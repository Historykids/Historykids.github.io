const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { pathToFileURL } = require("node:url"), { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const C = global.HKCore = require(path.join(root, "assets/ui/core.js"));
const R = require(path.join(root, "assets/ui/residents.js"));
const specs = {
  pagoda: { price:90, footprint:[3,3], triangles:9667, geometry:"3f8f38ef40799475afd5609333f7536ef81c87de992112594f991fe526d787ac", author:"QuenntyTR", source:"8db99b4d14a44983bccddd9b34d64e81" },
  torii: { price:20, footprint:[2,1], triangles:684, geometry:"4e0f7873fcd608f7992153bbe47f7aa47bb3f37a084913cdf04503c4871dc141", author:"Fundamental 3D", source:"1e113b0c282b4dcda7f4eebc0d1ccb8c" },
};
function page(seed = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root,"index.html"),"utf8"), {url:"https://historykids.github.io/#town",runScripts:"outside-only",pretendToBeVisual:true}), w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.requestAnimationFrame=()=>1;w.setTimeout=()=>0;
  for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,v);
  for(const p of ["data/dataset.js","data/ancient.js","data/meiji.js","data/modern.js","assets/ui/core.js","assets/ui/residents.js","assets/ui/wallet.js","assets/ui/app.js"])w.eval(fs.readFileSync(path.join(root,p),"utf8"));
  return {w,click(selector){const e=w.document.querySelector(selector);assert(e,selector);e.click();}};
}
async function main() {
  const threeURL=pathToFileURL(path.join(root,"assets/vendor/three.module.js")).href, THREE=await import(threeURL);
  const moduleSource = source => "data:text/javascript;base64,"+Buffer.from(source).toString("base64");
  const utils=moduleSource(fs.readFileSync(path.join(root,"assets/vendor/BufferGeometryUtils.js"),"utf8").replace("from 'three'","from '"+threeURL+"'"));
  const loaderSource=fs.readFileSync(path.join(root,"assets/vendor/GLTFLoader.js"),"utf8").replace("from 'three'","from '"+threeURL+"'").replace("from './BufferGeometryUtils.js'","from '"+utils+"'");
  const {GLTFLoader}=await import(moduleSource(loaderSource));
  const {fitModel,createBuilding,syncBuildings}=await import(moduleSource(fs.readFileSync(path.join(root,"assets/ui/town-geometry.js"),"utf8").replace('from "three"','from "'+threeURL+'"')));
  // Node cannot decode browser ImageBitmaps. Validate embedded image headers,
  // then let the real vendored GLTFLoader parse every mesh, accessor and material.
  global.self=globalThis;
  global.createImageBitmap=async blob=>{const bytes=Buffer.from(await blob.arrayBuffer());assert(bytes.length>100);assert(bytes[0]===0xff&&bytes[1]===0xd8||bytes.subarray(1,4).toString()==="PNG");return{width:1024,height:1024,close(){}};};
  const models=new Map(), credits=fs.readFileSync(path.join(root,"Credits.html"),"utf8");
  for(const [type,spec] of Object.entries(specs)) {
    const bytes=fs.readFileSync(path.join(root,"assets/_m",type+".glb")), n=bytes.readUInt32LE(12), gltf=JSON.parse(bytes.subarray(20,20+n));
    assert.equal(bytes.readUInt32LE(8),bytes.length);assert(bytes.length<800000);assert.equal(gltf.buffers.length,1);assert(!gltf.buffers[0].uri);assert(!gltf.extensionsRequired);
    const hash=crypto.createHash("sha256"), imageViews=new Set(gltf.images.map(i=>i.bufferView));
    for(let i=0;i<gltf.bufferViews.length;i++){const v=gltf.bufferViews[i];assert.equal((v.byteOffset||0)%4,0);assert((v.byteOffset||0)+v.byteLength<=gltf.buffers[0].byteLength);if(!imageViews.has(i))hash.update(bytes.subarray(28+n+(v.byteOffset||0),28+n+(v.byteOffset||0)+v.byteLength));}
    assert.equal(hash.digest("hex"),spec.geometry);assert.equal(gltf.asset.extras.historykids.geometrySha256,spec.geometry);assert(gltf.asset.extras.author.includes(spec.author));assert(gltf.asset.extras.license.includes("CC-BY-4.0"));assert(gltf.asset.extras.source.includes(spec.source));
    for(const image of gltf.images)assert(image.bufferView!==undefined&&!image.uri);
    const loader=new GLTFLoader(), result=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),""), scene=result.scene;
    let triangles=0;scene.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;assert(o.material.map);assert(o.geometry.attributes.normal);assert(o.geometry.attributes.uv);}});
    assert.equal(triangles,spec.triangles);models.set(type,scene);
    const item=C.items.find(i=>i.id===type), fitted=fitModel(scene,{width:item.width*.9,depth:item.depth*.9,height:item.height,stretch:!item.preserveAspect});
    const bounds=new THREE.Box3().setFromObject(fitted,true), size=bounds.getSize(new THREE.Vector3());
    assert.equal(fitted.scale.x,fitted.scale.y);assert.equal(fitted.scale.x,fitted.scale.z);assert(Math.abs(bounds.min.y)<1e-5);assert(size.x<=item.width*.9+1e-5&&size.z<=item.depth*.9+1e-5&&size.y<=item.height+1e-5);
    assert.equal(item.price,spec.price);assert.deepEqual([item.width,item.depth],spec.footprint);assert(credits.includes('id="'+item.credit+'"'));assert(credits.includes(spec.source));
    if(type==="torii") {fitted.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,.5,3),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(fitted,true).length,0,"the torii must retain its open passage");}
  }
  assert.equal(createBuilding("pagoda").children.filter(o=>o.name==="pagoda-roof").length,3);assert.equal(createBuilding("torii").children.filter(o=>o.name==="torii-post").length,2);
  console.log("PASS actual pagoda and torii GLBs parse with preserved geometry, embedded materials, original credits and uniform scale");
  const town={buildings:new THREE.Group(),render(){}}, city=[{id:"p",type:"pagoda",x:4,y:5,rot:90},{id:"t",type:"torii",x:12,y:5,rot:90}];
  await syncBuildings(town,city,type=>models.get(type));
  for(const b of city){const o=town.buildings.children.find(o=>o.userData.id===b.id);assert(o&&!o.userData.localModel);const f=C.footprint(b);assert.equal(o.position.x,b.x+f.width/2-30);assert.equal(o.position.z,b.y+f.depth/2-20);const s=new THREE.Box3().setFromObject(o,true).getSize(new THREE.Vector3());assert(s.x<=f.width+.0001&&s.z<=f.depth+.0001);}
  console.log("PASS both detailed models replace their fallback at the saved position and rotation");
  const p=page({money_v1:"1000",hk_town_layout_v2:JSON.stringify({version:2,width:60,height:40})});p.click("#town2d");
  for(const [type,x] of [["pagoda",4],["torii",12]]) {
    const item=C.items.find(i=>i.id===type);p.click("#shopBtn");p.click('[data-shopcat="building"]');assert(p.w.document.querySelector(`a[href="./Credits.html#${item.credit}"]`));
    p.click('[data-shop-quantity="5"]');p.click(`[data-buy="${type}"]`);assert.equal(p.w.HK.pending.total,5);p.w.HK.setCell(x,5);p.click("#placeRotate");
    const before=p.w.HK.state.money;p.click("#placeConfirm");assert.equal(p.w.HK.state.money,before-item.price);assert.equal(p.w.HK.pending.remaining,4);p.click("#placeCancel");
    const b=p.w.HK.state.city.find(b=>b.type===type);assert.equal(b.rot,90);assert(p.w.document.querySelector(`[data-building="${b.id}"]`));
  }
  const seed={};for(let i=0;i<p.w.localStorage.length;i++){const k=p.w.localStorage.key(i);seed[k]=p.w.localStorage.getItem(k);}const restored=page(seed);
  assert.equal(restored.w.HK.state.money,890);assert.equal(JSON.stringify(restored.w.HK.state.city),JSON.stringify(p.w.HK.state.city));
  assert(!C.canPlace(p.w.HK.state.city,4,5,null,"house",0));assert(!C.canPlace([],59,39,null,"torii",90));
  p.w.close();restored.w.close();
  console.log("PASS shop filtering, bulk purchase cancellation, full footprint collision, rotated placement and reload preserve both buildings and coins");
  const engine=R.createEngine(), residents=[{id:"visitor",x:9,y:5},{id:"monk",type:"monk",x:9,y:7}];engine.sync(residents,city);
  assert(!engine.free(4,5));assert(engine.free(12,5));assert(engine.free(12,6));
  const seen=new Set();for(let i=0;i<5000;i++)for(const a of engine.tick(.1))if(a.phase==="act"&&a.target)seen.add(a.type+":"+a.target.type+":"+a.action);
  assert(seen.has("farmer:pagoda:look"));assert(seen.has("farmer:torii:pray"));assert(seen.has("monk:pagoda:chant"));
  console.log("PASS residents can pass through torii plots and visit both new landmarks, including monks chanting by the pagoda");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
