const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),M=require('../assets/ui/amounts.js'),R=require('../assets/ui/casino-rules.js');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
function page(map=new Map(),ui=false){
 const w=new JSDOM(ui?read('casino.html'):'<body></body>',{url:'https://historykids.github.io/casino.html',runScripts:'outside-only',pretendToBeVisual:true}).window;
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))}});
 w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:true});
 for(const file of ['amounts.js','bitcoin-rules.js','wallet.js',...(ui?['casino-rules.js','casino.js']:[])])w.eval(read('assets/ui/'+file));
 return {w,W:w.HKWallet,map,$:id=>w.document.getElementById(id)};
}
const call=(p,method,...args)=>new Promise((yes,no)=>p.W[method](...args,yes,no));
(async()=>{
 await test('Japanese display shows at most the top three unit positions without rounding',()=>{
  for(const [value,text] of [['0','0'],['9999','9,999'],['10000','1万'],['50035','5万35'],['99009900990099','99兆99億99万'],['10000000000000001','1京'],['123456789012345678901','1垓2345京6789兆'],[M.MAX,'9999無量大数'],['-99009900990099','-99兆99億99万']])assert.equal(M.format(value),text,value);
  assert.equal(M.MAX,'9999'+'0'.repeat(68));assert.equal(M.full('99009900990099'),'99009900990099');assert(M.valid(M.MAX));assert(!M.valid(M.add(M.MAX,1)));
  for(const bad of [Number.MAX_SAFE_INTEGER+1,1.1,NaN,Infinity,'1e50','12.5','9'.repeat(81)])assert(!M.valid(bad));assert.equal(M.input(' ２０２６ '),2026);
 });
 await test('legacy numeric balances cross the Number boundary, spend, reload and retain each ryo',async()=>{
  const p=page(new Map([['money_v1','9007199254740981']]));await call(p,'adjust',20);assert.equal(p.W.snapshot().balance,'9007199254741001');assert.equal(JSON.parse(p.map.get('hk_wallet_v2')).balance,'9007199254741001');
  const q=page(p.map);await call(q,'buy',30,()=>true);assert.equal(M.full(q.W.snapshot().balance),'9007199254740971');await call(q,'adjust',31);assert.equal(q.W.snapshot().balance,'9007199254741002');assert.equal(p.map.get('money_v1'),'9007199254741002');p.w.close();q.w.close();
 });
 await test('UI abbreviates a huge balance while full-stake input retains the exact hidden tail',()=>{
  const amount='99009900990099009900990099',p=page(new Map([['money_v1',amount]]),true);assert.equal(p.$('casinoBalance').textContent,'99秭99垓99京');p.w.document.querySelector('.chip-picker [data-all-in]').click();assert.equal(p.$('stake').value,amount);assert.equal(p.$('mobileStake').value,amount);assert(!p.$('playRound').disabled);assert.equal(p.W.snapshot().balance,amount);p.w.close();
 });
 await test('huge multi-position Sic Bo rounds reload and pay every exact digit once',async()=>{
  const balance='1000000000000000000000000',stake='10000000000000000001',p=page(new Map([['money_v1',balance]]));
  const bets=[{id:'triple-1',stake},{id:'single-1',stake}],data=R.sicboRound(bets,[1,1,1]),round=await call(p,'begin','sicbo',M.mul(stake,2),()=>({payout:data.payout,data}));
  const stored=JSON.parse(p.map.get('hk_wallet_v2'));assert.equal(stored.pending.data.bets[0].stake,stake);assert.equal(stored.pending.payout,'1850000000000000000185');
  const q=page(p.map);assert.equal(q.W.snapshot().pending.payout,'1850000000000000000185');await call(q,'finish',round.id);await call(p,'finish',round.id);assert.equal(p.W.snapshot().balance,'1001830000000000000000183');assert.equal(p.W.snapshot().history.length,1);p.w.close();q.w.close();
 });
 await test('a cap-sized slot bonus keeps its exact stake and stores the computed and credited payout separately',async()=>{
  const p=page(new Map([['money_v1',M.MAX]]));const paid=await call(p,'begin','slots',M.MAX,()=>({payout:0,data:{bonusTriggered:true}}));await call(p,'finish',paid.id);assert.equal(p.W.snapshot().balance,0);assert.equal(p.W.snapshot().slotBonus.stake,M.MAX);
  const q=page(p.map),free=await call(q,'begin','slots',M.MAX,ctx=>{assert(ctx.freeSpin);return {payout:M.mul(ctx.stake,3200),data:{bonusTriggered:false}};});const reloaded=page(p.map);assert.equal(reloaded.W.snapshot().pending.payout,M.mul(M.MAX,3200));const result=await call(reloaded,'finish',free.id);assert.equal(result.payout,M.mul(M.MAX,3200));assert.equal(result.creditedPayout,M.MAX);assert.equal(reloaded.W.snapshot().balance,M.MAX);await call(q,'finish',free.id);assert.equal(q.W.snapshot().balance,M.MAX);p.w.close();q.w.close();reloaded.w.close();
 });
 await test('cap saturation, one-ryo spending and quiz rewards never round or exceed the limit',async()=>{
  const p=page(new Map([['money_v1',M.full(M.sub(M.MAX,1))]]));await call(p,'adjust',20);assert.equal(p.W.snapshot().balance,M.MAX);await call(p,'buy',1,()=>true);assert.equal(p.W.snapshot().balance,M.sub(M.MAX,1));await call(p,'adjust',1);assert.equal(p.W.snapshot().balance,M.MAX);await assert.rejects(call(p,'begin','janken',M.add(M.MAX,1),()=>({payout:0,data:{}})),/invalid-bet/);assert.equal(p.W.snapshot().balance,M.MAX);p.w.close();
 });
 await test('a huge Bitcoin prediction records and settles the exact integer stake after reopening',async()=>{
  const stake='123456789012345678901',now=Date.now(),p=page(new Map([['money_v1',M.full(M.mul(stake,2))]]));p.w.Date.now=()=>now;
  const round=await call(p,'beginBitcoin',stake,'up',()=>({price:100,time:now})),q=page(p.map);q.w.Date.now=()=>now+10000;assert.equal(q.W.snapshot().pending.stake,stake);await call(q,'finishBitcoin',round.id,{price:101,time:now+10000});await call(q,'finishBitcoin',round.id,{price:102,time:now+10000});assert.equal(q.W.snapshot().balance,'370370367037037036703');p.w.close();q.w.close();
 });
 await test('9836478597 repeatedly grants exactly one muryotaisu, preserving low digits, reloads and rebirths',async()=>{
  const reward='1'+'0'.repeat(68),p=page(new Map([['money_v1','35']]));
  for(let n=1;n<=2;n++){const result=await call(p,'redeem','9836478597');assert.equal(result.credited,reward);assert.equal(result.balance,M.add(M.mul(reward,n),35));}
  const q=page(p.map);assert.equal(q.W.snapshot().balance,M.add(M.mul(reward,2),35));assert.equal(JSON.parse(p.map.get('hk_wallet_v2')).balance,M.full(q.W.snapshot().balance));assert(!q.W.snapshot().redeemedCodes?.includes('9836478597'));
  await call(q,'redeem','2026');await call(q,'rebirth',0);assert.equal(q.W.snapshot().balance,10000);const after=await call(q,'redeem','9836478597');assert.equal(after.balance,M.add(reward,10000));await assert.rejects(call(q,'redeem','2026'),/code-used/);p.w.close();q.w.close();
 });
 await test('repeat rewards report only the credited amount at the exact wallet cap',async()=>{
  const p=page(new Map([['money_v1',M.full(M.sub(M.MAX,1))]])),first=await call(p,'redeem','9836478597');assert.equal(first.credited,1);assert.equal(first.balance,M.MAX);
  const next=await call(p,'redeem','9836478597');assert.equal(next.credited,0);assert.equal(next.balance,M.MAX);assert.equal(p.map.get('money_v1'),M.MAX);assert(!p.W.snapshot().redeemedCodes?.includes('9836478597'));p.w.close();
 });
 await test('concurrent repeat claims serialize across tabs without losing rewards',async()=>{
  const reward='1'+'0'.repeat(68),p=page(new Map([['money_v1','35']])),q=page(p.map);let chain=Promise.resolve();
  const locks={request:(_name,work)=>{const next=chain.then(work);chain=next.catch(()=>{});return next;}};
  for(const tab of [p,q])Object.defineProperty(tab.w.navigator,'locks',{value:locks});
  const results=await Promise.all([call(p,'redeem','9836478597'),call(q,'redeem','9836478597'),call(p,'redeem','9836478597')]);assert(results.every(r=>r.credited===reward));assert.equal(q.W.snapshot().balance,M.add(M.mul(reward,3),35));p.w.close();q.w.close();
 });
 await test('a failed repeat reward write leaves the wallet intact and can be retried',async()=>{
  const p=page(new Map([['money_v1','35']])),set=p.w.localStorage.setItem;p.w.localStorage.setItem=()=>{throw Error('storage unavailable');};await assert.rejects(call(p,'redeem','9836478597'),/storage unavailable/);assert.equal(p.W.snapshot().balance,35);
  p.w.localStorage.setItem=set;await call(p,'redeem','9836478597');assert.equal(p.W.snapshot().balance,M.add('1'+'0'.repeat(68),35));p.w.close();
 });
 console.log(checks+' exact-amount checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
