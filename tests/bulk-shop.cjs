const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');let checks=0;
function page(balance=300,locks=null){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://historykids.github.io/#town',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.requestAnimationFrame=()=>1;w.setTimeout=()=>0;
 w.localStorage.setItem('money_v1',String(balance));w.localStorage.setItem('hk_town_layout_v2',JSON.stringify({version:2,width:60,height:40}));
 if(locks)Object.defineProperty(w.navigator,'locks',{value:locks});
 for(const file of ['data/dataset.js','data/ancient.js','assets/ui/core.js','assets/ui/residents.js','assets/ui/wallet.js','assets/ui/app.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 const $=id=>w.document.getElementById(id),click=selector=>{const e=w.document.querySelector(selector);assert(e,selector);e.click();};
 const quantity=n=>{$('shopQuantity').value=String(n);$('shopQuantity').dispatchEvent(new w.Event('input',{bubbles:true}));};
 return {w,$,click,quantity};
}
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 await test('bulk quantities update totals, keep category selection and reject invalid or unaffordable purchases',()=>{
  const p=page(300);p.click('#shopBtn');p.quantity(5);assert.equal(p.w.document.querySelector('[data-shop-total="house"]').textContent,'合計 150両');assert(!p.w.document.querySelector('[data-buy="house"]').disabled);assert(p.w.document.querySelector('[data-buy="castle"]').disabled);
  p.click('[data-shopcat="resident"]');assert.equal(p.$('shopQuantity').value,'5');p.click('[data-shop-quantity="10"]');assert.equal(p.$('shopQuantity').value,'10');
  for(const n of [0,1.5,101,'']){p.quantity(n);assert(p.w.document.querySelector('[data-buy="farmer"]').disabled);p.click('[data-buy="farmer"]');assert.equal(p.w.HK.state.residents.length,0);assert.equal(p.w.HK.state.money,300);}p.w.close();
 });
 await test('every resident role can be welcomed in one purchase, retains its type and reloads with the exact total',()=>{
  const p=page(300);for(const type of ['farmer','merchant','samurai','monk']){p.click('#shopBtn');p.click('[data-shopcat="resident"]');p.quantity(3);p.click(`[data-buy="${type}"]`);assert.equal(p.w.HK.state.residents.filter(r=>r.type===type).length,3);}
  assert.equal(p.w.HK.state.money,180);assert.equal(p.w.HK.state.residents.length,12);assert.equal(p.w.HK.state.city.length,0);assert.equal(JSON.parse(p.w.localStorage.getItem('hk_residents_v1')).length,12);assert.equal(p.w.HKWallet.snapshot().balance,180);
  p.click('#shopBtn');p.quantity(100);assert(p.w.document.querySelector('[data-buy="farmer"]').disabled);p.click('[data-buy="farmer"]');assert.equal(p.w.HK.state.money,180);p.w.close();
 });
 await test('bulk building placement charges per confirmed plot and cancellation keeps all unspent coins',()=>{
  const p=page(300);p.click('#shopBtn');p.quantity(3);p.click('[data-buy="house"]');assert.equal(p.w.HK.state.money,300);assert.equal(p.w.HK.pending.remaining,3);assert(p.$('placementTitle').textContent.includes('1 / 3個'));
  p.w.HK.setCell(5,5);p.click('#placeConfirm');assert.equal(p.w.HK.state.money,270);assert.equal(p.w.HK.state.city.length,1);assert.equal(p.w.HK.pending.remaining,2);assert(p.$('placementTitle').textContent.includes('2 / 3個'));
  p.w.HK.setCell(5,5);assert(p.$('placeConfirm').disabled);p.click('#placeConfirm');assert.equal(p.w.HK.state.money,270);p.click('#placeCancel');assert.equal(p.w.HK.pending,null);assert.equal(p.w.HK.state.money,270);assert.equal(p.w.HK.state.city.length,1);p.w.close();
 });
 await test('a complete batch places rotated footprints without overlap and stops after the selected count',()=>{
  const p=page(210);p.click('#shopBtn');p.quantity(3);p.click('[data-buy="temple"]');
  for(let i=0;i<3;i++){p.w.HK.setCell(5+i*6,10);p.click('#placeRotate');p.click('#placeConfirm');assert.equal(p.w.HK.state.city.length,i+1);}
  assert.equal(p.w.HK.state.money,0);assert.equal(p.w.HK.pending,null);for(const b of p.w.HK.state.city){assert.equal(b.rot,90);assert(p.w.HKCore.canPlace(p.w.HK.state.city,b.x,b.y,b.id,b.type,b.rot));}assert.equal(JSON.parse(p.w.localStorage.getItem('city_v1')).length,3);p.w.close();
 });
 await test('a full map rejects a new batch without deducting the selected total',()=>{
  const p=page(100);p.w.HK.state.city=Array.from({length:2400},(_,i)=>({id:'full-'+i,type:'tree',x:i%60,y:Math.floor(i/60),rot:0}));p.click('#shopBtn');p.quantity(5);p.click('[data-buy="tree"]');assert.equal(p.w.HK.pending,null);assert.equal(p.w.HK.state.money,100);assert.equal(p.w.HK.state.city.length,2400);p.w.close();
 });
 await test('cancelling a batch before its wallet lock executes and repeated confirm clicks cannot double-charge',async()=>{
  let release;const locks={request:(_,fn)=>new Promise((resolve,reject)=>{release=()=>{try{resolve(fn());}catch(e){reject(e);}};})},p=page(100,locks);
  p.click('#shopBtn');p.quantity(3);p.click('[data-buy="tree"]');p.click('#placeConfirm');p.click('#placeConfirm');p.click('#placeCancel');release();await new Promise(setImmediate);assert.equal(p.w.HK.state.money,100);assert.equal(p.w.HK.state.city.length,0);
  p.click('#shopBtn');p.click('[data-buy="tree"]');p.click('#placeConfirm');p.click('#placeConfirm');release();await new Promise(setImmediate);assert.equal(p.w.HK.state.money,92);assert.equal(p.w.HK.state.city.length,1);assert.equal(p.w.HK.pending.remaining,2);p.w.close();
 });
 console.log(`\n${checks} bulk shop checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
