import { buildTerrain, terrainPoint } from "./touge-racing-terrain.mjs?v=21";

export const LAPS = 3;
export const PAD_LENGTH = 9;
export const PAD_HALF_WIDTH = 2.35;
export const ITEM_ZONE_BEFORE = 3.5;
export const ITEM_ZONE_AFTER = 5;
export const ITEM_LANES = [-.85, -.51, -.17, .17, .51, .85];

const palettes = {
  coast: ["#395c80", "#f0aa79", "#496650", "#487d8c", "#335447", "#566658", "#d76a48"],
  sakura: ["#686e9a", "#f5b4b5", "#768466", "#668f9c", "#d98fa9", "#8b747f", "#ad514f"],
  snow: ["#546f9a", "#d4e3f4", "#c7dbe4", "#658caa", "#456777", "#8299b2", "#ad4d52"],
  forest: ["#304e63", "#e1b580", "#3e664a", "#557b7e", "#284b40", "#4c6258", "#aa6848"],
  desert: ["#71668a", "#ffd5a2", "#b48458", "#839aaa", "#77634d", "#9d6e56", "#aa5842"],
  night: ["#141e43", "#664d83", "#303745", "#344d72", "#4c5872", "#42425f", "#dd5564"],
  harbor: ["#3c6b8e", "#c7d9d4", "#737b7b", "#397f9f", "#527475", "#6c8491", "#b85c45"],
  highland: ["#3a7690", "#e9d9a2", "#84945e", "#6395a2", "#496945", "#688075", "#93624f"],
  volcano: ["#59465d", "#ed8858", "#70534a", "#6d617d", "#544c48", "#644854", "#bd553f"],
  castle: ["#425786", "#efbb83", "#637959", "#607c89", "#3f654f", "#687462", "#b5553b"]
};

const courses = [
  ["yunagi", "夕凪峠", "海沿いを走る、入りやすい高速コース。", "初級", "coast", 7.2,
    [[-51,69],[-4,70],[52,76],[86,60],[98,26],[86,-9],[58,-45],[30,-43],[4,-62],[-33,-79],[-73,-65],[-103,-32],[-107,15],[-89,49]]],
  ["sakura", "桜の川沿い", "桜並木の先に、ゆるいS字が続く。", "初級", "sakura", 7.8,
    [[-70,66],[-24,61],[20,70],[66,73],[101,47],[104,9],[76,-16],[30,-8],[-4,-29],[-27,-60],[-73,-66],[-109,-37],[-119,3],[-106,43]]],
  ["snow", "白銀の峠", "雪山を抜ける、切り返しの多い細道。", "上級", "snow", 6.1,
    [[-60,72],[-16,70],[14,50],[47,58],[81,76],[112,53],[115,18],[74,-1],[97,-31],[78,-64],[39,-69],[13,-39],[-24,-53],[-66,-78],[-101,-58],[-114,-17],[-94,16],[-112,47]]],
  ["forest", "杉の森", "森の中を抜ける連続コーナー。", "中級", "forest", 6.8,
    [[-66,64],[-20,66],[6,43],[32,37],[62,66],[100,60],[116,30],[93,-5],[54,-17],[21,-10],[-6,-36],[-20,-66],[-52,-80],[-91,-66],[-115,-39],[-95,-5],[-120,23],[-106,51]]],
  ["sand", "砂丘スピードウェイ", "長い直線でブーストを生かそう。", "初級", "desert", 8.5,
    [[-95,52],[-48,54],[8,54],[62,54],[111,51],[133,25],[132,-10],[109,-39],[64,-56],[8,-56],[-50,-56],[-107,-48],[-133,-21],[-135,20],[-121,46]]],
  ["night", "夜の首都高", "ネオンの中を、直角コーナーで切り抜ける。", "中級", "night", 7,
    [[-78,72],[-31,72],[13,72],[24,44],[54,28],[101,28],[119,5],[119,-42],[91,-58],[45,-58],[13,-35],[-17,-37],[-41,-63],[-86,-63],[-109,-38],[-109,10],[-110,52]]],
  ["harbor", "みなと埠頭", "港の広い道路を、2本の直線で駆け抜ける。", "初級", "harbor", 8,
    [[-65,74],[-16,74],[47,74],[96,70],[113,44],[111,12],[87,-3],[79,-47],[50,-64],[-8,-67],[-61,-65],[-104,-61],[-117,-33],[-112,11],[-100,49]]],
  ["plateau", "高原パノラマ", "大きなカーブと小さなS字が交互に来る。", "中級", "highland", 7.2,
    [[-56,74],[-11,71],[34,83],[75,66],[91,36],[74,6],[93,-22],[109,-49],[83,-72],[43,-70],[7,-51],[-31,-58],[-61,-81],[-98,-72],[-122,-41],[-120,4],[-103,53]]],
  ["lava", "火山の外輪山", "鋭いヘアピンが待つ、最も難しいコース。", "上級", "volcano", 6.4,
    [[-74,68],[-27,67],[3,54],[27,74],[72,72],[110,49],[115,13],[85,-5],[52,15],[31,-6],[68,-27],[98,-48],[75,-73],[29,-72],[-10,-48],[-36,-77],[-77,-78],[-113,-47],[-92,-13],[-124,17],[-109,51]]],
  ["castle", "城下町グランプリ", "城門をくぐり、外堀に沿って3周。", "上級", "castle", 6.7,
    [[-68,73],[-26,73],[14,72],[36,57],[60,61],[105,63],[118,37],[103,12],[64,-4],[65,-37],[39,-64],[0,-64],[-19,-39],[-55,-34],[-69,-65],[-105,-63],[-122,-32],[-108,4],[-116,43],[-96,68]]]
];

