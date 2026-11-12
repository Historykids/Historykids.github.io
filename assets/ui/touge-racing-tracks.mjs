export const LAPS = 3;
export const PAD_LENGTH = 9;
export const PAD_HALF_WIDTH = 2.35;

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

export const TRACKS = courses.map(([id, name, description, difficulty, theme, halfWidth, points]) =>
  ({ id, name, description, difficulty, theme, colors: palettes[theme], halfWidth, points }));

const mix = (a, b, t) => a + (b - a) * t;
const cached = new Map();
export function getTrack(id) {
  const spec = TRACKS.find(track => track.id === id);
  if (!spec) return null;
  if (cached.has(id)) return cached.get(id);

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
  const pads = [.065, .485, .83].map((portion, i) =>
    ({ distance: length * portion, lane: [0, -2.5, 2.5][i] }));
  const outline = Array.from({ length: 100 }, (_, i) => sample(length * i / 100));
  const track = { ...spec, length, sample, samples, pads, outline, padLength: PAD_LENGTH, padHalfWidth: PAD_HALF_WIDTH };
  cached.set(id, track);
  return track;
}
