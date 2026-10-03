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
 assert(geometry.index.count/3<60000);assert(terrain.userData.softwareGeometry.index.count/3<27000);
 let tall=0;
 for(let i=0;i<geometry.attributes.position.count;i++){let x=geometry.attributes.position.getX(i),y=geometry.attributes.position.getY(i),z=geometry.attributes.position.getZ(i);assert(Number.isFinite(x+y+z));if(Math.abs(x)<=30&&Math.abs(z)<=20)assert(y<0);tall=Math.max(tall,y);}
 assert(tall>20);assert.equal(land.group.children.filter(o=>o.isInstancedMesh).length,1);assert(land.group.children.find(o=>o.isInstancedMesh).count<=1700);
 console.log('PASS detail and draw budgets are bounded while the central terrain has no raised vertices');
 for(let row=0;row<=112;row++){const a=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,row*241),b=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,row*241+240);assert(a.distanceTo(b)<1e-4);}
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
 const castle=groundModule.fitModel(groundModule.createBuilding('castle'),{width:7,depth:7,height:6,stretch:true});scene.add(castle);
 renderer.render(scene,camera);assert.equal(paints.length,1);assert(renderer.depth.filter(Number.isFinite).length>10000);renderer.render(scene,camera);assert.equal(paints.length,1);
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);assert(ray.intersectObject(castle,true).length>0);
 console.log('PASS the software fallback paints real perspective geometry and the same castle remains ray-pickable');
 if(process.env.LANDSCAPE_PREVIEW){const rgb=Buffer.alloc(1000*560*3),rgba=renderer.image.data;for(let i=0;i<1000*560;i++){rgb[i*3]=rgba[i*4];rgb[i*3+1]=rgba[i*4+1];rgb[i*3+2]=rgba[i*4+2];}fs.writeFileSync(process.env.LANDSCAPE_PREVIEW,Buffer.concat([Buffer.from('P6\n1000 560\n255\n'),rgb]));}
 const disposed=[];for(const o of land.group.children){o.geometry.addEventListener('dispose',()=>disposed.push(o.name));o.material.addEventListener('dispose',()=>disposed.push(o.name+' material'));}land.dispose();assert(!scene.children.includes(land.group));assert.equal(disposed.length,6);
 console.log('PASS rebuilding a town releases the old mountain and forest resources');
 console.log('7 landscape checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
