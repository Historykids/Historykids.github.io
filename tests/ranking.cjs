const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{JSDOM}=require("jsdom");
const C=require("../assets/ui/core.js"),root=path.resolve(__dirname,".."),L=require(path.join(root,"assets/ui/leaderboard.js"));let checks=0;
function test(name,fn){fn();checks++;console.log("PASS",name);}
const flush=()=>new Promise(setImmediate);
function page({scores=[],own=null,seed={},offline=false,ownFails=false,failAfterRegistration=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,"ranking.html"),"utf8"),{url:"https://historykids.github.io/ranking.html?period=daily&edition=v2",runScripts:"outside-only",pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.console.warn=()=>{};
 for(const [key,value]of Object.entries(seed))w.localStorage.setItem(key,value);
 const calls={path:"",doc:"",writes:[],connections:0,transactions:0};let serverOwn=own;
 w.HKRankingConfig={endpoint:'https://api.example/ranking'};
 w.fetch=async(url,options)=>{calls.connections++;calls.path=url;if(offline)throw Error('offline');
  if(url.endsWith('/register')){calls.transactions++;const body=JSON.parse(options.body),best=w.HKLeaderboard.registerableBest();assert.equal(body.proof,best.proof);assert.equal(body.ms,undefined);let renamed=!!serverOwn&&C.rankingCompare(best,C.rankingMetrics(serverOwn))>=0&&serverOwn.name!==body.name,updated=!serverOwn||C.rankingCompare(best,C.rankingMetrics(serverOwn))<0;if(updated){const data={id:'mine',name:body.name,ms:best.ms,answerMs:best.answerMs,score:best.score,correct:best.correct,timingVersion:2,timestamp:Date.now()};calls.writes.push(data);serverOwn=data;scores.splice(0,scores.length,...scores.filter(r=>r.id!=='mine'),data);}if(renamed){serverOwn={...serverOwn,name:body.name};scores.splice(0,scores.length,...scores.filter(r=>r.id!=='mine'),{...serverOwn,id:'mine'});}return Response.json({updated:updated||renamed,renamed,entry:{...serverOwn,id:'mine'}});}
  if(failAfterRegistration&&calls.transactions)throw Error('offline');assert.equal(options.cache,'no-store');return Response.json({entries:scores,own:ownFails?null:serverOwn?{...serverOwn,id:'mine'}:null,uid:'mine',ownKnown:!ownFails,at:Date.now()});
 };
 for(const file of ["assets/ui/core.js","assets/ui/leaderboard.js","assets/ui/ranking.js"])w.eval(fs.readFileSync(path.join(root,file),"utf8"));
 return{dom,w,calls,$:id=>w.document.getElementById(id),click:s=>w.document.querySelector(s).click()};
}
(async()=>{
 test("equal scores share competition ranks and invalid scores never enter the table",()=>{
  const scores=[{id:"c",ms:3000},{id:"b",ms:2000},{id:"a",ms:2000},{id:"d",ms:NaN},{id:"e",ms:-1}];
  assert.deepEqual(L.rank(scores).map(r=>r.rank),[1,1,3]);assert.equal(L.record({ms:2000,count:9},"bad"),null);assert.equal(L.record({ms:1.5},"bad"),null);
  assert.equal(L.ownRank(L.rank(scores),{id:"outside",ms:2000}),1);
  assert.deepEqual(L.rank([{id:"a",ms:1000},{id:"b",ms:1004},{id:"c",ms:1100}]).map(r=>r.rank),[1,1,3]);
  assert.equal(L.seconds(1005),"1.01");
 });
 test("accuracy and total answer time determine the score, ignoring supplied points",()=>{
  assert.equal(C.rankingScore(10,0),10000);assert.equal(C.rankingScore(9,30000),8400);assert.equal(C.rankingScore(0,1),0);
  const rows=L.rank([{id:'fast-wrong',correct:2,ms:5000,answerMs:5000,score:999999,timingVersion:2},{id:'slow-correct',correct:10,ms:60000,answerMs:60000,timingVersion:2},{id:'fast-correct',correct:10,ms:30000,answerMs:30000,timingVersion:2}]);
  assert.deepEqual(rows.map(r=>r.id),['fast-correct','slow-correct','fast-wrong']);assert.equal(rows[1].score,9000);
  assert.equal(L.record({correct:9,ms:35000},'legacy').answerMs,30000);
 });
 const scoreBest=page({own:{name:'旧ベスト',correct:2,ms:5000,answerMs:5000,timingVersion:2},scores:[{id:'mine',name:'旧ベスト',correct:2,ms:5000,answerMs:5000,timingVersion:2}],seed:{[L.verifiedKey]:JSON.stringify({correct:10,ms:60000,answerMs:60000,timingVersion:2,proof:'accurate'})}});await flush();await flush();
 test("a more accurate slower best is eligible to replace a fast inaccurate record",()=>{assert(!scoreBest.$('rankRegister').hidden);assert.equal(scoreBest.$('personalScore').textContent,'9,000');});
 scoreBest.$('rankNickname').value='正確さ優先';scoreBest.click('#registerBtn');await flush();await flush();
 test("publishing a higher score updates points, accuracy, time and rank together",()=>{assert.equal(scoreBest.$('myRank').textContent,'1位');assert.equal(scoreBest.w.document.querySelector('.rank-points').textContent,'9,000');assert.equal(scoreBest.w.document.querySelector('.correct-count').textContent,'10 / 10');assert(scoreBest.$('myScore').textContent.includes('60.00'));});scoreBest.w.close();
 const p=page({scores:[{id:"third",name:"三番",ms:3000},{id:"mine",name:"わたし",ms:2000},{id:"first",name:"<img src=x onerror=1>",ms:1000}],own:{name:"わたし",ms:2000},seed:{[L.bestKey]:JSON.stringify({correct:10,ms:2000,score:1800})}});await flush();await flush();
 test("one all-time leaderboard shows the player's rank, frozen best and safe names",()=>{
  assert.equal(p.calls.path,"https://api.example/ranking");assert.equal(p.$("myRank").textContent,"2位");assert.equal(p.$("personalTime").textContent,"2.00秒 · 正答率 100％");
  assert.equal(p.w.document.querySelectorAll("select").length,0);assert.equal(p.w.document.querySelectorAll("#rankList img").length,0);assert(p.$("rankList").textContent.includes("<img"));assert(p.$("rankRegister").hidden);assert(p.$("myScore").textContent.includes("あなた"));assert.equal(p.w.document.querySelectorAll(".podium-card").length,3);
 });
 p.$("rankSearch").value="三番";p.$("rankSearch").dispatchEvent(new p.w.Event("input"));
 test("nickname search keeps the actual rank and clearing restores all records",()=>{assert.equal(p.w.document.querySelectorAll("#rankList tr").length,1);assert.equal(p.w.document.querySelector(".position").textContent,"3");p.click("#clearSearch");assert.equal(p.w.document.querySelectorAll("#rankList tr").length,3);});
 p.$("rankSearch").value="見つからない";p.$("rankSearch").dispatchEvent(new p.w.Event("input"));assert(!p.$("rankEmpty").hidden);p.click("#myRowBtn");assert.equal(p.$("rankSearch").value,"");p.w.close();
 const q=page({seed:{[L.verifiedKey]:JSON.stringify({correct:10,ms:3210,proof:"verified-proof"}),[L.nicknameKey]:"歴史名人"}});await flush();await flush();
 test("an unpublished saved best can be registered after leaving the results page",()=>{assert(!q.$("rankRegister").hidden);assert.equal(q.$("rankNickname").value,"歴史名人");assert.equal(q.$("myRank").textContent,"—");assert(q.$("emptyTitle").textContent.includes("最初"));});
 q.$("rankNickname").value="　　";q.$("rankRegister").dispatchEvent(new q.w.Event("submit",{bubbles:true,cancelable:true}));await flush();assert.equal(q.calls.transactions,0);
 q.$("rankNickname").value="歴史名人";q.$("rankNickname").dispatchEvent(new q.w.Event("input"));q.click("#registerBtn");q.click("#registerBtn");await flush();await flush();await flush();
 test("registration publishes one verified record, avoids double sends and appears in the table",()=>{assert.equal(q.calls.writes.length,1);const r=q.calls.writes[0];assert.equal(r.ms,3210);assert.equal(r.name,"歴史名人");assert.equal(r.id,"mine");assert.equal(q.$("myRank").textContent,"1位");assert(q.$("rankRegister").hidden);assert(q.$("registrationMessage").textContent.includes("登録しました"));assert(q.$("myScore").textContent.includes("3.21"));});q.w.close();
 for(const oldTime of [2000,5000]){
  const a=page({own:{name:"先の名前",ms:oldTime},scores:[{id:"mine",name:"先の名前",ms:oldTime}],seed:{[L.verifiedKey]:JSON.stringify({correct:10,ms:3210,proof:"verified-proof"})}});await flush();await flush();
  const result=await a.w.HKLeaderboard.submit("新しい名前",3210);
  test(oldTime<3210?"slower submissions update the name while preserving the faster published time":"faster submissions atomically replace the published record",()=>{assert(result.updated);assert.equal(result.renamed,oldTime<3210);assert.equal(result.entry.name,'新しい名前');assert.equal(a.w.HKLeaderboard.readPublished().entry.name,'新しい名前');assert.equal(a.calls.writes.length,oldTime>3210?1:0);assert.equal(result.entry.ms,Math.min(oldTime,3210));});a.w.document.dispatchEvent(new a.w.StorageEvent('storage',{key:L.publishedKey}));a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:L.publishedKey}));await flush();await flush();test('an open ranking tab refreshes on a confirmed publication',()=>{assert(a.$('myScore').textContent.includes('新しい名前'));assert.equal(a.$('myRank').textContent,'1位');assert(a.$('registrationMessage').textContent.includes('新しい名前'));});a.w.close();
 }
 const confirmed=page({failAfterRegistration:true,seed:{[L.verifiedKey]:JSON.stringify({correct:10,ms:3210,proof:"verified-proof"})}});await flush();await flush();confirmed.$("rankNickname").value="確認済み";confirmed.click("#registerBtn");await flush();await flush();
 test("confirmed registration remains visible even if the following ranking refresh fails",()=>{assert(confirmed.$("myScore").textContent.includes("確認済み"));assert.equal(confirmed.$("myRank").textContent,"1位");assert(confirmed.$("registrationMessage").textContent.includes("登録しました"));assert(confirmed.$("rankStatus").textContent.includes("保存済み"));assert(confirmed.w.HKLeaderboard.readCache().entries.some(r=>r.name==="確認済み"));});confirmed.w.close();
 const cached=page({offline:true,seed:{[L.cacheKey]:JSON.stringify({at:Date.now()-60000,entries:[{id:"old",name:"保存済み",ms:4000}]}),[L.verifiedKey]:JSON.stringify({correct:10,ms:3210,proof:"verified-proof"})}});await flush();await flush();
 test("offline rankings label cached data, release retry and preserve the local best",()=>{assert(cached.$("rankList").textContent.includes("保存済み"));assert(cached.$("rankFreshness").textContent.includes("保存済み"));assert(cached.$("rankStatus").textContent.includes("通信"));assert(!cached.$("reload").disabled);assert.equal(cached.$("personalTime").textContent,"3.21秒 · 正答率 100％");});
 cached.$("rankNickname").value="再登録";cached.click("#registerBtn");await flush();await flush();assert(!cached.$("registerBtn").disabled);assert(cached.$("registrationMessage").textContent.includes("通信"));assert.equal(cached.w.HKLeaderboard.localBest().ms,3210);cached.w.close();
 const partial=page({scores:[{id:"someone",name:"読める記録",ms:5000}],ownFails:true});await flush();await flush();
 test("public scores remain available when the personal record cannot be loaded",()=>{assert(partial.$("rankList").textContent.includes("読める記録"));assert(partial.$("rankStatus").textContent.includes("登録状態"));assert.equal(partial.$("myRank").textContent,"—");});partial.w.close();
 const outside=page({scores:Array.from({length:100},(_,i)=>({id:"player"+i,name:"探検家"+i,ms:1000+i})),own:{name:"わたし",ms:5000}});await flush();await flush();
 test("a player outside the first hundred still sees their registered best",()=>{assert.equal(outside.$("myRank").textContent,"100位圏外");assert(outside.$("myPublished").textContent.includes("5.00"));assert(!outside.$("myRowBtn").disabled);});outside.w.close();
 const imperfect=page({scores:[{id:'mine',name:'最後まで挑戦',ms:55000,correct:0}],own:{name:'最後まで挑戦',ms:55000,correct:0},seed:{[L.verifiedKey]:JSON.stringify({correct:0,ms:55000,proof:'zero-proof'})}});await flush();await flush();
 test("zero correct answers remain registerable and their correctness appears in the ranking",()=>{assert.equal(imperfect.w.HKLeaderboard.registerableBest().correct,0);assert.equal(imperfect.$("myRank").textContent,"1位");assert(imperfect.$("myPublished").textContent.includes("0 / 10問正解"));assert.equal(imperfect.w.document.querySelector(".correct-count").textContent,"0 / 10");assert.equal(L.record({ms:1000,correct:11},"bad"),null);});imperfect.w.close();
 const timeout=page();timeout.w.fetch=(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener("abort",()=>reject(Error("abort"))));const original=timeout.w.setTimeout.bind(timeout.w);timeout.w.setTimeout=(fn,delay)=>original(fn,delay===12000?0:delay);await flush();timeout.click("#reload");await new Promise(r=>setTimeout(r,20));
 test("a stalled connection ends loading and allows another attempt",()=>{assert(!timeout.$("reload").disabled);assert.equal(timeout.$("rankBoard").getAttribute("aria-busy"),"false");assert(timeout.$("rankStatus").textContent.includes("通信"));});timeout.w.close();
 console.log(checks+" ranking checks passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