export const LEGACY_TRACKS = courses.map(([id, name, description, difficulty, theme, halfWidth, points]) =>
  ({ id, name, description, difficulty, theme, colors: palettes[theme], halfWidth, points }));

const worldCourses = [
  ["fuji", "富士・湖畔スカイライン", "日本", "桜の湖畔直線から、富士を望む長いS字へ。", "初級", "sakura", 8.3,
    [[-105,72],[-58,71],[3,75],[64,78],[113,61],[131,24],[121,-11],[91,-28],[57,-16],[27,-39],[-1,-64],[-57,-69],[-107,-53],[-132,-22],[-141,16],[-128,52]], [.11,.45,.77]],
  ["amalfi", "アマルフィ海岸", "イタリア", "段々の街を回り、海沿いのヘアピンを折り返す。", "上級", "coast", 7.2,
    [[-104,76],[-63,73],[-15,68],[28,76],[78,79],[119,58],[130,31],[111,10],[76,9],[51,-2],[75,-27],[105,-39],[91,-69],[50,-82],[12,-68],[-26,-48],[-72,-61],[-120,-40],[-131,-7],[-116,16],[-131,47]], [.14,.47,.85]],
  ["paris", "パリ・セーヌナイト", "フランス", "川沿いの直線と市街地の直角コーナーをつなぐ。", "中級", "night", 8.1,
    [[-91,69],[-43,69],[11,69],[63,69],[94,54],[97,25],[123,6],[122,-29],[100,-55],[47,-57],[19,-34],[-21,-34],[-47,-64],[-96,-64],[-123,-39],[-123,9],[-104,28],[-117,47]], [.1,.52,.79]],
  ["iceland", "氷河オーロラ・ループ", "アイスランド", "氷の塔を縫うS字から、氷河を見渡す大回りへ。", "上級", "snow", 7.4,
    [[-99,66],[-62,66],[-25,48],[13,61],[46,78],[97,76],[133,45],[135,12],[104,-8],[70,5],[44,-12],[82,-39],[112,-60],[79,-82],[25,-85],[-14,-61],[-55,-79],[-105,-71],[-137,-40],[-123,-1],[-137,29],[-121,52]], [.11,.46,.84]],
  ["giza", "ギザ・ピラミッド回廊", "エジプト", "広い砂漠の2本の直線と、ピラミッドを回る大カーブ。", "初級", "desert", 9.2,
    [[-110,53],[-50,54],[10,54],[67,54],[128,49],[153,21],[149,-17],[119,-44],[61,-56],[4,-55],[-58,-55],[-119,-45],[-151,-15],[-153,22],[-136,44]], [.12,.5,.82]],
  ["monument", "モニュメント・バレー", "アメリカ", "赤い岩山の間を高速で抜け、終盤のS字で勝負。", "中級", "volcano", 8.7,
    [[-119,64],[-68,66],[-10,66],[49,66],[110,66],[143,41],[140,9],[111,-13],[130,-43],[94,-74],[46,-77],[4,-61],[-33,-41],[-71,-61],[-115,-62],[-147,-28],[-133,3],[-149,35]], [.14,.55,.87]],
  ["rio", "リオ・ビーチカーブ", "ブラジル", "湾岸の長いカーブと、丘のふもとの短い切り返し。", "中級", "harbor", 8.4,
    [[-111,66],[-64,69],[-16,75],[36,84],[90,83],[130,65],[144,29],[129,-4],[99,-31],[62,-33],[44,-60],[14,-77],[-27,-68],[-44,-39],[-76,-40],[-110,-60],[-139,-35],[-147,1],[-132,42]], [.16,.49,.82]],
  ["singapore", "シンガポール・マリーナGP", "シンガポール", "光る湾岸の直線から、テクニカルな市街地へ。", "上級", "night", 7.6,
    [[-105,72],[-47,72],[15,72],[65,72],[106,59],[128,33],[102,12],[65,17],[42,-3],[61,-32],[103,-28],[119,-61],[89,-82],[36,-79],[-2,-55],[-39,-52],[-66,-74],[-110,-67],[-132,-33],[-113,-6],[-137,25],[-126,55]], [.08,.52,.81]],
  ["sydney", "シドニー・ハーバーラン", "オーストラリア", "橋のたもとの直線と、帆の見える埠頭のカーブ。", "初級", "harbor", 8.8,
    [[-101,70],[-41,71],[22,70],[87,70],[125,51],[133,17],[108,-5],[82,-35],[57,-56],[4,-64],[-53,-62],[-100,-55],[-128,-29],[-135,11],[-126,45]], [.09,.5,.77]],
  ["alpine", "南島・アルパイン峡谷", "ニュージーランド", "湖沿いのワイドな入口から、峡谷のつづら折りへ。", "上級", "highland", 7.5,
    [[-96,71],[-54,69],[-6,65],[36,80],[82,79],[121,60],[141,25],[114,1],[80,15],[52,-1],[74,-33],[106,-52],[81,-81],[34,-80],[-1,-55],[-42,-71],[-82,-80],[-124,-58],[-135,-21],[-109,6],[-129,33],[-122,54]], [.1,.57,.89]]
];
worldCourses.push(
  ["cloudpass", "雲海アルプス・スカイ峠", "スイス", "雲の上の稜線と大きなアップダウン。青いジャンプ台から空へ。", "上級", "highland", 10,
    [[-110,65],[-55,65],[8,80],[70,65],[120,30],[130,-15],[88,-43],[45,-20],[8,-55],[-45,-80],[-110,-55],[-145,-10],[-130,35]], [.12,.47,.81]],
  ["dunefly", "ドバイ・サンセットフライウェイ", "UAE", "砂丘を見下ろす高架道路。連続ジャンプと高速コーナーをつなごう。", "中級", "desert", 11,
    [[-125,65],[-55,65],[15,65],[90,62],[140,30],[135,-25],[90,-60],[20,-70],[-40,-55],[-95,-70],[-145,-30],[-150,20]], [.1,.43,.76]],
  ["lavacoast", "ハワイ・溶岩ジャンプトレイル", "ハワイ", "溶岩の谷と海を望む急坂。大ジャンプで稜線を飛び越えよう。", "上級", "volcano", 10.5,
    [[-115,70],[-55,70],[5,58],[65,78],[125,48],[140,5],[105,-25],[60,-5],[35,-45],[-10,-80],[-65,-70],[-125,-50],[-145,-5],[-132,40]], [.13,.5,.83]]
);
const newCourses = new Set(["cloudpass", "dunefly", "lavacoast"]);
export const TRACKS = worldCourses.map(([id, name, region, description, difficulty, theme, halfWidth, points, boostFractions]) =>
  ({ id, name, region, description, difficulty, theme, colors: palettes[theme], halfWidth, points, boostFractions,
    newCourse: newCourses.has(id) }));

