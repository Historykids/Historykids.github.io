/* Pure helpers shared by the learning and challenge screens. */
(function (root) {
  "use strict";
  const items = [
    { id: "house", name: "家", price: 30, cat: "building", icon: "🏠", width: 2, depth: 2, height: 1.4 },
    { id: "shop", name: "商家", price: 40, cat: "building", icon: "🏪", width: 3, depth: 2, height: 1.5 },
    { id: "castle", name: "城", price: 120, cat: "building", icon: "🏯", width: 6, depth: 5, height: 7 },
    { id: "temple", name: "寺", price: 70, cat: "building", icon: "⛩️", width: 4, depth: 4, height: 2.6 },
    { id: "tree", name: "木", price: 8, cat: "nature", icon: "🌳", width: 1, depth: 1, height: 1.8 },
    { id: "field", name: "畑", price: 12, cat: "nature", icon: "🌾", width: 3, depth: 2, height: .24 },
    { id: "road", name: "道路", price: 10, cat: "infrastructure", icon: "🛣️", width: 1, depth: 1, height: .12 },
    { id: "bridge", name: "橋", price: 25, cat: "infrastructure", icon: "🌉", width: 1, depth: 3, height: .6 },
    { id: "school", name: "学校", price: 80, cat: "building", icon: "🏫", width: 5, depth: 3, height: 1.7 },
    { id: "farmer", name: "農民", price: 10, cat: "resident", icon: "👨‍🌾" },
  ];
  function normalize(s) {
    return String(s)
      .normalize("NFKC")
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96))
      .trim();
  }
  function tokens(s) {
    return normalize(s)
      .split(/[\s・,，、/／]+/u)
      .filter(Boolean);
  }
  function answerOK(raw, need) {
    const user = tokens(raw).sort(),
      expected = need.map(normalize).sort();
    return (
      expected.length > 0 &&
      user.length === expected.length &&
      expected.every((v, i) => v === user[i])
    );
  }
  function esc(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function dayKey(d = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
  function weekKey(d = new Date()) {
    const a = new Date(dayKey(d) + "T00:00:00Z");
    a.setUTCDate(a.getUTCDate() + 4 - (a.getUTCDay() || 7));
    const y = a.getUTCFullYear(),
      jan = new Date(Date.UTC(y, 0, 1));
    return (
      y +
      "-W" +
      String(Math.ceil(((a - jan) / 86400000 + 1) / 7)).padStart(2, "0")
    );
  }
  function periodKey(period, d) {
    return period === "alltime" ? "ALL" : period === "weekly" ? weekKey(d) : dayKey(d);
  }
  function seededPick(a, n, seed) {
    let s = 0;
    for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b.slice(0, n);
  }
  const town = { width: 60, height: 40, minHeight: 40, maxHeight: 360, cellMetres: 4, version: 2 };
  const gridStyle = { cell: 34, gap: 2, pitch: 36 };
  function footprint(type, rot = 0) {
    if (typeof type === "object" && type) { rot = type.rot || 0; type = type.type; }
    const item = items.find((i) => i.id === type), swap = Math.abs(rot / 90) % 2 === 1;
    const width = item?.width || 1, depth = item?.depth || 1;
    return { width: swap ? depth : width, depth: swap ? width : depth };
  }
  function bounds(b) { return { x: b.x, y: b.y, ...footprint(b) }; }
  function containsCell(b, x, y) {
    const f = footprint(b);
    return x >= b.x && x < b.x + f.width && y >= b.y && y < b.y + f.depth;
  }
  function occupiedCells(b) {
    const f = footprint(b), cells = [];
    for (let y = b.y; y < b.y + f.depth; y++) for (let x = b.x; x < b.x + f.width; x++) cells.push({ x, y });
    return cells;
  }
  function inTown(x, y, f, layout = town) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + f.width <= layout.width && y + f.depth <= layout.height;
  }
  function canPlace(city, x, y, ignore, type, rot, layout = town) {
    const moving = city.find((b) => b.id === ignore), f = footprint(type || moving?.type, rot ?? moving?.rot ?? 0);
    return inTown(x, y, f, layout) && !city.some((b) => {
      if (ignore != null && b.id === ignore) return false;
      const other = footprint(b);
      return x < b.x + other.width && x + f.width > b.x && y < b.y + other.depth && y + f.depth > b.y;
    });
  }
  function findPlot(city, type, rot = 0, preferred = { x: Math.floor(town.width / 2), y: Math.floor(town.height / 2) }, ignore, layout = town) {
    const f = footprint(type, rot), blocked = new Set();
    for (const b of city) if (ignore == null || b.id !== ignore) for (const c of occupiedCells(b)) blocked.add(c.y * layout.width + c.x);
    let best = null, bestDistance = Infinity;
    for (let y = 0; y <= layout.height - f.depth; y++) for (let x = 0; x <= layout.width - f.width; x++) {
      const distance = Math.abs(x - preferred.x) + Math.abs(y - preferred.y);
      if (distance >= bestDistance) continue;
      let free = true;
      outer: for (let dy = 0; dy < f.depth; dy++) for (let dx = 0; dx < f.width; dx++) {
        if (blocked.has((y + dy) * layout.width + x + dx)) { free = false; break outer; }
      }
      if (free) { best = { x, y }; bestDistance = distance; }
    }
    return best;
  }
  function arrangeCity(city, { legacy = false, layout = { ...town } } = {}) {
    layout = { ...layout }; const arranged = []; let moved = 0;
    for (const b of city) {
      const f = footprint(b), preferred = legacy ? {
        x: Math.round(b.x + (layout.width - 30) / 2 + .5 - f.width / 2),
        y: Math.round(b.y + (town.minHeight - 18) / 2 + .5 - f.depth / 2),
      } : { x: b.x, y: b.y };
      let plot = canPlace(arranged, preferred.x, preferred.y, null, b.type, b.rot, layout) ? preferred : findPlot(arranged, b.type, b.rot, preferred, null, layout);
      while (!plot && layout.height < town.maxHeight) {
        layout.height = Math.min(town.maxHeight, layout.height + 10);
        plot = findPlot(arranged, b.type, b.rot, preferred, null, layout);
      }
      if (!plot) throw Error("Town has no room for the saved buildings");
      if (plot.x !== b.x || plot.y !== b.y) moved++;
      arranged.push({ ...b, ...plot });
    }
    return { city: arranged, layout, moved };
  }
  function validTownLayout(layout) {
    return layout && layout.width === town.width && Number.isInteger(layout.height) && layout.height >= town.minHeight && layout.height <= town.maxHeight;
  }
  // Each distractor is reviewed for the question's subject and exact reading length.
  const distractors = {
  "えど": [
    "なら",
    "みと",
    "さが"
  ],
  "おおさか": [
    "おだわら",
    "やましろ",
    "かまくら",
    "はままつ"
  ],
  "さんきん": [
    "きんばん",
    "さんけい",
    "さんせい"
  ],
  "ばら・くさ": [
    "はら・くさ",
    "ばら・ぐさ",
    "はら・ぐさ"
  ],
  "ぽるとがる": [
    "いすぱにあ",
    "でんまーく",
    "ふぃりぴん"
  ],
  "でじま": [
    "ひらど",
    "つしま",
    "さかい"
  ],
  "めいれき": [
    "げんろく",
    "てんめい",
    "あんせい",
    "てんぽう"
  ],
  "しんよしわら": [
    "さかいちょう",
    "おちゃのみず",
    "えいたいばし"
  ],
  "げんろく": [
    "かんせい",
    "めいれき",
    "てんぽう",
    "あんせい"
  ],
  "きょうほう": [
    "けいちょう",
    "えいきょう",
    "しょうほう"
  ],
  "ようしょ": [
    "こくがく",
    "らんがく",
    "じゅがく"
  ],
  "まちびけし": [
    "ひけしやく",
    "しょうぼう",
    "ばんがしら"
  ],
  "こめ": [
    "むぎ",
    "きぬ",
    "さけ"
  ],
  "たぬま": [
    "ほった",
    "みずの",
    "さかい"
  ],
  "てんめい": [
    "てんぽう",
    "げんろく",
    "かんせい",
    "あんせい"
  ],
  "かんせい": [
    "てんぽう",
    "しょうわ",
    "げんろく",
    "あんせい"
  ],
  "いこくせん": [
    "いすぱにあ",
    "ふぃりぴん",
    "でんまーく"
  ],
  "おおしおへいはちろう": [
    "まつだいらしゅんがく",
    "おおくぼひこざえもん",
    "なかむらかんざぶろう"
  ],
  "てんぽう": [
    "かんせい",
    "めいれき",
    "ぶんろく",
    "げんろく"
  ],
  "くろふね": [
    "ぐんかん",
    "なんばん",
    "じゅうき"
  ],
  "わしん": [
    "こうわ",
    "へいわ",
    "ぐんじ"
  ],
  "あんせい": [
    "かんせい",
    "げんろく",
    "てんぽう",
    "めいれき"
  ],
  "さくらだもんがい": [
    "さかしたもんがい",
    "ろくじょうがわら",
    "きょうとのごしょ"
  ],
  "たいせい": [
    "せいけん",
    "おうせい",
    "こくせい"
  ],
  "めいじ": [
    "たいか",
    "ほうじ",
    "かきつ"
  ],
  "むろまち": [
    "かまくら",
    "やましろ",
    "おおさか"
  ],
  "なんぼくちょう": [
    "むろまちばくふ",
    "かまくらばくふ",
    "とくがわばくふ"
  ],
  "きんかく": [
    "ぎんかく",
    "だいぶつ",
    "ほんどう"
  ],
  "きたやま": [
    "はくほう",
    "げんろく",
    "かんせい"
  ],
  "かんごう": [
    "なんばん",
    "しゅいん",
    "かいがい"
  ],
  "えいきょう": [
    "けいちょう",
    "きょうほう",
    "しょうほう"
  ],
  "かきつ": [
    "ほうじ",
    "めいじ",
    "わしん"
  ],
  "おうにん": [
    "めいおう",
    "げんこう",
    "しもつき"
  ],
  "やましろ": [
    "かまくら",
    "おだわら",
    "えちぜん"
  ],
  "ぎんかく": [
    "きんかく",
    "だいぶつ",
    "ほんどう"
  ],
  "めいおう": [
    "おうにん",
    "げんこう",
    "ぶんえい"
  ],
  "てっぽう": [
    "おおづつ",
    "じゅうき",
    "くろふね"
  ],
  "きりすと": [
    "じょうど",
    "りんざい",
    "にちれん"
  ],
  "いつくしま": [
    "おけはざま",
    "しずがたけ",
    "せきがはら"
  ],
  "げんぺい": [
    "なんぼく",
    "あしかが",
    "とくがわ"
  ],
  "だんのうら": [
    "いちのたに",
    "すまのうら",
    "せきがはら"
  ],
  "しゅご・じとう": [
    "こくし・ぐんじ",
    "しゅご・こくし",
    "じとう・ぐんじ"
  ],
  "かまくら": [
    "むろまち",
    "おおさか",
    "やましろ"
  ],
  "よりとも": [
    "よしつね",
    "さねとも",
    "よりいえ"
  ],
  "しっけん": [
    "かんぱく",
    "せいけん",
    "おうせい"
  ],
  "わだ": [
    "そが",
    "ゆい",
    "あべ"
  ],
  "じょうきゅう": [
    "しょうちゅう",
    "じょうりゃく",
    "しょうりゃく"
  ],
  "ごせいばいしきもく": [
    "たいほうりつりょう",
    "ようろうりつりょう",
    "みぶんとうせいれい"
  ],
  "ほうじ": [
    "かきつ",
    "えいじ",
    "にんじ"
  ],
  "だいぶつ": [
    "きんかく",
    "ぎんかく",
    "ほんどう"
  ],
  "ぶんえい": [
    "こうあん",
    "ぶんろく",
    "げんこう"
  ],
  "こうあん": [
    "ぶんえい",
    "ぶんろく",
    "めいおう"
  ],
  "とくせいれい": [
    "じょうちれい",
    "かいほうれい",
    "がっこうれい"
  ],
  "しもつき": [
    "げんこう",
    "めいおう",
    "おうにん"
  ],
  "げんこう": [
    "おうにん",
    "しもつき",
    "こうあん"
  ],
  "じょうど": [
    "にちれん",
    "りんざい",
    "そうとう",
    "じしゅう"
  ],
  "りんざい": [
    "そうとう",
    "じょうど",
    "にちれん",
    "じしゅう"
  ],
  "じしゅう": [
    "じょうど",
    "にちれん",
    "りんざい",
    "そうとう"
  ],
  "そうとう": [
    "りんざい",
    "じょうど",
    "じしゅう",
    "にちれん"
  ],
  "にちれん": [
    "じょうど",
    "りんざい",
    "そうとう",
    "じしゅう"
  ],
  "おけはざま": [
    "いつくしま",
    "しずがたけ",
    "せきがはら"
  ],
  "かわなかじま": [
    "うえだじょう",
    "ふしみじょう",
    "あづちじょう"
  ],
  "ぎふ": [
    "みの",
    "さが",
    "みと"
  ],
  "のぶなが": [
    "ひでよし",
    "いえやす",
    "みつひで"
  ],
  "あねがわ": [
    "ながしの",
    "やまざき",
    "おだわら"
  ],
  "ひえいざん": [
    "こうやさん",
    "えいへいじ",
    "ほんのうじ"
  ],
  "ながしの": [
    "あねがわ",
    "やまざき",
    "おだわら"
  ],
  "あづち": [
    "ふしみ",
    "こまき",
    "いなば"
  ],
  "ほんのうじ": [
    "ひえいざん",
    "しずがたけ",
    "いつくしま"
  ],
  "やまざき": [
    "あねがわ",
    "ながしの",
    "おだわら"
  ],
  "しずがたけ": [
    "おけはざま",
    "せきがはら",
    "いつくしま"
  ],
  "こまき・ながくて": [
    "あづち・おおさか",
    "ふしみ・やまざき",
    "さかい・おだわら"
  ],
  "かんぱく": [
    "しっけん",
    "だいじん",
    "たいこう"
  ],
  "きゅうしゅう": [
    "とうかいどう",
    "ほくりくどう",
    "とうさんどう"
  ],
  "かたながりれい": [
    "ぶけしょはっと",
    "へいのうぶんり",
    "らくいちらくざ"
  ],
  "おだわら": [
    "ながしの",
    "やまざき",
    "あねがわ"
  ],
  "みぶんとうせいれい": [
    "ごせいばいしきもく",
    "たいほうりつりょう",
    "ようろうりつりょう"
  ],
  "ぶんろく": [
    "ぶんえい",
    "こうあん",
    "げんこう"
  ],
  "けいちょう": [
    "きょうほう",
    "えいきょう",
    "しょうほう"
  ],
  "ひでよし": [
    "のぶなが",
    "いえやす",
    "みつひで"
  ],
  "せきがはら": [
    "しずがたけ",
    "おけはざま",
    "いつくしま"
  ],
  "らくいち・らくざ": [
    "らくいち・とんや",
    "らくいち・いちば",
    "かんごう・とんや"
  ],
  "たいこう": [
    "かんぱく",
    "しっけん",
    "だいじん"
  ]
};
  function choiceAnswers(record, records) {
    const correct = record.answers.join("・");
    const alternatives = (record.distractors || distractors[correct] || []).filter((a) =>
      Array.from(a).length === Array.from(correct).length && !answerOK(a, record.answers));
    if (alternatives.length < 3) throw new Error("Choices missing for " + correct);
    return seededPick([correct, ...seededPick(alternatives, 3, record.id || record.name)], 4, (record.id || record.name) + "choices");
  }
  function questionText(name) { return String(name).replace(/^-?\d+\s/, ""); }
  function dateValue(record) {
    return record.dateLabel || (record.year < 0 ? "紀元前" + Math.abs(record.year) : String(record.year));
  }
  function dateSuffix(record) { return record.dateLabel ? "" : "年"; }
  function dateText(record) { return dateValue(record) + dateSuffix(record); }
  const api = {
    eraOrder: ["jomon", "yayoi", "kofun", "asuka", "nara", "heian", "kamakura", "muromachi", "sengoku", "edo"],
    questionText,
    dateValue,
    dateSuffix,
    dateText,
    items,
    normalize,
    tokens,
    answerOK,
    esc,
    dayKey,
    weekKey,
    periodKey,
    seededPick,
    canPlace,
    town,
    gridStyle,
    footprint,
    bounds,
    containsCell,
    occupiedCells,
    findPlot,
    arrangeCity,
    validTownLayout,
    choiceAnswers,
  };
  root.HKCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
