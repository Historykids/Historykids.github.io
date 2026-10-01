const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { pathToFileURL } = require("node:url");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const R = require(path.join(root, "assets/ui/residents.js"));
let checks = 0;
function test(name, run) { run(); checks++; console.log("PASS", name); }
const city = [
  { id: "farm", type: "field", x: 3, y: 4 }, { id: "shop", type: "shop", x: 8, y: 4 },
  { id: "home", type: "house", x: 11, y: 4 }, { id: "temple", type: "temple", x: 11, y: 9 },
  { id: "castle", type: "castle", x: 8, y: 9 }, { id: "school", type: "school", x: 3, y: 9 },
  { id: "tree", type: "tree", x: 3, y: 13 },
  ...Array.from({ length: 12 }, (_, i) => ({ id: "wall" + i, type: "house", x: 6, y: i })),
];
test("farmer walks around obstacles and visits all seven kinds of destination", () => {
  const engine = R.createEngine(); engine.sync([{ id: "walker", x: 1, y: 4 }], city);
  const actions = new Set();
  for (let i = 0; i < 20000; i++) {
    const a = engine.tick(.05)[0];
    assert(a.x >= 0 && a.x < 30 && a.y >= 0 && a.y < 18);
    assert(engine.free(Math.round(a.x), Math.round(a.y)), `walked into a building at ${a.x},${a.y}`);
    if (a.phase === "act") {
      actions.add(a.action);
      if (a.target) assert.equal(Math.abs(a.x - a.target.x) + Math.abs(a.y - a.target.y), 1);
    }
  }
  for (const action of ["farm", "shop", "rest", "pray", "look", "read", "shade", "wave"]) assert(actions.has(action), action);
});
test("empty towns still have wandering and newly placed buildings update routes", () => {
  const engine = R.createEngine(); engine.sync([{ id: "empty", x: 14, y: 8 }], []);
  const before = { ...engine.snapshot()[0] };
  for (let i = 0; i < 50; i++) engine.tick(.05);
  assert(Math.hypot(engine.snapshot()[0].x - before.x, engine.snapshot()[0].y - before.y) > .1);
  const a = engine.snapshot()[0], blocked = { id: "new", type: "castle", x: Math.round(a.x), y: Math.round(a.y) };
  engine.sync([{ id: "empty", x: 14, y: 8 }], [blocked]);
  assert(engine.free(Math.round(engine.snapshot()[0].x), Math.round(engine.snapshot()[0].y)));
  engine.sync([], []); assert.equal(engine.snapshot().length, 0);
});
test("unreachable buildings are ignored and a single field still allows strolls", () => {
  const engine = R.createEngine();
  const sealed = [{ id: "sealed", type: "temple", x: 20, y: 10 }, ...[[19,10],[21,10],[20,9],[20,11]].map(([x,y], i) => ({ id: "barrier" + i, type: "tree", x, y }))];
  engine.sync([{ id: "sealed-test", x: 0, y: 0 }], sealed);
  for (let i = 0; i < 3000; i++) assert.notEqual(engine.tick(.1)[0].target?.id, "sealed");
  engine.sync([{ id: "single", x: 3, y: 3 }], [{ id: "field", type: "field", x: 3, y: 4 }]);
  let stroll = false;
  for (let i = 0; i < 2000; i++) { const a = engine.tick(.05)[0]; if (a.phase === "walk" && !a.target) stroll = true; }
  assert(stroll);
});
function page(seed = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { url: "https://historykids.github.io/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, frames = [];
  w.HTMLElement.prototype.scrollIntoView = function() {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  w.setTimeout = () => 0;
  for (const [key, value] of Object.entries(seed)) w.localStorage.setItem(key, value);
  for (const p of ["data/dataset.js", "assets/ui/core.js", "assets/ui/residents.js", "assets/ui/app.js"]) w.eval(fs.readFileSync(path.join(root, p), "utf8"));
  const click = (selector) => { const el = w.document.querySelector(selector); assert(el, selector); el.click(); };
  const advance = (start, count) => { for (let i = 0; i < count; i++) frames.shift()?.(start + i * 40); };
  return { dom, w, click, advance };
}
test("buying farmers charges ten coins each, persists, and does not create buildings", () => {
  const p = page({ money_v1: "20", city_v1: JSON.stringify([{ id: "field", type: "field", x: 3, y: 4, rot: 0 }]) });
  p.click("#shopBtn"); p.click('[data-shopcat="resident"]'); p.click('[data-buy="farmer"]');
  assert.equal(p.w.HK.state.money, 10); assert.equal(p.w.HK.state.residents.length, 1); assert.equal(p.w.HK.state.city.length, 1);
  p.click("#shopBtn"); p.click('[data-buy="farmer"]');
  assert.equal(p.w.HK.state.money, 0); assert.equal(p.w.HK.state.residents.length, 2);
  p.click("#shopBtn"); assert(p.w.document.querySelector('[data-buy="farmer"]').disabled); p.click('[data-buy="farmer"]');
  assert.equal(p.w.HK.state.residents.length, 2);
  const seed = {}; for (let i = 0; i < p.w.localStorage.length; i++) { const key = p.w.localStorage.key(i); seed[key] = p.w.localStorage.getItem(key); }
  const restored = page(seed); assert.equal(restored.w.HK.state.residents.length, 2);
  restored.dom.window.close(); p.dom.window.close();
});
test("pause freezes people, resume restarts, grid animates, and dismissal can be undone", () => {
  const p = page({ money_v1: "10" }); p.click("#shopBtn"); p.click('[data-buy="farmer"]'); p.click("#town2d");
  p.advance(0, 20); const actor = p.w.HK.residentActors[0], position = [actor.x, actor.y];
  assert.equal(p.w.document.querySelectorAll(".map-resident").length, 1);
  p.click("#residentPause"); p.advance(1000, 20);
  assert.deepEqual([actor.x, actor.y], position);
  p.click("#residentPause"); p.advance(2000, 20);
  assert(Math.hypot(actor.x - position[0], actor.y - position[1]) > 0);
  p.click("[data-dismiss-resident]"); assert.equal(p.w.HK.state.residents.length, 0);
  p.click("#undoBtn"); assert.equal(p.w.HK.state.residents.length, 1);
  p.click("#settingsBtn"); p.click("#resetRequest"); p.click("#resetConfirm"); assert.equal(p.w.HK.state.residents.length, 0);
  p.dom.window.close();
});
(async () => {
  const p = page(); p.click("#settingsBtn");
  const input = p.w.document.getElementById("importFile");
  const data = { version: 2, got: {}, money: 8, city: [], residents: [{ id: "restored", x: 4, y: 5 }] };
  Object.defineProperty(input, "files", { configurable: true, value: [{ size: 100, text: async () => JSON.stringify(data) }] });
  input.dispatchEvent(new p.w.Event("change", { bubbles: true })); await new Promise(setImmediate);
  test("backups restore farmers and reject invalid positions without losing progress", () => {
    assert.equal(p.w.HK.state.residents[0].id, "restored");
  });
  p.click("#settingsBtn"); const badInput = p.w.document.getElementById("importFile"); data.residents[0].x = 30;
  Object.defineProperty(badInput, "files", { value: [{ size: 100, text: async () => JSON.stringify(data) }] });
  badInput.dispatchEvent(new p.w.Event("change", { bubbles: true })); await new Promise(setImmediate);
  assert.equal(p.w.HK.state.residents[0].x, 4); p.dom.window.close();
  const url = pathToFileURL(path.join(root, "assets/vendor/three.module.js")).href;
  const THREE = await import(url);
  const source = fs.readFileSync(path.join(root, "assets/ui/farmer-3d.js"), "utf8").replace('from "three"', 'from "' + url + '"');
  const { createFarmer, animateFarmer, createFarmerView } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  test("3D farmer limbs move and every building routine uses the appropriate pose", () => {
    const mesh = createFarmer("pose"), actor = { x: 3, y: 4, heading: .5, elapsed: .2, phase: "walk", action: "walk" };
    animateFarmer(mesh, actor); const leg = mesh.userData.rig.leftLeg.rotation.x;
    actor.elapsed = .6; animateFarmer(mesh, actor); assert.notEqual(mesh.userData.rig.leftLeg.rotation.x, leg);
    actor.phase = "act";
    for (const action of ["farm", "shop", "rest", "pray", "look", "read", "shade", "wave"]) {
      actor.action = action; animateFarmer(mesh, actor);
      const r = mesh.userData.rig;
      assert.equal(r.hoe.visible, action === "farm"); assert.equal(r.basket.visible, action === "shop"); assert.equal(r.scroll.visible, action === "read");
      assert(Number.isFinite(new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).length()));
    }
    const scene = new THREE.Scene(), view = createFarmerView(scene); view.update([{ ...actor, id: "pose" }]);
    assert.equal(view.group.children.length, 1); view.update([]); assert.equal(view.group.children.length, 0);
  });
  console.log(checks + " farmer checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
