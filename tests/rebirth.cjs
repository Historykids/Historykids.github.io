const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),M=require('../assets/ui/amounts.js'),P=M.rebirth,R=require('../assets/ui/casino-rules.js');
let checks=0;const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
function page({times=0,balance=100,ui='',query='',map=null,locks=null,failWrite=false,full=false}={}){
 const store=map||new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:times,balance:M.full(balance),history:[],pending:null})]]);
 const dom=new JSDOM(ui?read(ui==='casino'?'casino.html':'index.html'):'<body></body>',{url:'https://historykids.github.io/'+(ui==='casino'?'casino.html'+query:'#rebirth'),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(failWrite&&k==='hk_wallet_v2')throw Error('quota');store.set(k,String(v));},removeItem:k=>store.delete(k)}});
 if(locks)Object.defineProperty(w.navigator,'locks',{value:locks});
 w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=function(){};w.scrollTo=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const f of ['amounts.js','bitcoin-rules.js','wallet.js'])w.eval(read('assets/ui/'+f));
 if(ui==='casino')for(const f of ['casino-rules.js','casino.js'])w.eval(read('assets/ui/'+f));
 if(ui==='rebirth'){
  if(full){for(const f of ['dataset','ancient','meiji','modern'])w.eval(read('data/'+f+'.js'));}
  w.eval(read('assets/ui/core.js'));w.eval(read('assets/ui/wealth-rules.js'));
  if(full)for(const f of ['activities','residents','app'])w.eval(read('assets/ui/'+f+'.js'));
  w.eval(read('assets/ui/rebirth.js'));
 }
 return {w,W:w.HKWallet,map:store,$:id=>w.document.getElementById(id)};
}
const call=(p,method,...args)=>new Promise((yes,no)=>p.W[method](...args,yes,no));
const begin=(p,game,stake,draw,variant='standard')=>new Promise((yes,no)=>p.W.begin(game,stake,draw,yes,no,{variant}));
(async()=>{
 await test('costs grow from 京 to 垓 to 秭 and stop at the exact wallet cap',()=>{
  assert.deepEqual([0,1,2,3,4].map(n=>M.format(P.cost(n))),['1京','1垓','1秭','1穣','1溝']);
  assert.equal(P.cost(13),'1'+'0'.repeat(68));assert.equal(P.cost(14),M.MAX);assert.equal(P.cost(100),M.MAX);
  assert.deepEqual([0,1,2,3,5].map(n=>P.factor(n)),['1','1.25','1.5','1.75','2.25']);
  assert.equal(P.boost('10000000000000000001',1),'12500000000000000001');assert.equal(P.boost(2,1),2);assert.equal(P.factor(3,2),'3.5');
 });
 await test('existing wallets migrate as zero rebirths without changing money or unfinished games',async()=>{
  const saved={version:2,balance:'9007199254741001',history:[],pending:{id:'old',game:'janken',stake:10,payout:20,data:{multiplier:2}}},p=page({map:new Map([['hk_wallet_v2',JSON.stringify(saved)]])});
  assert.equal(p.W.snapshot().rebirths,0);await call(p,'finish','old');assert.equal(p.W.snapshot().balance,'9007199254741021');p.w.close();
 });
 await test('rebirth requires the exact threshold, resets all money to 100 and preserves town, cards and receipts',async()=>{
  const p=page({balance:M.sub(P.cost(0),1)});p.map.set('city_v1','[{"id":"house","type":"house"}]');p.map.set('hk_wrong_v2','{"x":true}');p.map.set('hk_got_v2','{"edo|x":true}');
  await assert.rejects(call(p,'rebirth',0),/insufficient/);await call(p,'adjust',1);await call(p,'redeem','2026');const preserved=new Map(p.map);
  const result=await call(p,'rebirth',0);assert.equal(result.rebirths,1);assert.equal(p.W.snapshot().balance,100);assert(p.W.snapshot().redeemedCodes.includes('2026'));
  for(const key of ['city_v1','hk_wrong_v2','hk_got_v2'])assert.equal(p.map.get(key),preserved.get(key));
  const q=page({map:p.map});assert.equal(q.W.snapshot().rebirths,1);assert.equal(JSON.parse(p.map.get('hk_wallet_v2')).balance,'100');await assert.rejects(call(q,'rebirth',0),/rebirth-changed/);await assert.rejects(call(q,'redeem','2026'),/code-used/);p.w.close();q.w.close();
 });
 await test('pending rounds and free spins cannot be discarded to rebirth; failed saves keep the original balance',async()=>{
  const p=page({balance:P.cost(0)}),round=await begin(p,'janken',10,()=>({payout:20,data:{multiplier:2}}));await assert.rejects(call(p,'rebirth',0),/pending-round/);await call(p,'finish',round.id);
  const bonus=await begin(p,'slots',1,()=>({payout:0,data:{bonusTriggered:true}}));await call(p,'finish',bonus.id);await assert.rejects(call(p,'rebirth',0),/bonus-active/);p.w.close();
  const q=page({balance:P.cost(0),failWrite:true});await assert.rejects(call(q,'rebirth',0),/quota/);assert.equal(q.W.snapshot().rebirths,0);assert.equal(M.full(q.W.snapshot().balance),M.full(P.cost(0)));q.w.close();
 });
 await test('simultaneous tabs atomically grant only one rebirth',async()=>{
  let chain=Promise.resolve();const locks={request:(_name,fn)=>{const next=chain.then(fn);chain=next.catch(()=>{});return next;}},p=page({balance:M.MAX,locks}),q=page({map:p.map,locks});
  const results=await Promise.allSettled([call(p,'rebirth',0),call(q,'rebirth',0)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(q.W.snapshot().rebirths,1);assert.equal(p.W.snapshot().balance,100);p.w.close();q.w.close();
 });
 await test('every casino applies the current multiplier once and reopens at the original saved multiplier',async()=>{
  for(const times of [1,2,3,5])for(const game of ['janken','roulette','slots','sicbo']){
   const p=page({times,balance:'10000000000000000100'}),stake='10000000000000001';
   const data=game==='sicbo'?R.sicboRound([{id:'small',stake}],[1,2,3]):{multiplier:2,bonusTriggered:false};const base=game==='sicbo'?data.payout:M.mul(stake,2);
   const round=await begin(p,game,stake,()=>({payout:base,data})),q=page({map:p.map});assert.equal(q.W.snapshot().pending.payout,P.boost(base,times));
   const settled=await call(q,'finish',round.id);assert.equal(settled.basePayout,base);assert.equal(settled.payout,P.boost(base,times));await call(p,'finish',round.id);assert.equal(p.W.snapshot().history.length,1);assert.equal(p.W.snapshot().balance,M.add(M.sub('10000000000000000100',stake),P.boost(base,times)));p.w.close();q.w.close();
  }
 });
 await test('janken draws and Bitcoin ties or missing-price refunds return only the original stake',async()=>{
  const p=page({times:5,balance:100}),round=await begin(p,'janken',10,()=>({payout:10,data:{multiplier:1}}));await call(p,'finish',round.id);assert.equal(p.W.snapshot().balance,100);p.w.close();
  for(const kind of ['win','lose','tie','refund']){
   const p=page({times:3,balance:100}),now=Date.now();p.w.Date.now=()=>now;const round=await call(p,'beginBitcoin',10,'up',()=>({price:100,time:now})),q=page({map:p.map});q.w.Date.now=()=>now+(kind==='refund'?16000:10000);
   const quote=kind==='refund'?null:{price:kind==='win'?101:kind==='lose'?99:100,time:now+10000};const result=await call(q,'finishBitcoin',round.id,quote);assert.equal(result.payout,kind==='win'?35:kind==='lose'?0:10);assert.equal(q.W.snapshot().balance,kind==='win'?125:kind==='lose'?90:100);p.w.close();q.w.close();
  }
 });
 await test('slot free spins combine the bonus and rebirth multiplier, including cap saturation',async()=>{
  const p=page({times:5,balance:M.MAX}),round=await begin(p,'slots',M.MAX,()=>({payout:0,data:{bonusTriggered:true}}),'gold');await call(p,'finish',round.id);const free=await begin(p,'slots',1,ctx=>{assert(ctx.freeSpin);return {payout:M.mul(ctx.stake,3200),data:{bonusTriggered:false}};},'gold');
  const q=page({map:p.map});assert.equal(q.W.snapshot().pending.payout,P.boost(M.mul(M.MAX,3200),5));const result=await call(q,'finish',free.id);assert.equal(result.creditedPayout,M.MAX);assert.equal(q.W.snapshot().balance,M.MAX);assert.equal(q.W.snapshot().slotBonus.remaining,4);p.w.close();q.w.close();
 });
 await test('special machines are guarded by wallet rules as well as locked screens and direct links',async()=>{
  for(const [variant,game,required] of [['silver','roulette',2],['gold','slots',5]]){
   const p=page({times:required-1,ui:'casino',query:'?game='+game+'&variant='+variant});assert(!p.$('casinoLock').hidden);assert(p.$('panel-'+game).hidden);assert(p.$('playRound').disabled);assert(p.$('casinoLockMessage').textContent.includes(required+'回'));
   await assert.rejects(begin(p,game,10,()=>({payout:20,data:{}}),variant),/casino-locked/);assert.equal(p.W.snapshot().balance,100);
   p.w.document.querySelector('[data-game="janken"]').click();assert(p.$('casinoLock').hidden);assert(!p.$('panel-janken').hidden);p.w.close();
   const q=page({times:required,ui:'casino',query:'?game='+game+'&variant='+variant});assert(q.$('casinoLock').hidden);assert(!q.$('panel-'+game).hidden);assert.equal(q.w.document.body.dataset.casinoVariant,variant);assert(q.$('betGameName').textContent.includes(variant==='silver'?'銀':'金'));
   if(variant==='gold'){assert(q.$('slotTitle').textContent.includes('金'));assert(q.$('reel0').textContent.includes('💎'));assert(q.$('reel1').textContent.includes('👑'));assert.equal(q.$('slotJackpotRate').textContent,'450倍');}
   else assert(q.$('rouletteWheel').innerHTML.includes('#c0d7e5'));
   q.w.close();
  }
 });
 await test('rebirth page shows exact progress, requires confirmation and preserves town/learning from the main bar',async()=>{
  const p=page({balance:P.cost(0),ui:'rebirth',full:true});assert(!p.$('view-rebirth').hidden);assert(p.$('eraSection').hidden);assert(p.w.document.querySelector('.nav [data-view="rebirth"]').classList.contains('active'));assert.equal(p.$('rebirthCost').textContent,'1京両');assert.equal(p.$('rebirthProgress').value,10000);assert(!p.$('rebirthStart').disabled);
  p.$('rebirthStart').click();assert(!p.$('rebirthConfirm').hidden);assert.equal(p.W.snapshot().rebirths,0);p.$('rebirthCancel').click();assert(p.$('rebirthConfirm').hidden);p.$('rebirthStart').click();p.$('rebirthCommit').click();p.$('rebirthCommit').click();await tick();assert.equal(p.W.snapshot().rebirths,1);assert.equal(p.$('rebirthCount').textContent,'1回');assert.equal(p.$('rebirthCost').textContent,'1垓両');assert.equal(p.$('rebirthFactor').textContent,'×1.25');assert.equal(p.$('moneyValue').textContent,'100');assert(p.$('rebirthMessage').textContent.includes('完了'));p.w.close();
 });
 await test('rebirth updates an existing ranking using the actual revision, while offline sync keeps earned rebirths',async()=>{
  for(const offline of [false,true]){
   const p=page({balance:P.cost(0),ui:'rebirth'});p.map.set('hk_wealth_identity_v1','a'.repeat(64));p.w.HKRankingConfig={endpoint:'https://api.example/ranking'};const posts=[];
   p.w.fetch=async(url,options)=>{if(offline)throw Error('offline');if(options.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({own:{rebirths:1},entries:[],total:1,at:1})};}return {ok:true,json:async()=>({own:{name:'登録済み',revision:7}})};};
   p.$('rebirthStart').click();p.$('rebirthCommit').click();await tick();await tick();assert.equal(p.W.snapshot().rebirths,1);assert.equal(p.W.snapshot().balance,100);
   if(offline)assert(p.$('rebirthMessage').textContent.includes('保存済み'));else{assert.equal(posts[0].expectedRevision,7);assert.equal(posts[0].snapshot.rebirths,1);assert.equal(posts[0].snapshot.balance,100);assert(p.$('rebirthMessage').textContent.includes('反映しました'));}p.w.close();
  }
 });
 console.log(checks+' rebirth checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
