const assert = require('node:assert/strict'), {DatabaseSync} = require('node:sqlite');
(async () => {
  const {default: worker, HistoryLeaderboard} = await import('../server/ranking-api/worker.mjs');
  const db = new DatabaseSync(':memory:');
  const ctx = {storage: {sql: {exec(query, ...args) {
    if (!args.length && query.includes(';')) { db.exec(query); return {toArray: () => []}; }
    const stmt = db.prepare(query);
    if (/^(SELECT|PRAGMA)/i.test(query)) return {toArray: () => stmt.all(...args)};
    stmt.run(...args); return {toArray: () => []};
  }}}};
  let board = new HistoryLeaderboard(ctx), limited = false, count = 0;
  const limiter = {limit: async () => ({success: !limited})};
  const env = {LEADERBOARD: {idFromName: n => n, get: () => ({fetch: r => board.fetch(r)})}, RANK_READ_LIMITER: limiter, RANK_WRITE_LIMITER: limiter, RANK_GLOBAL_LIMITER: limiter};
  const empty = {balance: 0, buildings: {}, residents: {}}, town = {balance: 100, buildings: {house: 2, pagoda: 1, torii: 1}, residents: {farmer: 1, merchant: 1, samurai: 1, monk: 1}};
  async function req(path = '/wealth', body, token = 'a'.repeat(64), overrides = {}) {
    const r = await worker.fetch(new Request('https://example.com'+path, {method: body === undefined ? 'GET' : 'POST', headers: {Origin: 'https://historykids.github.io', 'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer '+token} : {}), ...overrides.headers}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), ...overrides}), env);
    return {status: r.status, body: await r.json()};
  }
  async function test(name, fn) { await fn(); count++; console.log('PASS', name); }
  await test('anonymous reads and nickname-only zero-asset registration are available', async () => {
    assert.deepEqual((await req('/wealth', undefined, '')).body.entries, []);
    const r = await req('/wealth/register', {name: '新しい町', snapshot: empty, expectedRevision: 0});
    assert.equal(r.status, 200); assert.equal(r.body.own.score, 0); assert.equal(r.body.ownRank, 1); assert.equal(r.body.total, 1);
  });
  await test('prices, assets and development score are calculated by the server', async () => {
    const r = await req('/wealth/register', {name: '経済の町', snapshot: {...town, score: 999999, assets: 999999}, score: 999999, expectedRevision: 1});
    assert.equal(r.status, 200); assert.equal(r.body.own.buildingValue, 170); assert.equal(r.body.own.residentValue, 40); assert.equal(r.body.own.assets, 310); assert.equal(r.body.own.score, 430); assert.equal(r.body.own.buildings, 4); assert.equal(r.body.own.residents, 4);
    assert.notEqual(r.body.own.id, 'a'.repeat(64)); assert(!JSON.stringify(r.body).includes('Bearer'));
  });
  await test('rename, lower current balance and restart update one persistent record', async () => {
    const r = await req('/wealth/register', {name: '変更した町', snapshot: {...town, balance: 50}, expectedRevision: 2});
    assert.equal(r.body.own.score, 380); assert.equal(r.body.total, 1); assert.equal(r.body.own.revision, 3);
    board = new HistoryLeaderboard(ctx); assert.equal((await req()).body.own.name, '変更した町');
    const again = await req('/wealth/register', {name: '変更した町', snapshot: {...town, balance: 50}, expectedRevision: 2});
    assert.equal(again.body.updated, false); assert.equal(again.body.own.timestamp, r.body.own.timestamp);
  });
  await test('stale updates cannot overwrite newer data and duplicate names cannot claim owners', async () => {
    assert.equal((await req('/wealth/register', {name: '古い状態', snapshot: empty, expectedRevision: 2})).status, 409);
    const r = await req('/wealth/register', {name: '変更した町', snapshot: empty, expectedRevision: 0}, 'b'.repeat(64));
    assert.equal(r.body.total, 2); assert.equal(r.body.own.score, 0); assert.notEqual(r.body.own.id, (await req()).body.own.id);
    assert.equal((await req('/wealth', undefined, '')).body.own, null);
  });
  await test('unknown items, role mixing, fractions, capacity and invalid large values are rejected', async () => {
    for (const snapshot of [null, {...empty, balance: -1}, {...empty, balance: 1.5}, {...empty, buildings: {fake: 1}}, {...empty, buildings: {farmer: 1}}, {...empty, residents: {house: 1}}, {...empty, buildings: {house: 0.5}}, {...empty, buildings: {road: 21601}}, {...empty, residents: {monk: 101}}, {...town, balance: '1'+'0'.repeat(72)}]) {
      assert.equal((await req('/wealth/register', {name: '町', snapshot, expectedRevision: 3})).status, 400);
    }
    assert.equal((await req()).body.own.revision, 3);
  });
  await test('all catalog structures and four resident roles use their actual purchase prices', async () => {
    const C = globalThis.HKCore, snapshot = {balance: 0, buildings: {}, residents: {}};
    for (const item of C.items) snapshot[item.cat === 'resident' ? 'residents' : 'buildings'][item.id] = 1;
    const r = await req('/wealth/register', {name: '全部の町', snapshot, expectedRevision: 0}, 'c'.repeat(64));
    assert.equal(r.body.own.buildings, 12); assert.equal(r.body.own.residents, 4); assert.equal(r.body.own.assets, C.items.reduce((a, b) => a+b.price, 0));
  });
  await test('tied points share competition rank and exact own rank survives the top-100 limit', async () => {
    await req('/wealth/register', {name: '同点', snapshot: empty, expectedRevision: 0}, 'd'.repeat(64));
    const zeros = (await req()).body.entries.filter(e => e.score === 0); assert.equal(zeros[0].rank, zeros[1].rank);
    for (let i = 0; i < 105; i++) db.prepare('INSERT INTO wealth_scores_v2(id,name,balance,buildings,residents,buildingValue,residentValue,assets,score,timestamp,revision,scoreKey,assetsKey) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('test-'+i, '富豪'+i, '1000', 0, 0, 0, 0, '1000', '1000', 1, 1, '1000'.padStart(72,'0'), '1000'.padStart(72,'0'));
    const r = (await req('/wealth', undefined, 'b'.repeat(64))).body;
    assert.equal(r.entries.length, 100); assert.equal(r.total, 109); assert.equal(r.ownRank, 108); assert(r.entries.every(e => e.rank === 1));
  });
  await test('wealth tables leave quiz records and quiz endpoints intact', async () => {
    db.prepare('INSERT INTO scores(id,name,ms,timestamp,correct,answerMs,score,timingVersion) VALUES(?,?,?,?,?,?,?,?)').run('quiz-owner', '早押しの記録', 30000, 12, 9, 30000, 8400, 2);
    board = new HistoryLeaderboard(ctx);
    assert.equal((await req('/ranking')).body.entries[0].name, '早押しの記録'); assert.equal((await req('/wealth')).body.total, 109);
    assert.equal((await req('/ranking/start', {timingVersion: 2})).status, 200);
  });
  await test('origin, credential, method, JSON and rate guards protect both routes', async () => {
    assert.equal((await req('/wealth/register', {name: '町', snapshot: empty, expectedRevision: 0}, '')).status, 401);
    assert.equal((await req('/wealth', undefined, 'invalid')).status, 401);
    assert.equal((await req('/wealth/register', undefined)).status, 405);
    assert.equal((await req('/wealth/nope')).status, 404);
    assert.equal((await req('/wealth', undefined, '', {headers: {Origin: 'https://evil.example'}})).status, 403);
    assert.equal((await req('/wealth/register', [], 'e'.repeat(64))).status, 400);
    limited = true; assert.equal((await req()).status, 429);
  });
  limited=false;
  await test('full decimal scores rank exact one-ryo differences hidden by the abbreviated display',async()=>{
    const M=globalThis.HKAmounts,n='10000000000000000001',larger='10000000000000000002';
    const first=await req('/wealth/register',{name:'精密な町1',snapshot:{...empty,balance:n},expectedRevision:0},'1'.repeat(64));
    const second=await req('/wealth/register',{name:'精密な町2',snapshot:{...empty,balance:larger},expectedRevision:0},'2'.repeat(64));
    assert.equal(first.body.own.score,n);assert.equal(second.body.own.score,larger);assert.equal(M.format(n),M.format(larger));assert.equal(second.body.ownRank,1);assert.equal((await req('/wealth',undefined,'1'.repeat(64))).body.ownRank,2);
    const row=db.prepare('SELECT score,typeof(score) AS kind FROM wealth_scores_v2 WHERE name=?').get('精密な町2');assert.equal(row.score,larger);assert.equal(row.kind,'text');board=new HistoryLeaderboard(ctx);assert.equal((await req('/wealth',undefined,'2'.repeat(64))).body.own.score,larger);
    const max=await req('/wealth/register',{name:'上限の町',snapshot:{...town,balance:M.MAX},expectedRevision:0},'3'.repeat(64));assert.equal(max.body.own.score,M.MAX);assert.equal(max.body.own.assets,M.add(M.MAX,210));
  });
  await test('legacy economy rows migrate without deleting quiz data or overwriting newer economy rows',async()=>{
    const legacyDb=new DatabaseSync(':memory:'),legacyCtx={storage:{sql:{exec(query,...args){if(!args.length&&query.includes(';')){legacyDb.exec(query);return {toArray:()=>[]};}const stmt=legacyDb.prepare(query);if(/^(SELECT|PRAGMA)/i.test(query))return {toArray:()=>stmt.all(...args)};stmt.run(...args);return {toArray:()=>[]};}}}};
    legacyDb.exec('CREATE TABLE wealth_scores(id TEXT PRIMARY KEY,name TEXT,balance INTEGER,buildings INTEGER,residents INTEGER,buildingValue INTEGER,residentValue INTEGER,assets INTEGER,score INTEGER,timestamp INTEGER,revision INTEGER)');
    legacyDb.prepare('INSERT INTO wealth_scores VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('legacy-town','以前の町',100,0,0,0,0,100,1234,17,4);new HistoryLeaderboard(legacyCtx);const row=legacyDb.prepare('SELECT * FROM wealth_scores_v2 WHERE id=?').get('legacy-town');assert.equal(row.score,'1234');assert.equal(row.revision,4);assert.equal(row.timestamp,17);assert.equal((await req('/ranking')).body.entries[0].name,'早押しの記録');
    legacyDb.prepare('UPDATE wealth_scores_v2 SET name=? WHERE id=?').run('更新した町','legacy-town');new HistoryLeaderboard(legacyCtx);assert.equal(legacyDb.prepare('SELECT name FROM wealth_scores_v2 WHERE id=?').get('legacy-town').name,'更新した町');
    legacyDb.prepare('DELETE FROM wealth_scores_v2 WHERE id=?').run('legacy-town');new HistoryLeaderboard(legacyCtx);assert.equal(legacyDb.prepare('SELECT COUNT(*) AS total FROM wealth_scores_v2').get().total,0);legacyDb.close();
  });
  await test('rebirth count outranks any wealth, ties use exact economy and persist across restarts',async()=>{
    const M=globalThis.HKAmounts;
    const first=await req('/wealth/register',{name:'輪廻1',snapshot:{...empty,rebirths:1,balance:M.MAX},expectedRevision:0},'4'.repeat(64));assert.equal(first.body.ownRank,1);
    const second=await req('/wealth/register',{name:'輪廻2',snapshot:{...empty,rebirths:2,balance:0},expectedRevision:0},'5'.repeat(64));assert.equal(second.body.ownRank,1);assert.equal((await req('/wealth',undefined,'4'.repeat(64))).body.ownRank,2);
    const tied=await req('/wealth/register',{name:'同輪廻',snapshot:{...empty,rebirths:2,balance:0},expectedRevision:0},'6'.repeat(64));assert.equal(tied.body.ownRank,1);
    const higher=await req('/wealth/register',{name:'同輪廻で富裕',snapshot:{...empty,rebirths:2,balance:1},expectedRevision:0},'7'.repeat(64));assert.equal(higher.body.ownRank,1);assert.equal((await req('/wealth',undefined,'5'.repeat(64))).body.ownRank,2);assert.equal((await req('/wealth',undefined,'4'.repeat(64))).body.ownRank,4);
    board=new HistoryLeaderboard(ctx);assert.equal((await req('/wealth',undefined,'7'.repeat(64))).body.own.rebirths,2);
    for(const rebirths of [-1,1.5,'2',10001,Number.MAX_SAFE_INTEGER,NaN])assert.equal((await req('/wealth/register',{name:'不正',snapshot:{...empty,rebirths},expectedRevision:0},'8'.repeat(64))).status,400);
    const capped=await req('/wealth/register',{name:'輪廻上限',snapshot:{...empty,rebirths:10000,balance:0},expectedRevision:0},'8'.repeat(64));assert.equal(capped.status,200);assert.equal(capped.body.own.rebirths,10000);assert.equal(capped.body.ownRank,1);
    assert.equal((await req('/ranking')).body.entries[0].name,'早押しの記録');
  });
  db.close(); console.log(count+' wealth API checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
