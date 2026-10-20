const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),M=require('../assets/ui/amounts.js'),R=require('../assets/ui/casino-rules.js');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');let checks=0;
async function test(name,fn){await fn();console.log('PASS',name);checks++;}
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function page({ui='casino',times=0,balance=100,bonus=null,map=null,locks=null,query='?game=slots',ranking=false}={}){
 const store=map||new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:times,balance:M.full(balance),pending:null,history:[],slotBonus:bonus})]]),w=new JSDOM(ui==='wallet'?'<body></body>':read(ui==='casino'?'casino.html':'index.html'),{url:'https://historykids.github.io/'+(ui==='casino'?'casino.html'+query:'#rebirth'),runScripts:'outside-only',pretendToBeVisual:true}).window;
 let fail=false,writes=0,draws=0,serial=0,now=0,next=0;const timers=new Map();
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(k==='hk_wallet_v2'){if(fail)throw new w.DOMException('Storage full','QuotaExceededError');writes++;}store.set(k,String(v));},removeItem:k=>store.delete(k)}});
 if(locks)Object.defineProperty(w.navigator,'locks',{value:locks});w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=function(){};w.scrollTo=()=>{};w.Date.now=()=>100000+now;
 w.crypto.getRandomValues=a=>{draws++;a[0]=0;return a;};w.crypto.randomUUID=()=> 'recovery-round-'+(++serial);
 w.setTimeout=(fn,delay=0)=>{const id=++next;timers.set(id,{fn,due:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);
 if(ranking){store.set('hk_wealth_identity_v1','a'.repeat(64));w.HKRankingConfig={endpoint:'https://api.example/ranking'};w.fetch=()=>new Promise(()=>{});}
 for(const f of ['amounts','bitcoin-rules','pachinko-rules','wallet'])w.eval(read('assets/ui/'+f+'.js'));
 if(ui==='casino')for(const f of ['casino-rules','table-rules','royal-poker','casino-vip','casino'])w.eval(read('assets/ui/'+f+'.js'));
 if(ui==='rebirth')w.eval(read('assets/ui/rebirth.js'));
 const advance=ms=>{const end=now+ms;let guard=0;while(true){const t=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];if(!t||t[1].due>end)break;assert(guard++<1000);now=t[1].due;timers.delete(t[0]);t[1].fn();}now=end;};
 return{w,W:w.HKWallet,map:store,$:id=>w.document.getElementById(id),advance,fail(value){fail=value;},get draws(){return draws;},get writes(){return writes;},close(){w.close();}};
}
const call=(p,fn,...args)=>new Promise((yes,no)=>p.W[fn](...args,yes,no));
(async()=>{
 await test('reopening standard, gold and sovereign free spins restores the right machine and saved stake at zero cost',()=>{
  for(const [variant,times]of [['standard',0],['gold',5],['sovereign',15]]){const p=page({times,balance:0,bonus:{remaining:3,stake:50000,variant}});assert.equal(p.w.document.body.dataset.casinoVariant,variant);assert(!p.$('panel-slots').hidden);assert(!p.$('playRound').disabled);p.$('playRound').click();assert.equal(p.W.snapshot().pending.stake,0);assert.equal(p.W.snapshot().pending.slotStake,50000);assert.equal(p.W.snapshot().balance,0);p.advance(300);assert.equal(p.W.snapshot().balance,M.rebirth.casinoBoost(1600000,times,variant));assert.equal(p.W.snapshot().slotBonus.remaining,2);p.close();}
 });
 await test('legacy bonus records infer an eligible originating machine without introducing a locked variant',()=>{
  for(const [times,source,expected]of [[15,'sovereign','sovereign'],[0,'gold','standard']]){const map=new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:times,balance:'100',pending:null,slotBonus:{remaining:2,stake:10},history:[{game:'slots',variant:source,data:{bonusTriggered:true}}]})]]),p=page({map});assert.equal(p.w.document.body.dataset.casinoVariant,expected);assert(!p.W.snapshot().unavailable);p.$('playRound').click();p.advance(300);assert(!p.W.snapshot().unavailable);assert.equal(p.W.snapshot().slotBonus.remaining,1);p.close();}
 });
 await test('other slot tabs remain selectable and offer an explicit return to the unfinished bonus',()=>{
  const p=page({times:15,bonus:{remaining:4,stake:10,variant:'sovereign'}});p.$('tab-slots').click();assert.equal(p.w.document.body.dataset.casinoVariant,'standard');assert(p.$('playRound').disabled);assert(!p.$('casinoResume').hidden);assert(p.$('casinoStatus').textContent.includes('無料スピン'));p.$('casinoResume').click();assert.equal(p.w.document.body.dataset.casinoVariant,'sovereign');assert(!p.$('playRound').disabled);assert.equal(p.W.snapshot().slotBonus.remaining,4);assert.equal(p.W.snapshot().balance,100);p.close();
 });
 await test('a failed payout can retry on the same page with the exact saved result and no second stake or draw',()=>{
  const p=page();p.$('playRound').click();assert.equal(p.W.snapshot().balance,90);const id=p.W.snapshot().pending.id,draws=p.draws;p.fail(true);p.advance(300);assert.equal(p.W.snapshot().pending.id,id);assert.equal(p.W.snapshot().history.length,0);assert(!p.$('casinoResume').hidden);assert(!p.$('casinoResume').disabled);p.fail(false);p.$('casinoResume').click();p.$('casinoResume').click();assert.equal(p.W.snapshot().balance,250);assert.equal(p.W.snapshot().pending,null);assert.equal(p.W.snapshot().history.length,1);assert.equal(p.draws,draws);assert(!p.$('tab-roulette').disabled);p.advance(10000);assert.equal(p.W.snapshot().balance,250);p.close();
 });
 await test('a failed initial save releases the controls without charging and can be retried',()=>{
  const p=page();p.fail(true);p.$('playRound').click();assert.equal(p.W.snapshot().balance,100);assert.equal(p.W.snapshot().pending,null);assert(!p.$('tab-janken').disabled);p.fail(false);p.$('playRound').click();p.advance(300);assert.equal(p.W.snapshot().balance,250);assert.equal(p.W.snapshot().history.length,1);p.close();
 });
 await test('another tab settling or resetting a round releases stale animation locks without paying again',async()=>{
  const p=page();p.$('playRound').click();const id=p.W.snapshot().pending.id,q=page({ui:'wallet',map:p.map});await call(q,'finish',id);p.w.dispatchEvent(new p.w.StorageEvent('storage',{key:'hk_wallet_v2'}));assert(!p.$('tab-roulette').disabled);p.advance(300);assert.equal(p.W.snapshot().balance,250);assert.equal(p.W.snapshot().history.length,1);
  p.$('playRound').click();await call(q,'replace',0);p.w.dispatchEvent(new p.w.StorageEvent('storage',{key:'hk_wallet_v2'}));assert(!p.$('tab-janken').disabled);p.advance(300);assert.equal(p.W.snapshot().balance,0);assert.equal(p.W.snapshot().pending,null);p.close();q.close();
 });
 await test('returning to a suspended animation settles the original wager and cancels its stale timers',()=>{
  const p=page();p.$('playRound').click();p.w.Date.now=()=>120000;p.w.dispatchEvent(new p.w.Event('focus'));assert.equal(p.W.snapshot().pending,null);assert.equal(p.W.snapshot().balance,250);assert(!p.$('tab-roulette').disabled);p.advance(300);assert.equal(p.W.snapshot().balance,250);assert.equal(p.W.snapshot().history.length,1);p.close();
 });
 await test('a denied native lock falls back before writing, while a synchronous lock failure never strands the UI',async()=>{
  const denied={request(){const e=Error('denied');e.name='SecurityError';throw e;}},p=page({locks:denied});p.$('playRound').click();p.advance(300);assert.equal(p.W.snapshot().balance,250);assert.equal(p.W.snapshot().history.length,1);p.close();
  const broken={request(){throw Error('lock unavailable');}},q=page({locks:broken});q.$('playRound').click();assert.equal(q.W.snapshot().balance,100);assert(!q.$('tab-roulette').disabled);broken.request=(_key,fn)=>Promise.resolve(fn());q.$('playRound').click();await tick();q.advance(300);await tick();assert.equal(q.W.snapshot().balance,250);q.close();
 });
 await test('success callback errors are never reported as a failed save or written twice',()=>{
  const p=page({ui:'wallet'});let failed=false;assert.throws(()=>p.W.adjust(1,()=>{throw Error('view failed');},()=>{failed=true;}),/view failed/);assert(!failed);assert.equal(p.W.snapshot().balance,101);assert.equal(p.writes,1);p.close();
 });
 await test('expired historical bonus access flags cannot disable a valid wallet or rebirth',async()=>{
  const p=page({ui:'rebirth',balance:M.rebirth.cost(0),bonus:{remaining:0,stake:10,variant:'gold'}});assert(!p.W.snapshot().unavailable);assert(!p.$('rebirthStart').disabled);p.$('rebirthStart').click();p.$('rebirthCommit').click();await tick();assert.equal(p.W.snapshot().rebirths,1);assert.equal(p.W.snapshot().balance,10000);p.close();
 });
 await test('a slow ranking request does not block a second locally valid rebirth',async()=>{
  const p=page({ui:'rebirth',balance:M.rebirth.cost(0),ranking:true});p.$('rebirthStart').click();p.$('rebirthCommit').click();await tick();assert.equal(p.W.snapshot().rebirths,1);await call(p,'adjust',M.rebirth.cost(1));assert(!p.$('rebirthStart').disabled);p.$('rebirthStart').click();p.$('rebirthCommit').click();await tick();assert.equal(p.W.snapshot().rebirths,2);assert.equal(p.W.snapshot().balance,10000);p.close();
 });
 await test('rebirth offers a route to finish a saved bonus and unlocks after the final free spin settles',async()=>{
  const p=page({ui:'rebirth',balance:M.rebirth.cost(15),times:15,bonus:{remaining:1,stake:10,variant:'sovereign'}});assert(p.$('rebirthStart').disabled);assert(!p.$('rebirthResume').hidden);assert.equal(p.$('rebirthResume').getAttribute('href'),'./casino.html');const q=page({map:p.map});assert.equal(q.w.document.body.dataset.casinoVariant,'sovereign');q.$('playRound').click();q.advance(300);p.w.dispatchEvent(new p.w.StorageEvent('storage',{key:'hk_wallet_v2'}));assert(!p.$('rebirthStart').disabled);assert(p.$('rebirthResume').hidden);p.$('rebirthStart').click();p.$('rebirthCommit').click();await tick();assert.equal(p.W.snapshot().rebirths,16);assert.equal(p.W.snapshot().balance,10000);p.close();q.close();
 });
 await test('an old round with unavailable visual metadata still settles its saved payout exactly once',()=>{
  const map=new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:0,balance:'90',history:[],pending:{id:'old-visual-round',game:'slots',variant:'standard',rebirths:0,boostVersion:2,stake:10,slotStake:10,payout:20,basePayout:20,data:{multiplier:2,title:'古い結果'},at:1}})]]),p=page({map});assert.equal(p.W.snapshot().balance,110);assert.equal(p.W.snapshot().pending,null);assert.equal(p.W.snapshot().history.length,1);assert(!p.$('tab-janken').disabled);p.w.dispatchEvent(new p.w.Event('focus'));assert.equal(p.W.snapshot().balance,110);p.close();
 });
 console.log(checks+' recovery checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
