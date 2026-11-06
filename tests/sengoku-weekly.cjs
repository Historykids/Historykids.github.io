const assert=require('node:assert/strict'),{setup,get,act,join,raw,store,seed,begin,finish,answer,train}=require('./sengoku-worlds.cjs'),{create,accept}=require('./sengoku-alliances.cjs'),G=global.HKSengokuWorldRules;
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS',name);},weekly=async(h,world=1,i=0)=>{const r=await h.req('/wealth/sengoku/world/weekly?world='+world,undefined,i);assert.equal(r.status,200,JSON.stringify(r));return r.body;};
function record(h,i,wins=1,damage=10,extra={}){const {world,p}=raw(h,i);h.board.sengokuWorlds.weekly.record(world,p,{id:crypto.randomUUID(),...extra},wins,damage);}
async function rollover(h){const d=await weekly(h);h.advance(d.weekEnd-h.board.sengokuWorlds.now());return weekly(h);}
(async()=>{
const {weekStart}=await import('../server/ranking-api/sengoku-weekly.mjs');
await test('weeks close exactly Monday midnight Japan time, including year boundaries',()=>{for(const iso of ['2026-11-01T15:00:00Z','2026-12-27T15:00:00Z','2026-12-31T15:00:00Z']){const at=Date.parse(iso),start=weekStart(at),d=new Date(start+9*3600000);assert.equal(d.getUTCDay(),1);assert.equal(d.getUTCHours(),0);assert(start<=at&&at<start+7*86400000);}const at=Date.parse('2026-11-01T15:00:00Z');assert.equal(weekStart(at),at);assert.equal(weekStart(at-1),at-7*86400000);});
await test('only server-completed battles count, capture wins once, with exact damage and no quiz backfill',async()=>{const h=await setup(2);try{await join(h,'musashi');await join(h,'sagami',1);seed(h,0,{soldiers:100});seed(h,1,{soldiers:10});h.advance(G.PROTECTION+1);await train(h);assert.deepEqual((await weekly(h)).players,[]);await begin(h,'sagami');await finish(h);let d=await weekly(h);assert.equal(d.players[0].wins,1);assert.equal(d.players[0].damage,10);assert.equal(d.players[0].battles,1);assert.equal(d.players[0].own,true);h.restart();assert.equal((await weekly(h)).players[0].wins,1);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM sengoku_weekly_battles').get().n,1);assert(!JSON.stringify(d).includes(h.playerOwner(0)));assert(!JSON.stringify(d).includes(h.tokens[0]));assert.equal((await act(h,'claim',{generalId:'takauji'})).body.error,'world-general');for(const type of ['weekly_reward','weekly_score'])assert((await act(h,type,{wins:999})).status>=400);assert.equal((await get(h)).own.state.generals.length,0);}finally{h.close();}});
await test('wrong answers and partial hits earn no win; duplicate battle IDs never double count',async()=>{const h=await setup(2);try{await join(h,'musashi');await join(h,'sagami',1);seed(h,0,{soldiers:100});seed(h,1,{soldiers:120});h.advance(G.PROTECTION+1);await begin(h,'sagami');await finish(h,0,false);assert.equal((await weekly(h)).players[0].wins,0);h.advance(300000);await begin(h,'sagami');await finish(h);const d=await weekly(h);assert.equal(d.players[0].wins,0);assert.equal(d.players[0].damage,10);assert.equal(d.players[0].battles,2);record(h,0,1,20,{id:'same-id'});record(h,0,1,20,{id:'same-id'});assert.equal((await weekly(h)).players[0].wins,1);await rollover(h);assert.equal((await get(h)).own.state.generals[0].id,'takauji');}finally{h.close();}});
await test('each world settles its own champion and does not synthesize historical wins',async()=>{const h=await setup(3);try{await join(h,'owari');await join(h,'kai',1,2);await join(h,'mino',2);const v=raw(h,2);v.p.s.battlesWon=999;store(h,v.world);record(h,0,1,10);record(h,1,1,20);assert.equal((await weekly(h,1)).players.length,1);assert.equal((await weekly(h,2)).players[0].name,'world_player_01');assert.equal((await weekly(h,3)).players.length,0);await rollover(h);await weekly(h,2);for(const i of [0,1])assert.equal((await get(h,i)).own.state.generals[0].id,'takauji');assert.equal((await get(h,2)).own.state.generals.length,0);for(const world of [0,6,'bad'])assert.equal((await h.req('/wealth/sengoku/world/weekly?world='+world)).status,400);}finally{h.close();}});
await test('alliance members rank individually and rollover grants no new alliance rewards',async()=>{
 const h=await setup(3);
 try{
  for(const [i,r]of ['owari','mino','kai'].entries())await join(h,r,i);
  await create(h,0,'西軍');await accept(h,1);
  record(h,0);record(h,0);record(h,1);record(h,2);
  const current=await weekly(h);
  assert.deepEqual(current.players.map(p=>p.wins),[2,1,1]);
  assert.deepEqual(current.alliances,[]);
  assert(!Object.hasOwn(current.rewards,'alliance'));
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM sengoku_weekly_battles WHERE allianceId IS NOT NULL').get().n,0);
  const after=await rollover(h);
  assert.deepEqual(after.history.alliances,[]);
  assert.equal(after.history.players[0].name,'world_player_00');
  h.restart();await weekly(h);
  for(let i=0;i<3;i++){
   const own=(await get(h,i)).own;
   assert.equal(own.state.soldiers,0);
   assert.equal(own.state.generals.filter(g=>g.id==='takauji').length,i===0?1:0);
  }
  assert.deepEqual(h.db.prepare('SELECT kind FROM sengoku_weekly_rewards').all().map(r=>r.kind),['takauji']);
 }finally{h.close();}
});
await test('legacy settlements hide the alliance division and honor already finalized awards once',async()=>{
 const h=await setup(1);
 try{
  await join(h,'owari');seed(h,0,{soldiers:500});
  const current=await weekly(h),week=current.weekStart-7*86400000;
  const prior={players:[{name:'world_player_00',wins:1,rank:1}],alliances:[{name:'旧同盟',wins:1,rank:1}]};
  h.db.prepare('INSERT INTO sengoku_weekly_settlements(worldId,week,result,at) VALUES(?,?,?,?)').run(1,week,JSON.stringify(prior),current.weekStart);
  h.db.prepare('INSERT INTO sengoku_weekly_rewards(worldId,week,owner,kind,amount,rank) VALUES(?,?,?,?,?,?)').run(1,week,h.playerOwner(0),'soldiers',2000,2);
  h.restart();const board=await weekly(h);
  assert.deepEqual(board.history.players,prior.players);
  assert.deepEqual(board.history.alliances,[]);
  assert.deepEqual(board.received,[]);
  assert.equal((await get(h)).own.state.soldiers,2500);
  h.restart();assert.equal((await get(h)).own.state.soldiers,2500);
 }finally{h.close();}
});
await test('tie breaks use exact integer damage, last winning time and stable IDs; zero wins give no reward',async()=>{const h=await setup(3);try{for(const [i,r]of ['owari','mino','kai'].entries())await join(h,r,i);record(h,0,1,Number.MAX_SAFE_INTEGER);record(h,0,0,Number.MAX_SAFE_INTEGER);record(h,1,1,Number.MAX_SAFE_INTEGER);record(h,1,0,Number.MAX_SAFE_INTEGER-1);record(h,2,0,1);let d=await weekly(h);assert.equal(d.players[0].name,'world_player_00');assert.equal(d.players[0].damageExact,'18014398509481982');assert.equal(d.players[1].damageExact,'18014398509481981');const w2=await setup(2);try{await join(w2,'owari');await join(w2,'mino',1);record(w2,0,0,100);record(w2,1,0,200);await rollover(w2);assert.equal((await get(w2)).own.state.generals.length,0);assert.equal((await weekly(w2)).received.length,0);}finally{w2.close();}await rollover(h);assert.equal((await get(h)).own.state.generals[0].id,'takauji');}finally{h.close();}});
await test('settlement and the individual reward roll back together on storage failure and retry safely',async()=>{const h=await setup(1);try{await join(h,'owari');await create(h);record(h,0);const d=await weekly(h);h.advance(d.weekEnd-h.board.sengokuWorlds.now());h.failSql('UPDATE sengoku_weekly_rewards');assert.equal((await h.req('/wealth/sengoku/world/weekly?world=1')).status,503);assert.equal(raw(h).p.s.soldiers,0);assert.equal(raw(h).p.s.generals.length,0);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM sengoku_weekly_settlements').get().n,0);h.failSql('');h.restart();await weekly(h);assert.equal(raw(h).p.s.soldiers,0);assert.equal(raw(h).p.s.generals.length,1);await weekly(h);assert.equal(raw(h).p.s.soldiers,0);}finally{h.close();}});
await test('limited Takauji is stronger, trains and deploys normally, while ordinary recruitment stays nine',async()=>{const h=await setup(1);try{await join(h,'owari');seed(h,0,{general:'nobunaga'});record(h,0);await rollover(h);let d=await get(h);assert.equal(d.own.state.activeGeneral,'nobunaga');assert.equal(G.deployed(d.own.state).some(g=>g.id==='takauji'),false);assert.equal(Object.keys(G.generals).length,9);assert(G.general('takauji').attack>Math.max(...Object.values(G.generals).map(g=>g.attack||0)));await act(h,'commander',{generalId:'takauji'});await act(h,'formation',{generalIds:['takauji']});d=await get(h);assert.equal(G.buffs(d.own.state).attack,8);await train(h,0,'level');assert.equal((await get(h)).own.state.generals.find(g=>g.id==='takauji').level,2);record(h,0);await rollover(h);const p=(await get(h)).own.state;assert.equal(p.generals.filter(g=>g.id==='takauji').length,1);assert(p.generals.find(g=>g.id==='takauji').level>=3);assert(!G.allStandardOwned(p));}finally{h.close();}});
console.log(checks+' weekly battle ranking checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
