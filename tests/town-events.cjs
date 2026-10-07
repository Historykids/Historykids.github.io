const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),C=require('../assets/ui/core.js'),L=require('../assets/ui/town-event-layout.js');
global.HKCore=C;global.HKEventLayout=L;
const start=Date.parse('2026-10-05T00:00:00+09:00');
const event=(type)=>({id:'scene-'+type,type,start,end:start+300000,resolved:false,answers:{}});
const city=[{id:'house',type:'house',x:26,y:16},{id:'shop',type:'shop',x:30,y:18},{id:'castle',type:'castle',x:15,y:7},{id:'temple',type:'temple',x:40,y:25}];
function blocked(x,y,city){return city.some(b=>b.type!=='road'&&b.type!=='bridge'&&C.containsCell(b,x,y));}
async function main(){
 for(const size of [{width:60,depth:40},{width:60,depth:80}])for(const type of ['fire','festival','shogun']) {
  const e=event(type),a=L.layout(e,city,size.width,size.depth),b=L.layout(e,city,size.width,size.depth);assert.deepEqual(a,b);
  if(type==='fire'){assert.equal(a.fires.length,8);assert(a.fires.some(p=>p.height>0));for(const p of a.fires)assert(p.x>=0&&p.x<size.width&&p.y>=0&&p.y<size.depth);}
  if(type==='festival'){assert(a.festival);const p=a.festival;for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++)assert(!blocked(x,y,city));}
  if(type==='shogun'){
   assert(a.routeLength>10);for(let i=0;i<a.route.length;i++){const p=a.route[i];assert(!blocked(p.x,p.y,city));assert(p.x>=0&&p.x<size.width&&p.y>=0&&p.y<size.depth);if(i)assert.equal(Math.abs(p.x-a.route[i-1].x)+Math.abs(p.y-a.route[i-1].y),1);}
   for(let t=0;t<300;t+=.7)for(let i=0;i<9;i++){const p=L.pose(a,t,i);assert(Number.isFinite(p.x+p.y+p.heading));assert(!blocked(Math.round(p.x),Math.round(p.y),city));}
  }
 }
 console.log('PASS all three events have deterministic placements within normal and expanded towns; venues and the whole procession avoid buildings');
 const wall=Array.from({length:40},(_,y)=>({id:'wall-'+y,type:'tree',x:30,y}));const route=L.layout(event('shogun'),wall);assert(route.route.every(p=>p.x<30));
 const packed=[{id:'floor',type:'castle',x:0,y:0}];assert.equal(L.layout(event('shogun'),packed,6,5).route.length,0);assert.equal(L.layout(event('festival'),packed,6,5).festival,null);
 console.log('PASS disconnected or fully occupied ground never produces a procession through a building');
 const threeURL=pathToFileURL(path.join(root,'assets/vendor/three.module.js')).href,THREE=await import(threeURL);
 const farmerSource=fs.readFileSync(path.join(root,'assets/ui/farmer-3d.js'),'utf8').replace('from "three"','from "'+threeURL+'"'),farmerURL='data:text/javascript;base64,'+Buffer.from(farmerSource).toString('base64');
 const source=fs.readFileSync(path.join(root,'assets/ui/town-events.js'),'utf8').replace('from "three"','from "'+threeURL+'"').replace('from "./farmer-3d.js?v=missions-20261005"','from "'+farmerURL+'"');
 const {createTownEventView}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 for(const type of ['fire','festival','shogun']) {
  const e=event(type),scene=new THREE.Scene(),view=createTownEventView(scene);view.update(e,city);view.animate(start+1000);const first=view.group.children[0];assert(first);view.update(e,city);assert.equal(view.group.children[0],first);
  scene.updateMatrixWorld();const initial=[],changed=[];view.group.traverse(o=>{if(o.isMesh)initial.push(o.matrixWorld.elements.join(','));});scene.updateMatrixWorld();view.animate(start+8000);scene.updateMatrixWorld();view.group.traverse(o=>{if(o.isMesh){changed.push(o.matrixWorld.elements.join(','));assert(o.geometry.attributes.position);}});assert.notDeepEqual(initial,changed);
  const bounds=new THREE.Box3().setFromObject(view.group);assert(Number.isFinite(bounds.getSize(new THREE.Vector3()).length()));
  if(type==='fire'){assert.equal(view.group.children.filter(o=>o.name==='fire-patch').length,8);view.update({...e,resolved:true},city);assert(view.group.visible);view.animate(start+15000);}
  if(type==='festival'){assert(view.group.getObjectByName('festival-yagura'));const names=[];view.group.traverse(o=>names.push(o.name));assert.equal(names.filter(n=>n==='festival-stall').length,4);assert.equal(names.filter(n=>n==='festival-lantern').length,18);}
  if(type==='shogun'){assert.equal(view.group.children.filter(o=>o.name==='shogun-guard').length,8);assert(view.group.getObjectByName('visiting-shogun'));const p=view.group.getObjectByName('visiting-shogun').position.clone();view.animate(start+16000);assert(p.distanceTo(view.group.getObjectByName('visiting-shogun').position)>1);}
  assert.equal(view.animate(e.end),false);assert(!view.group.visible);view.update(null,city);assert.equal(view.group.children.length,0);view.dispose();assert(!scene.children.includes(view.group));
 }
 console.log('PASS flames, four festival stalls, eighteen lanterns, dancers and nine parade members animate, expire and release their resources');
 const disposed=new Set(),scene=new THREE.Scene(),view=createTownEventView(scene);view.update(event('shogun'),city);const expected=new Set();view.group.traverse(o=>{if(o.isMesh){expected.add(o.geometry);expected.add(o.material);o.geometry.addEventListener('dispose',()=>disposed.add(o.geometry));o.material.addEventListener('dispose',()=>disposed.add(o.material));}});view.update(event('festival'),city);assert.equal(disposed.size,expected.size);view.dispose();
 console.log('PASS switching an event releases every previous mesh geometry and material');
 // Placement-mode visuals use the same layout and remain independent of purchased residents.
 const {JSDOM}=require('jsdom'),dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://historykids.github.io/#town',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.requestAnimationFrame=()=>0;w.setInterval=()=>0;w.setTimeout=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['data/dataset.js','data/ancient.js','data/meiji.js','assets/ui/core.js','assets/ui/activities.js','assets/ui/town-event-layout.js','assets/ui/residents.js','assets/ui/wallet.js','assets/ui/app.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 w.document.getElementById('town2d').click();assert(w.document.getElementById('townEventMapLayer').children.length>0);assert.equal(w.HK.state.residents.length,0);w.close();
 console.log('PASS active scenery also appears on the placement map when the town has no residents');
 console.log('5 town event scenery checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
