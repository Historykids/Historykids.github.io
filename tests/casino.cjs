const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),R=require(path.join(root,'assets/ui/casino-rules.js'));
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
function page({balance=100,storage=null,ui=false,locks=null,game=null,reduced=false}={}){
 const map=storage||new Map([['money_v1',String(balance)]]),dom=new JSDOM(ui?read('casino.html'):'<body></body>',{url:'https://historykids.github.io/casino.html'+(game?'?game='+game:''),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}});
 w.matchMedia=()=>({matches:reduced});w.HTMLElement.prototype.scrollIntoView=function(){};
 if(locks)Object.defineProperty(w.navigator,'locks',{value:locks});
 let next=0,values=[],count=0;w.crypto.getRandomValues=a=>{a[0]=values.length?values.shift():next;return a;};w.crypto.randomUUID=()=>`test-round-${++count}`;
 let now=0,id=0;const timers=new Map();w.setTimeout=(fn,delay=0)=>{const i=++id;timers.set(i,{fn,due:now+delay});return i;};w.clearTimeout=i=>timers.delete(i);
 w.eval(read('assets/ui/wallet.js'));if(ui){w.eval(read('assets/ui/casino-rules.js'));w.eval(read('assets/ui/casino.js'));}
 const advance=ms=>{const end=now+ms;let safety=0;while(true){const t=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];if(!t||t[1].due>end)break;assert(safety++<1000);now=t[1].due;timers.delete(t[0]);t[1].fn();}now=end;};
 return {dom,w,W:w.HKWallet,map,$:id=>w.document.getElementById(id),advance,setRandom:n=>{next=n;},setSequence:v=>{values=v.slice();}};
}
function walletCall(W,method,...args){return new Promise((resolve,reject)=>W[method](...args,resolve,reject));}
async function main(){
 await test('all 50 Sic Bo cells match the reference odds across every independent dice outcome',()=>{
  const ids=['small','big','any-triple',...Array.from({length:6},(_,i)=>'double-'+(i+1)),...Array.from({length:6},(_,i)=>'triple-'+(i+1)),...Array.from({length:14},(_,i)=>'sum-'+(i+4)),...Array.from({length:6},(_,i)=>'single-'+(i+1))];
  for(let a=1;a<6;a++)for(let b=a+1;b<=6;b++)ids.push('pair-'+a+'-'+b);
  assert.equal(new Set(ids).size,50);
  const sumCounts=[3,6,10,15,21,25,27,27,25,21,15,10,6,3],sumOdds=[61,21,19,13,9,7,7,7,7,9,13,19,21,61];
  for(const id of ids){let hits=0;const mults=new Set();for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++){const m=R.sicboMultiplier(id,[a,b,c]);if(m){hits++;mults.add(m);}}
   const type=R.sicboBet(id).type;
   const expected=type==='small'||type==='big'?105:type==='double'?16:type==='triple'?1:type==='any-triple'?6:type==='sum'?sumCounts[Number(id.slice(4))-4]:type==='pair'?30:91;
   assert.equal(hits,expected,id);
   if(type==='sum')assert.deepEqual([...mults],[sumOdds[Number(id.slice(4))-4]],id);
   else if(type==='single')assert.deepEqual([...mults].sort(),[2,3,4]);
   else assert.deepEqual([...mults],[type==='double'?12:type==='triple'?181:type==='any-triple'?31:type==='pair'?7:2],id);
  }
  for(const id of ['double-0','triple-7','sum-3','sum-18','pair-2-1','pair-1-1','single-9','fake'])assert.throws(()=>R.sicboBet(id));
 });
 await test('Sic Bo multi-bet table pays doubles, triples, totals and single faces together on a triple',()=>{
  const p=page({ui:true,game:'sicbo',balance:500,reduced:true});assert.equal(p.w.document.querySelectorAll('[data-sicbo]').length,50);assert(p.$('playRound').disabled);
  for(const id of ['small','big','double-4','triple-4','any-triple','sum-12','single-4','pair-3-4'])p.w.document.querySelector('[data-sicbo="'+id+'"]').click();
  assert.equal(p.$('sicboTotal').textContent,'80両');assert.equal(p.W.snapshot().balance,500);p.setRandom(3);p.$('playRound').click();assert.equal(p.W.snapshot().balance,420);assert(p.$('sicboClear').disabled);p.advance(350);
  assert.equal(p.$('resultPayout').textContent,'2,350両');assert.equal(p.W.snapshot().balance,2770);assert.equal(p.$('sicboTotal').textContent,'0両');assert.equal(p.W.snapshot().history.length,1);p.advance(1000);assert.equal(p.W.snapshot().balance,2770);p.w.close();
 });
 await test('Sic Bo chip undo, removal, balance and cap checks preserve the wager before rolling',()=>{
  const p=page({ui:true,game:'sicbo',balance:1100});const b=id=>p.w.document.querySelector('[data-sicbo="'+id+'"]');b('small').click();b('small').click();b('big').click();assert.equal(p.$('sicboTotal').textContent,'30両');p.$('sicboUndo').click();assert.equal(p.$('sicboTotal').textContent,'20両');p.$('sicboBetSlip').querySelector('[data-remove-sicbo]').click();assert.equal(p.$('sicboTotal').textContent,'0両');
  p.$('stake').value=1000;p.$('stake').dispatchEvent(new p.w.Event('input'));b('single-1').click();b('single-2').click();assert.equal(p.$('sicboTotal').textContent,'1,000両');assert.equal(p.W.snapshot().balance,1100);p.$('sicboClear').click();assert.equal(p.$('sicboTotal').textContent,'0両');p.w.close();
  const q=page({ui:true,game:'sicbo',balance:15});q.w.document.querySelector('[data-sicbo="small"]').click();q.w.document.querySelector('[data-sicbo="big"]').click();assert.equal(q.$('sicboTotal').textContent,'10両');assert.equal(q.W.snapshot().balance,15);q.w.close();
 });
 await test('Sic Bo multi-bet reload uses the saved dice and credits its original payout exactly once',()=>{
  const map=new Map([['money_v1','100']]),p=page({ui:true,game:'sicbo',storage:map});for(const id of ['small','pair-1-2','single-1'])p.w.document.querySelector('[data-sicbo="'+id+'"]').click();p.setSequence([0,0,1]);p.$('playRound').click();assert.equal(p.W.snapshot().balance,70);
  const q=page({ui:true,storage:map});assert.equal(q.W.snapshot().balance,190);assert.equal(q.$('resultPayout').textContent,'120両');assert.equal(q.$('sicboDie2').getAttribute('aria-label'),'右のサイコロ：2');p.advance(2000);assert.equal(p.W.snapshot().balance,190);assert.equal(q.W.snapshot().history.length,1);p.w.close();q.w.close();
 });
 await test('wallet rejects altered Sic Bo chip multipliers and still restores older two-choice rounds',async()=>{
  const p=page();const d=R.sicboRound([{id:'triple-1',stake:10}],[1,1,1]);d.bets[0].multiplier=999;await assert.rejects(walletCall(p.W,'begin','sicbo',10,()=>({payout:1810,data:d})),/invalid-payout/);assert.equal(p.W.snapshot().balance,100);p.w.close();
  const w={version:2,balance:90,pending:{id:'old-sicbo',game:'sicbo',stake:10,payout:20,data:R.sicbo('small',[1,2,3]),at:1},history:[]},q=page({ui:true,storage:new Map([['hk_wallet_v2',JSON.stringify(w)]])});assert.equal(q.W.snapshot().balance,110);assert.equal(q.$('resultPayout').textContent,'20両');q.w.close();
 });
 await test('Sic Bo covers all 216 independent dice results: 105 small, 105 big and six triples that lose both',()=>{
  let small=0,big=0,triples=0;
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++){
   const dice=[a,b,c],s=R.sicbo('small',dice),d=R.sicbo('big',dice);assert.equal(s.sum,a+b+c);assert.equal(d.sum,s.sum);
   if(a===b&&b===c){triples++;assert.equal(s.multiplier,0);assert.equal(d.multiplier,0);assert(s.triple&&d.triple);}
   else{assert.equal(s.multiplier+d.multiplier,2);if(s.multiplier)small++;else big++;}
   assert.deepEqual(s.dice,dice);
  }
  assert.deepEqual([small,big,triples],[105,105,6]);assert.equal(R.sicbo('small',[1,3,6]).multiplier,2);assert.equal(R.sicbo('big',[1,4,6]).multiplier,2);
  for(const [choice,dice]of [['fake',[1,2,3]],['small',[0,2,3]],['big',[1,2,7]],['small',[1,2]],['small',[1,2,2.5]],['small',null]])assert.throws(()=>R.sicbo(choice,dice));
 });
 await test('Sic Bo starts from its game link, reveals actual pips in order, locks betting and pays exactly once',()=>{
  const p=page({ui:true,game:'sicbo'});assert(!p.$('panel-sicbo').hidden);assert(p.$('playLabel').textContent.includes('サイコロ'));assert(p.$('gameRules').textContent.includes('ゾロ目'));
  p.w.document.querySelector('[data-sicbo="small"]').click();p.setSequence([0,2,5]);p.$('playRound').click();p.$('mobilePlayRound').click();assert.equal(p.W.snapshot().balance,90);assert.equal(p.W.snapshot().pending.game,'sicbo');assert(p.w.document.querySelector('[data-sicbo="big"]').disabled);
  p.advance(1260);assert.equal(p.$('sicboDie0').getAttribute('aria-label'),'左のサイコロ：1');assert(p.$('sicboDie2').classList.contains('rolling'));assert.equal(p.$('sicboSum').textContent,'？');
  p.advance(500);assert.equal(p.W.snapshot().balance,110);assert.equal(p.$('sicboSum').textContent,'10');assert.equal(p.$('sicboCall').textContent,'小');assert.equal(p.$('resultPayout').textContent,'20両');assert(p.$('resultHeadline').textContent.includes('的中'));assert.equal(p.w.document.querySelectorAll('.dice-cube.rolling').length,0);assert.equal(p.w.document.querySelectorAll('.dice-face').length,18);
  for(let n=1;n<=6;n++)assert.equal(p.$('sicboDie0').querySelectorAll('.face-'+n+' .pip').length,n);
  p.advance(10000);assert.equal(p.W.snapshot().balance,110);assert.equal(p.W.snapshot().history.length,1);p.w.close();
 });
 await test('Sic Bo loses on every triple and big/small misses, including shortened and reduced-motion animations',()=>{
  for(let n=1;n<=6;n++)for(const choice of ['small','big']){
   const p=page({ui:true,game:'sicbo',reduced:true});p.w.document.querySelector('[data-sicbo="'+choice+'"]').click();p.setRandom(n-1);p.$('playRound').click();p.advance(350);
   assert.equal(p.W.snapshot().balance,90);assert.equal(p.$('sicboSum').textContent,String(n*3));assert.equal(p.$('resultPayout').textContent,'0両');assert(p.$('resultDetail').textContent.includes('ゾロ目'));assert(p.$('sicboStage').classList.contains('triple'));p.w.close();
  }
  const p=page({ui:true,game:'sicbo'});p.$('quickToggle').checked=true;p.w.document.querySelector('[data-sicbo="small"]').click();p.setSequence([4,5,5]);p.$('playRound').click();p.advance(350);assert.equal(p.$('sicboCall').textContent,'大');assert.equal(p.W.snapshot().balance,90);assert(p.$('resultHeadline').textContent.includes('的中なし'));p.w.close();
 });
 await test('Sic Bo restores its chosen side and dice after reload without redrawing, charging or paying twice',()=>{
  const map=new Map([['money_v1','100']]),p=page({ui:true,storage:map,game:'sicbo'});p.w.document.querySelector('[data-sicbo="big"]').click();p.setSequence([0,3,5]);p.$('playRound').click();assert.equal(p.W.snapshot().balance,90);
  const q=page({ui:true,storage:map});assert(!q.$('panel-sicbo').hidden);assert.equal(q.$('sicboSum').textContent,'11');assert(q.w.document.querySelector('[data-sicbo="big"]').classList.contains('landed'));assert.equal(q.$('sicboTotal').textContent,'0両');assert.equal(q.W.snapshot().balance,110);assert.equal(q.$('resultKicker').textContent,'RESULT RESTORED');
  p.advance(2000);assert.equal(p.W.snapshot().balance,110);assert.equal(p.W.snapshot().history.length,1);assert(q.$('roundHistory').textContent.includes('大小'));p.w.close();q.w.close();
 });
 await test('Sic Bo rejects inconsistent results before spending and rejects malformed saved dice',async()=>{
  const p=page();await assert.rejects(walletCall(p.W,'begin','sicbo',10,()=>({payout:20,data:R.sicbo('small',[4,4,4])})),/invalid-payout/);assert.equal(p.W.snapshot().balance,100);
  const data=R.sicbo('small',[1,3,6]);const r=await walletCall(p.W,'begin','sicbo',10,()=>({payout:20,data}));const saved=JSON.parse(p.map.get('hk_wallet_v2'));saved.pending.data.dice[0]=7;p.map.set('hk_wallet_v2',JSON.stringify(saved));assert(p.W.snapshot().unavailable);await assert.rejects(walletCall(p.W,'finish',r.id),/wallet-invalid/);p.w.close();
 });
 await test('casino keyboard tabs include Sic Bo and every game card reaches its panel',()=>{
  const p=page({ui:true});p.w.document.querySelector('[data-game="janken"]').dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert(!p.$('panel-sicbo').hidden);assert.equal(p.$('tab-sicbo').getAttribute('aria-selected'),'true');p.$('tab-sicbo').dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert(!p.$('panel-janken').hidden);assert(read('index.html').includes('./casino.html?game=sicbo'));assert(read('index.html').includes('<b>大小。</b>'));p.w.close();
 });
 await test('janken obeys all nine outcomes and returns the stake on a tie',()=>{const matrix=[[1,2,0],[0,1,2],[2,0,1]];for(let a=0;a<3;a++)for(let b=0;b<3;b++)assert.equal(R.janken(a,b),matrix[a][b]);assert.throws(()=>R.janken(3,0));});
 await test('roulette uses the 37-pocket European sequence and zero loses every outside bet',()=>{assert.equal(R.wheel.length,37);assert.equal(new Set(R.wheel).size,37);assert.equal(R.wheel[0],0);for(const id of ['red','black','odd','even','low','high','d1','d2','d3','c1','c2','c3'])assert.equal(R.roulette([{id,stake:10}],0),0);assert.equal(R.roulette([{id:'n0',stake:10}],0),360);});
 await test('every supported roulette bet has correct coverage, payout and expected return',()=>{for(const id of ['red','black','odd','even','low','high','d1','d2','d3','c1','c2','c3',...Array.from({length:37},(_,i)=>'n'+i)]){const b=R.bet(id);assert.equal(b.numbers.length*b.multiplier,36,id);assert.equal(Array.from({length:37},(_,i)=>R.roulette([{id,stake:1}],i)).reduce((a,b)=>a+b,0),36,id);}assert.equal(R.roulette([{id:'n1',stake:5},{id:'red',stake:10},{id:'d1',stake:5}],1),215);assert.throws(()=>R.bet('n37'));assert.throws(()=>R.roulette([{id:'red',stake:-1}],1));});
 await test('slots pay each of the eight horizontal, vertical and diagonal lines and sum overlaps',()=>{
  assert.equal(R.strip.length,21);assert.equal(R.paylines.length,8);
  for(const line of R.paylines){const grid=['cherry','lemon','bell','lemon','bell','bar','bell','bar','cherry'];for(const cell of line.cells)grid[cell]='seven';const win=R.slots(grid);assert(win.wins.some(w=>w.id===line.id),line.name);assert.equal(win.multiplier,300);}
  const all=Array(9).fill('seven');assert.equal(R.slots(all).multiplier,2400);assert.equal(R.slots(all,true).multiplier,4800);
  assert.equal(R.slots(['cherry','lemon','bell','cherry','bell','bar','cherry','bar','lemon']).multiplier,4);
  assert.throws(()=>R.slots(Array(9).fill('fake')));assert.throws(()=>R.slots(['seven','seven','seven']));
 });
 await test('scatter bonus needs three symbols anywhere, awards no fake line payout and never retriggers in free spins',()=>{
  const grid=['bonus','lemon','bell','cherry','bonus','bar','lemon','bar','bonus'];assert.equal(R.slots(grid).bonusTriggered,true);assert.equal(R.slots(grid).multiplier,0);assert.equal(R.slots(grid,true).bonusTriggered,false);
  grid[8]='seven';assert.equal(R.slots(grid).bonusTriggered,false);
  assert.equal(R.slots(Array(9).fill('bonus')).multiplier,0);
 });
 await test('random selection rejects the biased tail of the uint32 range',()=>{const p=page({ui:true});p.setSequence([4294967295,0]);assert.equal(p.w.HKCasinoRules.randomIndex(37),0);p.w.close();});
 await test('the wallet migrates existing town coins, deducts first and pays a win exactly once',async()=>{const p=page({balance:100});const r=await walletCall(p.W,'begin','janken',10,()=>({payout:20,data:{player:0,opponent:1,multiplier:2}}));assert.equal(p.W.snapshot().balance,90);assert(p.W.snapshot().pending);await walletCall(p.W,'finish',r.id);assert.equal(p.W.snapshot().balance,110);assert.equal(p.map.get('money_v1'),'110');const retry=await walletCall(p.W,'finish',r.id);assert(retry.already);assert.equal(p.W.snapshot().balance,110);assert.equal(p.W.snapshot().history.length,1);p.w.close();});
 await test('integer, currency balance, round cap and pending-round checks reject invalid wagers without a debit',async()=>{const p=page({balance:30});for(const stake of [0,-1,1.5,NaN,Infinity,1001,31])await assert.rejects(walletCall(p.W,'begin','slots',stake,()=>({payout:0,data:{}})));assert.equal(p.W.snapshot().balance,30);const r=await walletCall(p.W,'begin','janken',10,()=>({payout:0,data:{}}));await assert.rejects(walletCall(p.W,'begin','janken',10,()=>({payout:0,data:{}})),/pending-round/);await walletCall(p.W,'finish',r.id);assert.equal(p.W.snapshot().balance,20);p.w.close();});
 await test('storage failure leaves the old balance intact and never starts a wager',async()=>{const p=page({balance:50});p.w.localStorage.setItem=()=>{throw Error('denied');};await assert.rejects(walletCall(p.W,'begin','janken',10,()=>({payout:20,data:{}})),/denied/);assert.equal(p.W.snapshot().balance,50);assert.equal(p.W.snapshot().pending,null);p.w.close();});
 await test('concurrent casino tabs share a lock and cannot spend the same coins twice',async()=>{let queue=Promise.resolve();const locks={request:(_,fn)=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;}};const shared=new Map([['money_v1','15']]),a=page({storage:shared,locks}),b=page({storage:shared,locks});const rounds=await Promise.allSettled([walletCall(a.W,'begin','janken',10,()=>({payout:20,data:{}})),walletCall(b.W,'begin','janken',10,()=>({payout:20,data:{}}))]);assert.equal(rounds.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.W.snapshot().balance,5);const round=rounds.find(r=>r.status==='fulfilled').value;await Promise.all([walletCall(a.W,'finish',round.id),walletCall(b.W,'finish',round.id)]);assert.equal(a.W.snapshot().balance,25);a.w.close();b.w.close();});
 await test('town spending and quiz rewards cannot overwrite a casino balance, and reset voids old pending rounds',async()=>{const shared=new Map([['money_v1','100']]),a=page({storage:shared}),b=page({storage:shared});const r=await walletCall(a.W,'begin','janken',10,()=>({payout:20,data:{}}));await walletCall(b.W,'adjust',-30);await walletCall(b.W,'adjust',20);await walletCall(a.W,'finish',r.id);assert.equal(a.W.snapshot().balance,100);const next=await walletCall(a.W,'begin','janken',10,()=>({payout:20,data:{}}));await walletCall(b.W,'replace',50);await assert.rejects(walletCall(a.W,'finish',next.id),/round-gone/);assert.equal(a.W.snapshot().balance,50);a.w.close();b.w.close();});
 await test('a cancelled town purchase waiting on the wallet lock cannot consume coins',async()=>{let release;const locks={request:(_,fn)=>new Promise((resolve,reject)=>{release=()=>{try{resolve(fn());}catch(e){reject(e);}};})},p=page({locks});let valid=true;const result=walletCall(p.W,'buy',30,()=>valid);valid=false;release();await assert.rejects(result,/purchase-cancelled/);assert.equal(p.W.snapshot().balance,100);p.w.close();});
 await test('mobile controls use the same stake and cannot double-charge a desktop button',()=>{const p=page({ui:true});p.$('mobileStake').value='5';p.$('mobileStake').dispatchEvent(new p.w.Event('input'));assert.equal(p.$('stake').value,'5');assert.equal(p.$('mobileBetTotal').textContent,'5両');p.setRandom(0);p.$('mobilePlayRound').click();p.$('playRound').click();assert.equal(p.W.snapshot().balance,95);assert(p.$('mobilePlayRound').disabled);p.advance(2000);assert.equal(p.W.snapshot().balance,100);assert.equal(p.W.snapshot().history.length,1);p.w.close();});
 await test('janken UI locks a running round, reveals the right hands and credits only its real payout',()=>{const p=page({ui:true});p.setRandom(1);p.$('playRound').click();p.$('playRound').click();assert.equal(p.W.snapshot().balance,90);assert(p.$('playRound').disabled);assert(p.w.document.querySelector('[data-game="slots"]').disabled);p.advance(2000);assert.equal(p.W.snapshot().balance,110);assert(p.$('resultHeadline').textContent.includes('あなたの勝ち'));assert.equal(p.$('resultNet').textContent,'＋10両');assert.equal(p.$('opponentHand').textContent,'✌️');p.advance(5000);assert.equal(p.W.snapshot().balance,110);p.w.close();});
 await test('roulette chips can be removed, charge only on spin and settle multiple covered positions',()=>{const p=page({ui:true,balance:500});p.w.document.querySelector('[data-game="roulette"]').click();p.w.document.querySelector('[data-position="n0"]').click();p.w.document.querySelector('[data-position="red"]').click();assert.equal(p.$('rouletteTotal').textContent,'20両');assert.equal(p.W.snapshot().balance,500);p.$('undoBet').click();assert.equal(p.$('rouletteTotal').textContent,'10両');p.setRandom(0);p.$('playRound').click();assert.equal(p.W.snapshot().balance,490);p.advance(5200);assert.equal(p.W.snapshot().balance,850);assert.equal(p.$('wheelNumber').textContent,'0');assert.equal(p.$('rouletteTotal').textContent,'0両');assert.equal(p.$('resultPayout').textContent,'360両');p.w.close();});
 await test('slots show all nine cells, highlight a vertical win and pay its exact amount',()=>{
  const p=page({ui:true});p.w.document.querySelector('[data-game="slots"]').click();p.setSequence([0,7,12,0,12,16,0,16,7]);p.$('playRound').click();assert.equal(p.W.snapshot().balance,90);
  p.advance(1800);assert(p.$('reel0').parentElement.classList.contains('stopped'));assert(!p.$('reel2').parentElement.classList.contains('stopped'));p.advance(1300);
  assert.equal(p.W.snapshot().balance,130);assert.equal(p.$('resultPayout').textContent,'40両');assert.equal(p.$('slotWinLines'),null);assert(p.$('slotLineWins').textContent.includes('左の縦列'));
  assert.equal(p.w.document.querySelectorAll('.reel-item').length,9);assert.equal(p.w.document.querySelectorAll('.is-winning').length,3);p.w.close();
 });
 await test('all eight 777 lines add up instead of hitting the old single-line payout cap',()=>{
  const p=page({ui:true});p.w.document.querySelector('[data-game="slots"]').click();p.setRandom(19);p.$('playRound').click();p.advance(3100);
  assert.equal(p.W.snapshot().balance,24090);assert.equal(p.$('resultPayout').textContent,'24,000両');assert.equal(p.$('slotWinLines'),null);assert(p.$('tableArea').classList.contains('big-win'));p.w.close();
 });
 await test('bonus grants five free spins, locks the original stake, doubles payouts and survives reloading',()=>{
  const map=new Map([['money_v1','10']]),p=page({ui:true,storage:map});p.w.document.querySelector('[data-game="slots"]').click();p.setSequence([20,7,12,0,20,16,7,16,20]);p.$('playRound').click();p.advance(3100);
  assert.equal(p.W.snapshot().balance,0);assert.equal(p.W.snapshot().slotBonus.remaining,5);assert(!p.$('playRound').disabled);assert(p.$('stake').disabled);assert(p.$('emptyWallet').hidden);assert(p.$('resultHeadline').textContent.includes('ボーナス発動'));
  const q=page({ui:true,storage:map});q.w.document.querySelector('[data-game="slots"]').click();assert(q.$('playLabel').textContent.includes('無料スピン'));q.setRandom(19);q.$('playRound').click();q.$('playRound').click();assert.equal(q.W.snapshot().balance,0);assert.equal(q.W.snapshot().pending.stake,0);assert.equal(q.W.snapshot().pending.slotStake,10);assert.equal(q.W.snapshot().slotBonus.remaining,4);
  const recovered=page({ui:true,storage:map});assert.equal(recovered.W.snapshot().balance,48000);assert.equal(recovered.W.snapshot().slotBonus.remaining,4);assert.equal(recovered.$('resultPayout').textContent,'48,000両');q.advance(3100);assert.equal(q.W.snapshot().balance,48000);
  recovered.setRandom(20);for(let i=0;i<4;i++){recovered.$('playRound').click();recovered.advance(3100);}assert.equal(recovered.W.snapshot().slotBonus.remaining,0);assert.equal(recovered.W.snapshot().balance,48000);assert(!recovered.$('stake').disabled);assert.equal(recovered.W.snapshot().history.filter(r=>r.freeSpin).length,5);
  p.w.close();q.w.close();recovered.w.close();
 });
 await test('two tabs cannot consume a bonus spin twice and duplicate settlement cannot grant a second bonus',async()=>{
  let queue=Promise.resolve();const locks={request:(_,fn)=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;}};const shared=new Map([['money_v1','10']]),a=page({storage:shared,locks}),b=page({storage:shared,locks});
  const round=await walletCall(a.W,'begin','slots',10,()=>({payout:0,data:{bonusTriggered:true}}));await Promise.all([walletCall(a.W,'finish',round.id),walletCall(b.W,'finish',round.id)]);assert.equal(a.W.snapshot().slotBonus.remaining,5);
  const results=await Promise.allSettled([walletCall(a.W,'begin','slots',10,()=>({payout:0,data:{}})),walletCall(b.W,'begin','slots',10,()=>({payout:0,data:{}}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.W.snapshot().slotBonus.remaining,4);assert.equal(a.W.snapshot().balance,0);a.w.close();b.w.close();
 });
 await test('old pending 250x slot rounds restore at their original payout without granting a bonus',()=>{
  const wallet={version:2,balance:90,pending:{id:'old-slot',game:'slots',stake:10,payout:2500,data:{stops:[19,19,19],reels:['seven','seven','seven'],multiplier:250,title:'7が3つ！'},at:1},history:[]};
  const p=page({ui:true,storage:new Map([['hk_wallet_v2',JSON.stringify(wallet)]])});assert.equal(p.W.snapshot().balance,2590);assert.equal(p.$('resultPayout').textContent,'2,500両');assert(!p.W.snapshot().slotBonus);p.w.close();
 });
 await test('reopening an unfinished round restores its exact result without a second stake or payout',()=>{const map=new Map([['money_v1','100']]),first=page({ui:true,storage:map});first.setRandom(1);first.$('playRound').click();assert.equal(first.W.snapshot().balance,90);const second=page({ui:true,storage:map});assert.equal(second.W.snapshot().balance,110);assert.equal(second.$('resultKicker').textContent,'RESULT RESTORED');first.advance(2000);assert.equal(first.W.snapshot().balance,110);assert.equal(first.W.snapshot().history.length,1);first.w.close();second.w.close();});
 await test('all three cards use the same casino page, VEX10 is gone, and small screens get dedicated layout rules',()=>{const index=read('index.html');for(const game of ['janken','roulette','slots'])assert(index.includes('./casino.html?game='+game));for(const file of ['index.html','arcade.html','edogames.html','assets/ui/arcade.js','assets/ui/arcade.css'])assert(!/vex|gamedistribution/i.test(read(file)),file);assert(read('assets/ui/casino.css').includes('@media(max-width:420px)'));assert(read('casino.html').includes('現金・別のチップは使いません'));});
 console.log(`\n${checks} casino and shared-wallet checks passed.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
