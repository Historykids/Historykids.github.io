const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 const {default:worker,HistoryLeaderboard}=await import('../server/ranking-api/worker.mjs');
 function harness(legacy=false){
  const db=new DatabaseSync(':memory:');
  if(legacy){db.exec('CREATE TABLE operation_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL)');db.prepare('INSERT INTO operation_notices(requestId,title,body,createdAt) VALUES(?,?,?,?)').run('old_broadcast_00001','従来のお知らせ','全員向けの本文',1);}
  const storage={sql:{exec(q,...args){if(!args.length&&q.includes(';')){db.exec(q);return{toArray:()=>[]};}const s=db.prepare(q);if(/^(SELECT|PRAGMA)/i.test(q))return{toArray:()=>s.all(...args)};s.run(...args);return{toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
  let now=100000,board=new HistoryLeaderboard({storage});board.poker.now=()=>now;
  const tokens=Array.from({length:16},(_,i)=>(i+1).toString(16).padStart(64,'0')),hash=i=>createHash('sha256').update(tokens[i]).digest('hex'),limiter={limit:async()=>({success:true})};
  const env={LEADERBOARD:{idFromName:n=>n,get:()=>({fetch:r=>board.fetch(r)})},RANK_READ_LIMITER:limiter,RANK_WRITE_LIMITER:limiter,RANK_GLOBAL_LIMITER:limiter,ADMIN_CLAIM_LIMITER:limiter,POKER_ROOM_LIMITER:limiter};
  async function req(route,body,index=0,tokenOverride=null){const r=await worker.fetch(new Request('https://api.example'+route,{method:body===undefined?'GET':'POST',headers:{Origin:'https://historykids.github.io',...(index===null?{}:{Authorization:'Bearer '+(tokenOverride||tokens[index])}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return{status:r.status,body:await r.json()};}
  async function register(i,name='参加者'+i){const own=(await req('/wealth',undefined,i)).body;const r=await req('/wealth/register',{name,expectedRevision:own.ownRevision||0,snapshot:{balance:1000,rebirths:10,buildings:{},residents:{}}},i);assert.equal(r.status,200);}
  const id=i=>'expansion_ticket_'+String(i).padStart(10,'0');
  async function join(i,room='royal-one',stake=10){assert.equal((await req('/wealth/poker/reserve',{id:id(i),stake,room},i)).status,200);assert.equal((await req('/wealth/poker/commit',{id:id(i),room},i)).status,200);}
  return{db,storage,tokens,hash,req,register,join,id,get board(){return board;},advance(ms){now+=ms;},restart(){board=new HistoryLeaderboard({storage});board.poker.now=()=>now;}};
 }
 const h=harness(true),{req,register,hash}=h;
 await test('existing broadcast notices migrate as public without changing titles, bodies or identifiers',async()=>{
  const notice=(await req('/wealth/notices',undefined,null)).body.notices[0];assert.equal(notice.id,1);assert.equal(notice.audience,'all');assert.equal(notice.title,'従来のお知らせ');h.restart();assert.equal((await req('/wealth/notices',undefined,null)).body.notices.length,1);
 });
 await test('only an authenticated administrator can inspect recipient choices',async()=>{
  await register(0);await register(1,'同じ名前');await register(2,'同じ名前');h.board.admin.verify=async c=>c==='12345678';assert.equal((await req('/wealth/admin/claim',{code:'12345678'})).status,200);
  assert.equal((await req('/wealth/admin/recipients',undefined,null)).status,401);assert.equal((await req('/wealth/admin/recipients?owner='+hash(0),undefined,1)).status,403);
  const people=(await req('/wealth/admin/recipients')).body.recipients;assert.equal(people.filter(p=>p.name==='同じ名前').length,2);assert.equal(new Set(people.map(p=>p.id)).size,3);assert(!JSON.stringify(people).includes(h.tokens[1]));
 });
 await test('a personal notice is delivered only to its bound identity, including after rename and restart',async()=>{
  const sent=await req('/wealth/admin/personal-notices',{requestId:'personal_notice_0001',title:'個人宛ての件名',body:'この本文は本人だけ',recipient:hash(1),recipientName:'偽の名前'});assert.equal(sent.status,200);assert.equal(sent.body.sent.recipientName,'同じ名前');assert(!sent.body.notices.some(n=>n.title==='個人宛ての件名'));assert(!h.db.prepare('SELECT title,body FROM operation_notices').all().some(n=>n.body==='この本文は本人だけ'));assert.equal(h.db.prepare('SELECT COUNT(*) n FROM operation_personal_notices').get().n,1);
  const received=(await req('/wealth/notices',undefined,1)).body;assert.equal(received.notices[0].audience,'personal');assert.equal(received.notices[0].body,'この本文は本人だけ');assert(!JSON.stringify(received).includes(hash(1)));assert(!JSON.stringify(received).includes('recipientName'));
  for(const index of [null,0,2])assert(!(await req('/wealth/notices?recipient='+hash(1),undefined,index)).body.notices.some(n=>n.title==='個人宛ての件名'));
  assert(!(await req('/wealth/notices',undefined,1,hash(1))).body.notices.some(n=>n.title==='個人宛ての件名'));
  await register(1,'新しい名前');h.restart();assert((await req('/wealth/notices',undefined,1)).body.notices.some(n=>n.body==='この本文は本人だけ'));
 });
 await test('personal delivery retries cannot change the recipient or silently become a broadcast',async()=>{
  const body={requestId:'personal_notice_0001',title:'個人宛ての件名',body:'この本文は本人だけ',recipient:hash(1)};
  assert.equal((await req('/wealth/admin/personal-notices',body)).status,200);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM operation_notices').get().n,1);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM operation_personal_notices').get().n,1);
  assert.equal((await req('/wealth/admin/notices',{...body,recipient:''})).status,409);assert.equal((await req('/wealth/admin/personal-notices',{...body,recipient:hash(2)})).status,409);assert.equal((await req('/wealth/admin/personal-notices',{...body,recipient:''})).status,400);assert.equal((await req('/wealth/admin/notices',{...body,requestId:'wrong_path_000001'})).status,400);
  assert.equal((await req('/wealth/admin/personal-notices',{...body,requestId:'unknown_recipient_01',recipient:'f'.repeat(64)})).status,404);
  assert.equal((await req('/wealth/admin/personal-notices',{...body,requestId:'invalid_recipient_01',recipient:null})).status,400);
  assert.equal((await req('/wealth/admin/personal-notices',{...body,requestId:'forged_sender_00001',owner:hash(0),admin:true},2)).status,403);
  assert.equal((await req('/wealth/notices',undefined,null)).body.notices.length,1);
 });
 await test('a full six-seat room creates exactly one next room, even with simultaneous refreshes',async()=>{
  for(let i=0;i<14;i++)await register(i);
  assert.equal((await req('/wealth/poker/reserve',{id:h.id(99),room:'royal-999',stake:10},14)).status,404);
  for(let i=0;i<6;i++)await h.join(i);
  let rooms=(await req('/wealth/poker',undefined,12)).body.rooms;assert.deepEqual(rooms.map(r=>r.id),['royal-one','royal-2']);assert.equal(rooms[0].seats,6);assert.equal(rooms[1].seats,0);
  await Promise.all(Array.from({length:8},()=>req('/wealth/poker',undefined,12)));assert.equal(h.db.prepare('SELECT COUNT(*) n FROM poker_rooms').get().n,2);
  for(let i=6;i<12;i++)await h.join(i,'royal-2',50);
  rooms=(await req('/wealth/poker?room=royal-2',undefined,12)).body.rooms;assert.deepEqual(rooms.map(r=>r.id),['royal-one','royal-2','royal-3']);assert.equal(rooms[1].stake,'50');
 });
 await test('one identity cannot occupy two rooms and spectator responses never include another room’s hands',async()=>{
  assert.equal((await req('/wealth/poker/reserve',{id:h.id(100),stake:50,room:'royal-2'},0)).status,409);
  h.advance(10000);const a=(await req('/wealth/poker',undefined,0)).body,b=(await req('/wealth/poker?room=royal-2',undefined,6)).body;
  assert.equal(a.room,'royal-one');assert.equal(b.room,'royal-2');assert.notEqual(a.handId,b.handId);assert.equal(a.stake,'10');assert.equal(b.stake,'50');
  assert.equal(a.players.filter(p=>p.hand).length,1);assert.equal(b.players.filter(p=>p.hand).length,1);assert(a.rooms.every(r=>!('hand' in r)&&!('playersData' in r)));
  const watcher=(await req('/wealth/poker?room=royal-2',undefined,12)).body;assert.equal(watcher.ownId,null);assert(watcher.players.every(p=>p.hand===null));assert.equal((await req('/wealth/poker/reserve',{id:h.id(12),stake:50,room:'royal-2'},12)).body.error,'poker-spectating');
  assert.equal((await req('/wealth/poker/draw',{id:h.id(0),handId:a.handId,holds:[],room:'royal-2'},6)).status,403);
 });
 await test('each room settles its own pot and reconnection follows the player’s existing room',async()=>{
  h.restart();const b=(await req('/wealth/poker',undefined,6)).body;assert.equal(b.room,'royal-2');assert.equal(b.ticket.room,'royal-2');
  for(let i=6;i<12;i++)assert.equal((await req('/wealth/poker/draw',{id:h.id(i),handId:b.handId,holds:[0,1,2,3,4],room:'royal-2'},i)).status,200);
  const done=(await req('/wealth/poker',undefined,6)).body;assert.equal(done.phase,'showdown');assert.equal(done.result.pot,'300');assert.equal(done.ticket.stake,'50');assert.equal(h.board.poker.ticket(h.id(0)).status,'paid');
  for(let i=6;i<12;i++)await req('/wealth/poker/ack',{id:h.id(i)},i);
  await h.join(12,'royal-3',25);const refunded=(await req('/wealth/poker/leave',{id:h.id(12)},12)).body;assert.equal(refunded.room,'royal-3');assert.equal(refunded.ticket.payout,'25');assert.equal(h.board.poker.ticket(h.id(0)).status,'paid');
 });
 await test('an unfinished legacy room and tickets migrate without redealing or losing their payout claims',async()=>{
  const old=harness();for(let i=0;i<2;i++){await old.register(i);await old.join(i);}old.advance(10000);
  const before=(await old.req('/wealth/poker')).body;
  for(let i=0;i<2;i++){const t=old.board.poker.ticket(old.id(i));delete t.room;old.board.poker.saveTicket(t);}
  old.db.exec('DROP TABLE poker_rooms');old.restart();const after=(await old.req('/wealth/poker')).body;assert.equal(after.handId,before.handId);assert.deepEqual(after.players[0].hand,before.players[0].hand);assert.equal(after.ticket.room,'royal-one');assert.equal(after.players.length,2);
  const legacy=JSON.parse(old.db.prepare('SELECT state FROM poker_room').get().state);legacy.players[0].drawn=true;old.db.prepare('UPDATE poker_room SET state=?').run(JSON.stringify(legacy));assert((await old.req('/wealth/poker')).body.players[0].drawn);
 });
 console.log(checks+' expansion server checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
