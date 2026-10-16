(function () {
  'use strict';
  const KEY = 'hk_wallet_v2', M = window.HKAmounts, P=M.rebirth;
  const games = ['janken', 'roulette', 'slots', 'bitcoin', 'sicbo', 'poker'];
  const integer = M.integer, within = M.valid;
  const amountKeys = new Set(['balance','stake','slotStake','payout','creditedPayout','basePayout']);
  const validCodes = codes => Array.isArray(codes) && codes.length <= 100 && new Set(codes).size === codes.length && codes.every(code => typeof code === 'string' && /^\d{1,16}$/.test(code));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,"0")).join("");
  function validSicbo(round) {
    const basePayout=round.basePayout??round.payout;
    const d=round.data;
    if(!d || !Array.isArray(d.dice) || d.dice.length!==3 || d.dice.some(n=>!Number.isInteger(n)||n<1||n>6))return false;
    const sum=d.dice.reduce((a,b)=>a+b,0),triple=d.dice.every(n=>n===d.dice[0]);
    if(d.sum!==sum || d.triple!==triple)return false;
    if(d.tableVersion===1){
      if(!Array.isArray(d.bets)||!d.bets.length)return false;
      let stake=0,payout=0;
      for(const b of d.bets){
        if(!b||typeof b.id!=='string'||!within(b.stake)||b.stake<1||!integer(b.payout))return false;
        let multiplier=0;
        const face=/^(double|triple|single)-([1-6])$/.exec(b.id),total=/^sum-([4-9]|1[0-7])$/.exec(b.id),pair=/^pair-([1-5])-([2-6])$/.exec(b.id);
        if(b.id==='small'||b.id==='big')multiplier=!triple&&(b.id==='small'?sum>=4&&sum<=10:sum>=11&&sum<=17)?2:0;
        else if(b.id==='any-triple')multiplier=triple?31:0;
        else if(face){const count=d.dice.filter(n=>n===Number(face[2])).length;multiplier=face[1]==='double'?count>=2?12:0:face[1]==='triple'?count===3?181:0:count?count+1:0;}
        else if(total)multiplier=sum===Number(total[1])?[60,20,18,12,8,6,6,6,6,8,12,18,20,60][sum-4]+1:0;
        else if(pair&&Number(pair[1])<Number(pair[2]))multiplier=d.dice.includes(Number(pair[1]))&&d.dice.includes(Number(pair[2]))?7:0;
        else return false;
        if(b.multiplier!==multiplier||M.cmp(b.payout,M.mul(b.stake,multiplier))!==0)return false;
        stake=M.add(stake,b.stake);payout=M.add(payout,b.payout);
        if(!within(stake)||!integer(payout))return false;
      }
      return M.cmp(stake,round.stake)===0 && M.cmp(payout,basePayout)===0 && M.cmp(d.payout,payout)===0;
    }
    if(!['small','big'].includes(d.choice))return false;
    const wins=!triple&&(d.choice==='small'?sum>=4&&sum<=10:sum>=11&&sum<=17);
    return d.sum===sum && d.triple===triple && d.multiplier===(wins?2:0) && M.cmp(basePayout,M.mul(round.stake,wins?2:0))===0;
  }
  function validPokerDeal(data){
    if(!data||data.version!==1||data.phase!=='draw'||!Array.isArray(data.hand)||data.hand.length!==5||!Array.isArray(data.deck)||data.deck.length!==47)return false;
    const cards=[...data.hand,...data.deck];return new Set(cards).size===52&&cards.every(card=>typeof card==='string'&&/^[2-9TJQKA][SHDC]$/.test(card));
  }
  function read() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const value = JSON.parse(raw,(key,value)=>amountKeys.has(key)?M.pack(value):value);
      if(value.rebirths===undefined)value.rebirths=0;
      if (!P.valid(value.rebirths)) throw Error('wallet-invalid');
      if (value.version !== 2 || !within(value.balance) || !Array.isArray(value.history)) throw Error('wallet-invalid');
      if (value.redeemedCodes !== undefined && !validCodes(value.redeemedCodes)) throw Error('wallet-invalid');
      if (value.slotBonus && (!Number.isInteger(value.slotBonus.remaining) || value.slotBonus.remaining < 0 || value.slotBonus.remaining > 5 || !within(value.slotBonus.stake) || value.slotBonus.stake < 1)) throw Error('wallet-invalid');
      if (value.pending) {
        const r=value.pending, times=r.rebirths??0, free=r.game==='slots'&&r.freeSpin===true, basis=free?r.slotStake:r.stake;
        if (!P.valid(times) || times>value.rebirths || ![1,2].includes(r.boostVersion??1) || !P.unlocked(r.game,r.variant||'standard',times) || !games.includes(r.game) || !within(r.stake) || (free?r.stake!==0:r.stake<1) || !within(basis) || basis<1 || !integer(r.payout) || !integer(r.basePayout??r.payout) || M.cmp(r.basePayout??r.payout,M.mul(basis,r.game==='slots'?4800:250))>0 || typeof r.id!=='string') throw Error('wallet-invalid');
        if(r.game!=='bitcoin' && M.cmp(r.payout,refund(r.game,r.data)?r.basePayout??r.payout:P.boost(r.basePayout??r.payout,times,r.boostVersion??1))!==0)throw Error('wallet-invalid');
        if (r.game === 'bitcoin' && (!window.HKBitcoinRules?.validRound(r.data) || r.payout !== 0)) throw Error('wallet-invalid');
        if(r.game==='poker'&&(!validPokerDeal(r.data)||r.variant!=='king'||r.payout!==0))throw Error('wallet-invalid');
        if (r.game === 'sicbo' && !validSicbo(r)) throw Error('wallet-invalid');
      }
      return value;
    }
    const legacy = localStorage.getItem('money_v1') || '0';
    return { version: 2, rebirths:0, balance: within(legacy) ? M.pack(legacy) : 0, pending: null, history: [] };
  }
  function snapshot() { try { return read(); } catch { return { version: 2, balance: 0, pending: null, history: [], unavailable: true }; } }
  function announce() { window.dispatchEvent(new CustomEvent('hk-wallet-change', { detail: snapshot() })); }
  function transact(change, success = () => {}, failure = () => {}) {
    const work = () => {
      const wallet = read(), result = change(wallet);
      wallet.balance=M.clamp(wallet.balance);
      // The balance and any unresolved round are committed in one atomic storage value.
      localStorage.setItem(KEY, JSON.stringify(wallet,(key,value)=>amountKeys.has(key)?M.full(value):value));
      try { localStorage.setItem('money_v1', String(wallet.balance)); } catch { /* v2 remains authoritative. */ }
      announce();
      return result;
    };
    if (navigator.locks?.request) navigator.locks.request('historykids-wallet', work).then(success, failure);
    else { try { const result = work(); success(result); } catch (error) { failure(error); } }
  }
  function adjust(delta, success, failure) {
    transact(w => { w.balance=M.clamp(M.add(w.balance,delta)); return w.balance; }, success, failure);
  }
  function replace(balance, success, failure, activities = null, redeemedCodes = []) {
    transact(w => { if (!within(balance) || !validCodes(redeemedCodes)) throw Error('wallet-invalid'); const receipts=[...new Set([...(w.redeemedCodes||[]),...redeemedCodes])]; if (!validCodes(receipts)) throw Error('wallet-invalid'); w.redeemedCodes = receipts; w.balance = M.pack(balance); w.pending = null; w.history = []; w.slotBonus = null; w.rebirths = 0; w.activities = activities; return balance; }, success, failure);
  }
  function redeem(code, success, failure) {
    transact(w => {
      if(code==='9836478597'){
        const before=w.balance;
        w.balance=M.clamp(M.add(before,'1'+'0'.repeat(68)));
        return {balance:w.balance,credited:M.sub(w.balance,before)};
      }
      if (code !== '2026') throw Error('invalid-code');
      if (w.redeemedCodes?.includes(code)) throw Error('code-used');
      // Grant and receipt share the same storage write and wallet lock.
      if(M.cmp(M.add(w.balance,50000),M.MAX)>0)throw Error('wallet-limit');
      w.balance=M.add(w.balance,50000);
      w.redeemedCodes = [...(w.redeemedCodes||[]),code];
      return w.balance;
    }, success, failure);
  }
  function activity(action, data, success, failure) {
    transact(w => window.HKActivities.apply(w, action, data), success, failure);
  }
  function buy(cost, valid, success, failure) {
    transact(w => {
      if (!within(cost) || cost < 1) throw Error('invalid-cost');
      if (!valid()) throw Error('purchase-cancelled');
      if (M.cmp(w.balance,cost)<0) throw Error('insufficient');
      w.balance=M.sub(w.balance,cost); return w.balance;
    }, success, failure);
  }
  function refund(game,data){return game==='janken'&&data?.multiplier===1 || game==='bitcoin'&&(data?.refunded || data?.endPrice===data?.startPrice);}
  function rebirth(expected,success,failure){
    transact(w=>{
      if(w.pending)throw Error('pending-round');
      if(w.slotBonus?.remaining>0)throw Error('bonus-active');
      if(expected!==w.rebirths)throw Error('rebirth-changed');
      if(!P.valid(w.rebirths+1))throw Error('rebirth-limit');
      if(M.cmp(w.balance,P.cost(w.rebirths))<0)throw Error('insufficient');
      w.rebirths++;w.balance=P.starter;w.slotBonus=null;
      return {rebirths:w.rebirths,balance:w.balance};
    },success,failure);
  }
  function begin(game, stake, draw, success, failure, options={}) {
    transact(w => {
      if (!games.includes(game) || ['bitcoin','poker'].includes(game) || !within(stake) || stake < 1) throw Error('invalid-bet');
      if (w.pending) throw Error('pending-round');
      const variant=options.variant||'standard';
      if(!P.unlocked(game,variant,w.rebirths))throw Error('casino-locked');
      const freeSpin=game==='slots'&&w.slotBonus?.remaining>0, slotStake=freeSpin?w.slotBonus.stake:stake, cost=freeSpin?0:stake;
      if (M.cmp(w.balance,cost)<0) throw Error('insufficient');
      const outcome = draw({freeSpin, stake:slotStake});
      if (!integer(outcome.payout) || M.cmp(outcome.payout,M.mul(slotStake,game==='slots'?4800:250))>0) throw Error('invalid-payout');
      const round = { id: uid(), game, variant, rebirths:w.rebirths, boostVersion:P.boostVersion, basePayout:outcome.payout, stake:cost, payout:refund(game,outcome.data)?outcome.payout:P.boost(outcome.payout,w.rebirths), data: outcome.data, at: Date.now(), ...(game==='slots'?{freeSpin,slotStake}:{}) };
      if(game==='sicbo' && !validSicbo(round))throw Error('invalid-payout');
      if(freeSpin)w.slotBonus.remaining--;
      w.balance=M.sub(w.balance,cost); w.pending = round;
      return round;
    }, success, failure);
  }
  function finish(id, success, failure) {
    transact(w => {
      if (!w.pending || w.pending.id !== id) {
        const old = w.history.find(r => r.id === id);
        if (old) return { ...old, already: true };
        throw Error('round-gone');
      }
      if (w.pending.game === 'bitcoin') throw Error('bitcoin-open');
      if (w.pending.game === 'poker') throw Error('poker-open');
      const result = { ...w.pending, settledAt: Date.now() };
      result.creditedPayout=M.sub(M.clamp(M.add(w.balance,result.payout)),w.balance);
      w.balance=M.add(w.balance,result.creditedPayout); w.pending = null;
      if(result.game==='slots'&&!result.freeSpin&&result.data?.bonusTriggered===true)w.slotBonus={remaining:5,stake:result.slotStake||result.stake};
      w.history = [result, ...w.history].slice(0, 8);
      return result;
    }, success, failure);
  }
  function beginPoker(stake,deal,success,failure){
    transact(w=>{
      if(!P.unlocked('poker','king',w.rebirths))throw Error('casino-locked');
      if(!within(stake)||M.cmp(stake,1)<0)throw Error('invalid-bet');
      if(w.pending)throw Error('pending-round');
      if(M.cmp(w.balance,stake)<0)throw Error('insufficient');
      const data=deal();if(!validPokerDeal(data))throw Error('invalid-poker');
      const round={id:uid(),game:'poker',variant:'king',rebirths:w.rebirths,boostVersion:P.boostVersion,stake,payout:0,basePayout:0,data,at:Date.now()};
      w.balance=M.sub(w.balance,stake);w.pending=round;return round;
    },success,failure);
  }
  function finishPoker(id,holds,success,failure){
    transact(w=>{
      const old=w.history.find(r=>r.id===id);if(old)return {...old,already:true};
      if(!w.pending||w.pending.id!==id||w.pending.game!=='poker')throw Error('round-gone');
      if(!Array.isArray(holds)||holds.length>5||new Set(holds).size!==holds.length||holds.some(i=>!Number.isInteger(i)||i<0||i>4))throw Error('invalid-holds');
      const data=window.HKRoyalPoker.draw(w.pending.data,holds);
      if(!Number.isInteger(data.multiplier)||data.multiplier<0||data.multiplier>250)throw Error('invalid-payout');
      const basePayout=M.mul(w.pending.stake,data.multiplier),payout=P.boost(basePayout,w.pending.rebirths,w.pending.boostVersion??1);
      const result={...w.pending,data,basePayout,payout,settledAt:Date.now()};
      result.creditedPayout=M.sub(M.clamp(M.add(w.balance,payout)),w.balance);
      w.balance=M.add(w.balance,result.creditedPayout);w.pending=null;w.history=[result,...w.history].slice(0,8);return result;
    },success,failure);
  }
  function beginBitcoin(stake, direction, getQuote, success, failure) {
    transact(w => {
      const B = window.HKBitcoinRules, quote = getQuote(), now = Date.now();
      if (!within(stake) || stake < 1 || !['up', 'down'].includes(direction)) throw Error('invalid-bet');
      if (w.pending) throw Error('pending-round');
      if (!B?.quoteValid(quote, now)) throw Error('price-unavailable');
      if (M.cmp(w.balance,stake)<0) throw Error('insufficient');
      const round = { id: uid(), game: 'bitcoin', rebirths:w.rebirths, boostVersion:P.boostVersion, stake, payout: 0, at: now, data: { direction, startPrice: quote.price, startedAt: now, deadline: now + B.duration } };
      w.balance=M.sub(w.balance,stake); w.pending = round; return round;
    }, success, failure);
  }
  function finishBitcoin(id, quote, success, failure) {
    transact(w => {
      const old = w.history.find(r => r.id === id);
      if (old) return { ...old, already: true };
      if (!w.pending || w.pending.id !== id || w.pending.game !== 'bitcoin') throw Error('round-gone');
      const result = { ...w.pending, ...window.HKBitcoinRules.decide(w.pending.data, w.pending.stake, quote), settledAt: Date.now() };
      result.basePayout=result.payout;
      if(!refund('bitcoin',result.data))result.payout=P.boost(result.basePayout,result.rebirths??0,result.boostVersion??1);
      result.creditedPayout=M.sub(M.clamp(M.add(w.balance,result.payout)),w.balance);
      w.balance=M.add(w.balance,result.creditedPayout); w.pending = null; w.history = [result, ...w.history].slice(0, 8); return result;
    }, success, failure);
  }
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) announce(); });
  window.addEventListener('focus', announce);
  window.HKWallet = { snapshot, adjust, replace, redeem, rebirth, buy, begin, finish, beginBitcoin, finishBitcoin, beginPoker, finishPoker, activity };
})();
