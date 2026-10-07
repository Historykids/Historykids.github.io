(function (root) {
  'use strict';
  const C = root.HKCore || (typeof require === 'function' ? require('./core.js') : null);
  const catalog = new Map(C.items.map(item => [item.id, item]));
  const validObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  function metrics(snapshot) {
    if (!validObject(snapshot) || !integer(snapshot.balance)) throw Error('invalid-town');
    let buildings = 0, residents = 0, buildingValue = 0, residentValue = 0, cells = 0;
    for (const group of ['buildings', 'residents']) {
      if (!validObject(snapshot[group])) throw Error('invalid-town');
      for (const [id, count] of Object.entries(snapshot[group])) {
        const item = catalog.get(id);
        if (!item || !integer(count) || (item.cat === 'resident') !== (group === 'residents')) throw Error('invalid-town');
        if (group === 'residents') { residents += count; residentValue += item.price * count; }
        else { buildings += count; buildingValue += item.price * count; cells += item.width * item.depth * count; }
      }
    }
    const assets = snapshot.balance + buildingValue + residentValue, score = assets + buildings * 20 + residents * 10;
    if (cells > C.town.width * C.town.maxHeight || residents > 100 || ![buildings, residents, buildingValue, residentValue, assets, score].every(integer)) throw Error('invalid-town');
    return { balance: snapshot.balance, buildings, residents, buildingValue, residentValue, assets, score };
  }
  function readLocal(storage, wallet) {
    if (!wallet || wallet.unavailable || !integer(wallet.balance)) throw Error('local-unavailable');
    const snapshot = { balance: wallet.balance, buildings: {}, residents: {} };
    for (const [group, key] of [['buildings', 'city_v1'], ['residents', 'hk_residents_v1']]) {
      const raw = storage.getItem(key), list = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(list)) throw Error('local-unavailable');
      const ids = new Set();
      for (const entry of list) {
        if (!validObject(entry) || !entry.id || ids.has(entry.id)) throw Error('local-unavailable');
        ids.add(entry.id);
        const type = entry.type || (group === 'residents' ? 'farmer' : '');
        snapshot[group][type] = (snapshot[group][type] || 0) + 1;
      }
    }
    return { snapshot, ...metrics(snapshot) };
  }
  function cleanName(value) {
    if (typeof value !== 'string') return '';
    return Array.from(value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 24).join('');
  }
  function sameMetrics(a, b) { return !!a && !!b && ['balance', 'buildings', 'residents', 'buildingValue', 'residentValue', 'assets', 'score'].every(key => a[key] === b[key]); }
  const rules = Object.freeze({ metrics, readLocal, cleanName, sameMetrics });
  root.HKWealthRules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
