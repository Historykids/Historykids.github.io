const assert=require('node:assert/strict'),{harness,M,C}=require('./holdem-harness.cjs');
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS',name);};
(async()=>{
 const H=await import('../server/ranking-api/holdem.mjs');
 function game(count=2,stake='100',rebirths=10,deck=C.deck()){
  const s=H.empty();s.stake=M.full(stake);s.players=Array.from({length:count},(_,i)=>({id:String(i),name:'席'+i,rebirths,paid:true}));H.start(s,deck,100000,'engine-hand');return s;
 }
 const doAction=(s,type,total)=>H.action(s,s.players[s.turn].id,type,total,100000);
 await test('heads-up deals two private cards, posts exact blinds and reverses postflop order',()=>{
  const deck=C.deck(),s=game(2,'100',10,deck);assert.equal(s.dealer,0);assert.equal(s.sb,0);assert.equal(s.bb,1);assert.equal(s.turn,0);
  assert.deepEqual(s.players[1].hand,[deck[0],deck[2]]);assert.deepEqual(s.players[0].hand,[deck[1],deck[3]]);
  assert.equal(s.players[0].stack,'99');assert.equal(s.players[1].stack,'98');
  doAction(s,'call');doAction(s,'check');assert.equal(s.street,'flop');assert.equal(s.turn,1);assert.deepEqual(s.board,deck.slice(5,8));
 });
 await test('six players finish four streets with unique cards, burns, and best five of seven',()=>{
  const deck=C.deck(),s=game(6,'100',0,deck);let turns=0;
  while(s.phase==='playing'&&turns++<40)doAction(s,H.options(s).check?'check':'call');
  assert.equal(s.phase,'showdown');assert.equal(turns,24);assert.deepEqual(s.board,[...deck.slice(13,16),deck[17],deck[19]]);
  assert.equal(new Set([...s.players.flatMap(p=>p.hand),...s.board]).size,17);
  assert.equal(s.settlements.reduce((n,p)=>n+BigInt(p.payout),0n),600n);assert.equal(s.result.pot,'12');
  for(const p of s.players)assert.equal(s.settlements.find(x=>x.id===p.id).handName,C.evaluate([...p.hand,...s.board]).name);
 });
 await test('invalid turn, free call, undersized raise and excessive bet cannot mutate the hand',()=>{
  const s=game();const before=JSON.stringify(s);
  assert.throws(()=>H.action(s,'1','call',undefined,100000),/poker-turn/);assert.throws(()=>doAction(s,'check'),/poker-check/);assert.throws(()=>doAction(s,'raise','3'),/poker-raise/);assert.throws(()=>doAction(s,'raise','101'),/poker-raise/);assert.equal(JSON.stringify(s),before);
  doAction(s,'call');assert.throws(()=>doAction(s,'call'),/poker-check/);
 });
 await test('all-ins run out remaining streets without a phantom turn',()=>{
  const s=game();doAction(s,'allin');assert.equal(s.players[0].stack,'0');doAction(s,'call');assert.equal(s.phase,'showdown');assert.equal(s.board.length,5);assert.equal(s.deadline,null);assert.equal(s.deck.length,0);assert.equal(s.result.pot,'200');assert.equal(s.settlements.reduce((n,p)=>n+BigInt(p.payout),0n),400n);
 });
 await test('short all-ins preserve raise rights until cumulative increases reach a full raise',()=>{
  const s=game(4);Object.assign(s,{street:'flop',board:['AS','KH','QD'],currentBet:'10',minRaise:'10',bigBlind:'2',turn:0,raiseEpoch:1});
  s.players.forEach(p=>Object.assign(p,{hand:['2C','3C'],stack:'100',bet:'10',invested:'10',acted:1,faced:'10',reopen:'10'}));
  Object.assign(s.players[1],{stack:'5',acted:-1});Object.assign(s.players[2],{stack:'10',acted:-1});s.turn=1;
  doAction(s,'allin');assert.equal(s.currentBet,'15');assert.equal(s.raiseEpoch,1);assert.equal(s.turn,2);doAction(s,'allin');assert.equal(s.currentBet,'20');
  assert.equal(s.turn,3);assert(H.options(s).canRaise);assert.equal(H.options(s).min,'30');
  const t=game(3);Object.assign(t,{currentBet:'10',minRaise:'10',turn:1,raiseEpoch:1});
  t.players.forEach(p=>Object.assign(p,{bet:'10',invested:'10',stack:'100',acted:1,faced:'10',reopen:'10'}));t.players[1].stack='5';t.players[1].acted=-1;
  doAction(t,'allin');assert.equal(t.turn,2);assert.equal(H.options(t).canRaise,false);assert.throws(()=>doAction(t,'raise','30'),/poker-raise/);
 });
 await test('a short opening all-in may be completed to the big blind',()=>{
  const s=game(3);Object.assign(s,{street:'flop',currentBet:'0',minRaise:'2',turn:0,raiseEpoch:0});
  s.players.forEach(p=>Object.assign(p,{stack:'50',bet:'0',invested:'2',acted:-1,faced:'0',reopen:'2'}));s.players[0].stack='1';
  doAction(s,'allin');assert.equal(H.options(s).min,'2');doAction(s,'raise','2');assert.equal(s.minRaise,'2');assert.equal(s.raiseEpoch,1);
 });
 await test('side pots, tied odd ryo and uncalled refunds preserve integers above Number precision',()=>{
  const s=game(4,'10000000000000003',0);s.board=['AS','KS','QS','JS','TS'];s.dealer=0;
  const amounts=['9007199254740994','9007199254740994','9007199254740996','9007199254740997'];
  s.players.forEach((p,i)=>Object.assign(p,{hand:['2C','3D'],stack:'0',bet:amounts[i],invested:amounts[i],allin:true,folded:i===0}));
  H.settle(s,100000);assert.equal(s.settlements.reduce((n,p)=>n+BigInt(p.payout),0n),amounts.reduce((n,a)=>n+BigInt(a),0n));
  assert.equal(s.settlements[3].returned,'1');assert.equal(s.result.pots.length,2);
  // First left of button receives the odd chip in the tied main pot.
  const main=BigInt(amounts[0])*4n;assert.equal(BigInt(s.settlements[1].prize),main/3n+1n);
 });
 await test('fold win boosts only contested winnings, returns unused and unmatched ryo unchanged',()=>{
  const s=game();doAction(s,'fold');assert.equal(s.result.reveal,false);assert.equal(s.result.pot,'3');assert.equal(s.settlements[0].returned,'99');assert.equal(s.settlements[1].returned,'99');assert.equal(s.settlements[1].prize,'4');assert.equal(s.settlements[1].payout,'103');assert.equal(s.board.length,0);
 });
 await test('timeouts check for free, fold against a bet and catch up disconnected hands',()=>{
  const s=game();H.tick(s,145000);assert.equal(s.phase,'showdown');assert.equal(s.players[0].folded,true);
  const t=game();doAction(t,'call');H.tick(t,145000);assert.equal(t.street,'flop');assert.equal(t.players[1].lastAction,'チェック');H.tick(t,2000000);assert.equal(t.phase,'showdown');assert.equal(t.board.length,5);
 });
 await test('new rooms enforce Holdem protocol, twenty ryo and ten rebirths',async()=>{
  const h=await harness();try{
   await h.register(0,9);assert.equal((await h.req('/wealth/poker/reserve',{id:h.id(0),stake:100,rules:'holdem-v1'})).body.error,'poker-locked');await h.register(0);
   assert.equal((await h.req('/wealth/poker/reserve',{id:h.id(0),stake:100})).body.error,'poker-client-update');
   assert.equal((await h.req('/wealth/poker/reserve',{id:h.id(0),stake:19,rules:'holdem-v1'})).body.error,'poker-buyin');
   const s=await h.join(0);assert.equal(s.rules,'holdem-v1');assert(s.protocols.includes('holdem-v1'));
  }finally{h.close();}
 });
 await test('private hole cards survive restart and late visitors can only spectate',async()=>{
  const h=await harness();try{
   for(let i=0;i<3;i++)await h.register(i);await h.join(0);await h.join(1);h.advance(10000);
   const a=(await h.req('/wealth/poker')).body;assert.equal(a.players[0].hand.length,2);assert.equal(a.players[1].hand,null);assert(!('deck'in a));assert(!JSON.stringify(a).includes('owner'));assert(!('settlements'in a));
   h.restart();assert.deepEqual((await h.req('/wealth/poker')).body.players[0].hand,a.players[0].hand);
   const watch=(await h.req('/wealth/poker',undefined,2)).body;assert.equal(watch.ownId,null);assert.equal(watch.options,null);assert(watch.players.every(p=>p.hand===null));
   assert.equal((await h.req('/wealth/poker/reserve',{id:h.id(2),stake:100,rules:'holdem-v1'},2)).body.error,'poker-spectating');
  }finally{h.close();}
 });
 await test('action ownership, optimistic version and retry IDs prevent duplicate or forged betting',async()=>{
  const h=await harness();try{
   await h.register(0);await h.register(1);await h.join(0);await h.join(1);h.advance(10000);
   const s=(await h.req('/wealth/poker')).body,body={id:h.id(0),handId:s.handId,version:s.actionVersion,requestId:'request_holdem_000001',action:'call'};
   assert.equal((await h.req('/wealth/poker/action',body,1)).status,403);
   h.failSql('UPDATE poker_room');assert.equal((await h.req('/wealth/poker/action',body)).status,503);h.failSql('');assert.equal(h.room().actionVersion,0);
   assert.equal((await h.req('/wealth/poker/action',body)).status,200);assert.equal((await h.req('/wealth/poker/action',body)).status,200);assert.equal(h.room().actionVersion,1);
   assert.equal((await h.req('/wealth/poker/action',{...body,action:'raise',total:'4'})).body.error,'poker-action-reused');
   assert.equal((await h.req('/wealth/poker/action',{...body,id:h.id(1),requestId:'request_holdem_000002',action:'check'},1)).body.error,'poker-state-changed');
   assert.equal((await h.req('/wealth/poker/draw',{id:h.id(0),handId:s.handId,holds:[]})).body.error,'poker-client-update');
  }finally{h.close();}
 });
 await test('all-in result receipts persist through restarts and acknowledgements remain idempotent',async()=>{
  const h=await harness();try{
   await h.register(0);await h.register(1);await h.join(0);await h.join(1);h.advance(10000);
   assert.equal((await h.act(0,'allin')).status,200);assert.equal((await h.act(1,'call')).status,200);
   h.restart();const a=(await h.req('/wealth/poker')).body,b=(await h.req('/wealth/poker',undefined,1)).body;
   assert.equal(a.phase,'showdown');assert.equal(a.board.length,5);assert.equal(BigInt(a.ticket.payout)+BigInt(b.ticket.payout),400n);assert.equal(a.ticket.rules,'holdem-v1');
   assert.equal(a.ticket.returned,'0');assert.equal(a.ticket.status,'done');
   await h.req('/wealth/poker/ack',{id:h.id(0)});await h.req('/wealth/poker/ack',{id:h.id(0)});assert.equal((await h.req('/wealth/poker')).body.ticket,null);
  }finally{h.close();}
 });
 await test('a full room opens another room with isolated cards, turns and pots',async()=>{
  const h=await harness();try{
   for(let i=0;i<8;i++){await h.register(i);await h.join(i,100,i<6?'royal-one':'royal-2');}
   h.advance(10000);const a=(await h.req('/wealth/poker')).body,b=(await h.req('/wealth/poker',undefined,6)).body;
   assert.equal(a.players.length,6);assert.equal(b.players.length,2);assert.notEqual(a.handId,b.handId);assert.equal(a.room,'royal-one');assert.equal(b.room,'royal-2');assert(a.rooms.length>=2);
   assert.equal((await h.req('/wealth/poker/reserve',{id:h.id(99),stake:100,rules:'holdem-v1',room:'royal-2'})).body.error,'poker-already-joined');
   const before=JSON.stringify(h.room(2));await h.act(3,'fold');assert.equal(JSON.stringify(h.room(2)),before);
  }finally{h.close();}
 });
 await test('an existing draw hand finishes before the room migrates to Holdem',async()=>{
  const h=await harness();try{
   for(let i=0;i<2;i++)await h.register(i);
   const s=h.board.poker.legacyEmpty();s.stake='10';s.phase='playing';s.handId='legacy-hand';s.deadline=h.now+45000;s.deck=C.deck();
   s.players=[0,1].map(i=>({id:h.id(i),owner:h.owner(i),name:'旧参加者'+i,rebirths:10,paid:true,hand:s.deck.splice(0,5),drawn:false,folded:false,holds:[]}));
   for(const p of s.players)h.board.poker.saveTicket({id:p.id,owner:p.owner,room:'royal-one',status:'paid',stake:'10',rebirths:10,at:h.now,payout:'0'});
   const json=JSON.stringify(s);h.db.prepare('UPDATE poker_room SET state=? WHERE singleton=1').run(json);h.db.prepare('UPDATE poker_rooms SET state=? WHERE id=1').run(json);
   for(let i=0;i<2;i++)assert.equal((await h.req('/wealth/poker/draw',{id:h.id(i),handId:s.handId,holds:[0,1,2,3,4]},i)).status,200);
   assert.equal((await h.req('/wealth/poker')).body.phase,'showdown');h.advance(10000);const next=(await h.req('/wealth/poker')).body;assert.equal(next.rules,'holdem-v1');assert.equal(next.phase,'lobby');
  }finally{h.close();}
 });
 console.log(checks+' Holdem engine and server checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
