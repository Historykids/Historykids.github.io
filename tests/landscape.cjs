const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
async function main(){
 const threeURL=pathToFileURL(path.join(root,'assets/vendor/three.module.js')).href,THREE=await import(threeURL);
 const load=async file=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,file),'utf8').replace('from "three"','from "'+threeURL+'"')).toString('base64'));
 const {createTerrainField,createLandscape}=await load('assets/ui/town-landscape.js');
 for(const [w,d] of [[60,40],[60,50],[240,360]]){
  const f=createTerrainField(w,d);
  for(let z=-d/2;z<=d/2;z+=d/20)for(let x=-w/2;x<=w/2;x+=w/20)assert(f.height(x,z)<-.01,'terrain must not enter a placement cell');
  for(const [x,z]of [[w/2,0],[-w/2,0],[0,d/2],[0,-d/2]])assert(f.height(x,z)<0);
 }
 console.log('PASS the whole buildable rectangle and resized imported towns stay clear of mountains');
 const f=createTerrainField(60,40),repeat=createTerrainField(60,40);
 for(let a=0;a<32;a++){
  const angle=a/32*Math.PI*2,heights=[];
  for(let r=80;r<=160;r+=5){let x=Math.cos(angle)*r,z=Math.sin(angle)*r,h=f.height(x,z);assert(Number.isFinite(h)&&h>=-.18);assert.equal(h,repeat.height(x,z));heights.push(h);assert(Math.abs(f.normal(x,z).length()-1)<1e-6);}
  assert(Math.max(...heights)>5,'mountains must surround every direction');assert(Math.max(...heights)-Math.min(...heights)>2);
 }
 console.log('PASS deterministic ridges surround all directions with varied heights and finite normals');
 for(let z=-120;z<=120;z+=3){let x=f.riverX(z);assert(x>32,'river stays outside the town');assert(f.height(x,z)<0,'river carves a continuous valley');}
 console.log('PASS the peripheral river never crosses the town or climbs over mountain ridges');
 const scene=new THREE.Scene(),land=createLandscape(scene,60,40),terrain=land.group.children[0],geometry=terrain.geometry;
 assert.equal(land.quality,'light');assert(geometry.index.count/3<=1440);
 assert.equal(terrain.material.map,null,'default mountains must not load or decode any texture');
 assert.equal(await land.ready,false);
 assert.equal(terrain.userData.softwareGeometry,undefined,'default view must not allocate a second terrain');
 let tall=0;
 for(let i=0;i<geometry.attributes.position.count;i++){let x=geometry.attributes.position.getX(i),y=geometry.attributes.position.getY(i),z=geometry.attributes.position.getZ(i);assert(Number.isFinite(x+y+z));if(Math.abs(x)<=30&&Math.abs(z)<=20)assert(y<0);tall=Math.max(tall,y);}
 assert(tall>20);assert.equal(land.group.children.filter(o=>o.isInstancedMesh).length,0);
 assert(land.group.children.every(o=>o.userData.staticScenery));
 assert(land.group.children.find(o=>o.name==='valley-stream').geometry.index.count/3<=128);
 const detailed=createLandscape(new THREE.Scene(),60,40,{quality:'detail'});
 assert.equal(detailed.quality,'detail');assert(geometry.index.count<detailed.group.children[0].geometry.index.count*.3);
 assert(detailed.group.children[0].userData.softwareGeometry.index.count/3<27000);detailed.dispose();
 assert(geometry.index.count/3<15360*.1,'cut at least 90% of the former light terrain triangles');
 console.log('PASS default mountain terrain drops from 15,360 to 1,440 triangles, with no tree instances or texture loading');
 const {angular,radial}=geometry.userData.segments;
 for(let row=0;row<=radial;row++){const a=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,row*(angular+1)),b=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,row*(angular+1)+angular);assert(a.distanceTo(b)<1e-4);}
 console.log('PASS the full 360 degree landscape closes without a visible seam');
 const paints=[],context={createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)}},putImageData(image){paints.push(image)}};
 global.document={createElement(){return{setAttribute(){},getContext(){return context}}}};
 const {SoftwareTownRenderer}=await load('assets/ui/town-software-renderer.js'),renderer=new SoftwareTownRenderer(),camera=new THREE.PerspectiveCamera(40,1.8,.1,1200);
 renderer.setSize(1000,560);camera.position.copy(new THREE.Vector3(.42,.52,1).normalize().multiplyScalar(135));camera.lookAt(0,0,0);
 global.HKCore=require(path.join(root,'assets/ui/core.js'));
 // The geometry module captures HKCore at import time; load it with core set.
 const groundSource=fs.readFileSync(path.join(root,'assets/ui/town-geometry.js'),'utf8').replace('from "three"','from "'+threeURL+'"');
 const groundModule=await import('data:text/javascript;base64,'+Buffer.from(groundSource+'\n// landscape test core').toString('base64'));
 groundModule.createGround(scene,false);
 scene.traverse(o=>{if(o.isMesh)o.userData.staticScenery=true;});
 const castle=groundModule.fitModel(groundModule.createBuilding('castle'),{width:7,depth:7,height:6,stretch:true});scene.add(castle);
 renderer.render(scene,camera);assert.equal(paints.length,1);assert(renderer.depth.filter(Number.isFinite).length>10000);renderer.render(scene,camera);assert.equal(paints.length,1);
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);assert(ray.intersectObject(castle,true).length>0);
 console.log('PASS the software fallback paints real perspective geometry and the same castle remains ray-pickable');
 const initial=renderer.image.data.slice(),builds=renderer.sceneryBuilds;
 castle.position.x+=8;renderer.last=0;renderer.render(scene,camera);
 assert.equal(renderer.sceneryBuilds,builds,'moving actors/buildings must reuse the mountain colour and depth buffers');
 assert.notDeepEqual(renderer.image.data,initial,'dynamic objects must still move');
 const cached=renderer.image.data.slice();renderer.scenery=null;renderer.previous='';renderer.last=0;renderer.render(scene,camera);
 assert.deepEqual(renderer.image.data,cached,'cached drawing must match a fresh draw, including occlusion');
 camera.position.x+=10;camera.lookAt(0,0,0);renderer.last=0;const beforeCamera=renderer.sceneryBuilds;renderer.render(scene,camera);
 assert.equal(renderer.sceneryBuilds,beforeCamera+1,'camera changes must rebuild the backdrop');
 terrain.visible=false;renderer.last=0;const beforeHide=renderer.sceneryBuilds;renderer.render(scene,camera);assert.equal(renderer.sceneryBuilds,beforeHide+1);
 terrain.visible=true;renderer.last=0;renderer.render(scene,camera);
 const resize=new SoftwareTownRenderer();resize.setSize(80,60);resize.render(scene,camera);resize.setSize(100,70);assert.equal(resize.scenery,null);resize.render(scene,camera);assert.equal(resize.scenery.bytes.length,100*70*4);resize.dispose();assert.equal(resize.scenery,null);
 console.log('PASS scenery caches survive dynamic movement, match fresh pixels, and invalidate for camera, visibility and size changes');
 const eyeScene=new THREE.Scene(),floor=new THREE.Mesh(new THREE.PlaneGeometry(60,40),new THREE.MeshBasicMaterial({color:0x80663e}));
 floor.rotation.x=-Math.PI/2;eyeScene.add(floor);
 const eyes=new THREE.PerspectiveCamera(75,320/180,.02,1000);eyes.position.set(0,.39,0);eyes.lookAt(0,.39,10);
 const eyeRenderer=new SoftwareTownRenderer();eyeRenderer.setSize(320,180);eyeRenderer.render(eyeScene,eyes);
 assert(eyeRenderer.depth.filter(Number.isFinite).length>20000,'near-plane crossing ground must remain visible from resident eyes');
 assert(Number.isFinite(eyeRenderer.depth[179*320+160]));eyeRenderer.dispose();
 console.log('PASS first-person software rendering clips the near plane and keeps ground visible beneath the resident');
 if(process.env.LANDSCAPE_PREVIEW){const rgb=Buffer.alloc(1000*560*3),rgba=renderer.image.data;for(let i=0;i<1000*560;i++){rgb[i*3]=rgba[i*4];rgb[i*3+1]=rgba[i*4+1];rgb[i*3+2]=rgba[i*4+2];}fs.writeFileSync(process.env.LANDSCAPE_PREVIEW,Buffer.concat([Buffer.from('P6\n1000 560\n255\n'),rgb]));}
 const disposed=[],resources=land.group.children.length*2;for(const o of land.group.children){o.geometry.addEventListener('dispose',()=>disposed.push(o.name));o.material.addEventListener('dispose',()=>disposed.push(o.name+' material'));}land.dispose();assert(!scene.children.includes(land.group));assert.equal(disposed.length,resources);renderer.dispose();
 console.log('PASS rebuilding a town releases the old mountain and forest resources');
 console.log('9 landscape checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
