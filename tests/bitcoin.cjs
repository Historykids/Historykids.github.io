const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),B=require(path.join(root,'assets/ui/bitcoin-rules.js'));
let checks=0;const test=async(n,f)=>{await f();checks++;console.log('PASS',n);};
function page({map=new Map([['money_v1','100']]),locks=null,ui=false}={}){
 const d=new JSDOM(ui?read('casino.html'):'<body></body>',{url:'https://historykids.github.io/casino.html?game=bitcoin',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))}});
 if(locks)Object.defineProperty(w.navigator,'locks',{value:locks});let now=1000000,seq=0;
 w.Date.now=()=>now;w.crypto.randomUUID=()=>`btc-${++seq}`;w.matchMedia=()=>({matches:true});w.setInterval=()=>1;w.clearInterval=()=>{};
 for(const file of ['bitcoin-rules.js','wallet.js'])w.eval(read('assets/ui/'+file));
 let publish;
 if(ui){w.HKBitcoin={draw(){},createFeed(callback){publish=callback;return {start(){},stop(){}}}};w.eval(read('assets/ui/casino-rules.js'));w.eval(read('assets/ui/casino.js'));}
 return {w,W:w.HKWallet,map,$:id=>w.document.getElementById(id),setTime:t=>{now=t;},feed:q=>publish({quote:q,points:[q],live:true}),close:()=>w.close()};
}
const call=(p,method,...a)=>new Promise((yes,no)=>p.W[method](...a,yes,no));
(async()=>{
 await test('up/down, equal price, exact 10 second deadline and missing quotes have deterministic payouts',()=>{
  const r={direction:'up',startPrice:100,startedAt:1000000,deadline:1010000};
  for(const [direction,price,payout] of [['up',101,20],['down',99,20],['up',99,0],['down',101,0],['up',100,10]])assert.equal(B.decide({...r,direction},10,{price,time:1010000},1010000).payout,payout);
  assert.throws(()=>B.decide(r,10,{price:101,time:1009999},1009999),/bitcoin-open/);
  assert.throws(()=>B.decide(r,10,{price:101,time:1009999},1010000),/bitcoin-waiting/);
  assert.equal(B.decide(r,10,{price:101,time:1016000},1016000).payout,10);
  for(const q of [null,{price:NaN,time:1000000},{price:0,time:1000000},{price:100,time:980000},{price:100,time:1020000}])assert(!B.quoteValid(q,1000000));
 });
 await test('stake is charged once, normal finish cannot settle early, reload preserves and result is paid once',async()=>{
  const p=page(),r=await call(p,'beginBitcoin',10,'up',()=>({price:100,time:1000000}));assert.equal(p.W.snapshot().balance,90);assert.equal(r.data.deadline-r.data.startedAt,10000);
  await assert.rejects(call(p,'beginBitcoin',10,'down',()=>({price:100,time:1000000})),/pending-round/);await assert.rejects(call(p,'finish',r.id),/bitcoin-open/);
  const q=page({map:p.map});assert.equal(q.W.snapshot().pending.id,r.id);q.setTime(1010001);
  await call(q,'finishBitcoin',r.id,{price:101,time:1010001});await call(q,'finishBitcoin',r.id,{price:999,time:1010001});assert.equal(p.W.snapshot().balance,110);assert.equal(p.W.snapshot().history.length,1);p.close();q.close();
 });
 await test('network failure refunds all coins after the bounded wait, including a late reload',async()=>{
  const p=page(),r=await call(p,'beginBitcoin',25,'down',()=>({price:100,time:1000000}));p.setTime(1010000);await assert.rejects(call(p,'finishBitcoin',r.id,null),/bitcoin-waiting/);assert.equal(p.W.snapshot().balance,75);
  const q=page({map:p.map});q.setTime(2000000);const result=await call(q,'finishBitcoin',r.id,{price:999,time:2000000});assert.equal(result.payout,25);assert(result.data.refunded);assert.equal(p.W.snapshot().balance,100);p.close();q.close();
 });
 await test('invalid amounts, stale quotes and storage errors spend nothing',async()=>{
  const p=page();for(const amount of [0,-1,1.5,1001,101])await assert.rejects(call(p,'beginBitcoin',amount,'up',()=>({price:100,time:1000000})));
  await assert.rejects(call(p,'beginBitcoin',10,'up',()=>({price:100,time:980000})),/price-unavailable/);
  p.w.localStorage.setItem=()=>{throw Error('quota');};await assert.rejects(call(p,'beginBitcoin',10,'up',()=>({price:100,time:1000000})),/quota/);assert.equal(p.W.snapshot().balance,100);assert.equal(p.W.snapshot().pending,null);p.close();
 });
 await test('concurrent tabs serialize starting and settlement against the same wallet',async()=>{
  let tail=Promise.resolve();const locks={request(_,f){const r=tail.then(f);tail=r.catch(()=>{});return r;}},p=page({locks}),q=page({map:p.map,locks});
  const results=await Promise.allSettled([call(p,'beginBitcoin',10,'up',()=>({price:100,time:1000000})),call(q,'beginBitcoin',10,'down',()=>({price:100,time:1000000}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  p.setTime(1010000);q.setTime(1010000);const id=p.W.snapshot().pending.id;await Promise.all([call(p,'finishBitcoin',id,{price:101,time:1010000}),call(q,'finishBitcoin',id,{price:101,time:1010000})]);assert.equal(p.W.snapshot().balance,110);assert.equal(q.W.snapshot().history.length,1);p.close();q.close();
 });
 await test('UI disables bets without a live quote, uses shared stake, prevents double clicks and displays exact result',()=>{
  const p=page({ui:true});assert.equal(p.$('btcCountdown').textContent,'10秒');assert(p.$('playRound').disabled);p.feed({price:100,time:1000000});assert(!p.$('playRound').disabled);p.$('playRound').click();p.$('mobilePlayRound').click();assert.equal(p.W.snapshot().balance,90);assert.equal(p.$('btcStartPrice').textContent,'$100.00');
  p.setTime(1010000);p.feed({price:101,time:1010000});assert.equal(p.W.snapshot().balance,110);assert.equal(p.$('resultPayout').textContent,'20両');assert(p.$('resultHeadline').textContent.includes('的中'));assert.equal(p.W.snapshot().history.length,1);p.close();
 });
 await test('a saved 60-second wager keeps its original deadline and never makes the wallet unreadable',async()=>{
  const old={id:'legacy-60',game:'bitcoin',stake:10,payout:0,at:1000000,data:{direction:'up',startPrice:100,startedAt:1000000,deadline:1060000}};
  const p=page({map:new Map([['hk_wallet_v2',JSON.stringify({version:2,balance:90,pending:old,history:[]})]])});
  assert.equal(p.W.snapshot().balance,90);assert.equal(p.W.snapshot().pending.data.deadline,1060000);assert(!p.W.snapshot().unavailable);
  p.setTime(1010000);await assert.rejects(call(p,'finishBitcoin',old.id,{price:101,time:1010000}),/bitcoin-open/);assert.equal(p.W.snapshot().balance,90);
  p.setTime(1060000);await call(p,'finishBitcoin',old.id,{price:101,time:1060000});assert.equal(p.W.snapshot().balance,110);p.close();
 });
 await test('zoom uses only recent real prices, excludes old extremes, and scales cent-sized changes visibly',()=>{
  const p=page();p.w.eval(read('assets/ui/bitcoin.js'));
  const points=[{time:900000,price:87000},{time:999000,price:85000},{time:1000000,price:85000.01}],v=p.w.HKBitcoin.view(points,60,null,1000000);
  assert.equal(v.points.length,2);assert.equal(v.start,940000);assert(v.high-v.low<.1);assert(v.high>85000.01);assert(v.low<85000);assert.equal(v.points[1].price,85000.01);
  assert.equal(p.w.HKBitcoin.view(points,1800,null,1000000).points.length,3);assert(p.w.HKBitcoin.view(points,1800,null,1000000).high-v.high>1000);
  const flat=p.w.HKBitcoin.view([{time:1000000,price:85000}],15,null,1000000);assert(flat.high>flat.low);p.close();
 });
 await test('chart range controls change the display without changing a wager or its deadline',()=>{
  const p=page({ui:true});p.feed({price:100,time:1000000});p.$('playRound').click();const before=JSON.stringify(p.W.snapshot().pending);
  p.w.document.querySelector('[data-btc-range="15"]').click();assert.equal(p.w.document.querySelector('[data-btc-range="15"]').getAttribute('aria-pressed'),'true');assert(p.$('btcChart').getAttribute('aria-label').includes('15秒'));assert.equal(JSON.stringify(p.W.snapshot().pending),before);assert.equal(p.W.snapshot().balance,90);p.close();
 });
 console.log(`\n${checks} bitcoin checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
