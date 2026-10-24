const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const R = require('../assets/ui/wealth-rules.js'), C = require('../assets/ui/core.js');
let checks = 0;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function test(name, fn) { await fn(); checks++; console.log('PASS', name); }
function page({balance = 100, city = [], residents = [], store = null, failRead = false, failWrite = false} = {}) {
  const map = store || new Map([['money_v1', String(balance)], ['city_v1', JSON.stringify(city)], ['hk_residents_v1', JSON.stringify(residents)]]);
  const dom = new JSDOM(read('wealth-ranking.html'), {url: 'https://historykids.github.io/wealth-ranking.html', runScripts: 'outside-only'}), w = dom.window;
  Object.defineProperty(w, 'localStorage', {value: {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value))}});
  const state = {own: null, entries: [], total: 0, ownRank: null, at: Date.now()}, posts = []; let block = null, conflict = false;
  w.fetch = async (url, options) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body); posts.push({url, body, headers: options.headers});
      if (block) await block;
      if (failWrite) throw Error('offline');
      if (conflict) { conflict = false; return {ok: false, json: async () => ({error: 'record-changed'})}; }
      state.own = {id: 'public-id', name: R.cleanName(body.name), ...R.metrics(body.snapshot), revision: (state.own?.revision || 0)+1, timestamp: Date.now()};
      state.entries = [{...state.own, rank: 1}]; state.total = 1; state.ownRank = 1;
      return {ok: true, json: async () => ({...state, updated: true})};
    }
    if (failRead) throw Error('offline');
    return {ok: true, json: async () => ({...state, entries: state.entries.slice()})};
  };
  w.HKRankingConfig = {endpoint: 'https://api.example/ranking'};
  for (const script of ['amounts.js', 'core.js', 'bitcoin-rules.js', 'wallet.js', 'wealth-rules.js', 'wealth.js']) w.eval(read('assets/ui/'+script));
  const $ = id => w.document.getElementById(id), submit = () => $('wealthRegister').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  return {dom, w, map, state, posts, $, submit, blockWrites: promise => { block = promise; }, conflictNext: () => { conflict = true; }};
}
(async () => {
  await test('NG name normalization prevents obfuscated names before posting and allows a different name',async()=>{
    for(const name of ['さとう','サトウ','ｻﾄｳ','さ と う','さ・と・う','さ\u200bとう','町のさとうさん'])assert(R.blockedName(name),name);
    for(const name of ['さとし','まさと','しろながす'])assert(!R.blockedName(name),name);
    const p=page();await tick();p.$('wealthName').value='さ・とう';p.submit();await tick();assert.equal(p.posts.length,0);assert(p.$('registrationMessage').textContent.includes('使えません'));assert(!p.$('registerWealth').disabled);p.$('wealthName').value='新しい城下町';p.submit();await tick();assert.equal(p.posts.length,1);p.w.close();
  });
  await test('a banned identity cannot use the form or force another registration submission',async()=>{
    const p=page();p.state.banned=true;await tick();assert(p.$('registerWealth').disabled);assert(p.$('wealthName').disabled);assert.equal(p.$('ownRank').textContent,'利用停止中');assert(p.$('townState').textContent.includes('利用を停止'));p.$('wealthName').value='別名';p.submit();await tick();assert.equal(p.posts.length,0);assert.equal(p.w.HKWallet.snapshot().balance,100);p.w.close();
  });
  await test('a held nickname can be corrected using its actual saved revision',async()=>{
    const p=page();p.state.nameBlocked=true;p.state.ownRevision=4;await tick();assert(!p.$('registerWealth').disabled);p.$('wealthName').value='新しい城下町';p.submit();await tick();assert.equal(p.posts[0].body.expectedRevision,4);assert(p.$('registrationMessage').textContent.includes('ランキングに反映'));p.w.close();
  });
  await test('a server ban disables a stale open form and remains disabled using the saved board offline',async()=>{
    const p=page();await tick();const fetch=p.w.fetch;p.w.fetch=(url,options)=>options.method==='POST'?Promise.resolve({ok:false,json:async()=>({error:'banned'})}):fetch(url,options);p.$('wealthName').value='別名';p.submit();await tick();assert(p.$('registrationMessage').textContent.includes('利用を停止'));assert(p.$('registerWealth').disabled);
    const q=page({store:p.map,failRead:true});await tick();assert(q.$('registerWealth').disabled);assert.equal(q.$('ownRank').textContent,'利用停止中');p.w.close();q.w.close();
  });
  await test('an offline board never displays old cached NG names',async()=>{
    const entry={id:'hidden',name:'さとうきよと',...R.metrics({balance:100,buildings:{},residents:{}}),revision:1,timestamp:1,rank:1},safe={...entry,id:'safe',name:'城下町',rank:2},store=new Map([['money_v1','100'],['hk_wealth_identity_v1','a'.repeat(64)],['hk_wealth_cache_v1',JSON.stringify({entries:[entry,safe],own:entry,ownRank:1,total:2,at:1})]]),p=page({store,failRead:true});
    await tick();assert(!p.$('wealthRows').textContent.includes('さとう'));assert(p.$('wealthRows').textContent.includes('城下町'));assert.equal(p.$('ownRank').textContent,'未登録');assert(p.$('townState').textContent.includes('別の名前'));p.w.close();
  });
  await test('adding every catalog structure or resident conserves asset value and rewards growth', () => {
    for (const item of C.items) {
      const snapshot = {balance: 1000-item.price, buildings: {}, residents: {}};
      snapshot[item.cat === 'resident' ? 'residents' : 'buildings'][item.id] = 1;
      const m = R.metrics(snapshot); assert.equal(m.assets, 1000); assert.equal(m.score, item.cat === 'resident' ? 1010 : 1020);
    }
    assert.equal(R.metrics({balance: 0, buildings: {}, residents: {}}).score, 0);
  });
  await test('local town aggregation rejects damaged storage and supports legacy farmers', () => {
    const values = new Map([['city_v1', '[{"id":"a","type":"pagoda"}]'], ['hk_residents_v1', '[{"id":"r"}]']]);
    const readTown = () => R.readLocal({getItem: k => values.get(k) ?? null}, {balance: 20});
    assert.equal(readTown().assets, 120); assert.equal(readTown().score, 150);
    for (const value of ['{}', 'null', 'broken', '[{"id":"a","type":"fake"}]', '[{"id":"a","type":"house"},{"id":"a","type":"house"}]']) { values.set('city_v1', value); assert.throws(readTown); }
    assert.throws(() => R.readLocal({getItem: () => null}, {balance: 0, unavailable: true}));
  });
  await test('authoritative wallet balance and placed buildings appear without editing any game data', async () => {
    const p = page({balance: 999, city: [{id: 'p', type: 'pagoda'}, {id: 't', type: 'torii'}], residents: [{id: 'm', type: 'monk'}]});
    p.map.set('hk_wallet_v2', JSON.stringify({version: 2, balance: 7, history: [], pending: null})); p.w.dispatchEvent(new p.w.Event('focus')); await tick();
    assert.equal(p.$('localBalance').textContent, '7'); assert.equal(p.$('localAssets').textContent, '127'); assert.equal(p.$('localScore').textContent, '177'); assert.equal(p.$('localBuildings').textContent, '2'); assert.equal(p.map.get('money_v1'), '999'); p.w.close();
  });
  await test('a nickname alone registers aggregate counts and immediately displays the owned row', async () => {
    const p = page({city: [{id: 'h', type: 'house', x: 2, y: 5}], residents: [{id: 'f', type: 'farmer'}]}); await tick();
    p.$('wealthName').value = ' 江戸の町 '; p.submit(); await tick();
    assert.equal(p.posts.length, 1); assert.equal(p.posts[0].url, 'https://api.example/wealth/register'); assert.deepEqual(p.posts[0].body.snapshot, {rebirths:0,balance: 100, buildings: {house: 1}, residents: {farmer: 1}});
    assert.equal(p.posts[0].body.expectedRevision, 0); assert.equal(p.$('ownRank').textContent, '1位'); assert.equal(p.$('registerWealth').textContent, '最新の経済力に更新'); assert(p.$('wealthRows').textContent.includes('江戸の町')); assert(p.$('registrationMessage').textContent.includes('反映しました'));
    assert.equal(p.w.document.querySelectorAll('.your-row').length, 1); assert(/Bearer [a-f0-9]{64}/.test(p.posts[0].headers.Authorization)); assert(!JSON.stringify(p.posts[0].body).includes('id":"h')); p.w.close();
  });
  await test('updated economy is read at click time, uses the saved identity and replaces the row', async () => {
    const p = page(); await tick(); p.$('wealthName').value = '育つ町'; p.submit(); await tick(); const token = p.posts[0].headers.Authorization;
    p.map.set('money_v1', '150'); p.map.set('city_v1', '[{"id":"h","type":"house"}]'); p.map.set('hk_residents_v1', '[{"id":"s","type":"samurai"}]');
    p.w.dispatchEvent(new p.w.StorageEvent('storage', {key: 'city_v1'})); assert(p.$('townState').textContent.includes('更新できます'));
    p.submit(); await tick(); assert.equal(p.posts[1].body.expectedRevision, 1); assert.equal(p.posts[1].headers.Authorization, token); assert.equal(p.posts[1].body.snapshot.balance, 150); assert.equal(p.$('localScore').textContent, '220'); assert.equal(p.w.document.querySelectorAll('tbody tr').length, 1); assert(p.$('townState').textContent.includes('登録されています')); p.w.close();
  });
  await test('zero assets remain eligible, normalized names persist and HTML is displayed safely', async () => {
    const p = page({balance: 0}); await tick(); p.$('wealthName').value = '<img src=x onerror=alert(1)>'; p.submit(); await tick();
    assert.equal(p.$('localScore').textContent, '0'); assert.equal(p.$('ownRank').textContent, '1位'); assert.equal(p.$('wealthRows').querySelectorAll('img').length, 0); assert(p.$('wealthRows').textContent.includes('<img')); assert.equal(p.map.get('hk_wealth_name_v1'), R.cleanName('<img src=x onerror=alert(1)>'));
    const reload = page({store: p.map}); await tick(); assert.equal(reload.$('wealthName').value, p.map.get('hk_wealth_name_v1')); p.w.close(); reload.w.close();
  });
  await test('double submit is locked and failed writes never claim success', async () => {
    const p = page({failWrite: true}); await tick(); let release; p.blockWrites(new Promise(resolve => { release = resolve; }));
    p.$('wealthName').value = '町'; p.submit(); p.submit(); assert(p.$('registerWealth').disabled); assert.equal(p.posts.length, 1); release(); await tick();
    assert(p.$('registrationMessage').classList.contains('error')); assert(p.$('registrationMessage').textContent.includes('登録できません')); assert.equal(p.$('ownRank').textContent, '未登録'); assert.equal(p.state.total, 0); p.w.close();
  });
  await test('offline cache is labeled and corrupted town data cannot overwrite a record', async () => {
    const p = page(); await tick(); p.$('wealthName').value = '保存の町'; p.submit(); await tick();
    const offline = page({store: p.map, failRead: true}); await tick(); assert(offline.$('boardStatus').textContent.includes('保存済み')); assert(offline.$('freshness').textContent.includes('保存済み'));
    offline.map.set('city_v1', 'broken'); offline.w.dispatchEvent(new offline.w.StorageEvent('storage', {key: 'city_v1'})); assert(offline.$('registerWealth').disabled); offline.submit(); await tick(); assert.equal(offline.posts.length, 0); p.w.close(); offline.w.close();
  });
  await test('revision conflicts reload the actual owner record without publishing stale values', async () => {
    const p = page(); await tick(); p.$('wealthName').value = '町'; p.submit(); await tick(); p.state.own.revision = 2; p.conflictNext();
    p.map.set('money_v1', '200'); p.submit(); await tick(); await tick(); assert(p.$('registrationMessage').classList.contains('error')); assert(p.$('registrationMessage').textContent.includes('別の画面')); assert.equal(p.state.own.score, 100);
    p.submit(); await tick(); assert.equal(p.posts[2].body.expectedRevision, 2); assert.equal(p.state.own.score, 200); p.w.close();
  });
  await test('search retains server ranks and personal rank is visible outside the first hundred', async () => {
    const p = page(); await tick(); p.state.own = {id: 'own', name: '小さな町', ...R.metrics({balance: 100, buildings: {}, residents: {}}), revision: 1, timestamp: Date.now()}; p.state.ownRank = 120; p.state.total = 130;
    p.state.entries = [{...p.state.own, id: 'leader', name: '大きな町', rank: 1, score: 1000}, {...p.state.own, id: 'leader2', name: '同点の町', rank: 1, score: 1000}];
    p.$('refreshWealth').click(); await tick(); assert.equal(p.$('ownRank').textContent, '120位'); p.$('wealthSearch').value = '同点'; p.$('wealthSearch').dispatchEvent(new p.w.Event('input')); assert.equal(p.$('wealthRows').children.length, 1); assert.equal(p.$('wealthRows').children[0].children[0].textContent, '1'); p.$('clearWealthSearch').click(); assert.equal(p.$('wealthRows').children.length, 2); p.w.close();
  });
  await test('points stay bold in the third column while rebirths stay at the far right without changing server order',async()=>{
    const p=page();await tick();p.state.entries=[{id:'rich',name:'高得点',score:1234,assets:1200,buildings:1,residents:1,timestamp:Date.now(),rank:2,rebirths:1},{id:'reborn',name:'転生',score:1,assets:1,buildings:0,residents:0,timestamp:Date.now(),rank:1,rebirths:2}];p.$('refreshWealth').click();await tick();
    const row=p.$('wealthRows').children[0];assert.equal(row.children[2].textContent,'1,234点');assert.equal(row.children[7].textContent,'1回');assert(row.children[2].querySelector('strong.wealth-score'));assert.equal(p.w.document.querySelector('thead th:last-child').textContent,'リボーン');assert.equal(row.children[0].textContent,'2');p.w.close();
  });
  await test('game entry, canonical, required tags, local references and unique IDs are valid', () => {
    assert(read('index.html').includes('href="./wealth-ranking.html"')); const html = read('wealth-ranking.html'), dom = new JSDOM(html), doc = dom.window.document;
    assert(html.includes('G-EZP12GC8W1')); assert(html.includes('ca-pub-4922140858632050')); assert.equal(doc.querySelector('link[rel=canonical]').href, 'https://historykids.github.io/wealth-ranking.html');
    const ids = [...doc.querySelectorAll('[id]')].map(e => e.id); assert.equal(ids.length, new Set(ids).size);
    for (const e of doc.querySelectorAll('script[src],link[href]')) { const value = e.getAttribute('src') || e.getAttribute('href'); if (value.startsWith('./')) assert(fs.existsSync(path.join(root, value.split('?')[0])), value); }
    assert.equal(R.cleanName('　Ａ町\u0000　'), 'A町'); assert.equal(Array.from(R.cleanName('🏯'.repeat(30))).length, 24); dom.window.close();
  });
  console.log(checks+' wealth UI and economy checks passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
