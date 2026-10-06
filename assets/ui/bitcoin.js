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
      points = points.filter(p => p.time > Date.now() - 1800000).slice(-5000);
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
        const results = await Promise.allSettled([json(base + '/candles?granularity=60'), json(base + '/trades?limit=1000')]);
        if (stopped) return;
        // Historical trades and candles seed the chart only, never settlement quotes.
        const rows = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [], trades = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
        const past = rows.map(r => ({ time: (Number(r[0]) + 60) * 1000, price: Number(r[4]) })).filter(p => p.time < Date.now() - 60000);
        past.push(...trades.map(r => ({ time: Date.parse(r.time), price: Number(r.price) })));
        const merged = [...past, ...points].filter(p => Number.isFinite(p.price) && p.price > 0 && Number.isSafeInteger(p.time) && p.time > Date.now() - 1800000 && p.time <= Date.now() + 5000);
        points = [...new Map(merged.map(p => [p.time, p])).values()].sort((a, b) => a.time - b.time).slice(-5000);
        historyLoaded = results.some(r => r.status === 'fulfilled'); changed(state());
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
  function view(points, seconds = 60, round = null, now = Date.now()) {
    if (![15, 60, 300, 1800].includes(seconds)) seconds = 60;
    const start = now - seconds * 1000, visible = points.filter(p => p.time >= start && p.time <= now + 5000 && Number.isFinite(p.price) && p.price > 0);
    const prices = visible.map(p => p.price); if (round) prices.push(round.data.startPrice);
    const low = prices.length ? Math.min(...prices) : 0, high = prices.length ? Math.max(...prices) : 0, padding = Math.max((high - low) * .1, .025);
    return { points: visible, start, end: Math.max(now, visible[visible.length - 1]?.time || now), low: low - padding, high: high + padding };
  }
  function draw(canvas, points, round, seconds = 60) {
    const width = canvas.clientWidth || 650, height = 270, dpr = Math.min(window.devicePixelRatio || 1, 2), ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height);
    const left = 12, right = width - 84, top = 18, bottom = height - 30, plot = view(points, seconds, round), visible = plot.points;
    if (!visible.length) return;
    const { low: lo, high: hi, start, end } = plot, x = t => left + (t - start) / Math.max(1, end - start) * (right - left), y = p => bottom - (p - lo) / (hi - lo) * (bottom - top);
    const falling = visible[visible.length - 1].price < visible[0].price, ink = falling ? '#eea2a2' : '#67e5b7', rgb = falling ? '238,162,162' : '86,221,177';
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#8da9a2'; ctx.strokeStyle = 'rgba(157,191,179,.12)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const price = lo + (hi - lo) * i / 4, yy = y(price); ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); ctx.fillText('$' + price.toLocaleString('en-US', { maximumFractionDigits: 2 }), right + 8, yy + 4); }
    const gradient = ctx.createLinearGradient(0, top, 0, bottom); gradient.addColorStop(0, 'rgba(' + rgb + ',.3)'); gradient.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.beginPath(); visible.forEach((p, i) => i ? ctx.lineTo(x(p.time), y(p.price)) : ctx.moveTo(x(p.time), y(p.price))); ctx.lineTo(x(visible[visible.length - 1].time), bottom); ctx.lineTo(x(visible[0].time), bottom); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath(); visible.forEach((p, i) => i ? ctx.lineTo(x(p.time), y(p.price)) : ctx.moveTo(x(p.time), y(p.price))); ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.stroke();
    const last = visible[visible.length - 1]; ctx.beginPath(); ctx.arc(x(last.time), y(last.price), 4, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
    if (round) { ctx.setLineDash([5, 5]); ctx.strokeStyle = '#e6bd71'; ctx.beginPath(); ctx.moveTo(left, y(round.data.startPrice)); ctx.lineTo(right, y(round.data.startPrice)); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = '#8da9a2'; ctx.fillText(new Date(start).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), left, height - 8); ctx.fillText('現在', right - 25, height - 8);
  }
  window.HKBitcoin = { createFeed, view, draw };
})();
