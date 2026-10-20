const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),{harness,M,C}=require('./holdem-harness.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),flush=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,5));};
const opened=[];let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS',name);};
const submit=(p,id)=>p.$(id).dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
 function page(h,{main=false,map=null,times=10,balance=1000,token=null,hash='',failWallet=false}={}){
  const store=map||new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:times,balance:M.full(balance),pending:null,history:[]})]]);if(token)store.set('hk_wealth_identity_v1',token);
  const w=new JSDOM(read(main?'index.html':'casino.html'),{url:'https://historykids.github.io/'+(main?hash:'casino.html'),runScripts:'outside-only',pretendToBeVisual:true}).window;
  opened.push(w);Object.defineProperty(w,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(failWallet&&k==='hk_wallet_v2')throw Error('quota');store.set(k,String(v));},removeItem:k=>store.delete(k)}});
  w.fetch=h.fetch;w.setInterval=()=>0;w.HKRankingConfig={endpoint:'https://api.example/ranking'};w.matchMedia=()=>({matches:true});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  for(const f of ['amounts','bitcoin-rules','wallet'])w.eval(read('assets/ui/'+f+'.js'));
  if(main){for(const f of ['dataset','ancient','meiji','modern'])w.eval(read('data/'+f+'.js'));}
  w.eval(read('assets/ui/core.js'));w.eval(read('assets/ui/wealth-rules.js'));
  if(main)for(const f of ['activities','residents','app','admin','community','notices'])w.eval(read('assets/ui/'+f+'.js'));
  else for(const f of ['casino-rules','table-rules','royal-poker','casino-vip','community','online-poker','casino'])w.eval(read('assets/ui/'+f+'.js'));
  return{w,map:store,W:w.HKWallet,$:id=>w.document.getElementById(id),setFailWallet(value){failWallet=value;},close:()=>w.close()};
 }

