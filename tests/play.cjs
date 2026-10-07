const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),scripts=['assets/ui/table-rules.js','assets/ui/table-ui.js'];let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
function page(file,extra=[],seed={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:'https://historykids.github.io/'+file,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let now=0,id=0;const timers=new Map();
 w.setTimeout=(fn,delay=0)=>{const t=++id;timers.set(t,{fn,due:now+delay});return t;};w.clearTimeout=t=>timers.delete(t);w.setInterval=()=>++id;w.clearInterval=()=>{};w.requestAnimationFrame=()=>++id;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const [key,value]of Object.entries(seed))w.localStorage.setItem(key,value);
 for(const s of extra)w.eval(fs.readFileSync(path.join(root,s),'utf8'));
 const $=id=>w.document.getElementById(id),advance=ms=>{const end=now+ms;let count=0;while(true){const next=[...timers.entries()].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>end)break;assert(count++<500,'Timer loop');now=next[1].due;timers.delete(next[0]);next[1].fn();}now=end;};
 return {dom,w,$,advance,timers};
}
test('pages have unique IDs, local resources, exact analytics and advertising, valid inline JS',()=>{
 for(const file of ['index.html','figures.html','arcade.html','casino.html','edogames.html','edogames_poker6.html','blackjack.html','howto.html']){
  const p=page(file),doc=p.w.document,ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);assert.equal(ids.length,new Set(ids).size,file);
  for(const e of doc.querySelectorAll('script[src],link[href]')){const url=e.getAttribute('src')||e.getAttribute('href');if(url.startsWith('./'))assert(fs.existsSync(path.join(root,url.split('?')[0])),url);}
  for(const s of doc.querySelectorAll('script:not([src]):not([type="importmap"]):not([type="application/ld+json"])'))if(s.type!=='module')new(require('node:vm').Script)(s.textContent);
  assert.equal(doc.querySelectorAll('script[src*="client=ca-pub-4922140858632050"]').length,1);assert.equal(doc.querySelectorAll('script[src*="id=G-EZP12GC8W1"]').length,1);p.w.close();
 }
});
test('retired games cannot launch from games, guide, original hub or former arcade links',()=>{
 for(const file of ['index.html','arcade.html','edogames.html']){const p=page(file),body=p.w.document.body;
  assert(!body.textContent.includes('神経衰弱'));assert(!body.textContent.includes('GRID WAR'));assert.equal(body.querySelectorAll('[href*="game=memory"],[href*="game=war"],script[src*="arcade.js"],#s-memory,#s-fps-game').length,0);
  assert(body.querySelector('[href="./blackjack.html"]'));p.w.close();
 }
});
test('new poker plays a complete hand by buttons, conceals opponents and enables next hand',()=>{
 const p=page('edogames_poker6.html',[...scripts,'assets/ui/poker-table.js']);assert(p.$('callButton').disabled);p.$('nextHand').click();p.advance(5000);
 let loops=0;while(p.$('nextHand').hidden){assert(loops++<35);assert.equal(p.w.document.querySelectorAll('#opponents .playing-card:not(.card-back)').length,0);if(!p.$('callButton').disabled)p.$('callButton').click();p.advance(10000);}
 const t=JSON.parse(p.w.localStorage.getItem('hk-poker-table-v1'));assert.equal(t.stage,'done');assert.equal(t.board.length,5);assert.equal(t.players.reduce((s,q)=>s+q.chips,0),4000);assert.equal(p.$('nextHand').textContent,'次のハンドへ');assert(p.$('actionLog').children.length>4);p.w.close();
});
test('poker reload resumes the current turn and reset requires an explicit confirmation',()=>{
 const p=page('edogames_poker6.html',[...scripts,'assets/ui/poker-table.js']);p.$('nextHand').click();p.advance(5000);const state=p.w.localStorage.getItem('hk-poker-table-v1');
 const restored=page('edogames_poker6.html',[...scripts,'assets/ui/poker-table.js'],{'hk-poker-table-v1':state});assert.equal(restored.$('handNumber').textContent,'HAND 1');
 restored.$('newTable').click();assert(restored.$('resetDialog').open);restored.$('cancelReset').click();assert.equal(restored.w.localStorage.getItem('hk-poker-table-v1'),state);
 restored.$('newTable').click();restored.$('confirmReset').click();assert.equal(restored.$('handNumber').textContent,'HAND 0');assert.equal(restored.$('heroChips').textContent,'1,000');restored.advance(10000);assert.equal(restored.$('handNumber').textContent,'HAND 0');p.w.close();restored.w.close();
});
test('blackjack buttons settle a round, hide the hole card and preserve unrelated coins',()=>{
 const p=page('blackjack.html',[...scripts,'assets/ui/blackjack.js'],{money_v1:'72'});p.$('dealButton').click();
 const t=JSON.parse(p.w.localStorage.getItem('hk-blackjack-table-v1'));
 if(t.stage==='player'){assert.equal(p.w.document.querySelectorAll('#dealerCards .card-back').length,1);assert.equal(p.$('dealerTotal').textContent,'公開札 '+p.w.HKEdoCards.blackjackValue([t.dealer[0]]).total);p.$('standButton').click();}
 p.advance(15000);const result=JSON.parse(p.w.localStorage.getItem('hk-blackjack-table-v1'));assert.equal(result.stage,'done');assert.equal(p.w.document.querySelectorAll('#dealerCards .card-back').length,0);assert(p.$('hitButton').disabled);assert.equal(p.$('blackjackHistory').children.length,1);assert.equal(p.w.localStorage.getItem('money_v1'),'72');assert.equal(result.bank,1000-result.history[0].stake+result.history[0].returned);p.w.close();
});
test('blackjack invalid bets do not start rounds or spend chips',()=>{
 const p=page('blackjack.html',[...scripts,'assets/ui/blackjack.js']);for(const bet of [15,600,-10]){p.$('betAmount').value=bet;p.$('dealButton').click();assert.equal(p.$('bankAmount').textContent,'1,000');assert.equal(p.$('roundNumber').textContent,'ROUND 0');}p.w.document.querySelector('[data-bet="20"]').click();assert.equal(p.$('betAmount').value,'20');p.w.close();
});
test('split UI exposes the active hand, double debits once and reload never deals again',()=>{
 const R=require('../assets/ui/table-rules.js'),t=R.createBlackjack();R.startBlackjack(t,100,[...R.deck(),...'8S TH 8D 7D 3S 2S TS 9S'.split(' ').reverse()]);
 const p=page('blackjack.html',[...scripts,'assets/ui/blackjack.js'],{'hk-blackjack-table-v1':JSON.stringify(t)});assert(!p.$('splitButton').disabled);p.$('splitButton').click();assert.equal(p.$('blackjackHands').children.length,2);assert.equal(p.$('bankAmount').textContent,'800');p.$('doubleButton').click();assert.equal(p.$('bankAmount').textContent,'700');assert(p.$('blackjackHands').children[1].classList.contains('seat-active'));
 const state=p.w.localStorage.getItem('hk-blackjack-table-v1'),r=page('blackjack.html',[...scripts,'assets/ui/blackjack.js'],{'hk-blackjack-table-v1':state});assert.equal(r.$('bankAmount').textContent,'700');assert.equal(r.$('blackjackHands').children.length,2);r.$('standButton').click();r.advance(15000);assert.equal(r.$('bankAmount').textContent,'1,100');p.w.close();r.w.close();
});
test('online reflex lobby still opens and retired modes are unavailable',()=>{
 const p=page('edogames.html'),w=p.w,ref={on(){},off(){},child(){return this;},onDisconnect(){return{cancel(){}}}};
 w.firebase={initializeApp(){},database:()=>({ref:()=>ref})};for(const s of w.document.querySelectorAll('script:not([src])'))w.eval(s.textContent);
 w.selectGame('reflex','create');assert(p.$('s-lobby-create').classList.contains('on'));w.goHome();w.selectGame('memory','create');assert(p.$('s-home').classList.contains('on'));w.selectGame('fps','create');assert(p.$('s-home').classList.contains('on'));w.cleanupListeners();assert.equal(typeof w.startReflex,'function');assert.equal(typeof w.startMemory,'undefined');assert.equal(typeof w.startFPS,'undefined');w.close();
});
console.log(checks+' game interface checks passed.');
