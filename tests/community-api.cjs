const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto'),C=require('../assets/ui/table-rules.js'),M=require('../assets/ui/amounts.js');
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 const {default:worker,HistoryLeaderboard}=await import('../server/ranking-api/worker.mjs');
 const db=new DatabaseSync(':memory:');let failSql='',now=100000;
 const storage={sql:{exec(q,...args){if(failSql&&q.startsWith(failSql))throw Error('write failed');if(!args.length&&q.includes(';')){db.exec(q);return{toArray:()=>[]};}const stmt=db.prepare(q);if(/^(SELECT|PRAGMA)/i.test(q))return{toArray:()=>stmt.all(...args)};stmt.run(...args);return{toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}};
 let board=new HistoryLeaderboard({storage});board.poker.now=()=>now;
 const limiter={limit:async()=>({success:true})},env={LEADERBOARD:{idFromName:n=>n,get:()=>({fetch:r=>board.fetch(r)})},RANK_READ_LIMITER:limiter,RANK_WRITE_LIMITER:limiter,RANK_GLOBAL_LIMITER:limiter,ADMIN_CLAIM_LIMITER:limiter,POKER_ROOM_LIMITER:limiter};
 const tokens=Array.from({length:8},(_,i)=>(i+1).toString(16).repeat(64)),id=i=>'poker_ticket_'+String(i).padStart(20,'0'),owner=i=>createHash('sha256').update(tokens[i]).digest('hex');
 async function req(path,body,index=0){const response=await worker.fetch(new Request('https://api.example'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://historykids.github.io',...(index===null?{}:{Authorization:'Bearer '+tokens[index]}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return{status:response.status,body:await response.json()};}
 async function register(i,rebirths=10,balance=1000){const old=(await req('/wealth',undefined,i)).body;return req('/wealth/register',{name:'王者'+i,snapshot:{rebirths,balance,buildings:{},residents:{}},expectedRevision:old.ownRevision||0},i);}
 async function join(i,stake=10,number=i){assert.equal((await req('/wealth/poker/reserve',{id:id(number),stake:M.full(stake)},i)).status,200);return req('/wealth/poker/commit',{id:id(number)},i);}
 await test('one public room rejects unregistered and under-ten participants and spoofed owners',async()=>{
  assert.equal((await req('/wealth/poker',undefined,null)).status,401);assert.equal((await req('/wealth/poker/reserve',{id:id(0),stake:10})).status,403);
  await register(0,9);await register(1);assert.equal((await req('/wealth/poker/reserve',{id:id(0),stake:10,owner:owner(1),rebirths:10000})).body.error,'poker-locked');await register(0);
  assert.equal((await req('/wealth/poker/another-room')).status,404);assert.equal((await req('/wealth/poker')).body.room,'royal-one');
 });
 await test('equal stakes, one ticket per identity and idempotent admission protect the single table',async()=>{
  const first=await req('/wealth/poker/reserve',{id:id(0),stake:10,room:'invented'});assert.equal(first.status,200);assert.equal(first.body.room,'royal-one');assert.equal(first.body.ticket.status,'reserved');assert.equal(first.body.players.length,1);
  assert.equal((await req('/wealth/poker/reserve',{id:id(0),stake:999})).body.players.length,1);assert.equal((await req('/wealth/poker/reserve',{id:id(20),stake:10})).status,409);assert.equal((await req('/wealth/poker/reserve',{id:id(0),stake:10},1)).status,403);
  assert.equal((await req('/wealth/poker/reserve',{id:id(1),stake:11},1)).body.error,'poker-stake-changed');assert.equal((await req('/wealth/poker/commit',{id:id(0)})).body.players[0].paid,true);await join(1);
  assert.equal((await req('/wealth/poker')).body.startAt,now+10000);
 });
 await test('dealing persists privately across restarts and late arrivals remain spectators',async()=>{
  const fixed=['AS','KS','QS','JS','TS','2S','2H','3D','5C','8S'];board.poker.shuffle=()=>[...fixed,...C.deck().filter(c=>!fixed.includes(c))];now+=10000;
  const a=(await req('/wealth/poker')).body;assert.equal(a.phase,'playing');assert.deepEqual(a.players[0].hand,fixed.slice(0,5));assert.equal(a.players[1].hand,null);assert(!JSON.stringify(a).includes('owner'));assert(!('deck' in a));assert(!('discards' in a));
  board=new HistoryLeaderboard({storage});board.poker.now=()=>now;
  const again=(await req('/wealth/poker')).body;assert.deepEqual(again.players[0].hand,a.players[0].hand);assert.equal(again.handId,a.handId);
  await register(2);const watch=(await req('/wealth/poker',undefined,2)).body;assert.equal(watch.ownId,null);assert(watch.players.every(p=>p.hand===null));assert.equal((await req('/wealth/poker/reserve',{id:id(2),stake:10},2)).body.error,'poker-spectating');
 });
 let handId;
 await test('only the owner exchanges once; forged cards, invalid holds and cross-player actions are rejected',async()=>{
  handId=(await req('/wealth/poker')).body.handId;assert.equal((await req('/wealth/poker/draw',{id:id(0),handId,holds:[0,0]})).status,400);
  assert.equal((await req('/wealth/poker/draw',{id:id(0),handId,holds:[0,1,2,3,4]},1)).status,403);
  const drawn=await req('/wealth/poker/draw',{id:id(0),handId,holds:[0,1,2,3,4],hand:['2H'],payout:M.MAX});assert.equal(drawn.status,200);assert(drawn.body.players[0].drawn);assert.equal(drawn.body.players[1].hand,null);
  assert.equal((await req('/wealth/poker/draw',{id:id(0),handId,holds:[]})).body.error,'poker-already-drawn');assert.equal((await req('/wealth/poker/draw',{id:id(0),handId,holds:[0,1,2,3,4]})).status,200);
 });
 await test('the server chooses the winner and produces durable, private and retryable exact payout receipts',async()=>{
  failSql='UPDATE poker_room';assert.equal((await req('/wealth/poker/draw',{id:id(1),handId,holds:[0,1,2,3,4]},1)).status,503);failSql='';assert.equal(board.poker.ticket(id(0)).status,'paid');assert.equal(board.poker.ticket(id(1)).status,'paid');
  const done=(await req('/wealth/poker/draw',{id:id(1),handId,holds:[0,1,2,3,4]},1)).body;assert.equal(done.phase,'showdown');assert.deepEqual(done.result.winners,[id(0)]);assert.equal(done.ticket.payout,'0');assert(done.players.every(p=>p.hand.length===5));
  const winner=(await req('/wealth/poker')).body;assert.equal(winner.ticket.payout,'40');assert.equal(winner.ticket.stake,'10');assert.equal(winner.ticket.status,'done');
  assert.equal((await req('/wealth/poker/commit',{id:id(0)})).body.ticket.payout,'40');await req('/wealth/poker/ack',{id:id(0)});assert.equal((await req('/wealth/poker')).body.ticket,null);assert.equal((await req('/wealth/poker/ack',{id:id(0)})).status,200);await req('/wealth/poker/ack',{id:id(1)},1);
  const spectator=(await req('/wealth/poker',undefined,2)).body;assert.equal(spectator.ticket,null);now+=10000;assert.equal((await req('/wealth/poker')).body.phase,'lobby');assert.equal((await req('/wealth/poker')).body.players.length,0);
 });
 await test('a cancelled or disconnected lobby seat returns the original stake and never starts a one-person game',async()=>{
  await join(0,25,30);const left=(await req('/wealth/poker/leave',{id:id(30)})).body;assert.equal(left.ticket.kind,'refund');assert.equal(left.ticket.payout,'25');assert.equal(left.players.length,0);await req('/wealth/poker/ack',{id:id(30)});
  await join(0,25,31);now+=91000;const expired=(await req('/wealth/poker',undefined,2)).body;assert.equal(expired.phase,'lobby');assert.equal(expired.players.length,0);assert.equal((await req('/wealth/poker')).body.ticket.payout,'25');await req('/wealth/poker/ack',{id:id(31)});
  await req('/wealth/poker/reserve',{id:id(32),stake:25});now+=31000;assert.equal((await req('/wealth/poker')).body.ticket.kind,'refund');await req('/wealth/poker/ack',{id:id(32)});
 });
 await test('six players may exchange all five without exhausting the deck or duplicating active cards',async()=>{
  for(let i=0;i<6;i++){await register(i);await join(i,10,40+i);}assert.equal((await req('/wealth/poker/reserve',{id:id(46),stake:10},6)).body.error,'poker-full');
  now+=10000;const first=(await req('/wealth/poker')).body;for(let i=0;i<6;i++)assert.equal((await req('/wealth/poker/draw',{id:id(40+i),handId:first.handId,holds:[]},i)).status,200);
  const done=(await req('/wealth/poker')).body;assert.equal(done.phase,'showdown');assert.equal(new Set(done.players.flatMap(p=>p.hand)).size,30);assert.equal(done.result.pot,'60');
  for(let i=0;i<6;i++)await req('/wealth/poker/ack',{id:id(40+i)},i);now+=10000;await req('/wealth/poker');
 });
 await test('folds and expired decisions finish fairly and never reveal folded cards',async()=>{
  await join(0,10,60);await join(1,10,61);now+=10000;await req('/wealth/poker');const folded=(await req('/wealth/poker/leave',{id:id(60)})).body;assert.equal(folded.phase,'showdown');assert.equal((await req('/wealth/poker',undefined,2)).body.players[0].hand,null);assert.equal(folded.ticket.payout,'0');assert.equal((await req('/wealth/poker',undefined,1)).body.ticket.payout,'40');
  await req('/wealth/poker/ack',{id:id(60)});await req('/wealth/poker/ack',{id:id(61)},1);now+=10000;await req('/wealth/poker');
  await join(0,10,62);await join(1,10,63);now+=10000;await req('/wealth/poker');now+=45000;const expired=(await req('/wealth/poker')).body;assert.equal(expired.phase,'showdown');assert.equal(expired.ticket.kind,'refund');assert.equal(expired.ticket.payout,'10');assert((await req('/wealth/poker',undefined,2)).body.players.every(p=>p.hand===null));
  await req('/wealth/poker/ack',{id:id(62)});await req('/wealth/poker/ack',{id:id(63)},1);now+=10000;await req('/wealth/poker');
 });
 await test('large tied pots and odd-ryo split remainders are exact and independent of hidden display digits',async()=>{
  for(const [stake,count,baseId] of [['10000000000000001',2,100],[1,3,110]]){
   const fixed=['AS','KS','QS','JS','TS','AH','KH','QH','JH','TH','2S','2H','3D','5C','8S'];board.poker.shuffle=()=>[...fixed,...C.deck().filter(c=>!fixed.includes(c))];
   for(let i=0;i<count;i++){await register(i,10,M.mul(stake,2));await join(i,stake,baseId+i);}now+=10000;const hand=(await req('/wealth/poker')).body.handId;
   for(let i=0;i<count;i++)assert.equal((await req('/wealth/poker/draw',{id:id(baseId+i),handId:hand,holds:[0,1,2,3,4]},i)).status,200);
   assert.equal(board.poker.ticket(id(baseId)).payout,count===2?M.full(M.mul(stake,2)):'4');assert.equal(board.poker.ticket(id(baseId+1)).payout,count===2?M.full(M.mul(stake,2)):'2');
   for(let i=0;i<count;i++)await req('/wealth/poker/ack',{id:id(baseId+i)},i);now+=10000;await req('/wealth/poker');
  }
  await register(0);await register(1);
 });
 await test('failed admission writes roll back the seat and ticket together',async()=>{
  failSql='INSERT INTO poker_tickets';assert.equal((await req('/wealth/poker/reserve',{id:id(70),stake:10})).status,503);failSql='';assert.equal((await req('/wealth/poker')).body.players.length,0);assert.equal(board.poker.ticket(id(70)),null);
 });
 await test('a lone connected player cannot keep the only room occupied indefinitely',async()=>{
  await join(0,10,130);for(let n=0;n<2;n++){now+=40000;assert.equal((await req('/wealth/poker')).body.ticket.status,'paid');}now+=40001;
  const expired=(await req('/wealth/poker')).body;assert.equal(expired.players.length,0);assert.equal(expired.ticket.kind,'refund');assert.equal(expired.ticket.payout,'10');await req('/wealth/poker/ack',{id:id(130)});
 });
 await test('ordinary callers cannot publish notices, including forged client administrator flags',async()=>{
  const body={requestId:id(80),title:'お知らせ',body:'テストの本文',admin:true,owner:owner(0)};
  assert.equal((await req('/wealth/admin/notices',body,1)).status,403);assert.deepEqual((await req('/wealth/notices',undefined,null)).body.notices,[]);
  board.admin.verify=async code=>code==='12345678';assert.equal((await req('/wealth/admin/claim',{code:'12345678'})).status,200);
 });
 await test('administrator notices reach anonymous recipients, preserve plain text and publish once on retries',async()=>{
  const body={requestId:id(80),title:'新しい遊びのお知らせ',body:'一行目\n<img src=x onerror=alert(1)>'};const sent=await req('/wealth/admin/notices',body);assert.equal(sent.status,200);assert.equal(sent.body.notices.length,1);
  assert.equal((await req('/wealth/admin/notices',body)).body.notices.length,1);assert.equal((await req('/wealth/admin/notices',{...body,body:'変更'})).status,409);
  const received=(await req('/wealth/notices',undefined,null)).body;assert.equal(received.notices[0].body,body.body);assert(!JSON.stringify(received).includes('requestId'));
  board=new HistoryLeaderboard({storage});board.poker.now=()=>now;assert.equal((await req('/wealth/notices',undefined,2)).body.notices[0].title,body.title);
  assert.equal((await req('/wealth/admin/notices',{requestId:id(81),title:'a'.repeat(81),body:'本文'})).status,400);assert.equal((await req('/wealth/admin/notices',{requestId:id(82),title:'件名',body:'a'.repeat(2001)})).status,400);
 });
 console.log(checks+' community server checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
