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
 if(ui==='casino')for(const f of ['casino-rules.js','table-rules.js','royal-poker.js','casino-vip.js','casino.js'])w.eval(read('assets/ui/'+f));
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
 await test('costs grow from 京 to 垓 to 秭 and remain at one muryotaisu',()=>{
  assert.deepEqual([0,1,2,3,4].map(n=>M.format(P.cost(n))),['1京','1垓','1秭','1穣','1溝']);
  assert.equal(P.cost(13),'1'+'0'.repeat(68));for(const n of [14,100,9999,10000])assert.equal(P.cost(n),'1'+'0'.repeat(68));
  assert.deepEqual([0,1,2,3,5].map(n=>P.factor(n)),['1','1.1','1.2','1.3','1.5']);
  assert.equal(P.boost('10000000000000000001',1),'11000000000000000001');assert.equal(P.boost(2,1),2);assert.equal(P.factor(3,2),'2.6');
  assert.equal(P.max,10000);assert(P.valid(10000));for(const invalid of [-1,1.1,10001,'1',Number.MAX_SAFE_INTEGER]){assert(!P.valid(invalid));assert.throws(()=>P.cost(invalid),/invalid-rebirth/);}
  assert.equal(P.factor(9999),'1000.9');assert.equal(P.factor(10000),'1001');assert.equal(P.factor(1,36),'39.6');assert.equal(P.boost(M.MAX,10000),M.mul(M.MAX,1001));
  assert.equal(P.factor(3,1,1),'1.75');assert.equal(P.boost(20,3,1),35);assert.throws(()=>P.factor(1,1,3),/invalid-boost-version/);
 });
 await test('existing wallets migrate as zero rebirths without changing money or unfinished games',async()=>{
  const saved={version:2,balance:'9007199254741001',history:[],pending:{id:'old',game:'janken',stake:10,payout:20,data:{multiplier:2}}},p=page({map:new Map([['hk_wallet_v2',JSON.stringify(saved)]])});
  assert.equal(p.W.snapshot().rebirths,0);await call(p,'finish','old');assert.equal(p.W.snapshot().balance,'9007199254741021');p.w.close();
 });
 await test('rebirth requires the exact threshold, resets all money to 10000 and preserves town, cards and receipts',async()=>{
  const p=page({balance:M.sub(P.cost(0),1)});p.map.set('city_v1','[{"id":"house","type":"house"}]');p.map.set('hk_wrong_v2','{"x":true}');p.map.set('hk_got_v2','{"edo|x":true}');
  await assert.rejects(call(p,'rebirth',0),/insufficient/);await call(p,'adjust',1);await call(p,'redeem','2026');const preserved=new Map(p.map);
  const result=await call(p,'rebirth',0);assert.equal(result.rebirths,1);assert.equal(p.W.snapshot().balance,10000);assert(p.W.snapshot().redeemedCodes.includes('2026'));
  for(const key of ['city_v1','hk_wrong_v2','hk_got_v2'])assert.equal(p.map.get(key),preserved.get(key));
  const q=page({map:p.map});assert.equal(q.W.snapshot().rebirths,1);assert.equal(JSON.parse(p.map.get('hk_wallet_v2')).balance,'10000');await assert.rejects(call(q,'rebirth',0),/rebirth-changed/);await assert.rejects(call(q,'redeem','2026'),/code-used/);p.w.close();q.w.close();
 });
 await test('pending rounds and free spins cannot be discarded to rebirth; failed saves keep the original balance',async()=>{
  const p=page({balance:P.cost(0)}),round=await begin(p,'janken',10,()=>({payout:20,data:{multiplier:2}}));await assert.rejects(call(p,'rebirth',0),/pending-round/);await call(p,'finish',round.id);
  const bonus=await begin(p,'slots',1,()=>({payout:0,data:{bonusTriggered:true}}));await call(p,'finish',bonus.id);await assert.rejects(call(p,'rebirth',0),/bonus-active/);p.w.close();
  const q=page({balance:P.cost(0),failWrite:true});await assert.rejects(call(q,'rebirth',0),/quota/);assert.equal(q.W.snapshot().rebirths,0);assert.equal(M.full(q.W.snapshot().balance),M.full(P.cost(0)));q.w.close();
 });
 await test('simultaneous tabs atomically grant only one rebirth',async()=>{
  let chain=Promise.resolve();const locks={request:(_name,fn)=>{const next=chain.then(fn);chain=next.catch(()=>{});return next;}},p=page({balance:M.MAX,locks}),q=page({map:p.map,locks});
  const results=await Promise.allSettled([call(p,'rebirth',0),call(q,'rebirth',0)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(q.W.snapshot().rebirths,1);assert.equal(p.W.snapshot().balance,10000);p.w.close();q.w.close();
 });
 await test('the one-muryotaisu cost remains unchanged through later rebirths and repeat rewards',async()=>{
  const reward='1'+'0'.repeat(68),p=page({times:12,balance:P.cost(12)});await call(p,'rebirth',12);assert.equal(p.W.snapshot().rebirths,13);
  for(const times of [13,14,15]){assert.equal(P.cost(times),reward);await call(p,'redeem','9836478597');await call(p,'rebirth',times);assert.equal(p.W.snapshot().balance,10000);}
  const q=page({map:p.map,ui:'rebirth'});assert.equal(q.W.snapshot().rebirths,16);assert.equal(q.$('rebirthCost').textContent,'1無量大数両');assert(Array.from(q.$('rebirthRoadmap').querySelectorAll('b')).every(el=>el.textContent==='1無量大数両'));p.w.close();q.w.close();
 });
 await test('the final rebirth enforces the exact cost and stops at 10000 without showing a future rebirth',async()=>{
  const reward='1'+'0'.repeat(68),p=page({times:9999,balance:M.sub(reward,1),ui:'rebirth'});assert(p.$('rebirthStart').disabled);assert.equal(p.$('rebirthRoadmap').children.length,1);assert(p.$('rebirthRoadmap').textContent.includes('10,000回目'));assert(!p.$('rebirthRoadmap').textContent.includes('10,001'));
  await assert.rejects(call(p,'rebirth',9999),/insufficient/);await call(p,'adjust',1);assert(!p.$('rebirthStart').disabled);p.$('rebirthStart').click();p.$('rebirthCommit').click();await tick();assert.equal(p.W.snapshot().rebirths,10000);assert.equal(p.W.snapshot().balance,10000);assert.equal(p.$('rebirthFactor').textContent,'×1001');assert.equal(p.$('rebirthNextFactor').textContent,'—');assert.equal(p.$('rebirthCost').textContent,'—');assert(p.$('rebirthStart').disabled);assert(p.$('rebirthCommit').disabled);assert(p.$('rebirthConfirm').hidden);assert(p.$('rebirthRemaining').textContent.includes('10,000回まで'));
  await call(p,'adjust',M.sub(M.MAX,10000));const before=p.map.get('hk_wallet_v2');await assert.rejects(call(p,'rebirth',10000),/rebirth-limit/);assert.equal(p.map.get('hk_wallet_v2'),before);
  const q=page({map:p.map,ui:'rebirth'});assert.equal(q.W.snapshot().rebirths,10000);assert.equal(q.W.snapshot().balance,M.MAX);assert(q.$('rebirthStart').disabled);assert(!q.$('rebirthRoadmap').textContent.includes('10,001'));p.w.close();q.w.close();
 });
 await test('every casino applies the current multiplier once and reopens at the original saved multiplier',async()=>{
  for(const times of [1,2,3,5,10000])for(const game of ['janken','roulette','slots','sicbo']){
   const p=page({times,balance:'10000000000000000100'}),stake='10000000000000001';
   const data=game==='sicbo'?R.sicboRound([{id:'small',stake}],[1,2,3]):{multiplier:2,bonusTriggered:false};const base=game==='sicbo'?data.payout:M.mul(stake,2);
   const round=await begin(p,game,stake,()=>({payout:base,data})),q=page({map:p.map});assert.equal(round.boostVersion,2);assert.equal(q.W.snapshot().pending.payout,P.boost(base,times));
   const settled=await call(q,'finish',round.id);assert.equal(settled.basePayout,base);assert.equal(settled.payout,P.boost(base,times));await call(p,'finish',round.id);assert.equal(p.W.snapshot().history.length,1);assert.equal(p.W.snapshot().balance,M.add(M.sub('10000000000000000100',stake),P.boost(base,times)));p.w.close();q.w.close();
  }
 });
 await test('unfinished quarter-step rounds retain their saved payouts while the next round uses tenth steps',async()=>{
  for(const game of ['janken','roulette','slots','sicbo']){
   const p=page({times:3}),data=game==='sicbo'?R.sicboRound([{id:'small',stake:10}],[1,2,3]):{multiplier:2,player:0,opponent:2,bonusTriggered:false},round=await begin(p,game,10,()=>({payout:20,data}));
   const saved=JSON.parse(p.map.get('hk_wallet_v2'));delete saved.pending.boostVersion;saved.pending.payout='35';p.map.set('hk_wallet_v2',JSON.stringify(saved));
   const q=page({map:p.map,ui:game==='janken'?'casino':''});assert(!q.W.snapshot().unavailable);await call(q,'finish',round.id);assert.equal(q.W.snapshot().balance,125);assert.equal(q.W.snapshot().pending,null);if(game==='janken')assert(q.$('resultDetail').textContent.includes('×1.75'));await call(q,'finish',round.id);assert.equal(q.W.snapshot().balance,125);
   const next=await begin(q,game,10,()=>({payout:20,data}));assert.equal(next.boostVersion,2);assert.equal(next.payout,26);p.w.close();q.w.close();
  }
 });
 await test('unfinished Bitcoin predictions use the multiplier from when they started',async()=>{
  const p=page({times:3}),now=Date.now();p.w.Date.now=()=>now;const round=await call(p,'beginBitcoin',10,'up',()=>({price:100,time:now})),saved=JSON.parse(p.map.get('hk_wallet_v2'));delete saved.pending.boostVersion;p.map.set('hk_wallet_v2',JSON.stringify(saved));
  const q=page({map:p.map});q.w.Date.now=()=>now+10000;const result=await call(q,'finishBitcoin',round.id,{price:101,time:now+10000});assert.equal(result.payout,35);assert.equal(q.W.snapshot().balance,125);await call(p,'finishBitcoin',round.id,null);assert.equal(p.W.snapshot().balance,125);p.w.close();q.w.close();
 });
 await test('janken draws and Bitcoin ties or missing-price refunds return only the original stake',async()=>{
  const p=page({times:5,balance:100}),round=await begin(p,'janken',10,()=>({payout:10,data:{multiplier:1}}));await call(p,'finish',round.id);assert.equal(p.W.snapshot().balance,100);p.w.close();
  for(const kind of ['win','lose','tie','refund']){
   const p=page({times:3,balance:100}),now=Date.now();p.w.Date.now=()=>now;const round=await call(p,'beginBitcoin',10,'up',()=>({price:100,time:now})),q=page({map:p.map});q.w.Date.now=()=>now+(kind==='refund'?16000:10000);
   const quote=kind==='refund'?null:{price:kind==='win'?101:kind==='lose'?99:100,time:now+10000};const result=await call(q,'finishBitcoin',round.id,quote);assert.equal(result.payout,kind==='win'?26:kind==='lose'?0:10);assert.equal(q.W.snapshot().balance,kind==='win'?116:kind==='lose'?90:100);p.w.close();q.w.close();
  }
 });
 await test('slot free spins combine the bonus and rebirth multiplier, including cap saturation',async()=>{
  const p=page({times:5,balance:M.MAX}),round=await begin(p,'slots',M.MAX,()=>({payout:0,data:{bonusTriggered:true}}),'gold');await call(p,'finish',round.id);const free=await begin(p,'slots',1,ctx=>{assert(ctx.freeSpin);return {payout:M.mul(ctx.stake,3200),data:{bonusTriggered:false}};},'gold');
  const q=page({map:p.map});assert.equal(q.W.snapshot().pending.payout,P.boost(M.mul(M.MAX,3200),5));const result=await call(q,'finish',free.id);assert.equal(result.creditedPayout,M.MAX);assert.equal(q.W.snapshot().balance,M.MAX);assert.equal(q.W.snapshot().slotBonus.remaining,4);p.w.close();q.w.close();
 });
 await test('special machines are guarded by wallet rules as well as locked screens and direct links',async()=>{
  for(const [variant,game,required] of [['silver','roulette',2],['gold','slots',5]]){
   const p=page({times:required-1,ui:'casino',query:'?game='+game+'&variant='+variant});assert.equal(p.w.document.body.dataset.casinoVariant,'standard');p.$('tab-'+variant).click();assert(!p.$('casinoLock').hidden);assert(p.$('panel-'+game).hidden);assert(p.$('playRound').disabled);assert(p.$('casinoLockMessage').textContent.includes(required+'回'));
   await assert.rejects(begin(p,game,10,()=>({payout:20,data:{}}),variant),/casino-locked/);assert.equal(p.W.snapshot().balance,100);
   p.w.document.querySelector('[data-game="janken"]').click();assert(p.$('casinoLock').hidden);assert(!p.$('panel-janken').hidden);p.w.close();
   const q=page({times:required,ui:'casino',query:'?game='+game+'&variant='+variant});assert.equal(q.w.document.body.dataset.casinoVariant,'standard');q.$('tab-'+variant).click();assert(q.$('casinoLock').hidden);assert(!q.$('panel-'+game).hidden);assert.equal(q.w.document.body.dataset.casinoVariant,variant);assert.equal(q.w.document.querySelector('button[data-casino-variant="'+variant+'"]').getAttribute('aria-selected'),'true');assert.equal(q.w.document.body.getAttribute('aria-pressed'),null);assert(q.$('betGameName').textContent.includes(variant==='silver'?'銀':'金'));
   if(variant==='gold'){assert(q.$('slotTitle').textContent.includes('金'));assert(q.$('reel0').querySelector('[aria-label="金剛石（レモン）"] svg'));assert(q.$('reel1').querySelector('[aria-label="王冠（ベル）"] svg'));assert.equal(q.$('slotJackpotRate').textContent,'300倍');}
   else assert(q.$('rouletteWheel').innerHTML.includes('#c0d7e5'));
   q.w.close();
  }
 });
 await test('each locked VIP room has its own artwork and progress while the selection bar remains the only entrance',()=>{
  const p=page({ui:'casino'});assert(p.$('vipRoom').hidden);
  for(const [variant,title,required] of [['silver','THE LUNAR SALON',2],['gold','THE PHOENIX VAULT',5],['king','THE SOVEREIGN’S CHAMBER',10]]){
   p.$('tab-'+variant).click();assert(!p.$('vipRoom').hidden);assert(p.w.document.body.classList.contains('vip-active'));assert.equal(p.w.document.body.dataset.vipLocked,'true');assert.equal(p.$('vipRoomEnglish').textContent,title);assert(p.$('vipRoomArt').querySelector('svg'));assert(p.$('vipLockArt').querySelector('svg'));assert.equal(p.$('vipLockProgress').max,required);assert.equal(p.$('vipLockProgress').value,0);assert(p.$('vipLockRemaining').textContent.includes('あと '+required+'回'));assert(p.$('playRound').disabled);assert(p.$('mobilePlayRound').disabled);
   const ids=Array.from(p.w.document.querySelectorAll('[id]'),el=>el.id);assert.equal(new Set(ids).size,ids.length);assert.equal(p.w.document.querySelectorAll('[data-casino-variant]:not(body):not(.casino-tabs *)').length,0);
  }
  p.$('tab-janken').click();assert(p.$('vipRoom').hidden);assert(!p.w.document.body.classList.contains('vip-active'));assert.equal(p.W.snapshot().balance,100);assert.equal(p.W.snapshot().history.length,0);p.w.close();
 });
 await test('unlocked VIP rooms use illustrated symbols and engraved cards without changing the wallet',()=>{
  const p=page({times:10,ui:'casino'});p.$('tab-silver').click();assert(p.$('casinoLock').hidden);assert(!p.$('panel-roulette').hidden);assert.equal(p.$('vipRoomRate').textContent,'配当 ×2');assert.equal(p.w.document.body.dataset.vipLocked,'false');
  p.$('tab-gold').click();assert.equal(p.$('reel0').parentElement.querySelectorAll('.vip-slot-symbol svg').length,3);assert.equal(p.w.document.querySelectorAll('.slot-mini-paytable svg').length,5);assert.equal(p.$('slotJackpotRate').textContent,'400倍');
  p.$('tab-king').click();assert.equal(p.$('royalCards').querySelectorAll('.card-suit svg').length,5);assert.equal(p.$('royalCards').querySelectorAll('.card-corner-bottom').length,5);assert.equal(p.W.snapshot().balance,100);p.w.close();
 });
 await test('a restored premium win shows its exclusive finale and credits the saved payout exactly once',async()=>{
  const p=page({times:5}),data=R.slots(Array(9).fill('cherry')),round=await begin(p,'slots',10,()=>({payout:M.mul(10,data.multiplier),data}),'gold'),expected=P.boost(M.mul(10,data.multiplier),5),q=page({map:p.map,ui:'casino'});
  assert.equal(q.W.snapshot().balance,M.add(90,expected));assert.equal(q.W.snapshot().history.length,1);assert(!q.$('vipFinale').hidden);assert.equal(q.$('vipFinaleTitle').textContent,'GOLDEN FORTUNE');assert.equal(q.$('vipFinaleAmount').textContent,M.format(expected)+'両');assert(!q.$('vipFinale').classList.contains('vip-finale-enter'));assert.equal(q.$('tableArea').dataset.vipPhase,'victory');
  await call(q,'finish',round.id);assert.equal(q.W.snapshot().balance,M.add(90,expected));q.$('tab-janken').click();assert(q.$('vipFinale').hidden);assert(p.W.snapshot().history.length,1);p.w.close();q.w.close();
 });
 await test('rebirth page shows exact progress, requires confirmation and preserves town/learning from the main bar',async()=>{
  const p=page({balance:P.cost(0),ui:'rebirth',full:true});assert(!p.$('view-rebirth').hidden);assert(p.$('eraSection').hidden);assert(p.w.document.querySelector('.nav [data-view="rebirth"]').classList.contains('active'));assert.equal(p.$('rebirthCost').textContent,'1京両');assert.equal(p.$('rebirthProgress').value,10000);assert(!p.$('rebirthStart').disabled);
  p.$('rebirthStart').click();assert(!p.$('rebirthConfirm').hidden);assert.equal(p.W.snapshot().rebirths,0);p.$('rebirthCancel').click();assert(p.$('rebirthConfirm').hidden);p.$('rebirthStart').click();p.$('rebirthCommit').click();p.$('rebirthCommit').click();await tick();assert.equal(p.W.snapshot().rebirths,1);assert.equal(p.$('rebirthCount').textContent,'1回');assert.equal(p.$('rebirthCost').textContent,'1垓両');assert.equal(p.$('rebirthFactor').textContent,'×1.1');assert.equal(p.$('moneyValue').textContent,'1万');assert(p.$('rebirthMessage').textContent.includes('完了'));p.w.close();
 });
 await test('rebirth updates an existing ranking using the actual revision, while offline sync keeps earned rebirths',async()=>{
  for(const offline of [false,true]){
   const p=page({balance:P.cost(0),ui:'rebirth'});p.map.set('hk_wealth_identity_v1','a'.repeat(64));p.w.HKRankingConfig={endpoint:'https://api.example/ranking'};const posts=[];
   p.w.fetch=async(url,options)=>{if(offline)throw Error('offline');if(options.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({own:{rebirths:1},entries:[],total:1,at:1})};}return {ok:true,json:async()=>({own:{name:'登録済み',revision:7}})};};
   p.$('rebirthStart').click();p.$('rebirthCommit').click();await tick();await tick();assert.equal(p.W.snapshot().rebirths,1);assert.equal(p.W.snapshot().balance,10000);
   if(offline)assert(p.$('rebirthMessage').textContent.includes('保存済み'));else{assert.equal(posts[0].expectedRevision,7);assert.equal(posts[0].snapshot.rebirths,1);assert.equal(posts[0].snapshot.balance,10000);assert(p.$('rebirthMessage').textContent.includes('反映しました'));}p.w.close();
  }
 });
 console.log(checks+' rebirth checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
