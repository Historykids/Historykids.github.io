const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{setup}=require('./sengoku-worlds.cjs');
(async()=>{const h=await setup(2);try{
 const pin=h.board.sengokuWorlds.expansion.adminPin,capability='fixture-private-recovery',password='fixture new login 54321';pin.recoveryHash=createHash('sha256').update(capability).digest('hex');
 const owner=h.playerOwner(0);h.db.prepare('UPDATE player_accounts SET username=?,name=? WHERE owner=?').run('sironagasu7777','sironagasu7777',owner);h.db.prepare('INSERT INTO wealth_admin_owner(singleton,owner,createdAt) VALUES(1,?,1)').run(owner);
 const before=h.board.accounts.row(owner),other=h.board.accounts.row(h.playerOwner(1)),operation='sironagasu7777-login-reset-20261102-v1';
 await assert.rejects(pin.provision({operation,password,capability:'wrong'}),/admin-required/);
 assert.equal((await pin.provision({operation,password,capability})).passwordChanged,true);
 const after=h.board.accounts.row(owner);assert(await h.board.accounts.verify(after,password));assert.equal(after.progress,before.progress);assert.equal(after.owner,before.owner);assert.equal(after.passwordVersion,before.passwordVersion+1);assert.deepEqual(h.board.accounts.row(h.playerOwner(1)),other);
 assert(h.db.prepare('SELECT expiresAt FROM player_sessions WHERE owner=?').all(owner).every(s=>s.expiresAt===0));
 assert.equal((await pin.provision({operation,password:'different fixture',capability})).replayed,true);assert.equal(h.board.accounts.row(owner).passwordHash,after.passwordHash);
 console.log('PASS sealed recovery changes only the exact administrator login password, revokes sessions, preserves saved data and cannot replay a different password');
 }finally{h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
