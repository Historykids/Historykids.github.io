const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto'),M=require('../assets/ui/amounts.js'),C=require('../assets/ui/table-rules.js'),R=require('../assets/ui/casino-rules.js');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),tick=()=>new Promise(r=>setImmediate(r)),flush=async()=>{for(let i=0;i<25;i++)await new Promise(r=>setTimeout(r,5));};
const opened=[];let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
const call=(W,fn,...args)=>new Promise((yes,no)=>W[fn](...args,yes,no));
(async()=>{
 const {default:worker,HistoryLeaderboard}=await import('../server/ranking-api/worker.mjs');
 function harness(){
  const db=new DatabaseSync(':memory:'),storage={sql:{exec(q,...args){if(!args.length&&q.includes(';')){db.exec(q);return{toArray:()=>[]};}const st=db.prepare(q);if(/^(SELECT|PRAGMA)/i.test(q))return{toArray:()=>st.all(...args)};st.run(...args);return{toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  let now=200000,failAfter='';const board=new HistoryLeaderboard({storage});board.poker.now=()=>now;const calls=[],limiter={limit:async()=>({success:true})},env={LEADERBOARD:{idFromName:n=>n,get:()=>({fetch:r=>board.fetch(r)})},RANK_READ_LIMITER:limiter,RANK_WRITE_LIMITER:limiter,RANK_GLOBAL_LIMITER:limiter,ADMIN_CLAIM_LIMITER:limiter,POKER_ROOM_LIMITER:limiter};
  async function fetch(url,options={}){const pathname=new URL(url).pathname,headers=new Headers(options.headers);headers.set('Origin','https://historykids.github.io');calls.push({path:pathname,body:options.body?JSON.parse(options.body):null});const response=await worker.fetch(new Request(url,{method:options.method||'GET',headers,...(options.body?{body:options.body}:{})}),env);if(failAfter===pathname){failAfter='';throw Error('response lost');}return response;}
  return{db,board,calls,fetch,advance(ms){now+=ms;},loseNext(path){failAfter=path;}};
 }
 function page(h,{main=false,map=null,times=10,balance=1000,token=null,hash='',failWallet=false}={}){
  const store=map||new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:times,balance:M.full(balance),pending:null,history:[]})]]);if(token)store.set('hk_wealth_identity_v1',token);
  const w=new JSDOM(read(main?'index.html':'casino.html'),{url:'https://historykids.github.io/'+(main?hash:'casino.html'),runScripts:'outside-only',pretendToBeVisual:true}).window;
  opened.push(w);Object.defineProperty(w,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(failWallet&&k==='hk_wallet_v2')throw Error('quota');store.set(k,String(v));},removeItem:k=>store.delete(k)}});
  w.fetch=h.fetch;w.HKRankingConfig={endpoint:'https://api.example/ranking'};w.matchMedia=()=>({matches:true});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  for(const f of ['amounts','bitcoin-rules','wallet'])w.eval(read('assets/ui/'+f+'.js'));
  if(main){for(const f of ['dataset','ancient','meiji','modern'])w.eval(read('data/'+f+'.js'));}
  w.eval(read('assets/ui/core.js'));w.eval(read('assets/ui/wealth-rules.js'));
  if(main)for(const f of ['activities','residents','app','admin','community','notices'])w.eval(read('assets/ui/'+f+'.js'));
  else for(const f of ['casino-rules','table-rules','royal-poker','casino-vip','community','online-poker','casino'])w.eval(read('assets/ui/'+f+'.js'));
  return{w,map:store,W:w.HKWallet,$:id=>w.document.getElementById(id),close:()=>w.close()};
 }
 const submit=(p,id)=>p.$(id).dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
 await test('two browsers meet in one real server room, a late visitor spectates and private cards stay hidden',async()=>{
  const h=harness(),a=page(h),b=page(h),c=page(h);const fixed=['AS','KS','QS','JS','TS','2S','2H','3D','5C','8S'];h.board.poker.shuffle=()=>[...fixed,...C.deck().filter(c=>!fixed.includes(c))];
  a.$('tab-king').click();await flush();assert(!a.$('roomJoinForm').hidden);assert(a.w.document.body.classList.contains('royal-online'));a.$('roomName').value='<b>王者</b>';submit(a,'roomJoinForm');submit(a,'roomJoinForm');await flush();assert.equal(a.W.snapshot().balance,900);assert.equal(h.calls.filter(c=>c.path.endsWith('/reserve')).length,1);
  b.$('tab-king').click();await flush();b.$('roomName').value='対戦相手';submit(b,'roomJoinForm');await flush();assert.equal(b.W.snapshot().balance,900);assert(b.$('roomStake').disabled);
  h.advance(10000);a.$('roomRefresh').click();b.$('roomRefresh').click();await flush();assert(!a.$('roomHand').hidden);assert.equal(a.$('roomHandCards').querySelectorAll('button').length,5);assert.equal(a.$('roomSeats').querySelectorAll('h3 b').length,0);assert(a.$('roomSeats').textContent.includes('<b>王者</b>'));
  c.$('tab-king').click();await flush();assert(c.$('roomRole').textContent.includes('観戦'));assert(c.$('roomJoinForm').hidden);assert(c.$('roomHand').hidden);assert.equal(c.W.snapshot().balance,1000);assert.equal(c.W.snapshot().pending,null);assert.equal(c.$('roomSeats').querySelectorAll('.room-card:not(.card-back)').length,0);
  for(const p of [a,b]){for(let i=0;i<5;i++)p.$('roomHandCards').querySelector('[data-room-card="'+i+'"]').click();assert.equal(p.$('roomHandCards').querySelectorAll('[aria-pressed=true]').length,5);p.$('roomDraw').click();p.$('roomDraw').click();await flush();}
  a.$('roomRefresh').click();c.$('roomRefresh').click();await flush();assert.equal(a.W.snapshot().balance,1300);assert.equal(b.W.snapshot().balance,900);assert.equal(a.W.snapshot().pending,null);assert.equal(a.W.snapshot().history.length,1);assert(a.$('roomOutcomeTitle').textContent.includes('勝利'));assert.equal(h.calls.filter(c=>c.path.endsWith('/draw')).length,2);
  a.$('roomRefresh').click();await flush();assert.equal(a.W.snapshot().balance,1300);const again=page(h,{map:a.map});assert.equal(again.W.snapshot().balance,1300);assert.equal(again.W.snapshot().history.length,1);again.close();a.close();b.close();c.close();
 });
 await test('a lost commit response reloads the same paid seat and cancellation refunds exactly once',async()=>{
  const h=harness(),p=page(h);p.$('tab-king').click();await flush();p.$('roomName').value='再接続';h.loseNext('/wealth/poker/commit');submit(p,'roomJoinForm');await flush();assert.equal(p.W.snapshot().balance,900);assert(p.W.snapshot().pending);
  const q=page(h,{map:p.map});p.close();await flush();assert.equal(q.w.document.body.dataset.casinoVariant,'king');assert.equal(q.W.snapshot().balance,900);assert.equal(h.calls.filter(c=>c.path.endsWith('/reserve')).length,1);
  q.$('roomLeave').click();assert(!q.$('roomLeaveConfirm').hidden);q.$('roomLeaveCancel').click();assert(q.$('roomLeaveConfirm').hidden);q.$('roomLeave').click();q.$('roomLeaveCommit').click();q.$('roomLeaveCommit').click();await flush();assert.equal(q.W.snapshot().balance,1000);assert.equal(q.W.snapshot().pending,null);assert.equal(q.W.snapshot().history.length,1);q.$('roomRefresh').click();await flush();assert.equal(q.W.snapshot().balance,1000);q.close();
 });
 await test('a failed local debit never commits a seat and leaves the balance intact',async()=>{
  const h=harness(),p=page(h,{failWallet:true});p.$('tab-king').click();await flush();p.$('roomName').value='保存確認';submit(p,'roomJoinForm');await flush();assert.equal(p.W.snapshot().balance,1000);assert.equal(p.W.snapshot().pending,null);assert.equal(h.calls.filter(c=>c.path.endsWith('/commit')).length,0);assert.equal(h.board.poker.latest(createHash('sha256').update(p.map.get('hk_wealth_identity_v1')).digest('hex')),null);p.close();
 });
 await test('fifteen rebirths unlock royal symbols in the standard slot cabinet with the displayed 1.2x payout',async()=>{
  const h=harness(),locked=page(h,{times:14});locked.$('tab-sovereign').click();assert(!locked.$('casinoLock').hidden);assert(locked.$('casinoLockMessage').textContent.includes('15回'));await assert.rejects(new Promise((yes,no)=>locked.W.begin('slots',1,()=>({payout:9,data:{}}),yes,no,{variant:'sovereign'})),/casino-locked/);locked.close();
  const p=page(h,{times:15});p.$('tab-sovereign').click();assert(p.$('casinoLock').hidden);assert.equal(p.w.document.body.dataset.casinoVariant,'sovereign');assert.equal(p.$('slotJackpotRate').textContent,'600倍');assert(p.$('vipRoom').hidden);assert(!p.w.document.body.classList.contains('vip-active'));assert(p.$('casinoBoost').textContent.includes('通常台の1.2倍'));assert(p.$('slotTitle').textContent.includes('王者'));assert(p.$('tab-sovereign').querySelector('.casino-tab-perk').textContent.includes('1.2倍'));assert(p.$('reel0').querySelector('.vip-slot-symbol svg'));p.close();
 });
 await test('VIP payouts use one exact rounding step, survive reload and retain the VIP multiplier on free spins',async()=>{
  const h=harness(),p=page(h,{times:15}),begin=(draw,variant='sovereign')=>new Promise((yes,no)=>p.W.begin('slots',1,draw,yes,no,{variant}));
  const r=await begin(()=>({payout:9,data:R.slots(['bell','bell','bell','lemon','cherry','bar','cherry','bar','lemon'])}));assert.equal(r.payout,27);const q=page(h,{times:15,map:p.map});assert.equal(q.W.snapshot().balance,1026);assert.equal(q.W.snapshot().history[0].payout,27);assert(q.$('vipFinale').hidden);assert(!q.w.document.body.classList.contains('vip-active'));await call(q.W,'finish',r.id);assert.equal(q.W.snapshot().balance,1026);q.close();
  const bonus=await begin(()=>({payout:0,data:{bonusTriggered:true}}));await call(p.W,'finish',bonus.id);assert.equal(p.W.snapshot().slotBonus.variant,'sovereign');await assert.rejects(begin(()=>({payout:9,data:{}}),'standard'),/bonus-variant/);
  const free=await begin(ctx=>{assert(ctx.freeSpin);return{payout:18,data:{}};});assert.equal(free.stake,0);assert.equal(free.payout,54);await call(p.W,'finish',free.id);assert.equal(p.W.snapshot().slotBonus.remaining,4);p.close();
 });
 await test('notifications open from the main bar, show unread marks and render operator messages as safe plain text',async()=>{
  const h=harness();h.db.prepare('INSERT INTO operation_notices(requestId,title,body,createdAt) VALUES(?,?,?,?)').run('fixture_notice_0001','新しいお知らせ','本文\n<img src=x onerror=alert(1)>',Date.now());
  const p=page(h,{main:true});await flush();assert(!p.$('noticeUnread').hidden);assert.equal(p.$('noticeUnread').textContent,'1');p.$('noticeNav').click();await flush();assert(!p.$('view-notifications').hidden);assert(p.$('eraSection').hidden);assert(p.$('noticeCompose').hidden);assert(p.$('noticeUnread').hidden);assert(p.$('noticeList').textContent.includes('通知'));assert(p.$('noticeList').textContent.includes('<img'));assert.equal(p.$('noticeList').querySelectorAll('img').length,0);assert.equal(p.map.get('hk_notice_seen_v3_anonymous'),'["1"]');p.close();
 });
 await test('only the authenticated administrator can preview and send a notice; double clicks and lost responses publish once',async()=>{
  const h=harness(),token='e'.repeat(64),owner=createHash('sha256').update(token).digest('hex');h.db.prepare('INSERT INTO wealth_admin_owner(singleton,owner,createdAt) VALUES(1,?,?)').run(owner,Date.now());
  const p=page(h,{main:true,token,hash:'#notifications'});await flush();assert(!p.$('noticeCompose').hidden);p.$('noticeTitle').value='王者の部屋が登場';p.$('noticeBody').value='お知らせ本文';submit(p,'noticeForm');assert(!p.$('noticePreview').hidden);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM operation_notices').get().n,0);
  h.loseNext('/wealth/admin/notices');p.$('noticeSend').click();p.$('noticeSend').click();await flush();assert.equal(h.db.prepare('SELECT COUNT(*) n FROM operation_notices').get().n,1);assert(!p.$('noticePreview').hidden);p.$('noticeSend').click();await flush();assert.equal(h.db.prepare('SELECT COUNT(*) n FROM operation_notices').get().n,1);assert(p.$('noticePreview').hidden);assert(p.$('noticeStatus').textContent.includes('配信しました'));assert.equal(p.map.get('hk_notice_draft_v1'),undefined);
  const visitor=page(h,{main:true,hash:'#notifications'});await flush();assert(visitor.$('noticeList').textContent.includes('王者の部屋が登場'));assert(visitor.$('noticeCompose').hidden);visitor.close();p.close();
 });
 await test('a seventh browser chooses the newly added room and reopens the same paid seat after reload',async()=>{
  const h=harness();
  for(let i=0;i<6;i++){
   const token=(i+1).toString(16).repeat(64),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
   assert((await h.fetch('https://api.example/wealth/register',{method:'POST',headers,body:JSON.stringify({name:'先客'+i,expectedRevision:0,snapshot:{balance:1000,rebirths:10,buildings:{},residents:{}}})})).ok);
   const id='full_room_ticket_'+i.toString().padStart(10,'0');for(const path of ['reserve','commit'])assert((await h.fetch('https://api.example/wealth/poker/'+path,{method:'POST',headers,body:JSON.stringify({id,stake:10})})).ok);
  }
  const p=page(h);p.$('tab-king').click();await flush();assert.equal(p.$('roomSelect').options.length,2);p.$('roomSelect').value='royal-2';p.$('roomSelect').dispatchEvent(new p.w.Event('change'));await flush();assert(!p.$('roomJoinForm').hidden);p.$('roomName').value='新しい部屋';p.$('roomStake').value='100';submit(p,'roomJoinForm');await flush();assert.equal(p.W.snapshot().balance,900);assert(p.$('roomSelect').disabled);assert.equal(p.$('roomSelect').value,'royal-2');
  const q=page(h,{map:p.map});p.close();await flush();assert.equal(q.$('roomSelect').value,'royal-2');assert.equal(q.W.snapshot().balance,900);q.$('roomLeave').click();q.$('roomLeaveCommit').click();await flush();assert.equal(q.W.snapshot().balance,1000);q.close();
 });
 await test('personal notice selection names the exact recipient and only that browser receives the content',async()=>{
  const h=harness(),staff='e'.repeat(64),one='1'.repeat(64),two='2'.repeat(64),hash=t=>createHash('sha256').update(t).digest('hex');
  h.db.prepare('INSERT INTO wealth_admin_owner(singleton,owner,createdAt) VALUES(1,?,?)').run(hash(staff),Date.now());
  for(const token of [one,two])assert((await h.fetch('https://api.example/wealth/register',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:'同じ名前',expectedRevision:0,snapshot:{balance:1000,rebirths:10,buildings:{},residents:{}}})})).ok);
  const p=page(h,{main:true,token:staff,hash:'#notifications'});await flush();p.$('noticeAudience').value='personal';p.$('noticeAudience').dispatchEvent(new p.w.Event('change'));assert(!p.$('noticeRecipientField').hidden);assert.equal(p.$('noticeRecipient').options.length,3);p.$('noticeRecipient').value=hash(one);p.$('noticeRecipient').dispatchEvent(new p.w.Event('change'));p.$('noticeTitle').value='あなたへの連絡';p.$('noticeBody').value='個人配信の本文';submit(p,'noticeForm');assert(p.$('noticePreviewTarget').textContent.includes(hash(one).slice(0,8)));assert.equal(p.$('noticeSend').textContent,'この人に配信する');p.$('noticeSend').click();await flush();assert(p.$('noticeStatus').textContent.includes('さんのみに配信'));assert(!p.$('noticeList').textContent.includes('個人配信の本文'));
  const a=page(h,{main:true,token:one,hash:'#notifications'}),b=page(h,{main:true,token:two,hash:'#notifications'});await flush();assert(a.$('noticeList').textContent.includes('個人配信の本文'));assert(a.$('noticeList').textContent.includes('あなた宛て'));assert(!b.$('noticeList').textContent.includes('個人配信の本文'));a.close();b.close();p.close();
 });
 await test('changing identity clears private notices and drops an older in-flight personal response',async()=>{
  const h=harness(),one='1'.repeat(64),two='2'.repeat(64),owner=createHash('sha256').update(one).digest('hex');
  h.db.prepare('INSERT INTO operation_personal_notices(requestId,title,body,createdAt,recipient,recipientName) VALUES(?,?,?,?,?,?)').run('private_inflight_001','本人限定','遅れて届く秘密の本文',Date.now(),owner,'本人');
  let release;const gate=new Promise(r=>release=r),original=h.fetch;h.fetch=async(url,options)=>{const r=await original(url,options);if(new URL(url).pathname==='/wealth/notices'&&options?.headers?.Authorization==='Bearer '+one)await gate;return r;};
  const p=page(h,{main:true,token:one,hash:'#notifications'});p.map.set('hk_wealth_identity_v1',two);p.w.dispatchEvent(new p.w.StorageEvent('storage',{key:'hk_wealth_identity_v1'}));release();await flush();assert(!p.$('noticeList').textContent.includes('秘密の本文'));assert(p.$('noticeCompose').hidden);assert(p.$('noticeUnread').hidden);p.close();
 });
 console.log(checks+' community UI checks passed.');
})().catch(error=>{console.error(error);for(const w of opened)w.close();process.exitCode=1;});
