const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),M=require('../assets/ui/amounts.js'),K=require('../assets/ui/royal-poker.js');
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
const cards=Array.from('SHDC').flatMap(s=>Array.from('23456789TJQKA',r=>r+s));
function fixture(hand,next=[]){return {version:1,phase:'draw',hand:[...hand],deck:[...next,...cards.filter(c=>!hand.includes(c)&&!next.includes(c))]};}
function page({times=10,balance=100,map=null,ui=false,locks=null,fail=false,deal=null,query=''}={}){
 const store=map||new Map([['hk_wallet_v2',JSON.stringify({version:2,rebirths:times,balance:M.full(balance),history:[],pending:null})]]),w=new JSDOM(ui?read('casino.html'):'<body></body>',{url:'https://historykids.github.io/casino.html'+query,runScripts:'outside-only',pretendToBeVisual:true}).window;
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail&&k==='hk_wallet_v2')throw Error('quota');store.set(k,String(v));},removeItem:k=>store.delete(k)}});
 if(locks)Object.defineProperty(w.navigator,'locks',{value:locks});
 w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['amounts.js','bitcoin-rules.js','wallet.js','casino-rules.js','table-rules.js','royal-poker.js','casino-vip.js'])w.eval(read('assets/ui/'+file));
 if(deal)w.HKRoyalPoker={...w.HKRoyalPoker,deal};
 if(ui)w.eval(read('assets/ui/casino.js'));
 return {w,W:w.HKWallet,map:store,$:id=>w.document.getElementById(id)};
}
const call=(p,method,...args)=>new Promise((yes,no)=>p.W[method](...args,yes,no));
(async()=>{
 await test('all nine paid hands, ace-low straights and unpaid low pairs use the stated base payouts',()=>{
  for(const [hand,multiplier] of [['TS JS QS KS AS',250],['5S 6S 7S 8S 9S',50],['9S 9H 9D 9C 2S',25],['3S 3H 3D 2S 2H',9],['2S 5S 8S JS KS',6],['AS 2H 3D 4C 5S',4],['AS AH AD 7C 2S',3],['QS QH 2D 2C 3S',2],['JS JH 2D 5C 8S',1],['2S 2H 3D 5C 8S',0],['2S 4H 6D 8C TS',0]])assert.equal(K.evaluate(hand.split(' ')).multiplier,multiplier,hand);
  for(const hand of [[],['AS','AS','QS','KS','TS'],['1S','2H','3D','4C','5S']])assert.throws(()=>K.evaluate(hand));
 });
 await test('deals contain all 52 cards once and exchanges preserve holds without reusing discarded cards',()=>{
  for(let i=0;i<100;i++)assert(K.validDeal(K.deal()));
  const deal=fixture(['AS','KS','QS','JS','2H'],['TS','3H','4D','5C','6S']),result=K.draw(deal,[0,1,2,3]);assert.deepEqual(result.hand,['AS','KS','QS','JS','TS']);assert.equal(result.multiplier,250);assert(!result.hand.includes('2H'));assert.equal(new Set(result.hand).size,5);assert.deepEqual(deal.hand,['AS','KS','QS','JS','2H']);
  for(const holds of [[0,0],[-1],[5],[1.5],null])assert.throws(()=>K.draw(deal,holds));
  const broken=structuredClone(deal);broken.deck[0]='AS';assert(!K.validDeal(broken));assert.throws(()=>K.draw(broken,[]));
 });
 await test('only ten or more rebirths can deal and ordinary begin cannot bypass the poker gate',async()=>{
  for(const times of [0,9]){const p=page({times});await assert.rejects(call(p,'beginPoker',10,()=>fixture(['AS','KS','QS','JS','TS'])),/casino-locked/);assert.equal(p.W.snapshot().balance,100);assert.equal(p.W.snapshot().pending,null);p.w.close();}
  for(const times of [10,11]){const p=page({times});const round=await call(p,'beginPoker',10,()=>fixture(['AS','KS','QS','JS','TS']));assert.equal(round.variant,'king');assert.equal(round.rebirths,times);assert.equal(p.W.snapshot().balance,90);await assert.rejects(call(p,'finish',round.id),/poker-open/);await assert.rejects(call(p,'begin','poker',1,()=>({payout:1,data:{}})),/invalid-bet/);p.w.close();}
 });
 await test('large exact stakes restore the same hand and one chosen exchange pays once at the saved multiplier',async()=>{
  const stake='10000000000000001',balance='20000000000000002',p=page({balance}),deal=fixture(['AS','KS','QS','JS','2H'],['TS']),round=await call(p,'beginPoker',stake,()=>deal),q=page({map:p.map});
  assert.equal(q.W.snapshot().pending.stake,stake);assert.deepEqual(Array.from(q.W.snapshot().pending.data.hand),deal.hand);await assert.rejects(call(q,'rebirth',10),/pending-round/);await assert.rejects(call(q,'finishPoker',round.id,[0,0]),/invalid-holds/);
  const result=await call(q,'finishPoker',round.id,[0,1,2,3]);assert.equal(result.basePayout,M.mul(stake,250));assert.equal(result.payout,M.rebirth.boost(M.mul(stake,250),10));assert.equal(q.W.snapshot().balance,M.add(stake,result.payout));assert.equal(q.W.snapshot().history.length,1);
  const duplicate=await call(p,'finishPoker',round.id,[]);assert(duplicate.already);assert.equal(p.W.snapshot().balance,q.W.snapshot().balance);assert.equal(JSON.parse(p.map.get('hk_wallet_v2')).history[0].stake,stake);p.w.close();q.w.close();
 });
 await test('poker integer rounding, loss and cap saturation stay exact',async()=>{
  for(const [hand,stake,payout] of [[['JS','JH','2D','5C','8S'],1,2],[['2S','2H','3D','5C','8S'],10,0],[['AS','KS','QS','JS','TS'],M.MAX,M.rebirth.boost(M.mul(M.MAX,250),10)]]){
   const p=page({balance:stake}),round=await call(p,'beginPoker',stake,()=>fixture(hand)),result=await call(p,'finishPoker',round.id,[0,1,2,3,4]);assert.equal(result.payout,payout);assert.equal(p.W.snapshot().balance,M.clamp(payout));p.w.close();
  }
 });
 await test('a poker hand dealt before the tenth-step change retains its promised multiplier',async()=>{
  const p=page(),round=await call(p,'beginPoker',10,()=>fixture(['JS','JH','2D','5C','8S'])),saved=JSON.parse(p.map.get('hk_wallet_v2'));delete saved.pending.boostVersion;p.map.set('hk_wallet_v2',JSON.stringify(saved));
  const q=page({map:p.map}),result=await call(q,'finishPoker',round.id,[0,1,2,3,4]);assert.equal(result.payout,35);assert.equal(q.W.snapshot().balance,125);await call(p,'finishPoker',round.id,[]);assert.equal(p.W.snapshot().balance,125);
  const next=await call(q,'beginPoker',10,()=>fixture(['JS','JH','2D','5C','8S'])),paid=await call(q,'finishPoker',next.id,[0,1,2,3,4]);assert.equal(next.boostVersion,2);assert.equal(paid.payout,20);p.w.close();q.w.close();
 });
 await test('failed deal and settlement writes preserve the old record and allow the same hand to retry',async()=>{
  const p=page({fail:true});await assert.rejects(call(p,'beginPoker',10,()=>fixture(['AS','KS','QS','JS','TS'])),/quota/);assert.equal(p.W.snapshot().balance,100);assert.equal(p.W.snapshot().pending,null);p.w.close();
  const q=page(),round=await call(q,'beginPoker',10,()=>fixture(['AS','KS','QS','JS','TS'])),r=page({map:q.map,fail:true});await assert.rejects(call(r,'finishPoker',round.id,[0,1,2,3,4]),/quota/);assert.equal(q.W.snapshot().balance,90);assert.equal(q.W.snapshot().pending.id,round.id);await call(q,'finishPoker',round.id,[0,1,2,3,4]);assert.equal(q.W.snapshot().balance,5090);q.w.close();r.w.close();
 });
 await test('two tabs cannot deal or pay the same poker hand twice',async()=>{
  let chain=Promise.resolve();const locks={request:(_name,fn)=>{const next=chain.then(fn);chain=next.catch(()=>{});return next;}},p=page({locks}),q=page({map:p.map,locks});
  const deals=await Promise.allSettled([call(p,'beginPoker',10,()=>fixture(['AS','KS','QS','JS','TS'])),call(q,'beginPoker',10,()=>fixture(['AS','KS','QS','JS','TS']))]);assert.equal(deals.filter(r=>r.status==='fulfilled').length,1);const id=p.W.snapshot().pending.id;
  await Promise.all([call(p,'finishPoker',id,[0,1,2,3,4]),call(q,'finishPoker',id,[])]);assert.equal(p.W.snapshot().history.length,1);assert.equal(q.W.snapshot().balance,5090);p.w.close();q.w.close();
 });
 await test('only the ten-item selection bar chooses premium games, including keyboard and locked previews',()=>{
  const p=page({times:9,ui:true,query:'?game=poker&variant=king'});assert.equal(p.w.document.body.dataset.casinoVariant,'standard');assert.equal(p.w.document.querySelectorAll('.casino-tabs [role=tab]').length,10);assert.equal(p.w.document.querySelectorAll('[data-casino-variant]:not(body):not(.casino-tabs *)').length,0);
  p.$('tab-king').click();assert(!p.$('casinoLock').hidden);assert(p.$('casinoLockMessage').textContent.includes('10回'));assert(p.$('playRound').disabled);assert(p.$('panel-poker').hidden);p.$('tab-king').dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert(!p.$('panel-janken').hidden);p.w.close();
  const doc=new JSDOM(read('index.html')).window.document;assert.equal(doc.querySelectorAll('.rebirth-unlocks a').length,0);assert.equal(doc.querySelectorAll('a[href*="variant="]').length,0);assert(doc.querySelector('#kingUnlock'));
 });
 await test('a legacy paid hand remains exchangeable after the online migration without a second stake',async()=>{
  const deal=fixture(['AS','KS','QS','JS','2H'],['TS']),seed=page({balance:10});await call(seed,'beginPoker',10,()=>deal);const p=page({ui:true,map:seed.map});seed.w.close();assert(!p.$('panel-poker').hidden);assert(p.$('royalPaytable').textContent.includes('500倍'));assert.equal(p.W.snapshot().balance,0);assert.equal(p.W.snapshot().pending.game,'poker');await new Promise(resolve=>setTimeout(resolve,100));assert(!p.$('playRound').disabled);assert(p.$('tab-janken').disabled);
  for(let i=0;i<4;i++)p.$('royalCards').querySelector('[data-royal-card="'+i+'"]').click();assert.equal(p.$('royalCards').querySelectorAll('[aria-pressed=true]').length,4);assert(p.$('playLabel').textContent.includes('1枚'));
  p.$('mobilePlayRound').click();p.$('playRound').click();assert.equal(p.W.snapshot().history.length,1);assert.equal(p.W.snapshot().pending,null);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(p.W.snapshot().balance,5000);assert.equal(p.$('resultPayout').textContent,'5,000両');assert(p.W.snapshot().history[0].data.handName.includes('ロイヤル'));assert(p.$('legacyRoyal').hidden);assert(!p.$('onlinePoker').hidden);assert.equal(p.$('royalCards').querySelectorAll('button').length,5);assert(!p.$('tab-janken').disabled);
  const q=page({map:p.map,ui:true});assert.equal(q.W.snapshot().balance,5000);assert.equal(q.W.snapshot().pending,null);p.w.close();q.w.close();
 });
 await test('unresolved poker survives reopening and a full progress reset cannot later pay the old hand',async()=>{
  const p=page();await call(p,'beginPoker',10,()=>fixture(['AS','KS','QS','JS','TS']));const id=p.W.snapshot().pending.id,q=page({map:p.map,ui:true});assert.equal(q.w.document.body.dataset.casinoVariant,'king');assert(!q.$('panel-poker').hidden);assert(!q.$('playRound').disabled);assert.equal(q.W.snapshot().balance,90);assert.equal(q.$('royalCards').querySelectorAll('button:not(:disabled)').length,5);
  await call(p,'replace',0);await assert.rejects(call(q,'finishPoker',id,[0,1,2,3,4]),/round-gone/);assert.equal(q.W.snapshot().balance,0);p.w.close();q.w.close();
 });
 console.log(checks+' royal poker checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
