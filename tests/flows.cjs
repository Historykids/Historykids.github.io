const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, ".."),
  read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const C = require(path.join(root, "assets/ui/core.js"));
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS", name);
}
function create(page, scripts, seed = {}) {
  const dom = new JSDOM(read(page), {
    url: "https://historykids.github.io/" + (page === "index.html" ? "" : page),
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.URL.createObjectURL = () => "blob:test";
  w.URL.revokeObjectURL = () => {};
  for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v);
  const loaded = scripts.slice();
  if (loaded.includes("assets/ui/app.js") && !loaded.includes("assets/ui/wallet.js")) loaded.splice(loaded.indexOf("assets/ui/app.js"), 0, "assets/ui/wallet.js");
  if (loaded.includes("assets/ui/app.js") && !loaded.includes("assets/ui/residents.js")) loaded.splice(loaded.indexOf("assets/ui/app.js"), 0, "assets/ui/residents.js");
  if (loaded.includes("assets/ui/challenge.js")) loaded.splice(loaded.indexOf("assets/ui/challenge.js"), 0, "assets/ui/leaderboard.js");
  for (const file of loaded) { w.eval(read(file)); if (file === "data/dataset.js") w.eval(read("data/ancient.js")); }
  return dom;
}
const click = (w, selector) => {
  const el = w.document.querySelector(selector);
  assert(el, "missing " + selector);
  el.click();
  return el;
};
test("privacy opens from the footer and contact dialog, closes the overlay and preserves learning records",()=>{
  const d=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],{money_v1:"40"}),w=d.window,g=id=>w.document.getElementById(id);w.scrollTo=()=>{};
  const before=JSON.stringify(w.HK.state);click(w,".page-footer [data-privacy-link]");assert.equal(w.location.hash,"#privacy");assert(!g("view-privacy").hidden);assert(g("eraSection").hidden);assert(g("missionBar").hidden);assert(g("view-learn").hidden);assert.equal(JSON.stringify(w.HK.state),before);
  click(w,"[data-contact-open]");assert(g("dialog").open);const form=g("dialogBody").querySelector('a[href^="https://docs.google.com/forms/"]');assert(form);assert.equal(form.target,"_blank");
  click(w,"#dialog [data-privacy-link]");assert(!g("dialog").open);assert(!g("view-privacy").hidden);click(w,'#view-privacy [data-view="learn"]');assert(!g("view-learn").hidden);assert.equal(w.location.hash,"#learn");assert.equal(JSON.stringify(w.HK.state),before);w.close();
});
test("strict answer matching, separators and katakana", () => {
  assert(C.answerOK("シユゴ", ["しゆご"]));
  assert(C.answerOK("ジトウ ／ シュゴ", ["しゅご", "じとう"]));
  assert(!C.answerOK("えど かまくら", ["えど"]));
  assert(!C.answerOK("しゅご", ["しゅご", "じとう"]));
  assert(!C.answerOK("えど", ["えど", "えど"]));
});
test("Japanese dates and ISO week boundaries", () => {
  assert.equal(C.dayKey(new Date("2026-10-01T16:00:00Z")), "2026-10-02");
  assert.equal(C.weekKey(new Date("2021-01-01T00:00:00Z")), "2020-W53");
  assert.equal(C.weekKey(new Date("2026-10-01T00:00:00Z")), "2026-W40");
});
test("placement rejects overlap and out-of-bounds", () => {
  assert(!C.canPlace([{ id: "a", x: 2, y: 2 }], 2, 2));
  assert(C.canPlace([{ id: "a", x: 2, y: 2 }], 2, 2, "a"));
  assert(!C.canPlace([], 60, 0));
  assert(!C.canPlace([], 0, -1));
  assert(!C.canPlace([], 2.5, 2));
});
const dom = create("index.html", [
    "data/dataset.js",
    "assets/ui/core.js",
    "assets/ui/app.js",
  ]),
  w = dom.window,
  $ = (id) => w.document.getElementById(id);
