/* Pure helpers shared by the learning and challenge screens. */
(function (root) {
  "use strict";
  const items = [
    { id: "house", name: "家", price: 30, cat: "building", icon: "🏠" },
    { id: "shop", name: "商家", price: 40, cat: "building", icon: "🏪" },
    { id: "castle", name: "城", price: 120, cat: "building", icon: "🏯" },
    { id: "temple", name: "寺", price: 70, cat: "building", icon: "⛩️" },
    { id: "tree", name: "木", price: 8, cat: "nature", icon: "🌳" },
    { id: "field", name: "畑", price: 12, cat: "nature", icon: "🌾" },
    { id: "road", name: "道路", price: 10, cat: "infrastructure", icon: "🛣️" },
    { id: "bridge", name: "橋", price: 25, cat: "infrastructure", icon: "🌉" },
    { id: "school", name: "学校", price: 80, cat: "building", icon: "🏫" },
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
  function canPlace(city, x, y, ignore) {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      x < 30 &&
      y >= 0 &&
      y < 18 &&
      !city.some((b) => b.id !== ignore && b.x === x && b.y === y)
    );
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
    choiceAnswers,
  };
  root.HKCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
