const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{setup,join}=require('./sengoku-worlds.cjs');
(async()=>{
 const h=await setup(3);try{
  await join(h,'owari');
  const pin=h.board.sengokuWorlds.expansion.adminPin,capability='private-fixture-capability',operation='transfer-sironagasu7777-v1';
  pin.transferHash=createHash('sha256').update(capability).digest('hex');
  const source=h.playerOwner(0),target=h.playerOwner(1);
  h.db.prepare('INSERT INTO wealth_admin_owner(singleton,owner,createdAt) VALUES(1,?,1)').run(source);
  const payload={operation,capability,pin:'7531'};
  await assert.rejects(pin.provision({...payload,capability:'forged'}),/admin-required/);
  await assert.rejects(pin.provision(payload),/admin-transfer-account-missing/);assert.equal(h.board.admin.owner(),source);
  for(const [name,owner]of [['sironagasu',source],['sironagasu7777',target]])h.db.prepare('UPDATE player_accounts SET username=?,name=? WHERE owner=?').run(name,name,owner);
  const before=h.db.prepare('SELECT * FROM player_accounts ORDER BY username').all();
  assert.equal((await pin.provision(payload)).transferred,true);
  assert.equal(h.board.admin.isAdmin(source),false);assert.equal(h.board.admin.isAdmin(target),true);
  await assert.rejects(pin.verify(source,payload.pin),/admin-required/);await pin.verify(target,payload.pin);
  assert.equal((await h.board.admin.fetch('/wealth/admin/board',{owner:source})).status,403);
  assert.equal((await h.board.admin.fetch('/wealth/admin/board',{owner:target})).status,200);
  assert.deepEqual(h.db.prepare('SELECT * FROM player_accounts ORDER BY username').all(),before);
  const verifier=pin.row().hash;assert.equal((await pin.provision({...payload,pin:'8642'})).replayed,true);assert.equal(pin.row().hash,verifier);
  h.restart();assert.equal(h.board.admin.owner(),h.board.accounts.byName('sironagasu7777').owner);
  console.log('PASS exact-account transfer revokes the old global role and rotates the PIN atomically without changing account data; retries cannot change it again');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
