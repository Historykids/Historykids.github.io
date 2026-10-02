import '../../assets/ui/core.js';
import {questions} from './ranking-questions.mjs';
const C=globalThis.HKCore,byId=new Map(questions.map(q=>[q.id,q]));
const expiresAfter=30*60*1000;
const cleanName=value=>Array.from(String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,24).join('');
const randomIndex=length=>crypto.getRandomValues(new Uint32Array(1))[0]%length;
function pick(){const selected=C.eraOrder.map(era=>{const pool=questions.filter(q=>q.era===era);return pool[randomIndex(pool.length)].id;});for(let i=selected.length-1;i>0;i--){const j=randomIndex(i+1);[selected[i],selected[j]]=[selected[j],selected[i]];}return selected;}
function fail(code,status=400){return Response.json({error:code},{status});}
export class HistoryLeaderboard {
 constructor(ctx){this.ctx=ctx;this.sql=ctx.storage.sql;this.sql.exec(`CREATE TABLE IF NOT EXISTS scores(id TEXT PRIMARY KEY,name TEXT NOT NULL,ms INTEGER NOT NULL,timestamp INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS scores_time ON scores(ms,id); CREATE TABLE IF NOT EXISTS challenges(owner TEXT PRIMARY KEY,ticket TEXT NOT NULL,started INTEGER NOT NULL,ids TEXT NOT NULL,result TEXT); CREATE TABLE IF NOT EXISTS receipts(owner TEXT PRIMARY KEY,proof TEXT NOT NULL,ms INTEGER NOT NULL,timestamp INTEGER NOT NULL);`);if(!this.sql.exec('PRAGMA table_info(challenges)').toArray().some(c=>c.name==='result'))this.sql.exec('ALTER TABLE challenges ADD COLUMN result TEXT');}
 async fetch(request){
  const url=new URL(request.url),data=await request.json(),owner=data.owner||'',now=Date.now();
  if(url.pathname==='/ranking'){
   const entries=this.sql.exec('SELECT id,name,ms,timestamp FROM scores ORDER BY ms,id LIMIT 100').toArray();
   const own=owner?this.sql.exec('SELECT id,name,ms,timestamp FROM scores WHERE id=?',owner).toArray()[0]||null:null;
   return Response.json({entries,own,uid:owner,ownKnown:true,at:now});
  }
  if(!/^[a-f0-9]{64}$/.test(owner))return fail('identity-required',401);
  if(url.pathname==='/ranking/start'){
   const ids=pick(),ticket=crypto.randomUUID(),started=now+3000;
   this.sql.exec('DELETE FROM challenges WHERE started<?',now-expiresAfter);
   this.sql.exec('INSERT INTO challenges(owner,ticket,started,ids,result) VALUES(?,?,?,?,NULL) ON CONFLICT(owner) DO UPDATE SET ticket=excluded.ticket,started=excluded.started,ids=excluded.ids,result=NULL',owner,ticket,started,JSON.stringify(ids));
   return Response.json({ticket,ids});
  }
  if(url.pathname==='/ranking/finish'){
   const row=this.sql.exec('SELECT * FROM challenges WHERE owner=?',owner).toArray()[0];
   if(!row||row.ticket!==data.ticket||now-row.started>expiresAfter)return fail('challenge-expired',409);
   if(row.result)return Response.json(JSON.parse(row.result));
   const ids=JSON.parse(row.ids),answers=data.answers;
   if(!Array.isArray(answers)||answers.length!==10||answers.some((a,i)=>a?.id!==ids[i]||typeof a.raw!=='string'||a.raw.length>160||!C.answerOK(a.raw,byId.get(ids[i]).answers)))return fail('not-perfect');
   // The server clock decides the published time. Client values cannot shorten it.
   const ms=now-row.started;if(ms<1000)return fail('too-fast');
   const previous=this.sql.exec('SELECT proof,ms,timestamp FROM receipts WHERE owner=?',owner).toArray()[0];
   if(previous&&previous.ms<=ms){const result={...previous,elapsedMs:ms};this.sql.exec('UPDATE challenges SET result=? WHERE owner=?',JSON.stringify(result),owner);return Response.json(result);}
   const proof=crypto.randomUUID();this.sql.exec('INSERT INTO receipts(owner,proof,ms,timestamp) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET proof=excluded.proof,ms=excluded.ms,timestamp=excluded.timestamp',owner,proof,ms,now);
   const result={proof,ms,timestamp:now,elapsedMs:ms};this.sql.exec('UPDATE challenges SET result=? WHERE owner=?',JSON.stringify(result),owner);return Response.json(result);
  }
  if(url.pathname==='/ranking/register'){
   const name=cleanName(data.name);if(!name)return fail('nickname');
   const receipt=this.sql.exec('SELECT proof,ms FROM receipts WHERE owner=?',owner).toArray()[0];
   if(!receipt||receipt.proof!==data.proof)return fail('verified-record-required',409);
   const old=this.sql.exec('SELECT id,name,ms,timestamp FROM scores WHERE id=?',owner).toArray()[0];
   if(old&&old.ms<=receipt.ms)return Response.json({updated:false,entry:old});
   this.sql.exec('INSERT INTO scores(id,name,ms,timestamp) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,ms=excluded.ms,timestamp=excluded.timestamp WHERE excluded.ms<scores.ms',owner,name,receipt.ms,now);
   return Response.json({updated:true,entry:{id:owner,name,ms:receipt.ms,timestamp:now}});
  }
  return fail('not-found',404);
 }
}
export async function rankingRequest(request,env,reply){
 const path=new URL(request.url).pathname;
 if(!['/ranking','/ranking/start','/ranking/finish','/ranking/register'].includes(path))return reply({error:'not-found'},404);
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
