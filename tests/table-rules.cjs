const assert=require('node:assert/strict'),R=require('../assets/ui/table-rules.js');
let checks=0;function test(name,fn){fn();console.log('PASS',name);checks++;}
const hand=s=>s.split(' '),bjDeck=s=>[...R.deck(),...hand(s).reverse()];
test('52 unique cards and complete poker category ordering',()=>{
 assert.equal(new Set(R.deck()).size,52);
 const cases=['AS KD 9H 7C 3D','AS AD 9H 7C 3D','AS AD 9H 9C 3D','AS AD AH 7C 3D','AS 2D 3H 4C 5D','AS JS 9S 7S 3S','AS AD AH 7C 7D','AS AD AH AC 3D','9S TS JS QS KS'];
 cases.forEach((s,i)=>assert.equal(R.evaluate(hand(s)).rank[0],i));
 assert(R.compare(R.evaluate(hand(cases[8])).rank,R.evaluate(hand(cases[7])).rank)>0);
});
test('wheel, kicker, two triplets and seven-card best five are evaluated correctly',()=>{
 assert.equal(R.evaluate(hand('AS 2D 3H 4C 5D KH KC')).rank[1],5);
 assert.deepEqual(R.evaluate(hand('AS AD AH KS KD KH 2S')).rank,[6,14,13]);
 assert(R.compare(R.evaluate(hand('AS AD KH 9S 8C 3D 2H')).rank,R.evaluate(hand('AH AC QH JS TS 7D 2C')).rank)>0);
 assert.equal(R.evaluate(hand('AS KS QS JS TS 2D 3H')).cards.length,5);
});
test('initial blinds, rotation, legal turns and minimum raises',()=>{
 const t=R.createPoker();assert(R.startPoker(t));assert.equal(t.dealer,0);assert.equal(t.sb,1);assert.equal(t.bb,2);assert.equal(t.turn,3);
 assert.equal(R.pokerAction(t,'call',null,0),false);assert.equal(R.pokerAction(t,'raise',30),false);assert(R.pokerAction(t,'raise',40));
 assert.equal(R.pokerOptions(t).min,60);assert.equal(R.startPoker(t),false);
});
test('blinds do not count as actions and all-check streets advance',()=>{
 const t=R.createPoker();R.startPoker(t);assert(R.pokerAction(t,'call'));assert(R.pokerAction(t,'call'));assert(R.pokerAction(t,'call'));
 assert.equal(t.turn,2);assert.equal(t.stage,'preflop');assert(R.pokerAction(t,'check'));assert.equal(t.stage,'flop');assert.equal(t.board.length,3);assert.equal(t.turn,1);
 while(t.stage!=='done'){const o=R.pokerOptions(t);assert(R.pokerAction(t,o.check?'check':'call'));}
 assert.equal(t.board.length,5);assert.equal(t.players.reduce((s,p)=>s+p.chips,0),4000);
 const old=t.dealer;assert(R.startPoker(t));assert.equal(t.dealer,(old+1)%4);
});
test('a short all-in does not reopen a previous actor’s raising right',()=>{
 const t=R.createPoker();t.players[1].chips=50;t.players[2].chips=1950;R.startPoker(t);
 R.pokerAction(t,'raise',40);R.pokerAction(t,'call');assert.equal(t.turn,1);R.pokerAction(t,'raise',50);R.pokerAction(t,'call');
 assert.equal(t.turn,3);assert.equal(R.pokerOptions(t).canRaise,false);assert.equal(R.pokerAction(t,'raise',100),false);assert(R.pokerAction(t,'call'));assert(R.pokerAction(t,'call'));assert.equal(t.stage,'flop');
});
test('all-ins run out the board and side pots exclude folded players',()=>{
 const t=R.createPoker();t.stage='river';t.dealer=0;t.board=hand('2H 3H 4H 9S TD');
 const holes=['AH 5H','KS KD','QS QD','JS JD'];const inv=[50,200,200,100];
 t.players.forEach((p,i)=>{p.cards=hand(holes[i]);p.invested=inv[i];p.chips=1000-inv[i];p.folded=i===2;});
 R.settlePoker(t);assert.equal(t.players[0].chips,1150);assert.equal(t.players[1].chips,1150);assert.equal(t.players[2].chips,800);assert.equal(t.players[3].chips,900);
 assert.equal(t.awards.reduce((s,a)=>s+a.amount,0),550);const bank=t.players.reduce((s,p)=>s+p.chips,0);R.settlePoker(t);assert.equal(t.players.reduce((s,p)=>s+p.chips,0),bank);
});
test('uncalled excess is returned and tied pots conserve odd chips',()=>{
 const t=R.createPoker();t.stage='river';t.dealer=0;t.board=hand('AS KS QS JS TS');
 t.players.forEach((p,i)=>{p.cards=hand(['2D 3D','4D 5D','6D 7D','8D 9D'][i]);p.invested=[5,5,5,10][i];p.chips=1000-p.invested;p.folded=i===0;});
 R.settlePoker(t);assert.equal(t.players[1].chips,1002);assert.equal(t.players[2].chips,1002);assert.equal(t.players[3].chips,1001);assert(t.awards.some(a=>a.refund&&a.amount===5));assert.equal(t.players.reduce((s,p)=>s+p.chips,0),4000);
});
test('heads-up dealer is small blind, acts first preflop and last after flop',()=>{
 const t=R.createPoker();t.players[2].chips=t.players[3].chips=0;t.players[0].chips=t.players[1].chips=2000;
 R.startPoker(t);assert.equal(t.dealer,t.sb);assert.equal(t.turn,t.dealer);R.pokerAction(t,'call');R.pokerAction(t,'check');assert.equal(t.stage,'flop');assert.equal(t.turn,t.bb);
});
test('CPU receives neither opponents’ cards nor the future deck',()=>{
 const t=R.createPoker();R.startPoker(t);const v=R.publicPoker(t,3);assert(!('deck' in v));assert(v.players.every((p,i)=>i===3?p.cards.length===2:p.cards.length===0));
 const before=JSON.stringify(t),move=R.botPoker(v,()=>.5);assert.equal(JSON.stringify(t),before);assert(R.pokerAction(t,move.action,move.total));
});
test('2000 randomized hands terminate with legal actions and conserved chips',()=>{
 let seed=12345;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};let t=R.createPoker();
 for(let handNo=0;handNo<2000;handNo++){
  if(t.players.filter(p=>p.chips>0).length<2)t=R.createPoker();assert(R.startPoker(t,R.deck(1,rng)));
  let turns=0;while(t.stage!=='done'){assert(turns++<300);const o=R.pokerOptions(t);assert(o);const chance=rng();const move=chance<.13?{action:'fold'}:chance<.29&&o.canRaise?{action:'raise',total:chance<.19?o.max:Math.min(o.max,o.min)}:R.botPoker(R.publicPoker(t,t.turn),rng);assert(R.pokerAction(t,move.action,move.total));assert.equal(t.players.reduce((s,p)=>s+p.chips+(t.stage==='done'?0:p.invested),0),4000);assert(t.players.every(p=>p.chips>=0));}
  assert(R.restorePoker(JSON.stringify(t)));assert.equal(t.players.reduce((s,p)=>s+p.chips,0),4000);
 }
});
test('poker active state resumes, invalid state is rejected',()=>{const t=R.createPoker();R.startPoker(t);assert.deepEqual(R.restorePoker(JSON.stringify(t)),t);t.players[0].chips++;assert.equal(R.restorePoker(JSON.stringify(t)),null);assert.equal(R.restorePoker('{'),null);});
test('blackjack ace totals and soft 17',()=>{assert.deepEqual(R.blackjackValue(hand('AS AH 5D')),{total:17,soft:true,natural:false});assert.equal(R.blackjackValue(hand('AS AH KD')).total,12);assert(R.blackjackValue(hand('AS KD')).natural);});
test('natural blackjack pays 3:2 once; opposing naturals push',()=>{
 let t=R.createBlackjack();assert(R.startBlackjack(t,100,bjDeck('AS 9H KD 8D')));assert.equal(t.stage,'done');assert.equal(t.bank,1150);assert.equal(t.hands[0].returned,250);R.finishBlackjack(t,true);assert.equal(t.bank,1150);
 t=R.createBlackjack();R.startBlackjack(t,100,bjDeck('AS AH KD TD'));assert.equal(t.bank,1000);assert.equal(t.hands[0].result,'引き分け');
 t=R.createBlackjack();R.startBlackjack(t,100,bjDeck('9S AH KD TD'));assert.equal(t.bank,900);assert.equal(R.blackjackAction(t,'hit'),false);
});
test('stand on soft 17, bust losses and ordinary ties return only the stake',()=>{
 let t=R.createBlackjack();R.startBlackjack(t,50,bjDeck('TS AS 7D 6D'));R.blackjackAction(t,'stand');const len=t.shoe.length;R.dealerBlackjack(t);assert.equal(t.shoe.length,len);assert.equal(t.bank,1000);
 t=R.createBlackjack();R.startBlackjack(t,50,bjDeck('TS 7H KD 9D 5S'));R.blackjackAction(t,'hit');assert.equal(t.stage,'done');assert.equal(t.bank,950);
});
test('double charges once, draws exactly one card and settles a doubled bet',()=>{
 const t=R.createBlackjack();R.startBlackjack(t,100,bjDeck('5S TH 6D 7D TS'));assert(R.blackjackAction(t,'double'));assert.equal(t.bank,800);assert.equal(t.hands[0].bet,200);assert.equal(t.hands[0].cards.length,3);assert.equal(R.blackjackAction(t,'double'),false);R.dealerBlackjack(t);assert.equal(t.bank,1200);
});
test('split creates two separately played hands and disallows resplitting',()=>{
 const t=R.createBlackjack();R.startBlackjack(t,100,bjDeck('8S TH 8D 7D 3S 2S TS 9S'));assert(R.blackjackAction(t,'split'));assert.equal(t.bank,800);assert.equal(t.hands.length,2);assert.equal(R.blackjackOptions(t).split,false);assert(R.blackjackAction(t,'double'));assert.equal(t.active,1);assert(R.blackjackAction(t,'stand'));assert.equal(t.stage,'dealer');R.dealerBlackjack(t);assert.equal(t.hands[0].returned,400);assert.equal(t.hands[1].returned,0);assert.equal(t.bank,1100);
});
test('split aces get one card each; split 21 does not get natural payout',()=>{
 const t=R.createBlackjack();R.startBlackjack(t,100,bjDeck('AS TH AD 7D KS QS'));assert(R.blackjackAction(t,'split'));assert.equal(t.stage,'dealer');assert.equal(t.hands[0].cards.length,2);R.dealerBlackjack(t);assert.equal(t.bank,1200);assert(t.hands.every(h=>h.returned===200));
});
test('bet and bankroll limits, disabled actions and active reload protect chip accounting',()=>{
 const t=R.createBlackjack();for(const b of [-10,0,15,505,NaN,Infinity])assert.equal(R.startBlackjack(t,b),false);R.startBlackjack(t,500,bjDeck('8S TH 8D 7D 3S 2S'));assert.equal(t.bank,500);assert.equal(R.startBlackjack(t,50),false);R.blackjackAction(t,'split');assert.equal(t.bank,0);assert.equal(R.blackjackOptions(t).double,false);assert.deepEqual(R.restoreBlackjack(JSON.stringify(t)),t);assert.equal(R.restoreBlackjack('{'),null);
});
test('500 blackjack rounds obey dealer rules and settle bank exactly once',()=>{
 let t=R.createBlackjack();for(let i=0;i<500;i++){
  if(t.bank<20)t=R.createBlackjack();const before=t.bank;assert(R.startBlackjack(t,20));const initialShoe=t.shoe.length;
  while(t.stage==='player'){const h=t.hands[t.active],o=R.blackjackOptions(t);assert(R.blackjackAction(t,R.blackjackValue(h.cards).total<15&&o.hit?'hit':'stand'));}
  let draws=0;while(t.stage==='dealer'){assert(draws++<20);R.dealerBlackjack(t);}
  const h=t.history[0];assert.equal(t.bank,before-h.stake+h.returned);const bank=t.bank;R.dealerBlackjack(t);R.finishBlackjack(t);assert.equal(t.bank,bank);assert(t.shoe.length<=initialShoe);assert(R.restoreBlackjack(JSON.stringify(t)));
 }
});
console.log(checks+' table rules checks passed.');
