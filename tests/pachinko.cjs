const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),M=require('../assets/ui/amounts.js'),Q=require('../assets/ui/pachinko-rules.js');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
const out=()=>Array.from({length:10},()=>({pocket:0,digits:null})),jackpot=()=>{const b=out();b[0]={pocket:3,digits:[7,7,7]};return Q.resolve(b);};
function page({times=20,balance=100,map=null,ui=false,reduced=true,fail=false,locks=null,query='',noDraw=false}={}){
 const store=map||new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:times,balance:M.full(balance),history:[],pending:null})]]);
 const w=new JSDOM(ui?read('casino.html'):'<body></body>',{url:'https://historykids.github.io/casino.html'+query,runScripts:'outside-only',pretendToBeVisual:true}).window;
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail&&k==='hk_wallet_v2')throw Error('quota');store.set(k,String(v));},removeItem:k=>store.delete(k)}});
 w.matchMedia=()=>({matches:reduced});w.HTMLElement.prototype.scrollIntoView=function(){};if(locks)Object.defineProperty(w.navigator,'locks',{value:locks});
 let now=0,next=0,serial=0,randomCalls=0,queue=[],paintCount=0;const timers=new Map(),gradient={addColorStop(){}};
 const ctx=new Proxy({},{get(_t,key){if(key==='createRadialGradient')return()=>gradient;if(key==='clearRect')return()=>paintCount++;return()=>{};}});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.setTimeout=(fn,delay=0)=>{const id=++next;timers.set(id,{fn,due:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);w.requestAnimationFrame=fn=>w.setTimeout(()=>fn(now),16);w.cancelAnimationFrame=w.clearTimeout;
 w.crypto.getRandomValues=a=>{randomCalls++;a[0]=queue.length?queue.shift():0;return a;};w.crypto.randomUUID=()=> 'pachinko-round-'+(++serial);
 for(const file of ['amounts','pachinko-rules','bitcoin-rules','wallet'])w.eval(read('assets/ui/'+file+'.js'));
 if(noDraw)w.HKPachinkoRules={...w.HKPachinkoRules,draw(){throw Error('Unexpected redraw');}};
 if(ui)for(const file of ['casino-rules','table-rules','royal-poker','casino-vip','pachinko','casino'])w.eval(read('assets/ui/'+file+'.js'));
 function advance(ms){const end=now+ms;let guard=0;while(true){const t=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];if(!t||t[1].due>end)break;assert(guard++<3000);now=t[1].due;timers.delete(t[0]);t[1].fn();}now=end;}
 return{w,W:w.HKWallet,map:store,$:id=>w.document.getElementById(id),advance,random(values){queue=values.slice();},get randomCalls(){return randomCalls;},get paints(){return paintCount;}};
}
const call=(p,fn,...args)=>new Promise((yes,no)=>p.W[fn](...args,yes,no)),begin=(p,stake,data,variant='emperor')=>new Promise((yes,no)=>p.W.begin('pachinko',stake,()=>({payout:Q.payout(stake,data),data}),yes,no,{variant}));
(async()=>{
 await test('all 100 pocket draws match the advertised weights and every three-digit draw pays the stated jackpot',()=>{
  const counts=Array(7).fill(0);for(let n=0;n<100;n++){const data=Q.draw(size=>size===100?n:123);counts[data.balls[0].pocket]++;assert(Q.valid(data));}assert.deepEqual(counts,[25,12,10,6,10,12,25]);
  let triples=0,sevens=0;for(let n=0;n<1000;n++){const b=out();b[0]={pocket:3,digits:[Math.floor(n/100),Math.floor(n/10)%10,n%10]};const r=Q.resolve(b);if(r.jackpots){triples++;assert.equal(r.units,n===777?2000:500);}else assert.equal(r.units,2);sevens+=r.seven;}assert.equal(triples,10);assert.equal(sevens,1);
 });
 await test('small prizes combine before rounding and retain exact hidden digits for large stakes',()=>{
  const balls=Array.from({length:10},(_,i)=>({pocket:i%2?2:1,digits:null})),data=Q.resolve(balls);assert.equal(data.units,15);assert.equal(Q.payout(1,data),1);assert.equal(Q.payout('10000000000000001',data),'15000000000000001');assert.equal(M.rebirth.casinoBoost(Q.payout('10000000000000001',data),20,'emperor'),'45000000000000003');
 });
 await test('under-twenty wallets and direct URL variants cannot open the pachinko game',async()=>{
  for(const times of [0,19]){const p=page({times,ui:true,query:'?game=pachinko&variant=emperor'});assert.equal(p.w.document.body.dataset.casinoVariant,'standard');p.$('tab-emperor').click();assert(!p.$('casinoLock').hidden);assert(p.$('casinoLockMessage').textContent.includes('20回'));assert(p.$('panel-pachinko').hidden);assert(p.$('playRound').disabled);await assert.rejects(begin(p,10,jackpot()),/casino-locked/);assert.equal(p.W.snapshot().balance,100);p.w.close();}
  const p=page();await assert.rejects(begin(p,10,jackpot(),'standard'),/casino-locked/);p.w.close();
 });
 await test('the twenty-rebirth cabinet displays boosted jackpot rates and only the ten-item selection bar opens it',()=>{
  const p=page({ui:true});p.$('tab-emperor').click();assert(p.$('casinoLock').hidden);assert(!p.$('panel-pachinko').hidden);assert.equal(p.w.document.querySelectorAll('.casino-tabs [role=tab]').length,10);assert.equal(p.$('pachinkoJackpotRate').textContent,'600倍');assert.equal(p.$('pachinkoTripleRate').textContent,'150倍');assert.equal(p.$('vipRoomEnglish').textContent,'THE GOLDEN PAVILION');assert(p.$('vipRoomArt').querySelector('svg'));assert.equal(p.W.snapshot().balance,100);p.w.close();
 });
 await test('desktop and mobile launch debit once, settle all ten balls once and show each result accessibly',()=>{
  const p=page({ui:true});p.$('tab-emperor').click();p.random([47,777,...Array(9).fill(0)]);p.$('mobilePlayRound').click();p.$('playRound').click();assert.equal(p.W.snapshot().balance,90);assert.equal(p.W.snapshot().pending.game,'pachinko');assert(p.$('tab-janken').disabled);p.advance(119);assert.equal(p.W.snapshot().balance,90);p.advance(1);assert.equal(p.W.snapshot().balance,6090);assert.equal(p.W.snapshot().history.length,1);assert.equal(p.$('pachinkoBallResults').children.length,10);assert.equal(p.$('pachinkoBallCount').textContent,'10 / 10球');assert.equal(p.$('pachinkoProgress').value,10);assert(p.$('pachinkoCall').textContent.includes('777'));assert(p.$('pachinkoMachine').classList.contains('pachinko-fever'));assert(!p.$('tab-janken').disabled);p.advance(10000);assert.equal(p.W.snapshot().balance,6090);p.w.close();
 });
 await test('normal motion animates the balls before paying and stops the animation after the final ball',()=>{
  const p=page({ui:true,reduced:false});p.$('tab-emperor').click();p.random([47,111,...Array(9).fill(0)]);p.$('playRound').click();assert(p.$('pachinkoMachine').classList.contains('pachinko-playing'));p.advance(2800);assert.equal(p.W.snapshot().balance,90);assert(p.$('pachinkoProgress').value>0);assert(p.$('pachinkoProgress').value<10);assert(p.paints>25);p.advance(3000);assert.equal(p.W.snapshot().balance,1590);assert(!p.$('pachinkoMachine').classList.contains('pachinko-playing'));assert.equal(p.$('pachinkoProgress').value,10);p.w.close();
 });
 await test('reopening a pending pachinko play restores the same ten balls without drawing or paying twice',async()=>{
  const p=page(),data=jackpot(),round=await begin(p,10,data),q=page({map:p.map,ui:true,noDraw:true});assert.equal(q.w.document.body.dataset.casinoVariant,'emperor');assert.equal(q.W.snapshot().balance,6090);assert.equal(q.W.snapshot().pending,null);assert.equal(q.W.snapshot().history[0].id,round.id);assert.equal(q.randomCalls,0);assert(q.$('resultKicker').textContent.includes('RESTORED'));await call(p,'finish',round.id);assert.equal(p.W.snapshot().balance,6090);assert.equal(p.W.snapshot().history.length,1);p.w.close();q.w.close();
 });
 await test('invalid pocket metadata or altered pending jackpots cannot change the wallet',async()=>{
  const p=page(),data=jackpot();for(const mutate of [d=>d.balls[0].pocket=8,d=>d.balls[0].digits=[7,7],d=>d.units++,d=>d.seven++,d=>d.title='偽の結果']){const bad=structuredClone(data);mutate(bad);assert(!Q.valid(bad));await assert.rejects(new Promise((yes,no)=>p.W.begin('pachinko',10,()=>({payout:2000,data:bad}),yes,no,{variant:'emperor'})));assert.equal(p.W.snapshot().balance,100);}
  const r=await begin(p,10,data),saved=JSON.parse(p.map.get('hk_wallet_v2'));saved.pending.data.units++;p.map.set('hk_wallet_v2',JSON.stringify(saved));assert(p.W.snapshot().unavailable);await assert.rejects(call(p,'finish',r.id),/wallet-invalid/);p.w.close();
 });
 await test('failed writes preserve unresolved balls and concurrent tabs settle the same payout once',async()=>{
  let chain=Promise.resolve();const locks={request(_name,fn){const task=chain.then(fn);chain=task.catch(()=>{});return task;}},p=page({locks}),q=page({map:p.map,locks}),data=jackpot();
  const starts=await Promise.allSettled([begin(p,10,data),begin(q,10,data)]);assert.equal(starts.filter(r=>r.status==='fulfilled').length,1);const round=p.W.snapshot().pending;
  const broken=page({map:p.map,fail:true});await assert.rejects(call(broken,'finish',round.id),/quota/);assert.equal(p.W.snapshot().balance,90);assert(p.W.snapshot().pending);
  await Promise.all([call(p,'finish',round.id),call(q,'finish',round.id)]);assert.equal(p.W.snapshot().balance,6090);assert.equal(p.W.snapshot().history.length,1);p.w.close();q.w.close();broken.w.close();
 });
 await test('maximum stakes saturate precisely and a reset prevents an old play from paying later',async()=>{
  const p=page({balance:M.MAX}),data=Q.resolve(Array.from({length:10},()=>({pocket:3,digits:[7,7,7]}))),r=await begin(p,M.MAX,data);assert.equal(r.basePayout,M.mul(M.MAX,2000));assert.equal(r.payout,M.mul(M.MAX,6000));await assert.rejects(call(p,'rebirth',20),/pending-round/);await call(p,'finish',r.id);assert.equal(p.W.snapshot().balance,M.MAX);p.w.close();
  const q=page(),round=await begin(q,10,jackpot());await call(q,'replace',0);await assert.rejects(call(q,'finish',round.id),/round-gone/);assert.equal(q.W.snapshot().balance,0);q.w.close();
 });
 await test('every wallet page loads pachinko rules before reading a saved play and the rebirth reward includes level twenty',()=>{
  for(const file of ['index.html','casino.html','wealth-ranking.html']){const source=read(file);assert(source.indexOf('pachinko-rules.js')<source.indexOf('wallet.js'));assert.equal((source.match(/pachinko-rules\.js/g)||[]).length,1);}
  const doc=new JSDOM(read('index.html')).window.document;assert(doc.getElementById('emperorUnlock'));assert(!doc.querySelector('.rebirth-unlock.emperor a'));
 });
 console.log(checks+' pachinko checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
