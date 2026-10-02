const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, ".."), C = require(path.join(root, "assets/ui/core.js"));
function checkCity(city, layout) {
  const cells = new Set();
  for (const b of city) for (const { x, y } of C.occupiedCells(b)) {
    assert(x >= 0 && y >= 0 && x < layout.width && y < layout.height, b.id);
    assert(!cells.has(x + "," + y), "overlap at " + x + "," + y);
    cells.add(x + "," + y);
  }
}
function page(seed = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { url: "https://historykids.github.io/#town", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function() {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.requestAnimationFrame = () => 1; w.setTimeout = () => 0;
  for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v);
  for (const p of ["data/dataset.js", "data/ancient.js", "assets/ui/core.js", "assets/ui/residents.js", "assets/ui/app.js"]) w.eval(fs.readFileSync(path.join(root, p), "utf8"));
  const click = (selector) => { const e = w.document.querySelector(selector); assert(e, selector); e.click(); };
  return { w, dom, click };
}
(async () => {
  const castle = { id: "castle", type: "castle", x: 4, y: 5, rot: 0 };
  assert(!C.canPlace([castle], 9, 9, null, "house", 0));
  assert(C.canPlace([castle], 10, 5, null, "house", 0));
  assert(!C.canPlace([], 55, 35, null, "castle", 0));
  assert(C.canPlace([], 55, 34, null, "castle", 90));
  assert(!C.canPlace([castle], 2, 5, null, "shop", 0));
  assert(C.canPlace([castle], 2, 5, null, "shop", 90));
  console.log("PASS entire footprints collide and rotated buildings fit town boundaries");

  const dense = Array.from({ length: 540 }, (_, i) => ({ id: "old-" + i, type: "castle", x: i % 30, y: Math.floor(i / 30), rot: i % 2 ? 90 : 0 }));
  const migrated = C.arrangeCity(dense, { legacy: true });
  assert.equal(migrated.city.length, dense.length);
  assert.deepEqual(migrated.city.map(b => [b.id,b.type,b.rot]), dense.map(b => [b.id,b.type,b.rot]));
  checkCity(migrated.city, migrated.layout);
  assert(migrated.layout.height > 40 && migrated.layout.height <= 360);
  console.log("PASS a fully occupied legacy town keeps every building without overlap");

  const old = [{ id: "home", type: "house", x: 3, y: 2, rot: 0 }, { id: "fort", type: "castle", x: 4, y: 2, rot: 90 }];
  const p = page({ money_v1: "300", city_v1: JSON.stringify(old), hk_residents_v1: JSON.stringify([{ id: "person", x: 7, y: 8 }]) });
  checkCity(p.w.HK.state.city, p.w.HKCore.town);
  assert.equal(p.w.HK.state.money, 300);
  assert.equal(p.w.HK.state.residents.length, 1);
  assert.equal(p.w.HK.state.residents[0].x, 22);
  assert.equal(p.w.HK.state.city.length, 2);
  const seed = {}; for (let i=0; i<p.w.localStorage.length; i++) { const k=p.w.localStorage.key(i); seed[k]=p.w.localStorage.getItem(k); }
  const restored = page(seed);
  assert.equal(JSON.stringify(restored.w.HK.state.city), JSON.stringify(p.w.HK.state.city));
  assert.equal(restored.w.HK.state.money, 300);
  assert.equal(JSON.stringify(restored.w.HK.state.residents), JSON.stringify(p.w.HK.state.residents));
  console.log("PASS old town migration persists once and never moves buildings on reload");

  const q = page({ money_v1: "300", hk_town_layout_v2: JSON.stringify({ version: 2, width: 60, height: 40 }), city_v1: JSON.stringify([{ id:"edge", type:"shop", x:57, y:5, rot:0 }]) });
  q.click('[data-rotate="edge"]'); assert.equal(q.w.HK.state.city[0].rot, 90);
  assert.equal(q.w.document.getElementById("townExtent").textContent, "60×40マス · 2,400マスの町");
  q.click("#town2d"); q.click("#shopBtn"); q.click('[data-buy="castle"]');
  q.w.HK.setCell(56, 5);
  assert(q.w.document.getElementById("placeConfirm").disabled);
  q.click("#placeConfirm"); assert.equal(q.w.HK.state.money, 300);
  q.w.HK.setCell(50, 5); q.click("#placeRotate");
  assert(!q.w.document.getElementById("placeConfirm").disabled);
  assert(q.w.document.getElementById("placementHint").textContent.includes("5×6"));
  q.click("#placeConfirm"); assert.equal(q.w.HK.state.money, 180);
  const placed = q.w.HK.state.city.find(b=>b.type==="castle");
  assert.equal(placed.rot, 90);
  assert.equal(q.w.document.querySelectorAll(".grid-cell.occupied").length, 36);
  checkCity(q.w.HK.state.city, q.w.HKCore.town);
  q.click('[data-move="edge"]'); q.w.HK.setCell(52, 8);
  assert(q.w.document.getElementById("placeConfirm").disabled);
  q.click("#placeCancel"); assert.equal(q.w.HK.state.city[0].x, 57);
  console.log("PASS purchase, move, rotation and 2D display use complete plots and charge only once");

  async function importBackup(data) {
    q.click("#settingsBtn");
    const input=q.w.document.getElementById("importFile");
    Object.defineProperty(input,"files",{ configurable:true, value:[{ size:1000, text:async()=>JSON.stringify(data) }] });
    input.dispatchEvent(new q.w.Event("change",{bubbles:true})); await new Promise(setImmediate);
  }
  const backup = { version:3, money:180, got:{}, city:JSON.parse(JSON.stringify(q.w.HK.state.city)), townLayout:{width:60,height:50}, residents:[{id:"south",x:50,y:49}] };
  await importBackup(backup);
  assert.equal(q.w.HKCore.town.height, 50);
  assert.equal(JSON.stringify(q.w.HK.state.city), JSON.stringify(backup.city));
  const before=JSON.stringify(q.w.HK.state);
  await importBackup({...backup, money:999, city:[...backup.city,{id:"overlap", type:"house",x:50,y:5,rot:0}]});
  assert.equal(JSON.stringify(q.w.HK.state), before);
  assert.equal(q.w.HKCore.town.height, 50);
  console.log("PASS new backups keep expanded land and invalid overlapping imports preserve progress");
  p.w.close(); restored.w.close(); q.w.close();
})().catch(e => { console.error(e); process.exitCode=1; });