async function enter(p,name){p.$('tab-king').click();await flush();assert(!p.$('roomJoinForm').hidden,p.$('roomMessage').textContent);p.$('roomName').value=name;submit(p,'roomJoinForm');await flush();}
async function pair(){const h=await harness(),a=page(h),b=page(h);await enter(a,'参加者あ');await enter(b,'参加者い');assert(a.W.snapshot().pending,a.$('roomMessage').textContent);assert(b.W.snapshot().pending,b.$('roomMessage').textContent);h.advance(10000);a.$('roomRefresh').click();b.$('roomRefresh').click();await flush();return{h,a,b};}
async function refresh(...pages){for(const p of pages)p.$('roomRefresh').click();await flush();}
(async()=>{
 await test('browser flows show two hole cards, five board slots, legal raises and all-in settlement',async()=>{
  const {h,a,b}=await pair();try{
   const c=page(h);c.$('tab-king').click();await flush();
   assert.equal(a.$('roomHandCards').querySelectorAll('.room-card').length,2);assert.equal(a.$('roomHandCards').querySelectorAll('button').length,0);
   assert.equal(a.$('roomBoardCards').children.length,5);assert.equal(c.$('roomSeats').querySelectorAll('.room-card:not(.card-back)').length,0);assert(c.$('roomRole').textContent.includes('観戦'));assert(c.$('roomJoinForm').hidden);
   assert(!a.$('roomCall').disabled);assert(b.$('roomCall').disabled);assert(a.$('roomDraw').hidden);
   a.$('roomRaise').value='6';a.$('roomRaiseCommit').click();await flush();await refresh(b);assert(b.$('roomCall').textContent.includes('4両'));b.$('roomCall').click();await flush();await refresh(a);
   assert.equal(a.$('roomStreet').textContent,'フロップ');assert.equal(a.$('roomBoardCards').querySelectorAll('.room-card:not(.card-back)').length,3);
   b.$('roomAllin').click();await flush();await refresh(a);assert(a.$('roomCall').textContent.includes('94両'));a.$('roomCall').click();await flush();await refresh(b,c);
   assert.equal(a.W.snapshot().pending,null);assert.equal(b.W.snapshot().pending,null);assert.equal(BigInt(a.W.snapshot().balance)+BigInt(b.W.snapshot().balance),2200n);
   assert.equal(a.W.snapshot().history.length,1);assert.equal(a.$('roomBoardCards').querySelectorAll('.room-card:not(.card-back)').length,5);
   const before=M.full(a.W.snapshot().balance);await refresh(a);assert.equal(M.full(a.W.snapshot().balance),before);assert.equal(a.W.snapshot().history.length,1);c.close();
  }finally{a.close();b.close();h.close();}
 });
 await test('a lost action response reloads the same request without calling twice',async()=>{
  const {h,a,b}=await pair();let q;try{
   h.lose('/wealth/poker/action');a.$('roomCall').click();await flush();assert(a.map.has('hk_holdem_action_v1'));assert.equal(h.room().actionVersion,1);assert(a.$('roomCall').disabled);
   a.close();q=page(h,{map:a.map});await flush();assert(!q.map.has('hk_holdem_action_v1'));assert.equal(h.room().actionVersion,1);assert.equal(h.room().players[0].bet,'2');
   await refresh(b);b.$('roomFold').click();await flush();await refresh(q);assert.equal(q.W.snapshot().balance,1006);assert.equal(b.W.snapshot().balance,998);assert.equal(q.W.snapshot().history.length,1);
   assert(q.$('roomOutcomeTitle').textContent.includes('勝利'));await refresh(q);assert.equal(q.W.snapshot().balance,1006);
  }finally{q?.close();a.close();b.close();h.close();}
 });
 await test('a failed local payout save retains its receipt and later credits unused ryo once',async()=>{
  const {h,a,b}=await pair();try{
   a.setFailWallet(true);a.$('roomFold').click();await flush();assert(a.W.snapshot().pending);assert.equal(a.W.snapshot().balance,900);assert.equal(h.room().phase,'showdown');
   a.setFailWallet(false);await refresh(a,b);assert.equal(a.W.snapshot().balance,999);assert.equal(a.W.snapshot().pending,null);assert.equal(b.W.snapshot().balance,1003);assert.equal(a.$('roomOutcomeTitle').textContent,'ハンド終了');
   await refresh(a);assert.equal(a.W.snapshot().balance,999);assert.equal(a.W.snapshot().history.length,1);
  }finally{a.close();b.close();h.close();}
 });
 await test('a failed initial debit cancels the reserved seat without granting an unearned refund',async()=>{
  const h=await harness(),p=page(h,{failWallet:true});try{
   await enter(p,'保存確認');assert.equal(p.W.snapshot().balance,1000);assert.equal(p.W.snapshot().pending,null);assert.equal(h.calls.filter(c=>c.path.endsWith('/commit')).length,0);assert.equal(h.room().players.length,0);
   assert.equal(h.calls.filter(c=>c.path.endsWith('/ack')).length,1);
  }finally{p.close();h.close();}
 });
 await test('invalid raises preserve the hand and identity changes immediately hide private cards',async()=>{
  const {h,a,b}=await pair();try{
   a.$('roomRaise').value='1';a.$('roomRaiseCommit').click();await flush();assert.equal(h.room().actionVersion,0);assert(!a.map.has('hk_holdem_action_v1'));assert(a.$('roomMessage').classList.contains('error'));
   a.map.set('hk_wealth_identity_v1','f'.repeat(64));a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:'hk_wealth_identity_v1'}));
   assert(a.$('roomHand').hidden);assert.equal(a.$('roomHandCards').children.length,0);assert.equal(a.$('roomSeats').children.length,0);assert(a.$('roomBetting').hidden);
  }finally{a.close();b.close();h.close();}
 });
 console.log(checks+' Holdem browser flow checks passed.');
})().catch(e=>{console.error(e);for(const w of opened)w.close();process.exitCode=1;});
