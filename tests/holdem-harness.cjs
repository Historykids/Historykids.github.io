const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const M=require('../assets/ui/amounts.js'),C=require('../assets/ui/table-rules.js');
async function harness(){
 const {default:worker,HistoryLeaderboard}=await import('../server/ranking-api/worker.mjs');
 const db=new DatabaseSync(':memory:');let failSql='',now=100000,loss='';
 const storage={sql:{exec(q,...args){if(failSql&&q.startsWith(failSql))throw Error('write failed');if(!args.length&&q.includes(';')){db.exec(q);return{toArray:()=>[]};}const st=db.prepare(q);if(/^(SELECT|PRAGMA)/i.test(q))return{toArray:()=>st.all(...args)};st.run(...args);return{toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 let board=new HistoryLeaderboard({storage});board.poker.now=()=>now;
 const tokens=Array.from({length:16},(_,i)=>(i+1).toString(16).padStart(64,'0')),owner=i=>createHash('sha256').update(tokens[i]).digest('hex'),id=i=>'holdem_ticket_'+String(i).padStart(20,'0');
 const limiter={limit:async()=>({success:true})},env={LEADERBOARD:{idFromName:n=>n,get:()=>({fetch:r=>board.fetch(r)})},RANK_READ_LIMITER:limiter,RANK_WRITE_LIMITER:limiter,RANK_GLOBAL_LIMITER:limiter,ADMIN_CLAIM_LIMITER:limiter,POKER_ROOM_LIMITER:limiter,ACCOUNT_AUTH_LIMITER:limiter},calls=[];
 async function fetch(url,options={}){
  const path=new URL(url).pathname,headers=new Headers(options.headers);headers.set('Origin','https://historykids.github.io');calls.push({path,body:options.body?JSON.parse(options.body):null});
  const r=await worker.fetch(new Request(url,{method:options.method||'GET',headers,...(options.body?{body:options.body}:{})}),env);
  if(loss===path){loss='';throw Error('response lost');}return r;
 }
 async function req(path,body,i=0){
  const r=await fetch('https://api.example'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+tokens[i],...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{status:r.status,body:await r.json()};
 }
 async function register(i,rebirths=10,balance=1000){
  const old=(await req('/wealth',undefined,i)).body;
  const r=await req('/wealth/register',{name:'参加者'+i,snapshot:{rebirths,balance,buildings:{},residents:{}},expectedRevision:old.ownRevision||0},i);assert.equal(r.status,200);return r.body;
 }
 async function join(i,stake=100,room='royal-one',ticket=id(i)){
  let r=await req('/wealth/poker/reserve',{id:ticket,stake:M.full(stake),rules:'holdem-v1',room},i);assert.equal(r.status,200,JSON.stringify(r));
  r=await req('/wealth/poker/commit',{id:ticket},i);assert.equal(r.status,200);return r.body;
 }
 async function act(i,action,total,extra={}){
  const s=(await req('/wealth/poker',undefined,i)).body;
  return req('/wealth/poker/action',{id:s.ownId,handId:s.handId,version:s.actionVersion,requestId:crypto.randomUUID(),action,...(total===undefined?{}:{total:M.full(total)}),...extra},i);
 }
 return{db,storage,tokens,owner,id,fetch,calls,req,register,join,act,get board(){return board;},get now(){return now;},advance(ms){now+=ms;},restart(){board=new HistoryLeaderboard({storage});board.poker.now=()=>now;},failSql(value){failSql=value;},lose(path){loss=path;},room(room=1){return JSON.parse(db.prepare(room===1?'SELECT state FROM poker_room WHERE singleton=1':'SELECT state FROM poker_rooms WHERE id=?').get(...(room===1?[]:[room])).state);},close(){db.close();}};
}
module.exports={harness,M,C};
