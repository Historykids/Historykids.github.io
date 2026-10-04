/* One leaderboard contract shared by results and the ranking page. */
(function (root) {
  "use strict";
  const C=root.HKCore || (typeof require === "function" ? require("./core.js") : null);
  const bestKey = "hk_best_v4_alltime_ALL_allera_ALL_sprint_choice", verifiedKey="hk_buzzer_verified_best_v1", identityKey="hk_rank_identity_v1", cacheKey = "hk_leaderboard_cache_v3", nicknameKey = "hk_buzzer_nickname", publishedKey="hk_buzzer_published_v1";
  function nickname(value) { return Array.from(String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0,24).join(""); }
  function validCorrect(correct){return Number.isInteger(correct)&&correct>=0&&correct<=10;}
  function validTime(ms) { return Number.isSafeInteger(ms) && ms > 0; }
  function record(value,id) {
    const metrics=C.rankingMetrics(value);
    if (!metrics || (value.count !== undefined && value.count !== 10)) return null;
    let timestamp=0; try { timestamp=value.ts?.toDate ? value.ts.toDate().getTime() : Number(value.timestamp)||0; } catch {}
    return {...metrics,id:String(id||value.id||value.uid||""),name:nickname(value.name)||"歴史探検家",timestamp:Number.isFinite(timestamp)?timestamp:0};
  }
  function rank(records) {
    const unique=new Map(); for(const value of records){const r=record(value,value?.id);if(r?.id && (!unique.has(r.id)||C.rankingCompare(r,unique.get(r.id))<0))unique.set(r.id,r);}
    const entries=[...unique.values()].sort((a,b)=>C.rankingCompare(a,b)||a.id.localeCompare(b.id)); let position=0;
    return entries.map((r,i)=>{if(!i||r.score!==entries[i-1].score)position=i+1;return {...r,rank:position};});
  }
  function ownRank(entries,own) {
    own=record(own,own?.id);if(!own)return null; const found=entries.find(r=>r.id===own.id);if(found)return found.rank;
    if(entries.length&&own.score>=entries[entries.length-1].score)return entries.filter(r=>r.score>own.score).length+1;
    return null;
  }
  function registerableBest(){try{const r=JSON.parse(root.localStorage.getItem(verifiedKey)),metrics=C.rankingMetrics(r);return metrics&&typeof r.proof==='string'?{...r,...metrics}:null;}catch{return null;}}
  function localBest(){const online=registerableBest();if(online)return online;try{const r=JSON.parse(root.localStorage.getItem(bestKey)),metrics=C.rankingMetrics(r);return metrics?{...r,...metrics}:null;}catch{return null;}}
  function readCache(){try{const c=JSON.parse(root.localStorage.getItem(cacheKey));if(!c||!Array.isArray(c.entries)||!Number.isFinite(c.at))return null;return{entries:rank(c.entries.map(r=>record(r,r.id)).filter(Boolean)),at:c.at};}catch{return null;}}
  function saveCache(entries,at){try{root.localStorage.setItem(cacheKey,JSON.stringify({entries,at}));}catch{}}
  function readPublished(){try{const p=JSON.parse(root.localStorage.getItem(publishedKey)),entry=record(p?.entry,p?.entry?.id);return entry&&Number.isFinite(p.at)?{entry,at:p.at}:null;}catch{return null;}}
  function savedName(){try{return nickname(root.localStorage.getItem(nicknameKey));}catch{return "";}}
  function saveName(name){try{root.localStorage.setItem(nicknameKey,name);}catch{}}
  function seconds(ms){return (Math.round(ms/10)/100).toFixed(2);}
  function wait(promise,duration=12000){let timeout;return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Object.assign(Error("timeout"),{code:"timeout"})),duration);})]).finally(()=>clearTimeout(timeout));}
  function identity(create=false){let token=root.localStorage.getItem(identityKey)||'';if(!/^[a-f0-9]{64}$/.test(token)){if(!create)return '';token=Array.from(root.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');root.localStorage.setItem(identityKey,token);}return token;}
  async function request(action='',body){
    const endpoint=root.HKRankingConfig?.endpoint;if(!endpoint)throw Error('not-configured');
    const token=identity(body!==undefined),headers={...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})};
    const controller=new AbortController();let timer=setTimeout(()=>controller.abort(),12000);
    try{const response=await root.fetch(endpoint+action,{method:body===undefined?'GET':'POST',headers,cache:'no-store',signal:controller.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'network'),{code:data.error,status:response.status});return data;}finally{clearTimeout(timer);}
  }
  async function load(){const data=await request();if(!Array.isArray(data.entries))throw Error('response');const own=data.own?record(data.own,data.own.id):null;return{entries:rank(data.entries.map(r=>record(r,r.id)).filter(Boolean)).slice(0,100),own,uid:String(data.uid||''),ownKnown:data.ownKnown===true,at:Date.now()};}
  async function startChallenge(){const result=await request('/start',{timingVersion:2});if(typeof result.ticket!=='string'||!Array.isArray(result.ids)||result.ids.length!==10||new Set(result.ids).size!==10)throw Error('response');return result;}
  async function timedRequest(action,body){try{return await request(action,body);}catch(error){if(error.status&&error.status<500)throw error;return request(action,body);}}
  async function openQuestion(ticket,index){const r=await timedRequest('/question',{ticket,index});if(r.index!==index||typeof r.id!=='string')throw Error('response');return r;}
  async function recordAnswer(ticket,index,id,raw){const r=await timedRequest('/answer',{ticket,index,id,raw});if(r.index!==index||r.id!==id||typeof r.correct!=='boolean'||!validTime(r.answerMs))throw Error('response');return r;}
  async function finishChallenge(ticket,log,round){
    const result=await request('/finish',{ticket,answers:log.map(r=>({id:r.q.id,raw:r.raw}))});
    const metrics=C.rankingMetrics(result),correct=result.roundCorrect??round.correct??result.correct??10;
    const current=C.rankingMetrics({ms:result.elapsedMs,correct,answerMs:result.roundAnswerMs,timingVersion:result.roundAnswerMs?2:1});
    if(!metrics||!current||typeof result.proof!=='string')throw Error('response');
    const best={...metrics,proof:result.proof,combo:round.combo};root.localStorage.setItem(verifiedKey,JSON.stringify(best));return{best,ms:current.answerMs,score:current.score,correct,timingVersion:result.roundAnswerMs?2:1};
  }
  async function submit(name,ms){
    name=nickname(name);if(!name)throw Object.assign(Error("nickname"),{code:"nickname"});if(!validTime(ms))throw Error("record");saveName(name);
    const best=registerableBest();if(!best)throw Object.assign(Error('verified-record-required'),{code:'verified-record-required'});
    const result=await request('/register',{name,proof:best.proof});const entry=record(result.entry,result.entry?.id);if(!entry)throw Error('response');
    saveName(entry.name);
    const at=Date.now(),cache=readCache();saveCache(rank([...(cache?.entries||[]).filter(r=>r.id!==entry.id),entry]).slice(0,100),at);
    try{root.localStorage.setItem(publishedKey,JSON.stringify({entry,at}));}catch{}
    return{updated:result.updated===true,renamed:result.renamed===true,entry};
  }
  function errorText(error){return error?.code==='verified-record-required'?"オンラインの10問決戦を最後まで遊ぶと登録できます。":error?.code==='rate-limited'?"いま接続が混み合っています。少し待って、もう一度試してください。":error?.code==='challenge-expired'?"結果の確認期限が切れました。もう一度10問決戦に挑戦してください。":"通信を確認できませんでした。接続を確認して、もう一度試してください。自己ベストはこのブラウザに残っています。";}
  const api={bestKey,verifiedKey,identityKey,cacheKey,nicknameKey,publishedKey,readPublished,nickname,validTime,validCorrect,record,rank,ownRank,localBest,registerableBest,readCache,saveCache,savedName,saveName,seconds,wait,identity,load,startChallenge,openQuestion,recordAnswer,finishChallenge,submit,errorText};root.HKLeaderboard=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window==="undefined"?globalThis:window);
