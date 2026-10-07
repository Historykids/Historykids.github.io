const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),C=require('../assets/ui/core.js'),A=require('../assets/ui/activities.js');
const monday=Date.parse('2026-10-05T01:00:00+09:00');let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
function page(seed={},time=monday){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://historykids.github.io/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const OriginalDate=w.Date;w.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}};
 const timers=[];w.setInterval=fn=>{timers.push(fn);return timers.length;};w.setTimeout=()=>0;w.requestAnimationFrame=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,v);
 for(const file of ['data/dataset.js','data/ancient.js','data/meiji.js','assets/ui/core.js','assets/ui/activities.js','assets/ui/town-event-layout.js','assets/ui/residents.js','assets/ui/wallet.js','assets/ui/app.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 return{w,dom,$:id=>w.document.getElementById(id),click:s=>{const el=w.document.querySelector(s);assert(el,s);el.click();},time:t=>{time=t;timers.forEach(fn=>fn());},stored:()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]))};
}
test('seven weekdays each have five learning goals and repeat after seven days at Tokyo midnight',()=>{
 assert.equal(A.weekly.length,7);for(const day of A.weekly){assert.equal(day.length,5);assert(day.every(m=>m.reward>0&&m.target>0));}
 for(let i=0;i<7;i++){const t=monday+i*86400000;assert.equal(A.summary(null,t).weekday,i);assert.deepEqual(A.summary(null,t).missions,A.summary(null,t+7*86400000).missions);}
 assert.equal(A.summary(null,Date.parse('2026-10-04T14:59:59Z')).weekday,6);assert.equal(A.summary(null,Date.parse('2026-10-04T15:00:00Z')).weekday,0);
});
test('mission progress counts distinct questions, input modes and eras, while claims pay once',()=>{
 const wallet={balance:100};for(let i=0;i<3;i++)A.apply(wallet,'quiz',{id:'q'+i,era:i===0?'edo':'jomon',mode:i===0?'type':'choice',replay:true},monday);
 A.apply(wallet,'quiz',{id:'q0',era:'edo',mode:'type',replay:true},monday);const s=A.summary(wallet.activities,monday);assert.equal(Object.keys(s.daily.correct).length,3);assert.equal(Object.keys(s.daily.type).length,1);assert.equal(Object.keys(s.daily.eras).length,2);
 const m=s.missions[0];A.apply(wallet,'claim',{id:m.id,day:s.daily.day},monday);assert.equal(wallet.balance,110);A.apply(wallet,'claim',{id:m.id,day:s.daily.day},monday);assert.equal(wallet.balance,110);
 assert.throws(()=>A.apply(wallet,'claim',{id:'0-3',day:s.daily.day},monday));assert.equal(wallet.balance,110);
 const next=A.summary(wallet.activities,monday+86400000);assert.equal(Object.keys(next.daily.correct).length,0);assert.equal(next.missions.filter(m=>m.claimed).length,0);
 assert.throws(()=>A.apply(wallet,'claim',{id:m.id,day:s.daily.day},monday+86400000));assert.equal(wallet.balance,110);
});
test('every event lasts exactly five minutes and distinct correct answers award one reward',()=>{
 for(const random of [()=>0,()=>.4,()=>.9]){
 const wallet={balance:50};A.apply(wallet,'town',{},monday,random);const e=wallet.activities.event,config=A.events[e.type];assert.equal(e.end-e.start,300000);
 A.apply(wallet,'town',{},monday+1000,random);assert.equal(wallet.activities.event.id,e.id);
 A.apply(wallet,'quiz',{id:'first',era:'edo',mode:'choice'},monday+2000);A.apply(wallet,'quiz',{id:'first',era:'edo',mode:'choice'},monday+2000);assert.equal(Object.keys(e.answers).length,1);
 for(let i=1;i<config.target;i++)A.apply(wallet,'quiz',{id:'q'+i,era:'edo',mode:'type',eventId:e.id},monday+3000);
 assert(e.resolved);assert.equal(wallet.balance,50+config.reward);assert.equal(wallet.activities.daily.events,1);
 A.apply(wallet,'quiz',{id:'extra',era:'edo',mode:'type'},monday+4000);assert.equal(wallet.balance,50+config.reward);
 assert(!A.summary(wallet.activities,e.end).eventActive);A.apply(wallet,'town',{},e.end);assert.equal(wallet.activities.event.id,e.id);
 A.apply(wallet,'town',{},wallet.activities.nextEventAt,random);assert.notEqual(wallet.activities.event.id,e.id);assert.notEqual(wallet.activities.event.type,e.type);
 }
});
test('expiry and stale event questions cannot earn event rewards or advance a new event',()=>{
 const wallet={balance:9};A.apply(wallet,'town',{},monday,()=>0);const e=wallet.activities.event;
 A.apply(wallet,'quiz',{id:'q1',era:'edo',mode:'choice'},e.end-1);A.apply(wallet,'quiz',{id:'q2',era:'edo',mode:'choice'},e.end);assert.equal(wallet.balance,9);assert(!e.resolved);
 A.apply(wallet,'town',{},wallet.activities.nextEventAt,()=>0);const current=wallet.activities.event;
 A.apply(wallet,'quiz',{id:'old',era:'edo',mode:'choice',eventId:e.id},current.start+10);assert.equal(Object.keys(current.answers).length,0);
});
function openMissions(p){p.click('.nav [data-view="learn"]');p.click('#missionBar [data-view="missions"]');}
test('only learning shows the mission shortcut, no mission navigation or weekdays remain, and reward claims survive reload',()=>{
 const p=page({money_v1:'50'});assert(!p.$('missionBar').hidden);assert.equal(p.w.document.querySelector('.nav [data-view="missions"]'),null);assert.equal(p.w.document.querySelectorAll('.nav > *').length,6);
 openMissions(p);assert.equal(p.$('missionList').children.length,5);assert.equal(p.$('missionWeek'),null);assert.equal(p.$('missionDayTitle').textContent,'今日のミッション');assert(!p.$('missionList').textContent.includes('曜日'));assert(p.$('missionBar').hidden);
 for(const view of ['town','games','timeline','howto']){p.click(`.nav [data-view="${view}"]`);assert(p.$('missionBar').hidden);}
 p.click('.nav [data-view="town"]');const e=p.w.HKWallet.snapshot().activities.event;assert.equal(e.end-e.start,300000);assert(p.$('townEventCountdown').textContent.includes('5:00'));
 openMissions(p);p.click('[data-claim-mission="0-4"]');assert.equal(p.w.HK.state.money,55);p.click('[data-claim-mission="0-4"]');assert.equal(p.w.HK.state.money,55);
 const q=page(p.stored(),monday+120000);q.click('.nav [data-view="town"]');assert.equal(q.w.HKWallet.snapshot().activities.event.id,e.id);assert(q.$('townEventCountdown').textContent.includes('3:00'));openMissions(q);assert(q.$('missionList').querySelector('[data-claim-mission="0-4"]').disabled);q.w.close();p.w.close();
});
test('in-progress buttons route to the correct answer mode, a fresh era, collected cards and town events',()=>{
 const p=page();openMissions(p);p.click('[data-start-mission="type"]');assert(!p.$('view-learn').hidden);assert(!p.$('missionBar').hidden);assert(!p.$('answerForm').hidden);assert(p.w.document.querySelector('[data-mode="type"]').classList.contains('active'));
 p.$('answerInput').value='えど';p.$('answerForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
 openMissions(p);p.click('[data-start-mission="eras"]');assert.notEqual(p.w.HK.state.era,'edo');assert(!p.$('view-learn').hidden);
 openMissions(p);p.click('[data-start-mission="read"]');assert(p.$('dialog').open);assert(p.$('dialogBody').querySelector('[data-practice]'));assert.equal(Object.keys(p.w.HKActivities.summary(p.w.HKWallet.snapshot().activities).daily.read).length,1);p.$('dialog').close();
 openMissions(p);p.click('[data-start-mission="town"]');assert(!p.$('view-town').hidden);assert(!p.$('townEventPanel').textContent.includes('町は穏やか'));p.w.close();
 const t=page({},monday+86400000);openMissions(t);t.click('[data-start-mission="choice"]');assert(t.w.document.querySelector('[data-mode="choice"]').classList.contains('active'));assert(!t.$('choices').hidden);t.w.close();
 const w=page({},monday+2*86400000);openMissions(w);w.click('[data-start-mission="events"]');assert(!w.$('view-town').hidden);assert(w.$('dialog').open);assert(w.$('dialogBody').querySelector('[data-event-answer]'));w.w.close();
});
test('events begin on a fixed thirty-minute cycle, migrate old cooldowns and skip expired offline windows',()=>{
 const wallet={balance:0};A.apply(wallet,'town',{},monday,()=>0);const e=wallet.activities.event;assert.equal(wallet.activities.nextEventAt,monday+1800000);
 A.apply(wallet,'town',{},e.end,()=>0);assert.equal(wallet.activities.event.id,e.id);assert(!A.summary(wallet.activities,e.end).eventActive);
 A.apply(wallet,'town',{},monday+1800000,()=>0);assert.equal(wallet.activities.event.start,monday+1800000);assert.equal(wallet.activities.nextEventAt,monday+3600000);
 A.apply(wallet,'town',{},monday+2*1800000+8*60000,()=>0);assert.equal(wallet.activities.event.start,monday+3600000);assert(!A.summary(wallet.activities,monday+2*1800000+8*60000).eventActive);assert.equal(wallet.activities.nextEventAt,monday+5400000);
 const legacy={event:e,nextEventAt:e.end+120000};assert.equal(A.summary(legacy,monday+600000).nextEventAt,monday+1800000);assert.equal(A.summary(legacy,monday+600000).event.id,e.id);
 const p=page();p.click('.nav [data-view="town"]');p.time(monday+300000);assert(p.$('nextTownEvent').textContent.includes('25:00'));p.time(monday+1800000);assert(p.$('townEventCountdown').textContent.includes('5:00'));p.w.close();
});
test('normal quiz success records daily progress but wrong answers and repeated cards do not inflate it',()=>{
 const p=page();p.click('[data-mode="type"]');p.$('answerInput').value='まちがい';p.$('answerForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(Object.keys(p.w.HKActivities.summary(p.w.HKWallet.snapshot().activities).daily.correct).length,0);
 p.$('answerInput').value='えど';p.$('answerForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(p.w.HK.state.money,20);
 p.click('#collection .done');p.click('[data-practice]');p.$('answerInput').value='えど';p.$('answerForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));const s=p.w.HKActivities.summary(p.w.HKWallet.snapshot().activities);assert.equal(Object.keys(s.daily.correct).length,1);assert.equal(Object.keys(s.daily.type).length,1);assert.equal(Object.keys(s.daily.read).length,1);assert.equal(Object.keys(s.daily.replay).length,1);p.w.close();
});
test('an event quiz explains misses, advances on correct answers, pays the real reward and stops after expiry',()=>{
 const p=page({money_v1:'10'});p.click('.nav [data-view="town"]');const event=p.w.HKWallet.snapshot().activities.event,config=p.w.HKActivities.events[event.type];
 for(let i=0;i<config.target;i++){
 p.click(i===0?'[data-event-quiz]':'[data-event-next]');const chip=p.$('dialogBody').querySelector('.chip').textContent,title=p.$('dialogBody').querySelector('h3').innerHTML;
 const r=p.w.HK.records.find(r=>chip===p.w.dataSets[r.era].title+' · '+p.w.HKCore.dateText(r)&&title===(p.w.dataSets[r.era].ruby[r.name]||r.question));assert(r);
 if(i===0){const wrong=[...p.$('dialogBody').querySelectorAll('[data-event-answer]')].find(b=>!p.w.HKCore.answerOK(b.dataset.eventAnswer,r.answers));wrong.click();assert(p.$('eventQuizFeedback').textContent.includes('もう一度'));assert.equal(Object.keys(p.w.HKWallet.snapshot().activities.event.answers).length,0);}
 const correct=[...p.$('dialogBody').querySelectorAll('[data-event-answer]')].find(b=>p.w.HKCore.answerOK(b.dataset.eventAnswer,r.answers));correct.click();correct.click();
 }
 assert.equal(p.w.HK.state.money,10+config.reward);assert(p.$('eventQuizFeedback').textContent.includes('イベント解決'));assert(p.$('townEventPanel').textContent.includes('解決済み'));assert(p.$('dialogBody').querySelector('[data-event-next]').hidden);
 p.time(event.end);assert(p.$('townEventPanel').textContent.includes('町は穏やか'));p.w.close();
});
test('merchant, samurai and monk purchases cost ten each, preserve roles and render distinct map symbols',()=>{
 const p=page({money_v1:'40'});for(const type of ['farmer','merchant','samurai','monk']){p.click('#shopBtn');p.click(`[data-buy="${type}"]`);}
 assert.equal(p.w.HK.state.money,0);assert.equal(p.w.HK.state.city.length,0);assert.deepEqual(Array.from(p.w.HK.state.residents,r=>r.type),['farmer','merchant','samurai','monk']);
 p.click('#town2d');assert.equal(p.$('residentList').querySelectorAll('.resident-item').length,4);for(const text of ['農民','商人','武士','僧侶'])assert(p.$('residentList').textContent.includes(text));
 assert.equal(p.$('residentMapLayer').children.length,4);const q=page(p.stored());assert.deepEqual(Array.from(q.w.HK.state.residents,r=>r.type),['farmer','merchant','samurai','monk']);q.w.close();p.w.close();
});
test('each new occupation performs its own routines beside buildings and stays on walkable cells',()=>{
 const R=require('../assets/ui/residents.js'),city=[{id:'s',type:'shop',x:4,y:4},{id:'c',type:'castle',x:10,y:4},{id:'t',type:'temple',x:20,y:4},{id:'f',type:'field',x:28,y:4}],engine=R.createEngine();
 engine.sync(['merchant','samurai','monk'].map((type,i)=>({id:type,type,x:1,y:2+i})),city);const performed={merchant:new Set(),samurai:new Set(),monk:new Set()};
 for(let i=0;i<14000;i++)for(const a of engine.tick(.1)){assert(engine.free(Math.round(a.x),Math.round(a.y)));if(a.phase==='act')performed[a.type].add(a.action);}
 assert(performed.merchant.has('trade'));assert(performed.samurai.has('guard'));assert(performed.monk.has('chant'));
});
(async()=>{
 const THREE=await import(require('node:url').pathToFileURL(path.join(root,'assets/vendor/three.module.js')).href);
 const source=fs.readFileSync(path.join(root,'assets/ui/farmer-3d.js'),'utf8').replace('from "three"','from "'+require('node:url').pathToFileURL(path.join(root,'assets/vendor/three.module.js')).href+'"');
 const models=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 test('all four occupations have distinct 3D outfits and finite moving poses',()=>{
  const colors=new Set();for(const type of ['farmer','merchant','samurai','monk']){const mesh=models.createFarmer(type,type);models.animateFarmer(mesh,{type,x:3,y:4,heading:1,elapsed:.3,phase:'walk',action:'walk'});assert.equal(mesh.userData.type,type);assert.equal(mesh.userData.rig.hat.visible,type==='farmer');assert(Number.isFinite(new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).length()));colors.add(mesh.userData.rig.body.children.find(o=>o.isMesh).material.color.getHex());}assert.equal(colors.size,4);
  const scene=new THREE.Scene(),view=models.createFarmerView(scene);const actor={id:'same-id',type:'farmer',x:0,y:0,heading:0,elapsed:0,phase:'walk',action:'walk'};view.update([actor]);view.update([{...actor,type:'monk'}]);assert.equal(view.people.get(actor.id).userData.type,'monk');view.update([]);assert.equal(view.people.size,0);
 });
 const backup=page({money_v1:'60'});backup.click('#shopBtn');backup.click('[data-buy="monk"]');openMissions(backup);backup.click('[data-claim-mission="0-4"]');
 const payload={version:3,got:backup.w.HK.state.got,money:backup.w.HK.state.money,city:backup.w.HK.state.city,residents:backup.w.HK.state.residents,townLayout:{width:60,height:40},activities:backup.w.HKWallet.snapshot().activities};
 const restored=page();restored.click('#settingsBtn');const input=restored.$('importFile');Object.defineProperty(input,'files',{value:[{size:100,text:async()=>JSON.stringify(payload)}]});input.dispatchEvent(new restored.w.Event('change',{bubbles:true}));await new Promise(setImmediate);
 test('backups preserve occupation and claimed mission rewards together',()=>{assert.equal(restored.w.HK.state.residents[0].type,'monk');assert.equal(restored.w.HK.state.money,payload.money);openMissions(restored);assert(restored.$('missionList').querySelector('[data-claim-mission="0-4"]').disabled);});restored.w.close();backup.w.close();
 const p=page();let queue=Promise.resolve();Object.defineProperty(p.w.navigator,'locks',{value:{request:(name,fn)=>{assert.equal(name,'historykids-wallet');const result=queue.then(fn);queue=result.catch(()=>{});return result;}}});
 await new Promise((resolve,reject)=>p.w.HKWallet.activity('town',{},resolve,reject));
 const event=p.w.HKWallet.snapshot().activities.event,target=p.w.HKActivities.events[event.type].target;
 for(let i=0;i<target;i++)await new Promise((resolve,reject)=>p.w.HKWallet.activity('quiz',{id:'race-'+i,era:'edo',mode:'choice'},resolve,reject));
 const results=await Promise.all([1,2].map(()=>new Promise((resolve,reject)=>p.w.HKWallet.activity('claim',{id:'0-4',day:C.dayKey(new Date(monday))},resolve,reject))));
 test('simultaneous reward requests share the wallet lock and pay only once',()=>{assert.equal(results.reduce((sum,r)=>sum+r.reward,0),5);assert.equal(p.w.HKWallet.snapshot().balance,p.w.HKActivities.events[event.type].reward+5);});
 p.w.close();console.log(checks+' activities and new-resident checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
