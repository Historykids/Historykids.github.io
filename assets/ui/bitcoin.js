(function () {
  'use strict';
  const B = window.HKBitcoinRules, base = 'https://api.exchange.coinbase.com/products/BTC-USD';
  function createFeed(changed) {
    let quote = null, points = [], socket = null, timer = null, retry = null, stopped = true, loading = false, historyLoaded = false;
    const state = () => ({ quote, points: points.slice(), live: B.quoteValid(quote) });
    function accept(data) {
      const q = { price: Number(data.price), time: Date.parse(data.time) };
      if (!B.quoteValid(q) || (quote && q.time < quote.time)) return;
      quote = q;
      const last = points[points.length - 1];
      if (last && q.time - last.time < 500) points[points.length - 1] = q; else points.push(q);
      points = points.filter(p => p.time > Date.now() - 1800000).slice(-1600);
      changed(state());
    }
    async function json(url) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 6500);
      try { const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' }); if (!response.ok) throw Error('market-unavailable'); return await response.json(); }
      finally { clearTimeout(timeout); }
    }
    async function poll() {
      if (stopped || loading || (quote && Date.now() - quote.time < 4000)) return;
      loading = true;
      try { const data = await json(base + '/ticker'); if (!stopped) accept(data); } catch { if (!stopped) changed(state()); }
      finally { loading = false; }
    }
    async function history() {
      try {
        const rows = await json(base + '/candles?granularity=60');
        if (stopped || !Array.isArray(rows)) return;
        // Candle closes are historical chart points only, never settlement quotes.
        const past = rows.map(r => ({ time: (Number(r[0]) + 60) * 1000, price: Number(r[4]) })).filter(p => Number.isFinite(p.price) && p.price > 0 && p.time < Date.now() - 60000 && p.time > Date.now() - 1800000);
        points = [...past, ...points].sort((a, b) => a.time - b.time).slice(-1600); historyLoaded = true; changed(state());
      } catch { /* Live quotes remain usable if historical candles are unavailable. */ }
    }
    function connect() {
      if (stopped) return;
      try {
        const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com'); socket = ws;
        ws.onopen = () => { if (stopped || socket !== ws) return; ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] })); };
        ws.onmessage = e => { if (stopped || socket !== ws) return; try { const data = JSON.parse(e.data); if (data.type === 'ticker' && data.product_id === 'BTC-USD') accept(data); } catch { /* Ignore unsupported packets. */ } };
        ws.onerror = () => ws.close();
        ws.onclose = () => { if (!stopped && socket === ws) { socket = null; retry = setTimeout(connect, 10000); } };
      } catch { retry = setTimeout(connect, 10000); }
    }
    return {
      state,
      start() { if (!stopped) return; stopped = false; connect(); poll(); if (!historyLoaded) history(); timer = setInterval(() => { poll(); changed(state()); }, 2000); },
      stop() { stopped = true; clearInterval(timer); clearTimeout(retry); socket?.close(); socket = null; }
    };
  }
  function draw(canvas, points, round) {
    const width = canvas.clientWidth || 650, height = 270, dpr = Math.min(window.devicePixelRatio || 1, 2), ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height);
    const left = 12, right = width - 84, top = 18, bottom = height - 30, visible = points.filter(p => p.time > Date.now() - 1800000);
    if (!visible.length) return;
    const prices = visible.map(p => p.price); if (round) prices.push(round.data.startPrice);
    let lo = Math.min(...prices), hi = Math.max(...prices); const pad = Math.max((hi - lo) * .18, hi * .0001); lo -= pad; hi += pad;
    const start = Math.min(visible[0].time, Date.now() - 180000), end = Date.now(), x = t => left + (t - start) / Math.max(1, end - start) * (right - left), y = p => bottom - (p - lo) / (hi - lo) * (bottom - top);
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#8da9a2'; ctx.strokeStyle = 'rgba(157,191,179,.12)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const price = lo + (hi - lo) * i / 4, yy = y(price); ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); ctx.fillText('$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 }), right + 8, yy + 4); }
    const gradient = ctx.createLinearGradient(0, top, 0, bottom); gradient.addColorStop(0, 'rgba(86,221,177,.26)'); gradient.addColorStop(1, 'rgba(86,221,177,0)');
    ctx.beginPath(); visible.forEach((p, i) => i ? ctx.lineTo(x(p.time), y(p.price)) : ctx.moveTo(x(p.time), y(p.price))); ctx.lineTo(x(visible[visible.length - 1].time), bottom); ctx.lineTo(x(visible[0].time), bottom); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath(); visible.forEach((p, i) => i ? ctx.lineTo(x(p.time), y(p.price)) : ctx.moveTo(x(p.time), y(p.price))); ctx.strokeStyle = '#67e5b7'; ctx.lineWidth = 2; ctx.stroke();
    if (round) { ctx.setLineDash([5, 5]); ctx.strokeStyle = '#e6bd71'; ctx.beginPath(); ctx.moveTo(left, y(round.data.startPrice)); ctx.lineTo(right, y(round.data.startPrice)); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = '#8da9a2'; ctx.fillText(new Date(start).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }), left, height - 8); ctx.fillText('現在', right - 25, height - 8);
  }
  window.HKBitcoin = { createFeed, draw };
})();
