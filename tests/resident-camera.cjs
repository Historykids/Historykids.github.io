const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..'),url=pathToFileURL(path.join(root,'assets/vendor/three.module.js')).href,THREE=await import(url);
 async function load(file){return import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'assets/ui/'+file),'utf8').replace('from "three"','from "'+url+'"')).toString('base64'));}
 const {createFarmer,animateFarmer}=await load('farmer-3d.js'),{createResidentCamera}=await load('resident-camera.js');
 globalThis.HKCore={town:{width:60,height:40}};
 const camera=new THREE.PerspectiveCamera(40,1,.5,1000);camera.position.set(10,30,70);
 const controls={enabled:true,target:new THREE.Vector3(0,0,0),update(){}};
 const a={id:'a',x:20,y:20,heading:0,elapsed:.2,phase:'walk',action:'walk'},b={...a,id:'b',type:'monk',heading:Math.PI/2};
 const meshes=new Map([['a',createFarmer('a')],['b',createFarmer('b','monk')]]);for(const actor of [a,b])animateFarmer(meshes.get(actor.id),actor);
 const changes=[],view=createResidentCamera(camera,controls,meshes,id=>changes.push(id));
 assert.equal(view.watch('missing'),false);assert.equal(controls.enabled,true);const old=camera.position.clone();
 assert(view.watch('a'));assert.equal(camera.near,.02);assert.equal(camera.fov,75);assert.equal(controls.enabled,false);assert.equal(meshes.get('a').visible,false);
 const actual=meshes.get('a').userData.rig.head.localToWorld(new THREE.Vector3(0,.01,.102));assert(camera.position.distanceTo(actual)<1e-10);assert(camera.position.y>.38&&camera.position.y<.4);
 let facing=camera.getWorldDirection(new THREE.Vector3());assert(facing.z>.99);
 a.x+=2;a.heading=Math.PI/2;animateFarmer(meshes.get('a'),a);view.update();facing=camera.getWorldDirection(new THREE.Vector3());assert(facing.x>.99);
 const before=facing.clone();view.look(60,-30);assert(camera.getWorldDirection(new THREE.Vector3()).distanceTo(before)>.2);
 a.phase='act';a.action='farm';animateFarmer(meshes.get('a'),a);view.update();assert(camera.position.y<.39);
 assert(view.watch('b'));assert.equal(meshes.get('a').visible,true);assert.equal(meshes.get('b').visible,false);
 meshes.delete('b');assert.equal(view.update(),false);assert.equal(view.id,null);assert.equal(camera.near,.5);assert.equal(camera.fov,40);assert.equal(controls.enabled,true);assert(camera.position.distanceTo(old)<1e-10);assert.equal(changes.at(-1),null);
 console.log('PASS resident eye position, walking direction, animated pose, drag, switch, removal and camera restoration');
})().catch(e=>{console.error(e);process.exitCode=1;});
