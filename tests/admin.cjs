const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{pbkdf2Sync}=require('node:crypto'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),tick=()=>new Promise(r=>setImmediate(r));let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 const {default:worker,HistoryLeaderboard}=await import('../server/ranking-api/worker.mjs'),{verifyAdminCode}=await import('../server/ranking-api/admin-auth.mjs');
 const db=new DatabaseSync(':memory:');let failSql='';
 const storage={sql:{exec(query,...args){if(failSql&&query.startsWith(failSql))throw Error('simulated write failure');if(!args.length&&query.includes(';')){db.exec(query);return{toArray:()=>[]};}const stmt=db.prepare(query);if(/^(SELECT|PRAGMA)/i.test(query))return{toArray:()=>stmt.all(...args)};stmt.run(...args);return{toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};
 let board=new HistoryLeaderboard({storage}),limited=false;const limiter={limit:async()=>({success:true})},claimLimiter={limit:async()=>({success:!limited})};
 const env={LEADERBOARD:{idFromName:n=>n,get:()=>({fetch:r=>board.fetch(r)})},RANK_READ_LIMITER:limiter,RANK_WRITE_LIMITER:limiter,RANK_GLOBAL_LIMITER:limiter,ADMIN_CLAIM_LIMITER:claimLimiter};
 const empty={balance:0,buildings:{},residents:{}};
 async function req(route,body,token='a'.repeat(64),custom={}){const response=await worker.fetch(new Request('https://api.example'+route,{method:body===undefined?'GET':'POST',headers:{Origin:'https://historykids.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...custom.headers},...(body===undefined?{}:{body:JSON.stringify(body)}),...custom}),env);return{status:response.status,body:await response.json()};}
 await test('the server verifier derives a salted key and accepts normalized input without a client-side PIN',async()=>{
  const salt='0123456789abcdef0123456789abcdef',config={salt,iterations:1000,hash:pbkdf2Sync('12345678',Buffer.from(salt,'hex'),1000,32,'sha256').toString('hex')};
  assert(await verifyAdminCode('１２３４５６７８',config));assert(!await verifyAdminCode('12345679',config));assert(!await verifyAdminCode('123',config));assert(!read('assets/ui/admin.js').includes(config.hash));
 });
 await test('normal identities and forged administrator fields cannot read or mutate the management API',async()=>{
  assert.equal((await req('/wealth/admin/session',undefined,'')).status,401);assert.equal((await req('/wealth/admin/session')).body.admin,false);assert.equal((await req('/wealth/admin/board')).status,403);assert.equal((await req('/wealth/admin/words',{words:[],admin:true,owner:'a'.repeat(64),expectedRevision:0})).status,403);
  board.admin.verify=async code=>code==='12345678';assert.equal((await req('/wealth/admin/claim',{code:'00000000'})).status,403);assert.equal(board.admin.owner(),'');
  limited=true;assert.equal((await req('/wealth/admin/claim',{code:'12345678'})).status,429);limited=false;assert.equal(board.admin.owner(),'');
  const old=env.ADMIN_CLAIM_LIMITER;delete env.ADMIN_CLAIM_LIMITER;assert.equal((await req('/wealth/admin/claim',{code:'12345678'})).status,503);env.ADMIN_CLAIM_LIMITER=old;
 });
 let adminToken,otherToken;
 await test('simultaneous valid claims assign exactly one persistent administrator',async()=>{
  let arrive=0,release;const gate=new Promise(r=>release=r);board.admin.verify=async()=>{if(++arrive===2)release();await gate;return true;};
  const tokens=['a'.repeat(64),'b'.repeat(64)],results=await Promise.all(tokens.map(token=>req('/wealth/admin/claim',{code:'12345678'},token)));assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.body.error==='admin-claimed').length,1);adminToken=tokens[results.findIndex(r=>r.status===200)];otherToken=tokens.find(t=>t!==adminToken);
  board=new HistoryLeaderboard({storage});assert((await req('/wealth/admin/session',undefined,adminToken)).body.admin);assert(!(await req('/wealth/admin/session',undefined,otherToken)).body.admin);assert.equal((await req('/wealth/admin/claim',{code:'12345678'},otherToken)).status,403);assert.equal((await req('/wealth/admin/claim',{code:'12345678'},adminToken)).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wealth_admin_owner').get().n,1);
 });
 let playerId;
 await test('only the administrator can ban and restore a selected registration without deleting its record',async()=>{
  const player=await req('/wealth/register',{name:'城下町',snapshot:empty,expectedRevision:0},'c'.repeat(64));playerId=player.body.own.id;
  const banned=await req('/wealth/admin/moderate',{id:playerId,banned:true,expectedRevision:0},adminToken);assert.equal(banned.status,200);assert(banned.body.entries.find(e=>e.id===playerId).banned);assert.equal((await req('/wealth',undefined,'c'.repeat(64))).body.own,null);assert.equal((await req('/wealth/register',{name:'別名',snapshot:empty,expectedRevision:1},'c'.repeat(64))).status,403);
  assert.equal((await req('/wealth/admin/moderate',{id:playerId,banned:false,expectedRevision:1,owner:board.admin.owner()},otherToken)).status,403);
  const restored=await req('/wealth/admin/moderate',{id:playerId,banned:false,expectedRevision:1},adminToken);assert.equal(restored.status,200);assert.equal(restored.body.revision,2);assert((await req('/wealth',undefined,'c'.repeat(64))).body.own);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wealth_scores_v2 WHERE id=?').get(playerId).n,1);
  assert.equal((await req('/wealth/admin/moderate',{id:playerId,banned:false,expectedRevision:1},adminToken)).body.revision,2);assert.equal((await req('/wealth/admin/moderate',{id:playerId,banned:true,expectedRevision:1},adminToken)).status,409);
 });
 await test('NG word changes apply to old and new names, preserve bans and survive restarts',async()=>{
  const changed=await req('/wealth/admin/words',{words:['サトウ','城下町'],expectedRevision:2},adminToken);assert.equal(changed.status,200);assert.equal(changed.body.revision,3);assert.deepEqual(changed.body.words,['さとう','城下町']);assert(changed.body.entries.find(e=>e.id===playerId).nameBlocked);assert((await req('/wealth',undefined,'c'.repeat(64))).body.nameBlocked);
  assert.equal((await req('/wealth/register',{name:'さ と う',snapshot:empty,expectedRevision:0},'d'.repeat(64))).body.error,'nickname-blocked');assert.equal((await req('/wealth/admin/moderate',{id:playerId,banned:true,expectedRevision:3},adminToken)).status,200);
  const cleared=await req('/wealth/admin/words',{words:[],expectedRevision:4},adminToken);assert.equal(cleared.status,200);assert(cleared.body.entries.find(e=>e.id===playerId).banned);assert(!cleared.body.entries.find(e=>e.id===playerId).nameBlocked);
  board=new HistoryLeaderboard({storage});assert.deepEqual(board.admin.words(),[]);assert((await req('/wealth',undefined,'c'.repeat(64))).body.banned);assert.equal((await req('/wealth/register',{name:'さとう',snapshot:empty,expectedRevision:0},'d'.repeat(64))).status,200);
 });
 await test('failed or conflicting setting writes are atomic and do not broaden privileges',async()=>{
  const before=board.admin.snapshot();assert.equal((await req('/wealth/admin/words',{words:['町'],expectedRevision:0},adminToken)).status,409);assert.equal((await req('/wealth/admin/words',{words:Array(101).fill('町'),expectedRevision:before.revision},adminToken)).status,400);
  failSql='INSERT INTO wealth_blocked_words';assert.equal((await req('/wealth/admin/words',{words:['町'],expectedRevision:before.revision},adminToken)).status,503);failSql='';assert.deepEqual(board.admin.snapshot(),before);assert.equal((await req('/wealth/admin/claim',undefined,adminToken)).status,405);
 });
 db.close();
 function page(admin=true){
  const w=new JSDOM(read('wealth-ranking.html'),{url:'https://historykids.github.io/wealth-ranking.html#admin',runScripts:'outside-only'}).window,map=new Map([['hk_wealth_identity_v1','a'.repeat(64)]]),posts=[],state={admin:true,entries:[{id:'x',name:'<img src=x onerror=alert(1)>',score:10,rebirths:2,banned:false,nameBlocked:false}],words:['さとう'],revision:0,total:1};
  Object.defineProperty(w,'localStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))}});w.HTMLElement.prototype.scrollIntoView=function(){};w.HKRankingConfig={endpoint:'https://api.example/ranking'};
  w.fetch=async(url,options)=>{if(url.endsWith('/session'))return{ok:true,json:async()=>({admin})};if(options.method==='POST'){const data=JSON.parse(options.body);posts.push({url,data});if(url.endsWith('/moderate'))state.entries[0].banned=data.banned;if(url.endsWith('/words'))state.words=data.words;state.revision++;}return{ok:admin,json:async()=>admin?structuredClone(state):{error:'admin-required'}};};
  w.eval(read('assets/ui/amounts.js'));w.eval(read('assets/ui/admin.js'));return{w,map,posts,state,$:id=>w.document.getElementById(id)};
 }
 await test('the management screen stays closed for non-admins despite forged local flags',async()=>{
  const p=page(false);p.map.set('admin','true');await tick();assert(p.$('adminPanel').hidden);assert(p.$('adminEntry').hidden);assert(!p.$('adminAccess').hidden);assert.equal(p.posts.length,0);p.w.close();
 });
 await test('the management UI renders safe names, confirms bans and saves word changes with the revision',async()=>{
  const p=page();await tick();assert(!p.$('adminPanel').hidden);assert.equal(p.$('adminRows').querySelectorAll('img').length,0);assert(p.$('adminRows').textContent.includes('<img'));
  p.$('adminRows').querySelector('button').click();assert(!p.$('adminConfirm').hidden);assert.equal(p.posts.length,0);p.$('adminCancel').click();assert(p.$('adminConfirm').hidden);p.$('adminRows').querySelector('button').click();p.$('adminCommit').click();p.$('adminCommit').click();await tick();assert.equal(p.posts.length,1);assert.equal(p.posts[0].data.expectedRevision,0);assert(p.posts[0].data.banned);assert.equal(p.$('adminRows').querySelector('button').textContent,'BANを解除');
  p.$('adminWords').value='新ワード\nさとう';p.$('adminWordsForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(p.posts[1].data.expectedRevision,1);assert.deepEqual(p.posts[1].data.words,['新ワード','さとう']);p.w.close();
 });
 await test('admin claiming saves the identity before requesting privileges and never saves the submitted code',async()=>{
  const w=new JSDOM('<body></body>',{url:'https://historykids.github.io',runScripts:'outside-only'}).window,map=new Map();Object.defineProperty(w,'localStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))}});w.HKRankingConfig={endpoint:'https://api.example/ranking'};let calls=0;
  w.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.example/wealth/admin/claim');assert.equal(JSON.parse(options.body).code,'12345678');assert.equal(options.headers.Authorization,'Bearer '+map.get('hk_wealth_identity_v1'));return{ok:true,json:async()=>({admin:true})};};w.eval(read('assets/ui/admin.js'));await w.HKAdmin.claim('１２３４５６７８');assert.equal(calls,1);assert(!JSON.stringify([...map]).includes('12345678'));w.localStorage.setItem=()=>{throw Error('quota');};map.clear();await assert.rejects(w.HKAdmin.claim('12345678'),/identity-unavailable/);assert.equal(calls,1);w.close();
 });
 await test('the main code form waits for server confirmation, blocks double submits and keeps the wallet unchanged',async()=>{
  const w=new JSDOM(read('index.html'),{url:'https://historykids.github.io/#howto',runScripts:'outside-only',pretendToBeVisual:true}).window,map=new Map([['money_v1','35']]);Object.defineProperty(w,'localStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))}});w.HTMLElement.prototype.scrollIntoView=function(){};w.scrollTo=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HKRankingConfig={endpoint:'https://api.example/ranking'};
  let calls=0,release;w.fetch=async()=>{calls++;await new Promise(r=>release=r);return{ok:true,json:async()=>({admin:true})};};
  for(const f of ['data/dataset.js','data/ancient.js','data/meiji.js','data/modern.js','assets/ui/amounts.js','assets/ui/core.js','assets/ui/bitcoin-rules.js','assets/ui/wallet.js','assets/ui/residents.js','assets/ui/admin.js','assets/ui/app.js'])w.eval(read(f));
  const $=id=>w.document.getElementById(id);$('redeemCodeBtn').click();assert.equal($('redeemCodeInput').type,'password');$('redeemCodeInput').value='１２３４５６７８';const submit=()=>$('redeemCodeForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));submit();submit();await tick();assert.equal(calls,1);assert($('redeemCodeInput').disabled);assert.equal(w.HKWallet.snapshot().balance,35);release();await tick();assert($('redeemCodeStatus').textContent.includes('管理者権限を付与'));assert.equal($('redeemCodeStatus').querySelector('a').getAttribute('href'),'./wealth-ranking.html#admin');assert.equal($('redeemCodeInput').value,'');assert.equal(w.HKWallet.snapshot().balance,35);
  $('redeemCodeBtn').click();$('redeemCodeInput').value='12345678';w.fetch=async()=>({ok:false,json:async()=>({error:'admin-code-invalid'})});submit();await tick();assert(!$('redeemCodeInput').disabled);assert($('redeemCodeStatus').textContent.includes('コードが違う'));$('redeemCodeInput').value='1940';submit();assert.equal(w.HKWallet.snapshot().balance,55);w.close();
 });
 console.log(checks+' administrator checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
