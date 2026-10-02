/* One leaderboard contract shared by results and the ranking page. */
(function (root) {
  "use strict";
  const path = "fast_scores/alltime/ALL/v4_allera_ALL_choice/entries", bestKey = "hk_best_v4_alltime_ALL_allera_ALL_sprint_choice", cacheKey = "hk_leaderboard_cache_v2", nicknameKey = "hk_buzzer_nickname";
  function nickname(value) { return Array.from(String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0,24).join(""); }
  function validTime(ms) { return Number.isSafeInteger(ms) && ms > 0; }
  function record(value,id) {
    if (!value || !validTime(value.ms) || (value.count !== undefined && value.count !== 10)) return null;
    let timestamp=0; try { timestamp=value.ts?.toDate ? value.ts.toDate().getTime() : Number(value.timestamp)||0; } catch {}
    return {id:String(id||value.uid||""),name:nickname(value.name)||"歴史探検家",ms:value.ms,timestamp:Number.isFinite(timestamp)?timestamp:0};
  }
  function rank(records) {
    const unique=new Map(); for(const r of records) if(r?.id && validTime(r.ms) && (!unique.has(r.id)||unique.get(r.id).ms>r.ms)) unique.set(r.id,r);
    const entries=[...unique.values()].sort((a,b)=>a.ms-b.ms||a.id.localeCompare(b.id)); let position=0;
    return entries.map((r,i)=>{if(!i||Math.round(r.ms/10)!==Math.round(entries[i-1].ms/10))position=i+1;return {...r,rank:position};});
  }
  function ownRank(entries,own) {
    if(!own)return null; const found=entries.find(r=>r.id===own.id);if(found)return found.rank;
    if(entries.length&&Math.round(own.ms/10)<=Math.round(entries[entries.length-1].ms/10))return entries.filter(r=>Math.round(r.ms/10)<Math.round(own.ms/10)).length+1;
    return null;
  }
  function localBest(){try{const r=JSON.parse(root.localStorage.getItem(bestKey));return r?.correct===10&&validTime(r.ms)?r:null;}catch{return null;}}
  function readCache(){try{const c=JSON.parse(root.localStorage.getItem(cacheKey));if(!c||!Array.isArray(c.entries)||!Number.isFinite(c.at))return null;return{entries:rank(c.entries.map(r=>record(r,r.id)).filter(Boolean)),at:c.at};}catch{return null;}}
  function saveCache(entries,at){try{root.localStorage.setItem(cacheKey,JSON.stringify({entries,at}));}catch{}}
  function savedName(){try{return nickname(root.localStorage.getItem(nicknameKey));}catch{return "";}}
  function saveName(name){try{root.localStorage.setItem(nicknameKey,name);}catch{}}
  function seconds(ms){return (Math.round(ms/10)/100).toFixed(2);}
  function wait(promise,duration=12000){let timeout;return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Object.assign(Error("timeout"),{code:"timeout"})),duration);})]).finally(()=>clearTimeout(timeout));}
  async function load(){
    const conn=await wait(root.HKCloud.connect()),uid=conn.auth?.currentUser?.uid;
    const [list,mine]=await Promise.allSettled([wait(conn.db.collection(path).orderBy("ms","asc").limit(100).get({source:"server"})),uid?wait(conn.db.doc(path+"/"+uid).get({source:"server"})):Promise.resolve(null)]);
    if(list.status==="rejected")throw list.reason;const records=[];list.value.forEach(doc=>{const r=record(doc.data(),doc.id);if(r)records.push(r);});
    const own=mine.status==="fulfilled"&&mine.value?.exists?record(mine.value.data(),uid):null;
    if(own && !records.some(r=>r.id===own.id) && (records.length<100 || own.ms<=Math.max(...records.map(r=>r.ms)))) records.push(own);
    return {entries:rank(records).slice(0,100),own,uid,ownKnown:mine.status==="fulfilled"&&!!uid,at:Date.now()};
  }
  async function submit(name,ms){
    name=nickname(name);if(!name)throw Object.assign(Error("nickname"),{code:"nickname"});if(!validTime(ms))throw Error("record");saveName(name);
    const conn=await wait(root.HKCloud.connect()),uid=conn.auth?.currentUser?.uid;if(!uid)throw Error("identity");const ref=conn.db.doc(path+"/"+uid);
    return wait(conn.db.runTransaction(async transaction=>{
      const previous=await transaction.get(ref),old=previous.exists?record(previous.data(),uid):null;
      if(old&&old.ms<=ms)return{updated:false,entry:old};
      transaction.set(ref,{app:"hk-buzzer-v1",uid,name,ms,period:"alltime",mode:"allera",era:"ALL",dateKey:root.HKCore.dayKey(),weekKey:root.HKCore.weekKey(),count:10,ts:conn.firebase.firestore.FieldValue.serverTimestamp(),ver:1});
      return{updated:true,entry:{id:uid,name,ms,timestamp:Date.now()}};
    }));
  }
  function errorText(error){return String(error?.code||"").includes("permission-denied")?"ランキングへのアクセスを確認できませんでした。時間をおいて再接続してください。":"通信を確認できませんでした。接続を確認して、もう一度試してください。自己ベストはこのブラウザに残っています。";}
  const api={path,bestKey,cacheKey,nicknameKey,nickname,validTime,record,rank,ownRank,localBest,readCache,saveCache,savedName,saveName,seconds,wait,load,submit,errorText};root.HKLeaderboard=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window==="undefined"?globalThis:window);
