(function () {
  'use strict';
  const W = window.HKWealthRules, $ = id => document.getElementById(id);
  const keys = {identity: 'hk_wealth_identity_v1', name: 'hk_wealth_name_v1', cache: 'hk_wealth_cache_v1'};
  const number = value => Number.isSafeInteger(value) ? value.toLocaleString('ja-JP') : '—';
  let board = null, local = null, reading = false, writing = false, lastRead = 0, epoch = 0;
  const errors = {'rate-limited': 'アクセスが集中しています。少し待って、もう一度押してね。', 'nickname': 'ランキングに使う名前を入力してね。', 'record-changed': '別の画面で記録が更新されました。最新の順位を確認してから、もう一度更新してね。', 'invalid-town': '町のデータを集計できませんでした。わたしの町で保存状態を確認してね。', 'identity-unavailable': 'このブラウザに登録情報を保存できません。ブラウザの保存設定を確認してね。'};
  function stored(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function identity(create = false) {
    const saved = stored(keys.identity);
    if (/^[a-f0-9]{64}$/.test(saved || '')) return saved;
    if (!create) return '';
    try {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(keys.identity, token);
      if (stored(keys.identity) !== token) throw Error();
      return token;
    } catch { throw Error('identity-unavailable'); }
  }
  function date(value, detailed = false) { return new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', ...(detailed ? {hour: '2-digit', minute: '2-digit'} : {})}).format(new Date(value)); }
  function message(text, error = false) { $('registrationMessage').textContent = text; $('registrationMessage').classList.toggle('error', error); }
  function controls() {
    $('registerWealth').disabled = writing || reading || !local;
    $('wealthName').disabled = writing;
    $('registerWealth').textContent = writing ? '登録しています…' : board?.own ? '最新の経済力に更新' : 'この名前で登録する';
    $('refreshWealth').disabled = reading || writing;
    $('wealthBoard').setAttribute('aria-busy', String(reading || writing));
  }
  function renderLocal() {
    try { local = W.readLocal(localStorage, window.HKWallet.snapshot()); }
    catch { local = null; }
    for (const [id, key] of [['localScore', 'score'], ['localAssets', 'assets'], ['localBuildings', 'buildings'], ['localResidents', 'residents'], ['localBalance', 'balance']]) $(id).textContent = local ? number(local[key]) : '—';
    $('ownRank').textContent = board?.own ? number(board.ownRank)+'位' : '未登録';
    $('townState').textContent = !local ? '町の保存データを読み込めませんでした。わたしの町で確認してね。' : !board?.own ? '名前を入力すれば、今の町で参加できます。' : W.sameMetrics(local, board.own) ? '今の経済力が登録されています。' : '町の状態が変わりました。最新の経済力に更新できます。';
    controls();
  }
  function renderRows() {
    const query = $('wealthSearch').value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
    const entries = (board?.entries || []).filter(entry => entry.name.normalize('NFKC').toLocaleLowerCase('ja-JP').includes(query));
    $('clearWealthSearch').hidden = !query;
    $('shownCount').textContent = board ? entries.length+'件を表示' : '';
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const row = document.createElement('tr'), own = entry.id === board?.own?.id;
      if (own) row.className = 'your-row';
      const values = [number(entry.rank), entry.name, number(entry.score)+'点', number(entry.assets)+'両', number(entry.buildings)+'個', number(entry.residents)+'人', date(entry.timestamp)];
      values.forEach((value, index) => { const cell = document.createElement('td'); cell.textContent = value; if (index === 1 && own) { const badge = document.createElement('span'); badge.className = 'your-badge'; badge.textContent = 'あなた'; cell.append(badge); } row.append(cell); });
      fragment.append(row);
    }
    $('wealthRows').replaceChildren(fragment);
    $('wealthTable').hidden = !entries.length; $('wealthEmpty').hidden = !!entries.length;
    $('emptyTitle').textContent = query ? 'この名前は見つかりませんでした' : board ? '最初の町を登録しよう' : 'ランキングを読み込めませんでした';
    $('emptyDescription').textContent = query ? '検索は上位100人が対象です。自分の順位は上のカードで確認できます。' : board ? '0両・建造物0個でも、名前だけで参加できます。' : '通信を確認して「順位を更新」を押してね。';
    $('participantCount').textContent = board ? '参加者 '+number(board.total)+'人 · 上位100人を表示 · 同点は同順位' : '上位100人を表示';
  }
  function accept(data, cached = false) {
    if (!data || !Array.isArray(data.entries) || !Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.at)) throw Error('invalid-response');
    board = data;
    if (!cached) { try { localStorage.setItem(keys.cache, JSON.stringify(data)); } catch {} }
    if (board.own && !$('wealthName').value) $('wealthName').value = board.own.name;
    $('freshness').textContent = (cached ? '保存済み ' : '更新 ')+date(data.at, true);
    $('boardStatus').textContent = cached ? '接続できないため、保存済みの順位を表示しています。' : '';
    renderRows(); renderLocal();
  }
  async function api(path, data, token) {
    const endpoint = window.HKRankingConfig?.endpoint;
    if (!endpoint) throw Error('not-configured');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(new URL(path, endpoint).href, {method: data ? 'POST' : 'GET', mode: 'cors', cache: 'no-store', signal: controller.signal, headers: {...(token ? {Authorization: 'Bearer '+token} : {}), ...(data ? {'Content-Type': 'application/json'} : {})}, ...(data ? {body: JSON.stringify(data)} : {})});
      const body = await response.json(); if (!response.ok) throw Error(body.error || 'ranking-unavailable');
      return body;
    } finally { clearTimeout(timeout); }
  }
  async function refresh() {
    if (reading || writing) return;
    reading = true; const requestEpoch = ++epoch; controls(); lastRead = Date.now();
    try { const data = await api('/wealth', null, identity()); if (requestEpoch === epoch) accept(data); }
    catch {
      if (!board) { try { const cached = JSON.parse(stored(keys.cache)); if (!identity()) cached.own = null; accept(cached, true); } catch {} }
      $('boardStatus').textContent = board ? '接続できないため、保存済みの順位を表示しています。もう一度「順位を更新」を押してね。' : 'オンラインランキングに接続できません。「順位を更新」で再接続できます。';
      if (board) $('freshness').textContent = '保存済み '+date(board.at, true);
      renderRows();
    } finally { reading = false; renderLocal(); }
  }
  $('wealthRegister').addEventListener('submit', async event => {
    event.preventDefault(); if (writing || reading) return;
    renderLocal(); const name = W.cleanName($('wealthName').value);
    if (!name) { message(errors.nickname, true); $('wealthName').focus(); return; }
    if (!local) { message(errors['invalid-town'], true); return; }
    const snapshot = local.snapshot, expectedRevision = board?.own?.revision || 0;
    writing = true; ++epoch; controls(); message('今の町をランキングに反映しています…');
    let conflict = false;
    try {
      const data = await api('/wealth/register', {name, snapshot, expectedRevision}, identity(true));
      accept(data); $('wealthName').value = data.own.name;
      try { localStorage.setItem(keys.name, data.own.name); } catch {}
      message(data.updated ? 'ランキングに反映しました！ あなたは '+number(data.ownRank)+'位です。' : '今の名前と経済力は、すでに登録されています。');
    } catch (error) { conflict = error.message === 'record-changed'; message(errors[error.message] || '登録できませんでした。通信を確認して、もう一度押してね。', true); }
    finally { writing = false; renderLocal(); }
    if (conflict) await refresh();
  });
  $('refreshWealth').addEventListener('click', refresh);
  $('wealthSearch').addEventListener('input', renderRows);
  $('clearWealthSearch').addEventListener('click', () => { $('wealthSearch').value = ''; renderRows(); $('wealthSearch').focus(); });
  window.addEventListener('hk-wallet-change', renderLocal);
  window.addEventListener('storage', event => { if (!event.key || ['city_v1', 'hk_residents_v1', 'money_v1', 'hk_wallet_v2'].includes(event.key)) renderLocal(); if (event.key === keys.identity) { board = null; renderLocal(); refresh(); } });
  window.addEventListener('focus', () => { renderLocal(); if (Date.now()-lastRead > 15000) refresh(); });
  $('wealthName').value = stored(keys.name) || '';
  renderLocal(); refresh();
})();
