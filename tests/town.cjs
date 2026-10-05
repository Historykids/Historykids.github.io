const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
global.HKCore = require(path.join(root, "assets/ui/core.js"));
async function main() {
  const threeURL = pathToFileURL(path.join(root, "assets/vendor/three.module.js")).href;
  const THREE = await import(threeURL);
  const source = fs.readFileSync(path.join(root, "assets/ui/town-geometry.js"), "utf8").replace('from "three"', 'from "' + threeURL + '"');
  const { fitModel, createBuilding, createGround, groundGridOpacity, syncBuildings } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const town = { buildings: new THREE.Group(), render() {} };
  let resolve;
  const model = new Promise((r) => { resolve = r; });
  const city = [{ id: "one", type: "house", x: 4, y: 3, rot: 0 }];
  const waiting = syncBuildings(town, city, () => model);
  assert.equal(town.buildings.children.length, 1);
  assert(town.buildings.children[0].userData.localModel);
  city[0].x = 7; city[0].rot = 90;
  const moved = syncBuildings(town, city, () => { throw Error("duplicate fetch"); });
  assert.equal(town.buildings.children[0].position.x, -22);
  resolve(createBuilding("house"));
  await Promise.all([waiting, moved]);
  assert.equal(town.buildings.children.length, 1);
  assert.equal(town.buildings.children[0].position.x, -22);
  assert.equal(town.buildings.children[0].rotation.y, Math.PI / 2);
  console.log("PASS placement is visible immediately and retains moves during loading");
  let deletedResolve;
  const pending = syncBuildings(town, [{ id: "two", type: "castle", x: 0, y: 0 }], () => new Promise((r) => { deletedResolve = r; }));
  await Promise.resolve();
  await syncBuildings(town, [], () => {});
  deletedResolve(createBuilding("castle")); await pending;
  assert.equal(town.buildings.children.length, 0);
  console.log("PASS deleted buildings cannot reappear after delayed loading");
  let errors = 0;
  const types = ["house", "shop", "castle", "temple", "tree", "field", "road", "bridge", "fence", "school"];
  await syncBuildings(town, types.map((type, i) => ({ id: type, type, x: i * 6, y: 2 })), () => Promise.reject(Error("offline")), () => errors++);
  assert.equal(errors, 10); assert.equal(town.buildings.children.length, 10);
  for (const object of town.buildings.children) {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    assert(size.x > .1 && size.y > .01 && size.z > .1);
    const item = global.HKCore.items.find((i) => i.id === object.userData.id);
    assert(size.x <= item.width && size.z <= item.depth && size.y <= item.height + .04);
  }
  console.log("PASS all ten building types remain visible if GLB loading fails");
  // Real asset node transforms and accessor bounds exercise model normalization.
  const assetTypes = { "house.2a9f3.glb":"house", "j8ap2an8eses0ho1p.glb":"shop", "ja76386p2an8esecas6t9le.glb":"castle", "japanese.tem3pl4e1383.glb":"temple", "t6r7e9e.glb":"tree", "f2i342el2d.glb":"field", "w8a9l0k9w7a2y.glb":"road", "b7r89i6d8g9e.glb":"bridge", "fence_wood.glb":"fence", "s7c7h9o89ol.glb":"school" };
  for (const file of fs.readdirSync(path.join(root, "assets/_m")).filter((p) => p.endsWith(".glb"))) {
    const bytes = fs.readFileSync(path.join(root, "assets/_m", file));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const nodes = gltf.nodes.map((node) => {
      const group = new THREE.Group();
      if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
        const a = gltf.accessors[primitive.attributes.POSITION];
        const min = new THREE.Vector3().fromArray(a.min), max = new THREE.Vector3().fromArray(a.max);
        const size = max.clone().sub(min), center = max.clone().add(min).multiplyScalar(.5);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
        mesh.position.copy(center); group.add(mesh);
      }
      if (node.matrix) { group.matrix.fromArray(node.matrix); group.matrix.decompose(group.position, group.quaternion, group.scale); }
      if (node.translation) group.position.fromArray(node.translation);
      if (node.rotation) group.quaternion.fromArray(node.rotation);
      if (node.scale) group.scale.fromArray(node.scale);
      return group;
    });
    gltf.nodes.forEach((node, i) => (node.children || []).forEach((child) => nodes[i].add(nodes[child])));
    const scene = new THREE.Group();
    gltf.scenes[gltf.scene || 0].nodes.forEach((i) => scene.add(nodes[i]));
    const fitted = fitModel(scene, .86), bounds = new THREE.Box3().setFromObject(fitted);
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    assert(Math.abs(center.x) < 1e-5 && Math.abs(center.z) < 1e-5, file);
    assert(Math.abs(bounds.min.y) < 1e-5, file);
    assert(Math.max(size.x, size.z, size.y * .65) <= .86001, file);
    const item=global.HKCore.items.find(i=>i.id===assetTypes[file]);
    assert(item, file);
    const detailed=fitModel(scene,{width:item.width*.9,depth:item.depth*.9,height:item.height,stretch:item.id!=="fence"});
    const realBounds=new THREE.Box3().setFromObject(detailed), realSize=realBounds.getSize(new THREE.Vector3());
    if(item.id==="fence"){assert(realSize.x<=item.width*.9+1e-5&&realSize.z<=item.depth*.9+1e-5&&realSize.y<=item.height+1e-5);assert.equal(detailed.scale.x,detailed.scale.y);assert.equal(detailed.scale.x,detailed.scale.z);}
    else assert(Math.abs(realSize.x-item.width*.9)<1e-5 && Math.abs(realSize.z-item.depth*.9)<1e-5 && Math.abs(realSize.y-item.height)<1e-5,file);
    assert(Math.abs(realBounds.min.y)<1e-5, file);
  }
  console.log("PASS all packaged GLB asset bounds fit their building footprint and rest above ground");
  const bridge=createBuilding("bridge"), decks=bridge.children.filter(o=>o.name==="bridge-deck");
  assert.equal(decks.length,8);
  const tops=decks.map(o=>new THREE.Box3().setFromObject(o).max.y);
  assert(tops.every(y=>Math.abs(y-tops[0])<1e-6));
  const bridgeItem=global.HKCore.items.find(i=>i.id==="bridge");assert.deepEqual([bridgeItem.width,bridgeItem.depth],[1,2]);
  assert(!fs.readFileSync(path.join(root,"assets/ui/town.js"),"utf8").includes('bridge: "b7r89i6d8g9e.glb"'));
  console.log("PASS all bridge deck planks are level and the old arched model cannot replace them");
  const fenceBytes=fs.readFileSync(path.join(root,"assets/_m/fence_wood.glb")),jsonLength=fenceBytes.readUInt32LE(12),fenceJSON=JSON.parse(fenceBytes.subarray(20,20+jsonLength));
  assert.equal(fenceBytes.readUInt32LE(8),fenceBytes.length);assert.equal(fenceJSON.asset.extras.author,"trentspi (https://sketchfab.com/trentspice)");assert(fenceJSON.asset.extras.license.includes("CC-BY-4.0"));
  const imageView=fenceJSON.bufferViews[fenceJSON.images[0].bufferView];
  assert.equal(require("node:crypto").createHash("sha256").update(fenceBytes.subarray(28+jsonLength,28+jsonLength+imageView.byteOffset)).digest("hex"),"0af25f36b2e0d5f2237becd453a41e3ac41e8c72ac5e2dc35ac3b14f8501fee8");
  for(const v of fenceJSON.bufferViews)assert((v.byteOffset||0)+v.byteLength<=fenceJSON.buffers[0].byteLength);
  console.log("PASS the supplied fence geometry and license survive texture compression");
  const scene = new THREE.Scene();
  const ground = createGround(scene, false);
  assert.equal(ground.name, "town-earth");
  assert(!scene.children.some(o => o.isInstancedMesh));
  assert.equal(ground.geometry.parameters.width, 60);
  assert.equal(ground.geometry.parameters.height, 40);
  const grid = scene.children.find((o) => o.isLineSegments);
  assert.equal(grid.geometry.attributes.position.count, 204);
  console.log("PASS terrain grid matches all 60 by 40 placement cells");
  scene.updateMatrixWorld();
  const soilY = new THREE.Box3().setFromObject(ground).max.y;
  assert(Math.abs(soilY) < 1e-5);
  const foundation = scene.getObjectByName("town-foundation"), normals = foundation.geometry.attributes.normal, indices = foundation.geometry.index;
  for(let i=0;i<indices.count;i+=3)assert(!(normals.getY(indices.getX(i))>.9 && normals.getY(indices.getX(i+1))>.9 && normals.getY(indices.getX(i+2))>.9));
  const floorRay = new THREE.Raycaster(new THREE.Vector3(3,12,4),new THREE.Vector3(0,-1,0)), floorHit = floorRay.intersectObject(ground)[0];
  assert(floorHit && Math.abs(floorHit.point.y) < 1e-5);assert.equal(Math.floor(floorHit.point.x + 30),33);assert.equal(Math.floor(floorHit.point.z + 20),24);
  console.log("PASS one continuous visible floor has no competing foundation cap and placement rays hit the correct cell");
  const camera = new THREE.PerspectiveCamera(40,1.8,.5,1200), target = new THREE.Vector3();
  for(const distance of [120,150,187]){camera.position.copy(new THREE.Vector3(.42,.52,1).normalize().multiplyScalar(distance));assert.equal(groundGridOpacity(camera,target,560),0);}
  camera.position.set(5,7,9);assert(groundGridOpacity(camera,target,560)>.2);
  for(let i=10;i<200;i++){camera.position.copy(new THREE.Vector3(.42,.52,1).normalize().multiplyScalar(i));const opacity=groundGridOpacity(camera,target,560);assert(Number.isFinite(opacity)&&opacity>=0&&opacity<=.24);}
  console.log("PASS grid lines fade out in distant views while remaining visible close to town");
  global.document={createElement(){return{getContext(){return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)}},putImageData(){}}}}}};
  const rendererSource=fs.readFileSync(path.join(root,"assets/ui/town-software-renderer.js"),"utf8").replace('from "three"','from "'+threeURL+'"');
  const {SoftwareTownRenderer}=await import("data:text/javascript;base64,"+Buffer.from(rendererSource).toString("base64"));
  const renderer=new SoftwareTownRenderer();renderer.setSize(640,360);camera.aspect=640/360;camera.updateProjectionMatrix();
  let maxJump=0;
  for(const distance of [120,150,187]) {
    let previous=null;
    for(let step=0;step<8;step++) {
      camera.position.copy(new THREE.Vector3(.42,.52,1).normalize().multiplyScalar(distance));camera.position.x+=step*.1;camera.lookAt(0,0,0);
      renderer.last=-Infinity;renderer.render(scene,camera);
      const values=[];
      for(let i=0;i<400;i++) {
        const sample=new THREE.Vector3((i*37.19)%43-21.5,0,(i*19.73)%27-13.5).project(camera);
        const x=Math.floor((sample.x+1)*320),y=Math.floor((1-sample.y)*180),offset=(y*640+x)*4;
        values.push(...renderer.image.data.slice(offset,offset+3));
      }
      if(previous)for(let i=0;i<values.length;i++)maxJump=Math.max(maxJump,Math.abs(values[i]-previous[i]));
      previous=values;
    }
  }
  assert(maxJump<=2,"tiny distant camera movement must not make the floor flash between colors");renderer.dispose();
  console.log("PASS ground pixels remain stable through small camera movements at three distant zoom levels");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
