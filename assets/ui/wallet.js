(function () {
  'use strict';
  const KEY = 'hk_wallet_v2', LIMIT = Number.MAX_SAFE_INTEGER - 1000000;
  const games = ['janken', 'roulette', 'slots'];
  const integer = n => Number.isSafeInteger(n) && n >= 0 && n <= LIMIT;
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,"0")).join("");
  function read() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (value.version !== 2 || !integer(value.balance) || !Array.isArray(value.history)) throw Error('wallet-invalid');
      if (value.pending && (!games.includes(value.pending.game) || !integer(value.pending.stake) || value.pending.stake < 1 || !integer(value.pending.payout) || value.pending.payout > value.pending.stake * 250 || typeof value.pending.id !== 'string')) throw Error('wallet-invalid');
      return value;
    }
    const legacy = Number(localStorage.getItem('money_v1') || 0);
    return { version: 2, balance: integer(legacy) ? legacy : 0, pending: null, history: [] };
  }
  function snapshot() { try { return read(); } catch { return { version: 2, balance: 0, pending: null, history: [], unavailable: true }; } }
  function announce() { window.dispatchEvent(new CustomEvent('hk-wallet-change', { detail: snapshot() })); }
  function transact(change, success = () => {}, failure = () => {}) {
    const work = () => {
      const wallet = read(), result = change(wallet);
      if (!integer(wallet.balance)) throw Error('wallet-limit');
      // The balance and any unresolved round are committed in one atomic storage value.
      localStorage.setItem(KEY, JSON.stringify(wallet));
      try { localStorage.setItem('money_v1', String(wallet.balance)); } catch { /* v2 remains authoritative. */ }
      announce();
      return result;
    };
    if (navigator.locks?.request) navigator.locks.request('historykids-wallet', work).then(success, failure);
    else { try { const result = work(); success(result); } catch (error) { failure(error); } }
  }
  function adjust(delta, success, failure) {
    transact(w => { if (!Number.isSafeInteger(delta) || !integer(w.balance + delta)) throw Error(delta < 0 ? 'insufficient' : 'wallet-limit'); w.balance += delta; return w.balance; }, success, failure);
  }
  function replace(balance, success, failure, activities = null) {
    transact(w => { if (!integer(balance)) throw Error('wallet-invalid'); w.balance = balance; w.pending = null; w.history = []; w.activities = activities; return balance; }, success, failure);
  }
  function activity(action, data, success, failure) {
    transact(w => window.HKActivities.apply(w, action, data), success, failure);
  }
  function buy(cost, valid, success, failure) {
    transact(w => {
      if (!Number.isSafeInteger(cost) || cost < 1) throw Error('invalid-cost');
      if (!valid()) throw Error('purchase-cancelled');
      if (w.balance < cost) throw Error('insufficient');
      w.balance -= cost; return w.balance;
    }, success, failure);
  }
  function begin(game, stake, draw, success, failure) {
    transact(w => {
      if (!games.includes(game) || !Number.isSafeInteger(stake) || stake < 1 || stake > 1000) throw Error('invalid-bet');
      if (w.pending) throw Error('pending-round');
      if (w.balance < stake) throw Error('insufficient');
      const outcome = draw();
      if (!integer(outcome.payout) || outcome.payout > stake * 250) throw Error('invalid-payout');
      const round = { id: uid(), game, stake, payout: outcome.payout, data: outcome.data, at: Date.now() };
      w.balance -= stake; w.pending = round;
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
      const result = { ...w.pending, settledAt: Date.now() };
      w.balance += result.payout; w.pending = null;
      w.history = [result, ...w.history].slice(0, 8);
      return result;
    }, success, failure);
  }
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) announce(); });
  window.addEventListener('focus', announce);
  window.HKWallet = { snapshot, adjust, replace, buy, begin, finish, activity };
})();
