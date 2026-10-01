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
  if (loaded.includes("assets/ui/app.js") && !loaded.includes("assets/ui/residents.js")) loaded.splice(loaded.indexOf("assets/ui/app.js"), 0, "assets/ui/residents.js");
  for (const file of loaded) w.eval(read(file));
  return dom;
}
const click = (w, selector) => {
  const el = w.document.querySelector(selector);
  assert(el, "missing " + selector);
  el.click();
  return el;
};
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
  assert(!C.canPlace([], 30, 0));
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
test("all 94 questions have answers and valid display names", () => {
  assert.equal(w.HK.records.length, 94);
  for (const r of w.HK.records) {
    assert(r.answers.length);
    assert(!r.title.includes("undefined"));
    assert(!r.title.includes("〇"));
    assert.equal(Number(r.name.split(" ")[0]), r.year);
  }
});
test("all 94 questions offer four unique choices with matching character counts", () => {
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
test("a fresh typed answer earns twenty coins and cannot be collected twice", () => {
  const typed = create("index.html", ["data/dataset.js", "assets/ui/core.js", "assets/ui/app.js"]);
  const tw = typed.window;
  click(tw, '[data-mode="type"]');
  tw.document.getElementById("answerInput").value = "えど";
  tw.document.getElementById("answerForm").dispatchEvent(new tw.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(tw.HK.state.money, 20);
  assert(tw.document.getElementById("quizFeedback").textContent.includes("＋20両"));
  click(tw, '[data-mode="choice"]');
  click(tw, '[data-answer="えど"]');
  assert.equal(tw.HK.state.money, 20);
  typed.window.close();
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
  assert(fw.document.querySelector('[data-cell="3,2"]').classList.contains("occupied"));
  assert(fw.document.querySelector('[data-cell="3,2"]').textContent.includes("🏠"));
  fw.close();
});
test("repeating a collected card gives no duplicate reward", () => {
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
  click(w, '.nav [data-view="book"]');
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
test("town accessible grid provides 540 placement cells", () => {
  click(w, "#town2d");
  assert.equal($("townGrid").querySelectorAll("[data-cell]").length, 540);
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
    "assets/ui/app.js",
  ])
    nw.eval(read(file));
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
  assert(cw.document.getElementById("era").disabled);
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
  const ranking = create("ranking.html", ["assets/ui/core.js"]);
  const rw = ranking.window;
  let query = "";
  rw.document.getElementById("period").value = "weekly";
  rw.HKCloud = {
    connect: async () => ({
      db: {
        collection(p) {
          query = p;
          return {
            orderBy() {
              return this;
            },
            limit() {
              return this;
            },
            get: async () => ({
              forEach(fn) {
                fn({
                  data: () => ({
                    name: "<img src=x onerror=alert(1)>",
                    ms: 3210,
                  }),
                });
              },
            }),
          };
        },
      },
    }),
  };
  rw.eval(read("assets/ui/ranking.js"));
  await new Promise((resolve) => setImmediate(resolve));
  test("weekly leaderboard shares the challenge week key", () => {
    assert(query.includes("/weekly/" + C.weekKey() + "/"));
    assert(!rw.document.getElementById("reload").disabled);
  });
  test("leaderboard names render as text without injecting HTML", () => {
    assert.equal(rw.document.querySelectorAll("#tbody img").length, 0);
    assert(rw.document.getElementById("tbody").textContent.includes("<img"));
    assert(rw.document.getElementById("tbody").textContent.includes("3.21秒"));
  });
  ranking.window.close();
  const offlineRank = create("ranking.html", ["assets/ui/core.js"]);
  offlineRank.window.HKCloud = {
    connect: async () => {
      throw Error("offline");
    },
  };
  offlineRank.window.console.warn = () => {};
  offlineRank.window.eval(read("assets/ui/ranking.js"));
  await new Promise((resolve) => setImmediate(resolve));
  test("offline ranking ends loading and enables retry", () => {
    assert(
      offlineRank.window.document
        .getElementById("tbody")
        .textContent.includes("読み込めません"),
    );
    assert(!offlineRank.window.document.getElementById("reload").disabled);
  });
  offlineRank.window.close();
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
