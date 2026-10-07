(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HKEdoCards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ranks = "23456789TJQKA", suits = "SHDC";
  const names = ["ハイカード", "ワンペア", "ツーペア", "スリーカード", "ストレート", "フラッシュ", "フルハウス", "フォーカード", "ストレートフラッシュ"];
  const value = c => ranks.indexOf(c[0]) + 2;
  function random() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296;
    }
    return Math.random();
  }
  function deck(copies = 1, rng = random) {
    const out = [];
    for (let n = 0; n < copies; n++) for (const s of suits) for (const r of ranks) out.push(r + s);
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function compare(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
    return 0;
  }
  function five(cards) {
    const vals = cards.map(value).sort((a, b) => b - a), counts = new Map();
    vals.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every(c => c[1] === cards[0][1]);
    const uniq = [...new Set(vals)];
    const straight = uniq.length === 5 ? (uniq[0] - uniq[4] === 4 ? uniq[0] : uniq.join() === "14,5,4,3,2" ? 5 : 0) : 0;
    if (flush && straight) return [8, straight];
    if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
    if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
    if (flush) return [5, ...vals];
    if (straight) return [4, straight];
    if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(g => g[0])];
    if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...groups.slice(0, 2).map(g => g[0]).sort((a,b)=>b-a), groups[2][0]];
    if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(g => g[0])];
    return [0, ...vals];
  }
  function evaluate(cards) {
    if (cards.length < 5) return { rank: [0, ...cards.map(value).sort((a,b)=>b-a)], name: "役はフロップから表示", cards: [] };
    let best = null;
    for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
        const chosen = [cards[a], cards[b], cards[c], cards[d], cards[e]], rank = five(chosen);
        if (!best || compare(rank, best.rank) > 0) best = { rank, name: names[rank[0]], cards: chosen };
      }
    return best;
  }
  const nextSeat = (t, from, predicate) => {
    for (let k = 1; k <= t.players.length; k++) { const i = (from + k) % t.players.length; if (predicate(t.players[i])) return i; }
    return -1;
  };
  const live = t => t.players.filter(p => !p.folded);
  const movable = p => !p.folded && !p.allin;
  function log(t, text) { t.log.push(text); if (t.log.length > 32) t.log.shift(); }
  function pay(p, amount) {
    const cost = Math.max(0, Math.min(p.chips, amount)); p.chips -= cost; p.bet += cost; p.invested += cost; p.allin = p.chips === 0; return cost;
  }
  function createPoker() {
    return { version: 1, players: ["あなた", "商人 · 慎重派", "武士 · 大胆派", "奉行 · 読み合い"].map(name => ({name, chips:1000, cards:[], bet:0, invested:0, folded:true, allin:false, acted:-1})), dealer: -1, turn: -1, hand: 0, stage: "idle", board: [], deck: [], log: [], awards: [], currentBet: 0, minRaise: 20, epoch: 0 };
  }
  function startPoker(t, shuffled = deck()) {
    if (!["idle", "done"].includes(t.stage)) return false;
    if (t.players.filter(p=>p.chips>0).length < 2) return false;
    t.hand++; t.deck = shuffled.slice(); t.board = []; t.awards = []; t.log = []; t.stage = "preflop"; t.epoch = 0; t.currentBet = 20; t.minRaise = 20;
    t.players.forEach(p=>{p.cards=[];p.bet=p.invested=0;p.folded=p.chips<=0;p.allin=false;p.acted=-1;p.action="";});
    t.dealer = nextSeat(t, t.dealer, p=>!p.folded);
    const sb = live(t).length === 2 ? t.dealer : nextSeat(t,t.dealer,p=>!p.folded);
    const bb = nextSeat(t,sb,p=>!p.folded); t.sb=sb; t.bb=bb;
    for(let round=0;round<2;round++) { let seat=t.dealer; for(let n=0;n<live(t).length;n++){seat=nextSeat(t,seat,p=>!p.folded);t.players[seat].cards.push(t.deck.pop());} }
    pay(t.players[sb],10); pay(t.players[bb],20); log(t,"ハンド " + t.hand + " · ブラインド 10 / 20");
    t.turn=bb; advancePoker(t); return true;
  }
  function pokerOptions(t, seat=t.turn) {
    const p=t.players[seat];
    if (!p || t.turn!==seat || !movable(p) || ["done","idle"].includes(t.stage)) return null;
    const due=Math.max(0,t.currentBet-p.bet), max=p.bet+p.chips;
    const canRaise=p.acted!==t.epoch && max>t.currentBet && t.players.some((q,i)=>i!==seat&&movable(q));
    return {due,call:Math.min(due,p.chips),check:due===0,min:t.currentBet+t.minRaise,max,canRaise};
  }
  function pokerAction(t, action, total, seat=t.turn) {
    const o=pokerOptions(t,seat); if(!o) return false;
    const p=t.players[seat]; let text="";
    if(action==="fold") {p.folded=true; text="フォールド";}
    else if(action==="check") {if(!o.check)return false;text="チェック";}
    else if(action==="call") {if(o.check)return false;text="コール " + pay(p,o.due);}
    else if(action==="raise") {
      if(!Number.isInteger(total)||!o.canRaise||total<=t.currentBet||total>o.max||(total<o.min&&total!==o.max))return false;
      const raise=total-t.currentBet; pay(p,total-p.bet);
      if(raise>=t.minRaise){t.minRaise=raise;t.epoch++;}
      t.currentBet=total; text=(p.allin?"オールイン ":"レイズ ")+total;
    } else return false;
    p.acted=t.epoch; p.action=text; log(t,p.name+"："+text); advancePoker(t); return true;
  }
  function street(t) {
    t.players.forEach(p=>{p.bet=0;p.acted=-1;}); t.currentBet=0;t.minRaise=20;t.epoch=0;
    t.deck.pop();
    const count=t.stage==="preflop"?3:1; for(let n=0;n<count;n++)t.board.push(t.deck.pop());
    t.stage=t.stage==="preflop"?"flop":t.stage==="flop"?"turn":"river";
    log(t,({flop:"フロップ",turn:"ターン",river:"リバー"})[t.stage]); t.turn=t.dealer;
  }
  function settlePoker(t) {
    if(t.stage==="done")return;
    const handRanks=t.players.map(p=>p.folded?null:evaluate([...p.cards,...t.board]));
    const levels=[...new Set(t.players.map(p=>p.invested).filter(v=>v>0))].sort((a,b)=>a-b);
    let previous=0; t.awards=[];
    for(const level of levels){
      const contributors=t.players.map((p,i)=>p.invested>=level?i:-1).filter(i=>i>=0);
      const amount=(level-previous)*contributors.length;previous=level;
      if(contributors.length===1){const i=contributors[0];t.players[i].chips+=amount;t.awards.push({seat:i,amount,refund:true});continue;}
      const eligible=contributors.filter(i=>!t.players[i].folded);
      let winners=[];
      for(const i of eligible){if(!winners.length||compare(handRanks[i].rank,handRanks[winners[0]].rank)>0)winners=[i];else if(compare(handRanks[i].rank,handRanks[winners[0]].rank)===0)winners.push(i);}
      // A folded contributor cannot win; every contested layer has a live contender.
      if(!winners.length)throw new Error("No eligible side-pot contender");
      winners.sort((a,b)=>((a-t.dealer+t.players.length-1)%t.players.length)-((b-t.dealer+t.players.length-1)%t.players.length));
      winners.forEach((i,n)=>{const won=Math.floor(amount/winners.length)+(n<amount%winners.length?1:0);t.players[i].chips+=won;t.awards.push({seat:i,amount:won,refund:false,hand:handRanks[i].name,cards:handRanks[i].cards});});
    }
    t.stage="done"; t.turn=-1;
    t.players.forEach(p=>{p.bet=0;});
    const won=new Map();t.awards.filter(a=>!a.refund).forEach(a=>won.set(a.seat,(won.get(a.seat)||0)+a.amount));
    for(const [i,n] of won)log(t,t.players[i].name+"が "+n+" チップ獲得");
  }
  function advancePoker(t) {
    if(live(t).length===1){settlePoker(t);return;}
    while(true){
      const actors=t.players.filter(movable);
      const need=p=>movable(p)&&(p.bet<t.currentBet||(actors.length>1&&p.acted!==t.epoch));
      const next=nextSeat(t,t.turn,need);
      if(next>=0){t.turn=next;return;}
      if(t.stage==="river"){settlePoker(t);return;}
      street(t);
    }
  }
  function publicPoker(t, seat) {
    return {stage:t.stage,board:t.board.slice(),currentBet:t.currentBet,pot:t.players.reduce((s,p)=>s+p.invested,0),seat,options:pokerOptions(t,seat),players:t.players.map((p,i)=>({name:p.name,chips:p.chips,bet:p.bet,folded:p.folded,allin:p.allin,cards:i===seat?p.cards.slice():[]}))};
  }
  function botPoker(view, rng=random) {
    const o=view.options,p=view.players[view.seat];if(!o)return null;
    const hole=p.cards, vals=hole.map(value), paired=vals[0]===vals[1], suited=hole[0][1]===hole[1][1];
    const rank=view.board.length>=3?evaluate([...hole,...view.board]).rank:null;
    let strength=rank ? Math.min(.93,.24+rank[0]*.14+(rank[1]||0)/95) : .12+Math.max(...vals)/35+(paired?.28:0)+(suited?.07:0)+(Math.abs(vals[0]-vals[1])<=2?.04:0);
    const bold=view.seat===2?.12:view.seat===1?-.06:0;strength+=bold;
    const pressure=o.due/Math.max(1,view.pot+o.due), roll=rng();
    if(!o.check&&strength<pressure+.2&&roll>.14)return {action:"fold"};
    if(o.canRaise && strength>.58 && roll<strength*.32){
      const target=Math.min(o.max,Math.max(o.min,view.currentBet+Math.max(20,Math.round(view.pot*.5/10)*10)));
      if(target>=o.min || target===o.max)return {action:"raise",total:target};
    }
    return {action:o.check?"check":"call"};
  }
  function blackjackValue(cards) {
    let total=0,aces=0;
    for(const c of cards){if(c[0]==="A"){total+=11;aces++;}else total+=Math.min(10,value(c));}
    while(total>21&&aces){total-=10;aces--;}
    return {total,soft:aces>0,natural:cards.length===2&&total===21};
  }
  function createBlackjack() {return {version:1,bank:1000,shoe:[],dealer:[],hands:[],active:0,stage:"idle",round:0,history:[],message:"ベットを選んで、カードを配ろう。"};}
  function finishBlackjack(t, natural=false) {
    if(t.stage==="done")return false;
    const dealer=blackjackValue(t.dealer);let returned=0;
    t.hands.forEach(h=>{
      const v=blackjackValue(h.cards);let rate=0,label="負け";
      if(v.total>21)label="バースト";
      else if(natural&&dealer.natural){if(!h.split&&v.natural){rate=1;label="引き分け";}}
      else if(natural&&!h.split&&v.natural){rate=2.5;label="ブラックジャック！";}
      else if(dealer.total>21||v.total>dealer.total){rate=2;label="勝ち！";}
      else if(v.total===dealer.total){rate=1;label="引き分け";}
      h.returned=h.bet*rate;h.result=label;returned+=h.returned;
    });
    const stake=t.hands.reduce((s,h)=>s+h.bet,0),net=returned-stake;t.bank+=returned;t.stage="done";
    t.message=(net>0?"WIN +"+net:net===0?"PUSH ±0":"LOSE "+net)+" チップ";
    t.history.unshift({round:t.round,stake,returned,net});t.history=t.history.slice(0,8);return true;
  }
  function startBlackjack(t, bet, shuffled) {
    if(!["idle","done"].includes(t.stage)||!Number.isInteger(bet)||bet<10||bet>500||bet%10||bet>t.bank)return false;
    if(shuffled)t.shoe=shuffled.slice();else if(t.shoe.length<75)t.shoe=deck(6);
    if(t.shoe.length<10)return false;
    t.round++;t.bank-=bet;t.stage="player";t.active=0;t.dealer=[];
    t.hands=[{cards:[],bet,split:false,splitAce:false,done:false}];
    for(let i=0;i<2;i++){t.hands[0].cards.push(t.shoe.pop());t.dealer.push(t.shoe.pop());}
    t.message="あなたの番。21に近づけよう。";
    if(blackjackValue(t.dealer).natural||blackjackValue(t.hands[0].cards).natural)finishBlackjack(t,true);
    return true;
  }
  function blackjackOptions(t) {
    if(t.stage!=="player")return null;const h=t.hands[t.active];if(!h||h.done)return null;
    return {hit:!h.splitAce,stand:true,double:h.cards.length===2&&!h.splitAce&&t.bank>=h.bet,split:t.hands.length===1&&h.cards.length===2&&h.cards[0][0]===h.cards[1][0]&&t.bank>=h.bet};
  }
  function nextBlackjack(t) {
    const i=t.hands.findIndex(h=>!h.done);if(i>=0){t.active=i;t.message="手札 "+(i+1)+" の番です。";return;}
    t.stage="dealer";t.message="ディーラーの番…";
    if(t.hands.every(h=>blackjackValue(h.cards).total>21))finishBlackjack(t);
  }
  function blackjackAction(t,action) {
    const o=blackjackOptions(t);if(!o||!o[action])return false;const h=t.hands[t.active];
    if(action==="hit"){h.cards.push(t.shoe.pop());if(blackjackValue(h.cards).total>=21)h.done=true;}
    else if(action==="stand")h.done=true;
    else if(action==="double"){t.bank-=h.bet;h.bet*=2;h.cards.push(t.shoe.pop());h.done=true;}
    else if(action==="split"){
      t.bank-=h.bet;const second={cards:[h.cards.pop()],bet:h.bet,split:true,splitAce:h.cards[0][0]==="A",done:false};
      h.split=true;h.splitAce=second.splitAce;h.cards.push(t.shoe.pop());second.cards.push(t.shoe.pop());t.hands.push(second);
      t.hands.forEach(x=>{x.done=x.splitAce||blackjackValue(x.cards).total===21;});
    }
    if(h.done||action==="split")nextBlackjack(t);return true;
  }
  function dealerBlackjack(t) {
    if(t.stage!=="dealer")return false;
    if(blackjackValue(t.dealer).total<17){t.dealer.push(t.shoe.pop());return true;}
    finishBlackjack(t);return true;
  }
  function validCard(c){return typeof c==="string"&&c.length===2&&ranks.includes(c[0])&&suits.includes(c[1]);}
  function restorePoker(json) {
    try {const t=JSON.parse(json);if(t.version!==1||!Array.isArray(t.players)||t.players.length!==4||!["idle","preflop","flop","turn","river","done"].includes(t.stage))return null;
      if(!Array.isArray(t.deck)||!Array.isArray(t.board)||!Array.isArray(t.log)||!Array.isArray(t.awards))return null;
      if(!t.players.every(p=>Number.isInteger(p.chips)&&p.chips>=0&&Number.isInteger(p.invested)&&p.invested>=0&&Number.isInteger(p.bet)&&p.bet>=0&&p.bet<=p.invested&&Array.isArray(p.cards)))return null;
      const cards=[...t.deck,...t.board,...t.players.flatMap(p=>p.cards)];if(!cards.every(validCard)||new Set(cards).size!==cards.length)return null;
      if(t.players.reduce((s,p)=>s+p.chips+(["idle","done"].includes(t.stage)?0:p.invested),0)!==4000)return null;
      if(!["idle","done"].includes(t.stage)&&(!Number.isInteger(t.turn)||!pokerOptions(t)))return null;return t;
    }catch(e){return null;}
  }
  function restoreBlackjack(json) {
    try{const t=JSON.parse(json);if(t.version!==1||!Number.isInteger(t.bank)||t.bank<0||t.bank>1e8||!["idle","player","dealer","done"].includes(t.stage)||!Array.isArray(t.hands)||t.hands.length>2||!Array.isArray(t.dealer)||!Array.isArray(t.shoe)||!Array.isArray(t.history))return null;
      if(![...t.shoe,...t.dealer,...t.hands.flatMap(h=>h.cards)].every(validCard)||!t.hands.every(h=>Number.isInteger(h.bet)&&h.bet>=10&&h.bet<=1000&&h.bet%10===0))return null;
      if(t.stage==="player"&&(!Number.isInteger(t.active)||!blackjackOptions(t)))return null;
      if(["player","dealer"].includes(t.stage)&&(t.shoe.length<10||t.dealer.length<2||!t.hands.length))return null;return t;
    }catch(e){return null;}
  }
  return {deck,value,compare,evaluate,names,createPoker,startPoker,pokerOptions,pokerAction,publicPoker,botPoker,settlePoker,restorePoker,createBlackjack,blackjackValue,startBlackjack,blackjackOptions,blackjackAction,dealerBlackjack,finishBlackjack,restoreBlackjack};
});