const circuitLengths = {
  fuji: 2650, amalfi: 2500, paris: 2600, iceland: 2600, giza: 2750,
  monument: 2700, rio: 2600, singapore: 2500, sydney: 2700, alpine: 2550,
  cloudpass: 2800, dunefly: 2850, lavacoast: 2750
};
const mix = (a, b, t) => a + (b - a) * t;
// Entry and exit as fractions of the lap, followed by the side of the road.
const shortcutSections = {
  fuji: [.36, .53, -1], amalfi: [.36, .51, 1], paris: [.32, .49, -1],
  iceland: [.36, .52, 1], giza: [.30, .47, -1], monument: [.26, .42, -1],
  rio: [.74, .90, -1], singapore: [.44, .61, -1], sydney: [.28, .44, -1],
  alpine: [.46, .63, -1], cloudpass: [.3,.46,-1], dunefly: [.3,.45,1], lavacoast: [.35,.51,-1]
};
export const SHORTCUT_COLOR = "#f8bf55";

function buildShortcut(track, [entry, exit, side]) {
  const from = entry * track.length, to = exit * track.length;
  const lane = side * track.halfWidth * .68;
  const a = track.sample(from), b = track.sample(to);
  const start = [a.x + a.rx * lane, a.z + a.rz * lane];
  const finish = [b.x + b.rx * lane, b.z + b.rz * lane];
  const handle = Math.min(Math.hypot(finish[0] - start[0], finish[1] - start[1]), to - from) * .32;
  const startHandle = [start[0] + a.fx * handle, start[1] + a.fz * handle];
  const endHandle = [finish[0] - b.fx * handle, finish[1] - b.fz * handle];
  const marks = [0];
  const points = Array.from({ length: 129 }, (_, index) => {
    const t = index / 128, v = 1 - t;
    return start.map((coordinate, axis) => v ** 3 * coordinate + 3 * v * v * t * startHandle[axis] +
      3 * v * t * t * endHandle[axis] + t ** 3 * finish[axis]);
  });
  for (let i = 1; i < points.length; i++) {
    marks.push(marks[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const length = marks.at(-1), ratio = (to - from) / length;
  function sample(distance, out = {}) {
    const at = Math.max(0, Math.min(length, distance));
    let low = 0, high = marks.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (marks[middle] <= at) low = middle;
      else high = middle;
    }
    const p = points[low], q = points[high];
    const t = (at - marks[low]) / (marks[high] - marks[low]);
    const tangent = distance <= 0 ? a : distance >= length ? b : null;
    out.fx = tangent?.fx ?? (q[0] - p[0]) / (marks[high] - marks[low]);
    out.fz = tangent?.fz ?? (q[1] - p[1]) / (marks[high] - marks[low]);
    out.x = mix(p[0], q[0], t) + (distance - at) * out.fx;
    out.z = mix(p[1], q[1], t) + (distance - at) * out.fz;
    out.rx = -out.fz;
    out.rz = out.fx;
    return out;
  }
  const halfWidth = Math.min(4.4, track.halfWidth - Math.abs(lane) + 1);
  return { from, to, lane, length, ratio, halfWidth, sample,
    outline: Array.from({ length: 41 }, (_, index) => sample(index * length / 40)) };
}

export function lapDistance(track, distance) {
  return ((distance % track.length) + track.length) % track.length;
}

export function nearShortcut(track, x, z) {
  const cut = track.shortcut;
  return cut?.outline.some(point => Math.hypot(point.x - x, point.z - z) < cut.halfWidth + 7) ?? false;
}

export function racerSample(track, racer, out) {
  return racer.free ? terrainPoint(racer, out) : driveSample(track, racer.distance, racer.shortcut, out);
}

export function racerWorldPosition(track, racer, out) {
  const p = racerSample(track, racer, out);
  const lane = racer.free ? 0 : racer.lane;
  p.x += p.rx * lane;
  p.z += p.rz * lane;
  return p;
}

export function rampHeight(track, racer) {
  if (!track.manualDrive || !racer.onAsphalt && racer.free) return 0;
  const position = lapDistance(track, racer.distance);
  for (const ramp of track.ramps) {
    const t = (position - ramp.distance) / ramp.length;
    if (t >= 0 && t <= 1 && Math.abs(racer.lane - ramp.lane) < ramp.halfWidth) return t * ramp.height;
  }
  return 0;
}

export function roadHeight(track, distance) {
  const p = track.sample(distance);
  return track.heightAt?.(p.x, p.z) ?? 0;
}

export function driveSample(track, distance, shortcut, out) {
  if (!shortcut || !track.shortcut) return track.sample(distance, out);
  return track.shortcut.sample((lapDistance(track, distance) - track.shortcut.from) / track.shortcut.ratio, out);
}

const cached = new Map();
export function getTrack(id, { classic = false, shortcuts = !classic, offroad = shortcuts, turboCuts = offroad, freeDrive = false, manualDrive = false } = {}) {
  const spec = TRACKS.find(track => track.id === id) ?? LEGACY_TRACKS.find(track => track.id === id);
  if (!spec) return null;
  const key = id + (classic ? ":classic" : freeDrive ? ":terrain" : shortcuts ? (turboCuts ? ":turbo" : offroad ? ":offroad" : ":shortcuts") : ":main") + (manualDrive ? ":manual" : "");
  if (cached.has(key)) return cached.get(key);

  const { points } = spec;
  const subdiv = 26;
  const raw = [];
  const marks = [0];
  function spline(a, b, c, d, t) {
    return b + .5 * t * ((c - a) + t * ((2 * a - 5 * b + 4 * c - d) + t * (3 * (b - c) + d - a)));
  }
  for (let i = 0; i <= points.length * subdiv; i++) {
    const index = Math.floor(i / subdiv);
    const t = (i % subdiv) / subdiv;
    const a = points[(index + points.length - 1) % points.length];
    const b = points[index % points.length];
    const c = points[(index + 1) % points.length];
    const d = points[(index + 2) % points.length];
    const p = [spline(a[0], b[0], c[0], d[0], t), spline(a[1], b[1], c[1], d[1], t)];
    if (i) marks.push(marks[i - 1] + Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]));
    raw.push(p);
  }
  const layoutScale = !classic && circuitLengths[id] ? circuitLengths[id] / marks.at(-1) : 1;
  if (layoutScale !== 1) {
    for (const point of raw) {
      point[0] *= layoutScale;
      point[1] *= layoutScale;
    }
    for (let i = 1; i < marks.length; i++) marks[i] *= layoutScale;
  }
  const length = marks.at(-1);
  const count = Math.ceil(length / 1.1);
  const step = length / count;
  let cursor = 0;
  const samples = Array.from({ length: count }, (_, index) => {
    const at = index * step;
    while (marks[cursor + 1] < at) cursor++;
    const t = (at - marks[cursor]) / (marks[cursor + 1] - marks[cursor]);
    return [mix(raw[cursor][0], raw[cursor + 1][0], t), mix(raw[cursor][1], raw[cursor + 1][1], t)];
  });
  function sample(distance, out = {}) {
    const at = ((distance % length + length) % length) / step;
    const i = Math.floor(at);
    const a = samples[i % count];
    const b = samples[(i + 1) % count];
    const prev = samples[(i + count - 1) % count];
    const next = samples[(i + 2) % count];
    const t = at - i;
    const x = b[0] - a[0], z = b[1] - a[1];
    const dx = mix((b[0] - prev[0]) * .5, (next[0] - a[0]) * .5, t);
    const dz = mix((b[1] - prev[1]) * .5, (next[1] - a[1]) * .5, t);
    const magnitude = Math.hypot(dx, dz);
    out.x = a[0] + x * t;
    out.z = a[1] + z * t;
    out.fx = dx / magnitude;
    out.fz = dz / magnitude;
    out.rx = -out.fz;
    out.rz = out.fx;
    return out;
  }
  const pads = (spec.boostFractions ?? [.065, .485, .83]).map((portion, i) =>
    ({ distance: length * portion, lane: [0, -2.5, 2.5][i] }));
  const outline = Array.from({ length: 100 }, (_, i) => sample(length * i / 100));
  const itemLines = (layoutScale > 1 ? [.065, .20, .335, .47, .61, .75, .885] : [.22, .58, .93]).map(portion => length * portion);
  const track = { ...spec, length, layoutScale, sample, samples, pads, outline, itemLines, padLength: PAD_LENGTH, padHalfWidth: PAD_HALF_WIDTH };
  track.manualDrive = manualDrive && !classic && freeDrive && Object.hasOwn(shortcutSections,id);
  const amplitude = spec.newCourse ? 22 : 5;
  track.heightAt = track.manualDrive ? (x,z) => 5 + amplitude * (1 + Math.sin(x/190) * Math.cos(z/210)) : () => 0;
  track.ramps = pads.map((pad,i) => ({distance: pad.distance + 13, lane: spec.newCourse ? 0 : pad.lane,
    length: spec.newCourse ? 14 : 10, halfWidth: spec.newCourse ? spec.halfWidth - 1 : 3.8, height: spec.newCourse ? 4.5 : 2.4, id:i}));
  if (!classic && shortcuts && Object.hasOwn(shortcutSections, id)) {
    track.shortcut = buildShortcut(track, shortcutSections[id]);
    if (offroad && !freeDrive) {
      track.offroad = true;
      track.turboCuts = turboCuts;
      track.offroadItemLine = track.shortcut.from - 90;
      track.itemLines = [...track.itemLines, track.offroadItemLine].sort((a, b) => a - b);
    }
  }
  if (!classic && freeDrive && Object.hasOwn(shortcutSections, id)) {
    track.terrain = buildTerrain(track);
    track.turboCuts = true;
  }
  cached.set(key, track);
  return track;
}
