(function (root) {
  'use strict';
  const duration = 60000, grace = 15000, freshness = 15000;
  function quoteValid(q, now = Date.now()) {
    return !!q && Number.isFinite(q.price) && q.price > 0 && Number.isSafeInteger(q.time) && q.time > 0 && q.time <= now + 5000 && now - q.time <= freshness;
  }
  function validRound(r) {
    return !!r && ['up', 'down'].includes(r.direction) && Number.isFinite(r.startPrice) && r.startPrice > 0 && Number.isSafeInteger(r.startedAt) && r.startedAt > 0 && r.deadline === r.startedAt + duration;
  }
  function decide(r, stake, quote, now = Date.now()) {
    if (!validRound(r)) throw Error('invalid-bitcoin-round');
    if (now < r.deadline) throw Error('bitcoin-open');
    // Only a fresh trade just after the fixed deadline may determine the result.
    if (quoteValid(quote, now) && quote.time >= r.deadline && quote.time <= r.deadline + grace && now <= r.deadline + grace) {
      const difference = quote.price - r.startPrice, tie = difference === 0, win = !tie && (r.direction === 'up' ? difference > 0 : difference < 0);
      return { payout: stake * (tie ? 1 : win ? 2 : 0), data: { ...r, endPrice: quote.price, quoteTime: quote.time, refunded: false, title: tie ? '同じ価格。掛け金を返しました。' : win ? '予想的中！払い戻し2倍。' : '今回は予想が外れました。' } };
    }
    if (now >= r.deadline + grace) return { payout: stake, data: { ...r, refunded: true, title: '判定価格を取得できず、両を返しました。' } };
    throw Error('bitcoin-waiting');
  }
  const api = { duration, grace, freshness, quoteValid, validRound, decide };
  root.HKBitcoinRules = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
