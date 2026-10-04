import '../../assets/ui/core.js';
import {questions} from './ranking-questions.mjs';
const C=globalThis.HKCore,byId=new Map(questions.map(q=>[q.id,q]));
const expiresAfter=30*60*1000;
const cleanName=value=>Array.from(String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,24).join('');
const randomIndex=length=>crypto.getRandomValues(new Uint32Array(1))[0]%length;
function pick(){const selected=C.eraOrder.map(era=>{const pool=questions.filter(q=>q.era===era);return pool[randomIndex(pool.length)].id;});for(let i=selected.length-1;i>0;i--){const j=randomIndex(i+1);[selected[i],selected[j]]=[selected[j],selected[i]];}return selected;}
function fail(code,status=400){return Response.json({error:code},{status});}
export class HistoryLeaderboard {
 constructor(ctx){
  this.ctx=ctx;this.sql=ctx.storage.sql;
  this.sql.exec(`CREATE TABLE IF NOT EXISTS scores(id TEXT PRIMARY KEY,name TEXT NOT NULL,ms INTEGER NOT NULL,timestamp INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS challenges(owner TEXT PRIMARY KEY,ticket TEXT NOT NULL,started INTEGER NOT NULL,ids TEXT NOT NULL,result TEXT); CREATE TABLE IF NOT EXISTS receipts(owner TEXT PRIMARY KEY,proof TEXT NOT NULL,ms INTEGER NOT NULL,timestamp INTEGER NOT NULL);`);
  const add=(table,name,type)=>{if(!this.sql.exec('PRAGMA table_info('+table+')').toArray().some(c=>c.name===name))this.sql.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type);};
  add('challenges','result','TEXT');add('challenges','timing','TEXT');
  for(const table of ['scores','receipts']){
   add(table,'correct','INTEGER NOT NULL DEFAULT 10');add(table,'answerMs','INTEGER NOT NULL DEFAULT 0');add(table,'score','INTEGER NOT NULL DEFAULT 0');add(table,'timingVersion','INTEGER NOT NULL DEFAULT 1');
   for(const row of this.sql.exec('SELECT * FROM '+table+' WHERE answerMs=0').toArray()){
    const metrics=C.rankingMetrics(row);if(metrics)this.sql.exec('UPDATE '+table+' SET answerMs=?,score=? WHERE '+(table==='scores'?'id':'owner')+'=?',metrics.answerMs,metrics.score,row.id||row.owner);
   }
  }
  this.sql.exec('CREATE INDEX IF NOT EXISTS scores_points ON scores(score DESC,answerMs,id)');
 }
 challenge(owner,ticket,now){const row=this.sql.exec('SELECT * FROM challenges WHERE owner=?',owner).toArray()[0];return row&&row.ticket===ticket&&now-row.started<=expiresAfter?row:null;}
 async fetch(request){
  const url=new URL(request.url),data=await request.json(),owner=data.owner||'',now=Date.now();
  if(url.pathname==='/ranking'){
   const entries=this.sql.exec('SELECT id,name,ms,timestamp,correct,answerMs,score,timingVersion FROM scores ORDER BY score DESC,answerMs,id LIMIT 100').toArray();
   const own=owner?this.sql.exec('SELECT id,name,ms,timestamp,correct,answerMs,score,timingVersion FROM scores WHERE id=?',owner).toArray()[0]||null:null;
   return Response.json({entries,own,uid:owner,ownKnown:true,at:now});
  }
  if(!/^[a-f0-9]{64}$/.test(owner))return fail('identity-required',401);
  if(url.pathname==='/ranking/start'){
   const ids=pick(),ticket=crypto.randomUUID(),started=now+3000,timed=data.timingVersion===2;
   this.sql.exec('DELETE FROM challenges WHERE started<?',now-expiresAfter);
   const timing=timed?JSON.stringify({version:2,log:[],opened:null}):null;
   this.sql.exec('INSERT INTO challenges(owner,ticket,started,ids,result,timing) VALUES(?,?,?,?,NULL,?) ON CONFLICT(owner) DO UPDATE SET ticket=excluded.ticket,started=excluded.started,ids=excluded.ids,result=NULL,timing=excluded.timing',owner,ticket,started,JSON.stringify(ids),timing);
   return Response.json({ticket,ids,...(timed?{timingVersion:2}:{})});
  }
  if(url.pathname==='/ranking/question'||url.pathname==='/ranking/answer'){
   const row=this.challenge(owner,data.ticket,now);if(!row)return fail('challenge-expired',409);
   if(!row.timing||row.result)return fail('challenge-state',409);
   const timing=JSON.parse(row.timing),ids=JSON.parse(row.ids),index=data.index;
   if(!Number.isInteger(index)||index<0||index>=10)return fail('question-order',409);
   if(url.pathname==='/ranking/question'){
    if(index!==timing.log.length||now<row.started)return fail('question-order',409);
    // Retrying a question start cannot reset the server clock.
    if(timing.opened===null){timing.opened=now;this.sql.exec('UPDATE challenges SET timing=? WHERE owner=?',JSON.stringify(timing),owner);}
    return Response.json({index,id:ids[index],started:timing.opened});
   }
   if(data.id!==ids[index]||typeof data.raw!=='string'||data.raw.length>160)return fail('invalid-answers');
   if(index<timing.log.length){const previous=timing.log[index];return previous.raw===data.raw?Response.json(previous):fail('answer-already-recorded',409);}
   if(index!==timing.log.length||timing.opened===null)return fail('question-order',409);
   const elapsed=Math.max(1,now-timing.opened),answerMs=Math.min(45000,elapsed),correct=elapsed<=45000&&C.answerOK(data.raw,byId.get(ids[index]).answers);
   const answer={index,id:data.id,raw:data.raw,correct,answerMs};timing.log.push(answer);timing.opened=null;
   this.sql.exec('UPDATE challenges SET timing=? WHERE owner=?',JSON.stringify(timing),owner);
   return Response.json(answer);
  }
  if(url.pathname==='/ranking/finish'){
   const row=this.challenge(owner,data.ticket,now);if(!row)return fail('challenge-expired',409);
   if(row.result)return Response.json(JSON.parse(row.result));
   const ids=JSON.parse(row.ids),answers=data.answers;
   if(!Array.isArray(answers)||answers.length!==10||answers.some((a,i)=>a?.id!==ids[i]||typeof a.raw!=='string'||a.raw.length>160))return fail('invalid-answers');
   let correct,answerMs,ms,timingVersion;
   if(row.timing){
    const timing=JSON.parse(row.timing);
    if(timing.log.length!==10||answers.some((a,i)=>a.raw!==timing.log[i].raw))return fail('unverified-answers',409);
    correct=timing.log.filter(a=>a.correct).length;answerMs=timing.log.reduce((sum,a)=>sum+a.answerMs,0);ms=answerMs;timingVersion=2;
   }else{
    // Allow an already-running older client to finish during the deployment.
    answerMs=now-row.started;if(answerMs<1000)return fail('too-fast');
    correct=answers.filter((a,i)=>C.answerOK(a.raw,byId.get(ids[i]).answers)).length;ms=answerMs+(10-correct)*5000;timingVersion=1;
   }
   const score=C.rankingScore(correct,answerMs),round={elapsedMs:ms,roundCorrect:correct,durationMs:answerMs,penaltyMs:ms-answerMs,roundAnswerMs:answerMs,roundScore:score};
   const previous=this.sql.exec('SELECT proof,ms,timestamp,correct,answerMs,score,timingVersion FROM receipts WHERE owner=?',owner).toArray()[0];
   let best=previous;
   if(!previous||C.rankingCompare({score,answerMs},previous)<0){
    best={proof:crypto.randomUUID(),ms,timestamp:now,correct,answerMs,score,timingVersion};
    this.sql.exec('INSERT INTO receipts(owner,proof,ms,timestamp,correct,answerMs,score,timingVersion) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET proof=excluded.proof,ms=excluded.ms,timestamp=excluded.timestamp,correct=excluded.correct,answerMs=excluded.answerMs,score=excluded.score,timingVersion=excluded.timingVersion',owner,best.proof,ms,now,correct,answerMs,score,timingVersion);
   }
   const result={...best,...round};this.sql.exec('UPDATE challenges SET result=? WHERE owner=?',JSON.stringify(result),owner);return Response.json(result);
  }
  if(url.pathname==='/ranking/register'){
   const name=cleanName(data.name);if(!name)return fail('nickname');
   const receipt=this.sql.exec('SELECT proof,ms,correct,answerMs,score,timingVersion FROM receipts WHERE owner=?',owner).toArray()[0];
   if(!receipt||receipt.proof!==data.proof)return fail('verified-record-required',409);
   const old=this.sql.exec('SELECT id,name,ms,timestamp,correct,answerMs,score,timingVersion FROM scores WHERE id=?',owner).toArray()[0];
   if(old&&C.rankingCompare(receipt,old)>=0){
    if(old.name===name)return Response.json({updated:false,entry:old});
    this.sql.exec('UPDATE scores SET name=? WHERE id=?',name,owner);return Response.json({updated:true,renamed:true,entry:{...old,name}});
   }
   this.sql.exec('INSERT INTO scores(id,name,ms,timestamp,correct,answerMs,score,timingVersion) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,ms=excluded.ms,timestamp=excluded.timestamp,correct=excluded.correct,answerMs=excluded.answerMs,score=excluded.score,timingVersion=excluded.timingVersion',owner,name,receipt.ms,now,receipt.correct,receipt.answerMs,receipt.score,receipt.timingVersion);
   const {proof,...metrics}=receipt;return Response.json({updated:true,entry:{id:owner,name,timestamp:now,...metrics}});
  }
  return fail('not-found',404);
 }
}
export async function rankingRequest(request,env,reply){
 const path=new URL(request.url).pathname;
 if(!['/ranking','/ranking/start','/ranking/question','/ranking/answer','/ranking/finish','/ranking/register'].includes(path))return reply({error:'not-found'},404);
 if(request.method==='OPTIONS')return reply({ok:true});
 if(request.method!==(path==='/ranking'?'GET':'POST'))return reply({error:'method-not-allowed'},405);
 if(!env.LEADERBOARD||!env.RANK_READ_LIMITER||!env.RANK_WRITE_LIMITER||!env.RANK_GLOBAL_LIMITER)return reply({error:'not-configured'},503);
 const rate=await (path==='/ranking'?env.RANK_READ_LIMITER:env.RANK_WRITE_LIMITER).limit({key:request.headers.get('CF-Connecting-IP')||'anonymous'}),globalRate=await env.RANK_GLOBAL_LIMITER.limit({key:'site'});
 if(!rate.success||!globalRate.success)return reply({error:'rate-limited'},429);
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 if(token&&!/^[a-f0-9]{64}$/.test(token))return reply({error:'identity-required'},401);
 const digest=token?await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)):null,owner=digest?Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''):'';
 let data={};if(request.method==='POST'){if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'json-required'},415);if(Number(request.headers.get('Content-Length'))>8000)return reply({error:'too-large'},413);try{const body=await request.text();if(body.length>8000)return reply({error:'too-large'},413);data=JSON.parse(body);if(!data||Array.isArray(data)||typeof data!=='object')throw Error();}catch{return reply({error:'invalid-json'},400);}}
 try{const stub=env.LEADERBOARD.get(env.LEADERBOARD.idFromName('alltime-v1'));const response=await stub.fetch(new Request('https://internal'+path,{method:'POST',body:JSON.stringify({...data,owner})}));return reply(await response.json(),response.status);}catch{return reply({error:'ranking-unavailable'},503);}
}