test("previous question resets unsolved inputs and skips questions just solved", () => {
  const d=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"]),v=d.window,g=id=>v.document.getElementById(id);
  assert(g("prevBtn").disabled);const first=g("qTitle").textContent;
  click(v, '#nextBtn');const second=g("qTitle").textContent;assert(!g("prevBtn").disabled);assert.notEqual(second,first);
  click(v, '[data-mode="type"]');g("answerInput").value="途中の入力";
  click(v, '#prevBtn');assert.equal(g("qTitle").textContent,first);assert(g("prevBtn").disabled);assert.equal(g("answerInput").value,"");
  click(v, '[data-mode="type"]');g("answerInput").value="えど";g("answerForm").dispatchEvent(new v.Event("submit",{bubbles:true,cancelable:true}));
  const earned=v.HK.state.money;click(v, '#nextBtn');assert.equal(g("qTitle").textContent,second);assert(g("prevBtn").disabled);
  click(v, '#nextBtn');g("answerInput").value="途中の入力";click(v, '#prevBtn');
  assert.equal(g("qTitle").textContent,second);assert.equal(g("answerInput").value,"");assert(g("quizFeedback").hidden);assert(!g("answerInput").disabled);
  const solved=v.document.querySelector('#collection .history-card.done');solved.click();click(v, '[data-practice]');assert.equal(g("qTitle").textContent,first);assert(g("prevBtn").disabled);
  g("answerInput").value="えど";g("answerForm").dispatchEvent(new v.Event("submit",{bubbles:true,cancelable:true}));assert.equal(v.HK.state.money,earned);
  click(v, '#nextBtn');assert.equal(g("qTitle").textContent,second);d.window.close();
});
test("all 202 questions have answers and valid display names", () => {
  assert.equal(w.HK.records.length, 202);
  for (const r of w.HK.records) {
    assert(r.answers.length);
    assert(!r.title.includes("undefined"));
    assert(!r.title.includes("〇"));
    assert.equal(Number(r.name.split(" ")[0]), r.year);
  }
});
test("all 202 questions offer four unique choices with matching character counts", () => {
  for (const r of w.HK.records) {
    const choices = C.choiceAnswers(r, w.HK.records);
    assert.equal(choices.length, 4, r.id);
    assert.equal(new Set(choices).size, 4, r.id);
    assert.equal(choices.filter((a) => C.answerOK(a, r.answers)).length, 1, r.id);
    for (const choice of choices) {
      assert.equal([...choice].length, [...r.answers.join("・")].length, r.id);
      assert.deepEqual(choice.split("・").map((a) => [...a].length), Array.from(r.answers, (a) => [...a].length), r.id);
    }
  }
});
test("all ten eras show only unsolved questions in order and complete immediately after the last correct answer", () => {
  const seed = {money_v1: "300"}, byEra = {};
  for (const era of w.HKCore.eraOrder) {
    const ordered = w.HK.records.filter(r => r.era === era).sort((a,b) => a.year-b.year);
    byEra[era] = ordered;
    seed[w.dataSets[era].LS_KEY] = JSON.stringify(Object.fromEntries(ordered.filter((r,i) => ![1,4,ordered.length-1].includes(i)).map(r => [r.name,true])));
  }
  const d = create("index.html", ["data/dataset.js","assets/ui/core.js","assets/ui/app.js"], seed), v=d.window, g=id=>v.document.getElementById(id);
  const prompt = r => assert.equal(g("qTitle").innerHTML, v.dataSets[r.era].ruby[r.name] || r.question);
  const type = r => {click(v,'[data-mode="type"]');g("answerInput").value=r.answers.join("・");g("answerForm").dispatchEvent(new v.Event("submit",{bubbles:true,cancelable:true}));};
  let money=300;
  for (const era of v.HKCore.eraOrder) {
    const rows=byEra[era];click(v,`[data-era="${era}"]`);
    assert.equal(g("practiceFilter").value,"new");prompt(rows[1]);assert(g("prevBtn").disabled);
    click(v,'#nextBtn');prompt(rows[4]);click(v,'#prevBtn');prompt(rows[1]);
    type(rows[1]);money+=20;assert.equal(v.HK.state.money,money);
    click(v,'#nextBtn');prompt(rows[4]);assert(g("prevBtn").disabled);
    click(v,'#nextBtn');prompt(rows.at(-1));click(v,'#prevBtn');prompt(rows[4]);
    click(v,'[data-mode="choice"]');click(v,`#choices [data-answer="${rows[4].answers.join("・")}"]`);money+=10;
    click(v,'#nextBtn');prompt(rows.at(-1));type(rows.at(-1));money+=20;
    assert.equal(g("qTitle").textContent,"すべての問題を正解しました！",era);
    assert(g("qInstruction").textContent.includes("下の時代カードをタップ"));
    assert(g("choices").hidden && g("answerForm").hidden && g("quizPanel").querySelector(".answer-mode").hidden);
    assert(g("prevBtn").disabled && g("nextBtn").disabled);assert.equal(v.HK.state.money,money);
    assert.equal(g("collection").querySelectorAll(".done").length,rows.length);
    click(v,'#collection .done');click(v,'[data-practice]');prompt(rows[0]);
    assert.equal(g("qCount").textContent,"カードから解き直し");assert(g("prevBtn").disabled);
    g("answerInput").value="まちがい";g("answerForm").dispatchEvent(new v.Event("submit",{bubbles:true,cancelable:true}));
    assert.equal(g("wrongCount").textContent,"0");type(rows[0]);assert.equal(v.HK.state.money,money);
    click(v,'#nextBtn');assert.equal(g("qTitle").textContent,"すべての問題を正解しました！");
  }
  const saved=Object.fromEntries(Object.keys(v.localStorage).map(k=>[k,v.localStorage.getItem(k)]));
  const reloaded=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],saved);
  for (const era of reloaded.window.HKCore.eraOrder) {click(reloaded.window,`[data-era="${era}"]`);assert.equal(reloaded.window.document.getElementById("qTitle").textContent,"すべての問題を正解しました！");}
  assert.equal(reloaded.window.HK.state.money,money);reloaded.window.close();v.close();
});
test("skipped questions remain available and mode changes never reopen a solved normal question", () => {
  const rows=w.HK.records.filter(r=>r.era==="edo").sort((a,b)=>a.year-b.year);
  const seed={[w.dataSets.edo.LS_KEY]:JSON.stringify(Object.fromEntries(rows.filter((r,i)=>![1,rows.length-1].includes(i)).map(r=>[r.name,true])))};
  const d=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],seed),v=d.window,g=id=>v.document.getElementById(id);
  click(v,'#nextBtn');click(v,'[data-mode="type"]');g("answerInput").value=rows.at(-1).answers.join("・");g("answerForm").dispatchEvent(new v.Event("submit",{bubbles:true,cancelable:true}));
  assert(!g("quizPanel").classList.contains("quiz-complete"));click(v,'[data-mode="choice"]');
  assert.equal(g("qTitle").innerHTML,v.dataSets.edo.ruby[rows[1].name]);assert(g("prevBtn").disabled);
  click(v,'#nextBtn');assert.equal(g("qTitle").innerHTML,v.dataSets.edo.ruby[rows[1].name]);
  click(v,'.nav [data-view="timeline"]');click(v,`[data-detail="${rows[0].id}"]`);
  assert(!v.document.querySelector('[data-practice]'));click(v,'#dialogClose');v.close();
});
test("review excludes historically solved questions and selecting an era resets to the unsolved queue", () => {
  const rows=w.HK.records.filter(r=>r.era==="edo").sort((a,b)=>a.year-b.year);
  const seed={[w.dataSets.edo.LS_KEY]:JSON.stringify({[rows[0].name]:true}),hk_wrong_v2:JSON.stringify({[rows[0].id]:true,[rows[1].id]:true})};
  const d=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],seed),v=d.window,g=id=>v.document.getElementById(id);
  assert.equal(g("wrongCount").textContent,"1");click(v,'#reviewBtn');assert.equal(g("qTitle").innerHTML,v.dataSets.edo.ruby[rows[1].name]);
  click(v,`#choices [data-answer="${rows[1].answers.join("・")}"]`);click(v,'#nextBtn');
  assert.equal(g("qTitle").textContent,"復習する問題はありません。");assert(!g("quizPanel").classList.contains("quiz-complete"));
  click(v,'[data-era="edo"]');assert.equal(g("practiceFilter").value,"new");assert.equal(g("qTitle").innerHTML,v.dataSets.edo.ruby[rows[2].name]);v.close();
});
test("a failed coin save keeps the final question unsolved and available to retry", () => {
  const rows=w.HK.records.filter(r=>r.era==="edo").sort((a,b)=>a.year-b.year), last=rows.at(-1);
  const seed={[w.dataSets.edo.LS_KEY]:JSON.stringify(Object.fromEntries(rows.slice(0,-1).map(r=>[r.name,true])))};
  const d=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],seed),v=d.window,g=id=>v.document.getElementById(id);
  const adjust=v.HKWallet.adjust;v.HKWallet.adjust=(delta,success,failure)=>failure(Error("storage full"));
  click(v,`#choices [data-answer="${last.answers.join("・")}"]`);
  assert(!v.HK.state.got.edo[last.name]);assert.equal(v.HK.state.money,0);assert(!g("saveWarning").hidden);
  assert(!g("quizPanel").classList.contains("quiz-complete"));assert.equal(g("qTitle").innerHTML,v.dataSets.edo.ruby[last.name]);
  v.HKWallet.adjust=adjust;click(v,`#choices [data-answer="${last.answers.join("・")}"]`);assert.equal(v.HK.state.money,10);assert(g("quizPanel").classList.contains("quiz-complete"));v.close();
});
test("a fresh typed answer earns twenty coins and cannot be collected twice", () => {
  const typed = create("index.html", ["data/dataset.js", "assets/ui/core.js", "assets/ui/app.js"]);
  const tw = typed.window;
  click(tw, '[data-mode="type"]');
  tw.document.getElementById("answerInput").value = "えど";
  tw.document.getElementById("answerForm").dispatchEvent(new tw.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(tw.HK.state.money, 20);
  assert(tw.document.getElementById("quizFeedback").textContent.includes("＋20両"));
  click(tw, '#collection .history-card.done');
  click(tw, '[data-practice]');
  click(tw, '[data-mode="choice"]');
  click(tw, '[data-answer="えど"]');
  assert.equal(tw.HK.state.money, 20);
  typed.window.close();
});
test("the small help footer opens a code form and adds exactly 100 coins without duplicate submissions", () => {
  const d=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],{money_v1:"35"}),v=d.window,g=id=>v.document.getElementById(id);
  assert.equal(v.document.querySelector('#view-howto').lastElementChild.querySelector('button').textContent,"コードを入力");
  click(v,'#redeemCodeBtn');assert(g("dialog").open);g("redeemCodeInput").value="1941";
  const submit=()=>g("redeemCodeForm").dispatchEvent(new v.Event("submit",{bubbles:true,cancelable:true}));
  submit();assert.equal(v.HK.state.money,35);assert(g("redeemCodeStatus").textContent.includes("コードが違う"));
  const adjust=v.HKWallet.adjust;let finish,calls=0;
  v.HKWallet.adjust=(amount,success,failure)=>{calls++;finish=()=>adjust(amount,success,failure);};
  g("redeemCodeInput").value="1940";submit();submit();assert.equal(calls,1);assert.equal(v.HK.state.money,35);
  finish();assert.equal(v.HK.state.money,135);assert(g("redeemCodeStatus").textContent.includes("100両ゲット"));submit();assert.equal(calls,1);
  const saved=Object.fromEntries(Object.keys(v.localStorage).map(k=>[k,v.localStorage.getItem(k)]));
  const again=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],saved);assert.equal(again.window.HK.state.money,135);again.window.close();v.close();
});
test("a failed code reward leaves coins intact and allows retry", () => {
  const d=create("index.html",["data/dataset.js","assets/ui/core.js","assets/ui/app.js"],{money_v1:"12"}),v=d.window,g=id=>v.document.getElementById(id);
  click(v,'#redeemCodeBtn');g("redeemCodeInput").value="1940";
  const adjust=v.HKWallet.adjust;v.HKWallet.adjust=(amount,success,failure)=>failure(Error("storage unavailable"));
  const submit=()=>g("redeemCodeForm").dispatchEvent(new v.Event("submit",{bubbles:true,cancelable:true}));submit();assert.equal(v.HK.state.money,12);assert(!g("redeemCodeInput").disabled);assert(g("redeemCodeStatus").textContent.includes("保存できません"));
  v.HKWallet.adjust=adjust;submit();assert.equal(v.HK.state.money,112);v.close();
});
test("first quiz awards exactly one card and ten coins", () => {
  click(w, '[data-answer="えど"]');
  assert.equal(w.HK.state.money, 10);
  assert.equal($("eraGot").textContent, "1");
  assert(!$("quizFeedback").hidden);
  click(w, '[data-answer="えど"]');
  assert.equal(w.HK.state.money, 10);
});
test("town automatically shows saved buildings on the grid when 3D is unavailable", () => {
  const fallback = create("index.html", ["data/dataset.js", "assets/ui/core.js", "assets/ui/app.js"], {
    city_v1: JSON.stringify([{ id: "saved", type: "house", x: 3, y: 2, rot: 0 }]),
  });
  const fw = fallback.window;
  fw.setTimeout = (callback, delay) => { if (delay === 1500) callback(); return 0; };
  click(fw, '.nav [data-view="town"]');
  assert(!fw.document.getElementById("townGrid").hidden);
  assert(fw.document.getElementById("townCanvas").hidden);
  assert.equal(fw.document.getElementById("town3d").getAttribute("aria-pressed"), "false");
  const saved = fw.HK.state.city[0];
  assert(fw.document.querySelector(`[data-cell="${saved.x},${saved.y}"]`).classList.contains("occupied"));
  assert(fw.document.querySelector('[data-building="saved"]').textContent.includes("🏠"));
  fw.close();
});
test("repeating a collected card gives no duplicate reward", () => {
  click(w, '#collection .history-card.done');
  click(w, '[data-practice]');
  click(w, '[data-mode="type"]');
  $("answerInput").value = "えど";
  $("answerForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal(w.HK.state.money, 10);
});
test("wrong answer enters review list and correct answer clears it", () => {
  click(w, "#nextBtn");
  $("answerInput").value = "まちがい";
  $("answerForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal($("wrongCount").textContent, "1");
  click(w, "#reviewBtn");
  assert.equal($("practiceFilter").value, "wrong");
  $("answerInput").value = "おおさか";
  $("answerForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal($("wrongCount").textContent, "0");
  assert.equal(w.HK.state.money, 30);
});
test("book search, state filters and timeline navigation", () => {
  click(w, '.nav [data-view="games"]');
  click(w, '[data-view="book"]');
  $("bookSearch").value = "1603";
  $("bookSearch").dispatchEvent(new w.Event("input"));
  assert.equal($("bookGrid").querySelectorAll("[data-card]").length, 1);
  $("cardFilter").value = "new";
  $("cardFilter").dispatchEvent(new w.Event("change"));
  assert($("bookGrid").textContent.includes("見つからなかった"));
  click(w, '.nav [data-view="timeline"]');
  assert.equal($("timeline").querySelectorAll("[data-detail]").length, 26);
});
test("shop cancel never charges; committed placement charges once", () => {
  click(w, "#walletBtn");
  click(w, '[data-buy="tree"]');
  assert.equal(w.HK.state.money, 30);
  click(w, "#placeCancel");
  assert.equal(w.HK.state.money, 30);
  click(w, "#shopBtn");
  click(w, '[data-buy="tree"]');
  w.HK.setCell(3, 4);
  click(w, "#placeConfirm");
  assert.equal(w.HK.state.money, 22);
  assert.equal(w.HK.state.city.length, 1);
  assert.equal(w.HK.state.city[0].x, 3);
});
test("occupied cells disable confirmation without charging", () => {
  click(w, "#shopBtn");
  click(w, '[data-buy="tree"]');
  w.HK.setCell(3, 4);
  assert($("placeConfirm").disabled);
  click(w, "#placeConfirm");
  assert.equal(w.HK.state.money, 22);
  click(w, "#placeCancel");
});
test("building movement, rotation, deletion and undo", () => {
  click(w, "[data-move]");
  w.HK.setCell(5, 6);
  click(w, "#placeConfirm");
  assert.equal(w.HK.state.city[0].x, 5);
  click(w, "[data-rotate]");
  assert.equal(w.HK.state.city[0].rot, 90);
  click(w, "[data-delete]");
  assert.equal(w.HK.state.city.length, 0);
  click(w, "#undoBtn");
  assert.equal(w.HK.state.city.length, 1);
  assert.equal(w.HK.state.city[0].rot, 90);
});
test("town accessible grid provides 2400 placement cells", () => {
  click(w, "#town2d");
  assert.equal($("townGrid").querySelectorAll("[data-cell]").length, 2400);
});
test("saved progress survives recreation and legacy corrections migrate", () => {
  const seed = {};
  for (let i = 0; i < w.localStorage.length; i++) {
    const k = w.localStorage.key(i);
    seed[k] = w.localStorage.getItem(k);
  }
  seed.cards_kamakura_complete_v1 = JSON.stringify({
    "1305 〇〇〇〇騒動": true,
  });
  const next = create(
    "index.html",
    ["data/dataset.js", "assets/ui/core.js", "assets/ui/app.js"],
    seed,
  );
  assert.equal(next.window.HK.state.money, 22);
  assert.equal(next.window.HK.state.city.length, 1);
  assert(next.window.HK.state.got.kamakura["1285 〇〇〇〇騒動"]);
  next.window.close();
});
test("reset requires confirmation; cancel preserves progress", () => {
  click(w, "#settingsBtn");
  click(w, "#resetRequest");
  assert.equal(w.HK.state.money, 22);
  click(w, "#resetCancel");
  assert.equal(w.HK.state.money, 22);
  click(w, "#resetRequest");
  click(w, "#resetConfirm");
  assert.equal(w.HK.state.money, 0);
  assert.equal(w.HK.state.city.length, 0);
  assert.equal($("allGot").textContent, "0");
});
test("missing storage displays warning without preventing learning", () => {
  const next = new JSDOM(read("index.html"), {
      url: "https://historykids.github.io/",
      runScripts: "outside-only",
    }),
    nw = next.window;
  nw.HTMLElement.prototype.scrollIntoView = function () {};
  nw.Storage.prototype.setItem = function () {
    throw Error("denied");
  };
  for (const file of [
    "data/dataset.js",
    "assets/ui/core.js",
    "assets/ui/wallet.js",
    "assets/ui/app.js",
  ])
    { nw.eval(read(file)); if (file === "data/dataset.js") nw.eval(read("data/ancient.js")); }
  assert(!nw.document.getElementById("saveWarning").hidden);
  assert(nw.document.querySelector('[data-answer="えど"]'));
  next.window.close();
});
const challenge = create("buzzer.html", [
    "data/dataset.js",
    "assets/ui/core.js",
    "assets/ui/challenge.js",
  ]),
  cw = challenge.window;
test("challenge works without Firebase and locks settings during countdown", () => {
  click(cw, "#startBtn");
  assert.equal(cw.HKChallenge.run.qs.length, 10);
  assert.equal(cw.HKChallenge.run.phase, "countdown");
  assert(cw.document.querySelector("[data-game]").disabled);
});
test("ten buzzer answers finish, prevent double advance and save best", () => {
  let now = cw.HKChallenge.run.start + 10;
  Object.defineProperty(cw.performance, "now", { value: () => now });
  cw.HKChallenge.tick();
  for (let i = 0; i < 10; i++) {
    const q = cw.HKChallenge.run.qs[cw.HKChallenge.qi];
    click(cw, "#buzzBtn");
    const choice = [...cw.document.querySelectorAll("[data-choice]")].find((b) => C.answerOK(b.dataset.choice, q.answers));
    choice.click(); now += 250;
    if (i < 9) {
      click(cw, "#nextBtn"); const count = cw.HKChallenge.qi;
      click(cw, "#nextBtn"); assert.equal(cw.HKChallenge.qi, count);
    }
  }
  assert(cw.HKChallenge.resultMs > 0);
  assert(!cw.document.getElementById("resultBox").hidden);
  assert(cw.localStorage.getItem(cw.HKChallenge.run.scoreKey));
});
dom.window.close();
challenge.window.close();
console.log(checks + " checks passed.");

(async function extraChecks() {
  const backup = create("index.html", [
    "data/dataset.js",
    "assets/ui/core.js",
    "assets/ui/app.js",
  ]);
  const bw = backup.window;
  click(bw, "#settingsBtn");
  const input = bw.document.getElementById("importFile");
  const record = {
    version: 2,
    money: 50,
    city: [{ id: "restored", type: "tree", x: 4, y: 4, rot: 90 }],
    got: { edo: { "1603 〇〇幕府がはじまる": true } },
    wrong: {},
    ruby: false,
    era: "edo",
  };
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{ size: 100, text: async () => JSON.stringify(record) }],
  });
  input.dispatchEvent(new bw.Event("change", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  test("backup import restores cards, money, town and reading settings", () => {
    assert.equal(bw.HK.state.money, 50);
    assert.equal(bw.HK.state.city.length, 1);
    assert.equal(bw.HK.state.city[0].rot, 90);
    assert.equal(bw.HK.state.ruby, false);
    assert(bw.HK.state.got.edo["1603 〇〇幕府がはじまる"]);
  });
  click(bw, "#settingsBtn");
  const bad = bw.document.getElementById("importFile");
  record.city.push({ id: "conflict", type: "house", x: 4, y: 4 });
  Object.defineProperty(bad, "files", {
    value: [{ size: 100, text: async () => JSON.stringify(record) }],
  });
  bad.dispatchEvent(new bw.Event("change", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  test("invalid backup is rejected without losing existing state", () => {
    assert.equal(bw.HK.state.money, 50);
    assert.equal(bw.HK.state.city.length, 1);
    assert(
      bw.document
        .getElementById("toastText")
        .textContent.includes("読み込めません"),
    );
  });
  backup.window.close();
  test("ranking has one clear rule and a saved-best registration form", () => {
    const rank = new JSDOM(read("ranking.html"));
    assert.equal(rank.window.document.querySelectorAll("select").length, 0);
    assert(rank.window.document.getElementById("rankRegister"));
    assert(rank.window.document.getElementById("myRank"));
    rank.window.close();
  });
  test("source HTML has unique IDs and all local assets resolve", () => {
    for (const name of ["index.html", "buzzer.html", "ranking.html"]) {
      const d = new JSDOM(read(name)).window.document;
      const ids = [...d.querySelectorAll("[id]")].map((el) => el.id);
      assert.equal(new Set(ids).size, ids.length, name + " duplicate id");
      for (const el of d.querySelectorAll("script[src],link[href],img[src]")) {
        const src = el.getAttribute("src") || el.getAttribute("href");
        if (src.startsWith("./"))
          assert(fs.existsSync(path.join(root, src.split(/[?#]/)[0])), name + " " + src);
      }
    }
  });
  console.log(checks + " total checks passed.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
