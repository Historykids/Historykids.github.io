const assert=require('node:assert/strict'),{setup,join,get,act,raw,seed,grant,begin,finish,store}=require('./sengoku-worlds.cjs'),R=require('../assets/ui/sengoku-kuni-map.js'),G=require('../assets/ui/sengoku-world-rules.js');let checks=0;const test=async(n,f)=>{await f();checks++;console.log('PASS',n);};
(async()=>{
await test('all 70 Japanese lands are initially eligible and all overseas spawn/recovery is rejected, including zero guards',async()=>{const h=await setup(2);try{const list=(await h.req('/wealth/sengoku/worlds')).body;assert.equal(list.spawnProtectionVersion,G.spawnVersion);for(const w of list.worlds)assert.deepEqual(new Set(w.startingRegions),new Set(R.japanRegions.map(r=>r.id)));for(const region of ['qing','country_ken','country_ata']){const v=JSON.parse(h.db.prepare('SELECT state FROM sengoku_worlds WHERE id=1').get().state);v.regions.find(r=>r.id===region).garrison=0;store(h,v);assert.equal((await act(h,'join',{worldId:1,region})).status,409);}await join(h,'owari');let v=raw(h);v.world.regions.find(r=>r.id==='owari').owner=null;h.board.sengokuWorlds.sync(v.world,v.p);store(h,v.world);for(const region of ['qing','country_ken','country_ata'])assert.equal((await act(h,'respawn',{region})).body.error,'world-respawn');assert.equal((await act(h,'respawn',{region:'mino'})).status,200);}finally{h.close();}});
await test('the first holding can be attacked after its timed shield and conquered without transferring 100,000 guards',async()=>{
 const h=await setup(2);
 try{
  await join(h,'owari');await join(h,'mino',1);seed(h,1,{soldiers:1000000});
  assert.equal((await begin(h,'owari',1)).body.error,'world-protected');
  h.advance(G.PROTECTION);h.restart();
  assert.equal((await begin(h,'owari',1)).status,200);
  await finish(h,1);
  const view=await get(h,1),region=view.world.regions.find(r=>r.id==='owari');
  assert.equal(region.owner,view.own.id);
  assert.equal(region.garrison,G.INITIAL_GARRISON);
 }finally{h.close();}
});
await test('guarded Japanese ordinary land can be used immediately and stale attacks are cancelled atomically',async()=>{const h=await setup(3);try{await join(h,'owari');await join(h,'mino',1);seed(h,0,{soldiers:777,general:'nobunaga',guards:9000});seed(h,1,{soldiers:10000});h.advance(G.PROTECTION);assert.equal((await begin(h,'owari',1)).status,200);let v=raw(h);v.world.regions.find(r=>r.id==='owari').protectedUntil=h.board.sengokuWorlds.now()+864000000;store(h,v.world);const d=await join(h,'owari',2);assert.equal(d.world.regions.find(r=>r.id==='owari').garrison,G.STARTING_GARRISON);assert.equal((await get(h,1)).own.state.pending,null);assert.equal((await get(h)).own.incoming,null);assert.equal((await get(h)).own.state.soldiers,777);assert.equal((await get(h)).own.state.generals[0].id,'nobunaga');const retry=await act(h,'respawn',{region:'kai'});assert.equal(retry.status,200);assert.equal(retry.body.world.regions.find(r=>r.id==='kai').garrison,G.INITIAL_GARRISON);}finally{h.close();}});
await test('former permanent homes receive a one-time unranked top-up while former recovery holdings keep their guards',async()=>{
 const h=await setup(2);
 try{
  await join(h,'owari');await join(h,'mino',1);grant(h,0,'mikawa',300);
  const old=raw(h),home=old.world.regions.find(r=>r.id==='owari'),recovery=old.world.regions.find(r=>r.id==='mikawa');
  old.world.spawnProtectionVersion='japan-permanent-base-20261105-v1';
  home.garrison=2050;home.initialGarrisonRemaining=2000;home.spawnBaseOwner=old.p.id;
  recovery.spawnBaseOwner=old.p.id;
  h.board.sengokuWorlds.rank(old.world,old.p);store(h,old.world);
  const view=await get(h),region=view.world.regions.find(r=>r.id==='owari');
  assert.equal(region.garrison,100000);
  assert.equal(region.initialGarrisonRemaining,99950);
  assert(view.world.regions.every(r=>!Object.hasOwn(r,'spawnBaseOwner')));
  assert.equal(view.world.regions.find(r=>r.id==='mikawa').garrison,300);
  assert.equal((await h.req('/wealth/sengoku/world/ranking')).body.own.garrison,350);
  const current=raw(h);current.world.regions.find(r=>r.id==='owari').garrison=90000;store(h,current.world);
  h.restart();assert.equal((await get(h)).world.regions.find(r=>r.id==='owari').garrison,90000);
 }finally{h.close();}
});
await test('a lost spawn response replays once without resetting guards and voluntary departure releases the base',async()=>{const h=await setup(1);try{await get(h);const payload={rules:7,type:'join',worldId:1,region:'owari',revision:0,requestId:crypto.randomUUID()},r=await h.req('/wealth/sengoku/world/action',payload);assert.equal(r.status,200);let v=raw(h);v.world.regions.find(r=>r.id==='owari').garrison=123;store(h,v.world);assert.equal((await h.req('/wealth/sengoku/world/action',payload)).body.replayed,true);assert.equal((await get(h)).world.regions.find(r=>r.id==='owari').garrison,123);assert.equal((await act(h,'leave')).status,200);const d=await get(h,0,1);assert.equal(d.world.regions.find(r=>r.id==='owari').owner,null);const rejoined=await join(h,'mino');assert.equal(rejoined.world.regions.find(r=>r.id==='mino').garrison,G.INITIAL_GARRISON);}finally{h.close();}});
await test('support and diplomatic exchange can target a first holding after its timed shield',async()=>{
 const {create,accept}=require('./sengoku-alliances.cjs'),h=await setup(3);
 try{
  await join(h,'musashi');await join(h,'izu',1);await join(h,'sagami',2);await create(h);await accept(h,1);
  seed(h,0,{soldiers:10000});h.advance(G.PROTECTION);
  assert.equal((await act(h,'support_create',{region:'sagami'})).status,200);
  const v=raw(h),target=v.world.regions.find(r=>r.id==='sagami');
  assert.equal(h.board.sengokuWorlds.expansion.hit(target,100).remaining,99900);
  assert.equal((await act(h,'treaty_offer',{targetId:v.world.players[2].id,scope:'player',kind:'exchange',giveRegion:'musashi',receiveRegion:'sagami'})).status,200);
 }finally{h.close();}
});
console.log(checks+' Japanese starting-garrison checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
