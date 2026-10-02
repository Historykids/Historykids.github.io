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
  const { fitModel, createBuilding, createGround, syncBuildings } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
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
  const types = ["house", "shop", "castle", "temple", "tree", "field", "road", "bridge", "school"];
  await syncBuildings(town, types.map((type, i) => ({ id: type, type, x: i * 6, y: 2 })), () => Promise.reject(Error("offline")), () => errors++);
  assert.equal(errors, 9); assert.equal(town.buildings.children.length, 9);
  for (const object of town.buildings.children) {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    assert(size.x > .1 && size.y > .01 && size.z > .1);
    const item = global.HKCore.items.find((i) => i.id === object.userData.id);
    assert(size.x <= item.width && size.z <= item.depth && size.y <= item.height + .04);
  }
  console.log("PASS all nine building types remain visible if GLB loading fails");
  // Real asset node transforms and accessor bounds exercise model normalization.
  const assetTypes = { "house.2a9f3.glb":"house", "j8ap2an8eses0ho1p.glb":"shop", "ja76386p2an8esecas6t9le.glb":"castle", "japanese.tem3pl4e1383.glb":"temple", "t6r7e9e.glb":"tree", "f2i342el2d.glb":"field", "w8a9l0k9w7a2y.glb":"road", "b7r89i6d8g9e.glb":"bridge", "s7c7h9o89ol.glb":"school" };
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
    const detailed=fitModel(scene,{width:item.width*.9,depth:item.depth*.9,height:item.height,stretch:["field","road","bridge"].includes(item.id)});
    const realBounds=new THREE.Box3().setFromObject(detailed), realSize=realBounds.getSize(new THREE.Vector3());
    assert(realSize.x<=item.width && realSize.z<=item.depth && realSize.y<=item.height+.00001, file);
    assert(Math.abs(realBounds.min.y)<1e-5, file);
  }
  console.log("PASS all nine GLB asset bounds fit their building footprint and rest above ground");
  const scene = new THREE.Scene();
  const ground = createGround(scene, false);
  const terrain = scene.children.find((o) => o.isInstancedMesh);
  assert.equal(terrain.count, 2400);
  assert.equal(ground.geometry.parameters.width, 60);
  assert.equal(ground.geometry.parameters.depth, 40);
  const grid = scene.children.find((o) => o.isLineSegments);
  assert.equal(grid.geometry.attributes.position.count, 204);
  console.log("PASS terrain grid matches all 60 by 40 placement cells");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
