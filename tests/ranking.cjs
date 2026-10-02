const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{JSDOM}=require("jsdom");
const root=path.resolve(__dirname,".."),L=require(path.join(root,"assets/ui/leaderboard.js"));let checks=0;
function test(name,fn){fn();checks++;console.log("PASS",name);}
const flush=()=>new Promise(setImmediate);
function page({scores=[],own=null,seed={},offline=false,ownFails=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,"ranking.html"),"utf8"),{url:"https://historykids.github.io/ranking.html?period=daily&edition=v2",runScripts:"outside-only",pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.console.warn=()=>{};
 for(const [key,value]of Object.entries(seed))w.localStorage.setItem(key,value);
 const calls={path:"",doc:"",writes:[],connections:0,transactions:0};let serverOwn=own;
 w.HKCloud={connect:async()=>{calls.connections++;if(offline)throw Error("offline");return{auth:{currentUser:{uid:"mine"}},firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},db:{
 collection(p){calls.path=p;return{orderBy(field,order){assert.equal(field,"ms");assert.equal(order,"asc");return this;},limit(n){assert.equal(n,100);return this;},get:async options=>{assert.equal(options.source,"server");return{forEach(fn){scores.forEach(r=>fn({id:r.id,data:()=>r}));}};}};},
 doc(p){calls.doc=p;return{get:async options=>{assert.equal(options.source,"server");if(ownFails)throw Error("private-read");return{exists:!!serverOwn,data:()=>serverOwn};}};},
 async runTransaction(fn){calls.transactions++;return fn({get:async()=>({exists:!!serverOwn,data:()=>serverOwn}),set(ref,data){calls.writes.push(data);serverOwn={...data,id:"mine"};scores.splice(0,scores.length,...scores.filter(r=>r.id!=="mine"),serverOwn);}});}
 }};}};
 for(const file of ["assets/ui/core.js","assets/ui/leaderboard.js","assets/ui/ranking.js"])w.eval(fs.readFileSync(path.join(root,file),"utf8"));
 return{dom,w,calls,$:id=>w.document.getElementById(id),click:s=>w.document.querySelector(s).click()};
}
(async()=>{
 test("equal times share competition ranks and invalid scores never enter the table",()=>{
  const scores=[{id:"c",ms:3000},{id:"b",ms:2000},{id:"a",ms:2000},{id:"d",ms:NaN},{id:"e",ms:-1}];
  assert.deepEqual(L.rank(scores).map(r=>r.rank),[1,1,3]);assert.equal(L.record({ms:2000,count:9},"bad"),null);assert.equal(L.record({ms:1.5},"bad"),null);
  assert.equal(L.ownRank(L.rank(scores),{id:"outside",ms:2000}),1);
  assert.deepEqual(L.rank([{id:"a",ms:1000},{id:"b",ms:1004},{id:"c",ms:1006}]).map(r=>r.rank),[1,1,3]);
  assert.equal(L.seconds(1005),"1.01");
 });
 const p=page({scores:[{id:"third",name:"三番",ms:3000},{id:"mine",name:"わたし",ms:2000},{id:"first",name:"<img src=x onerror=1>",ms:1000}],own:{name:"わたし",ms:2000},seed:{[L.bestKey]:JSON.stringify({correct:10,ms:2000,score:1800})}});await flush();await flush();
 test("one all-time leaderboard shows the player's rank, frozen best and safe names",()=>{
  assert.equal(p.calls.path,L.path);assert.equal(p.calls.doc,L.path+"/mine");assert.equal(p.$("myRank").textContent,"2位");assert.equal(p.$("personalTime").textContent,"2.00");
  assert.equal(p.w.document.querySelectorAll("select").length,0);assert.equal(p.w.document.querySelectorAll("#rankList img").length,0);assert(p.$("rankList").textContent.includes("<img"));assert(p.$("rankRegister").hidden);assert(p.$("myScore").textContent.includes("あなた"));assert.equal(p.w.document.querySelectorAll(".podium-card").length,3);
 });
 p.$("rankSearch").value="三番";p.$("rankSearch").dispatchEvent(new p.w.Event("input"));
 test("nickname search keeps the actual rank and clearing restores all records",()=>{assert.equal(p.w.document.querySelectorAll("#rankList tr").length,1);assert.equal(p.w.document.querySelector(".position").textContent,"3");p.click("#clearSearch");assert.equal(p.w.document.querySelectorAll("#rankList tr").length,3);});
 p.$("rankSearch").value="見つからない";p.$("rankSearch").dispatchEvent(new p.w.Event("input"));assert(!p.$("rankEmpty").hidden);p.click("#myRowBtn");assert.equal(p.$("rankSearch").value,"");p.w.close();
 const q=page({seed:{[L.bestKey]:JSON.stringify({correct:10,ms:3210}),[L.nicknameKey]:"歴史名人"}});await flush();await flush();
 test("an unpublished saved best can be registered after leaving the results page",()=>{assert(!q.$("rankRegister").hidden);assert.equal(q.$("rankNickname").value,"歴史名人");assert.equal(q.$("myRank").textContent,"—");assert(q.$("emptyTitle").textContent.includes("最初"));});
 q.$("rankNickname").value="　　";q.$("rankRegister").dispatchEvent(new q.w.Event("submit",{bubbles:true,cancelable:true}));await flush();assert.equal(q.calls.transactions,0);
 q.$("rankNickname").value="歴史名人";q.$("rankNickname").dispatchEvent(new q.w.Event("input"));q.click("#registerBtn");q.click("#registerBtn");await flush();await flush();await flush();
 test("registration writes one compatible record, avoids double sends and appears in the table",()=>{assert.equal(q.calls.writes.length,1);const r=q.calls.writes[0];assert.equal(r.ms,3210);assert.equal(r.name,"歴史名人");assert.equal(r.count,10);assert.equal(r.period,"alltime");assert.equal(q.$("myRank").textContent,"1位");assert(q.$("rankRegister").hidden);assert(q.$("registrationMessage").textContent.includes("登録しました"));assert(q.$("myScore").textContent.includes("3.21"));});q.w.close();
 for(const oldTime of [2000,5000]){
  const a=page({own:{name:"先の名前",ms:oldTime},scores:[{id:"mine",name:"先の名前",ms:oldTime}],seed:{[L.bestKey]:JSON.stringify({correct:10,ms:3210})}});await flush();await flush();
  const result=await a.w.HKLeaderboard.submit("新しい名前",3210);
  test(oldTime<3210?"slower submissions preserve the published record":"faster submissions atomically replace the published record",()=>{assert.equal(result.updated,oldTime>3210);assert.equal(a.calls.writes.length,oldTime>3210?1:0);assert.equal(result.entry.ms,Math.min(oldTime,3210));});a.w.close();
 }
 const cached=page({offline:true,seed:{[L.cacheKey]:JSON.stringify({at:Date.now()-60000,entries:[{id:"old",name:"保存済み",ms:4000}]}),[L.bestKey]:JSON.stringify({correct:10,ms:3210})}});await flush();await flush();
 test("offline rankings label cached data, release retry and preserve the local best",()=>{assert(cached.$("rankList").textContent.includes("保存済み"));assert(cached.$("rankFreshness").textContent.includes("保存済み"));assert(cached.$("rankStatus").textContent.includes("通信"));assert(!cached.$("reload").disabled);assert.equal(cached.$("personalTime").textContent,"3.21");});
 cached.$("rankNickname").value="再登録";cached.click("#registerBtn");await flush();await flush();assert(!cached.$("registerBtn").disabled);assert(cached.$("registrationMessage").textContent.includes("通信"));assert.equal(cached.w.HKLeaderboard.localBest().ms,3210);cached.w.close();
 const partial=page({scores:[{id:"someone",name:"読める記録",ms:5000}],ownFails:true});await flush();await flush();
 test("public scores remain available when the personal record cannot be loaded",()=>{assert(partial.$("rankList").textContent.includes("読める記録"));assert(partial.$("rankStatus").textContent.includes("登録状態"));assert.equal(partial.$("myRank").textContent,"—");});partial.w.close();
 const outside=page({scores:Array.from({length:100},(_,i)=>({id:"player"+i,name:"探検家"+i,ms:1000+i})),own:{name:"わたし",ms:5000}});await flush();await flush();
 test("a player outside the first hundred still sees their registered best",()=>{assert.equal(outside.$("myRank").textContent,"100位圏外");assert(outside.$("myPublished").textContent.includes("5.00"));assert(!outside.$("myRowBtn").disabled);});outside.w.close();
 const timeout=page();timeout.w.HKCloud={connect:()=>new Promise(()=>{})};const original=timeout.w.setTimeout.bind(timeout.w);timeout.w.setTimeout=(fn,delay)=>original(fn,delay===12000?0:delay);await flush();timeout.click("#reload");await new Promise(r=>setTimeout(r,20));
 test("a stalled connection ends loading and allows another attempt",()=>{assert(!timeout.$("reload").disabled);assert.equal(timeout.$("rankBoard").getAttribute("aria-busy"),"false");assert(timeout.$("rankStatus").textContent.includes("通信"));});timeout.w.close();
 console.log(checks+" ranking checks passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
