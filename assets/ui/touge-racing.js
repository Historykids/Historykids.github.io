import { createScene } from "./touge-racing-scene.js?v=5";
import { getTrack, LAPS, TRACKS } from "./touge-racing-tracks.mjs";
import {
  EMPTY_INPUT, ROOM_CODE, ROOM_SIZE, STEP, TRIAL_MAX_TICKS, TRIAL_PROTOCOL,
  applyDrive, createRacer, createTrialRacer, formatTime, isDriving, rankRacers, recordTrialInput, stepRace
} from "./touge-racing-rules.mjs?v=5";
import { OnlineRace, makeRoomCode, savedRoomToken } from "./touge-racing-online.js?v=5";
import { createRankingPanel, createRoomDirectory, raceRequest } from "./touge-racing-menu.js?v=5";

const byId = id => document.getElementById(id);
const setup = byId("setup"), lobby = byId("lobby"), game = byId("game");
const start = byId("start"), pause = byId("pause"), resume = byId("resume"), retry = byId("retry");
const courseGrid = byId("course-grid");
const nickname = byId("nickname"), trialName = byId("trial-name");
const countdown = byId("countdown");
const time = byId("time"), speed = byId("speed"), speedBar = byId("speed-bar");
const placeNumber = byId("place").firstChild, lapNumber = byId("lap").firstChild;
const buttons = [...document.querySelectorAll("[data-input]")];
const held = new Map();
const keys = new Map([
  ["ArrowUp", "gas"], ["KeyW", "gas"], ["ArrowDown", "brake"], ["KeyS", "brake"],
  ["ArrowLeft", "left"], ["KeyA", "left"], ["ArrowRight", "right"], ["KeyD", "right"]
]);

const BEST_PREFIX = "historykids.tougeRacing.best.v2.";
const TRIAL_BEST_PREFIX = "historykids.tougeRacing.trial.best.";
const PLAYER_KEY = "historykids.tougeRacing.trial.player";
const NAME_KEY = "historykids.tougeRacing.nickname";
const defaultTrack = TRACKS[0].id;
let mode = "cpu", selected = defaultTrack, state = "setup";
let race, online, onlinePhase, previousState, menuOpen = false;
let frameId = 0, lastFrame = 0;
const setDirectoryActive = createRoomDirectory(code => joinOnline(code, { type: "join" }));
const ranking = createRankingPanel();
const modes = {
  cpu: "CPUと対戦する →", online: "このコースで部屋を作る →", trial: "タイムアタック開始 →"
};

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function bestTime(id, trial = false) {
  const key = (trial ? TRIAL_BEST_PREFIX : BEST_PREFIX) + id;
  const saved = Number(load(key) || (!trial && id === defaultTrack ? load("historykids.tougeRacing.best.v1") : null));
  return Number.isFinite(saved) && saved > 0 ? saved : Infinity;
}

function outline(canvas, track, mini = false) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  const xs = track.outline.map(p => p.x), zs = track.outline.map(p => p.z);
  const left = Math.min(...xs), top = Math.min(...zs);
  const w = Math.max(...xs) - left, h = Math.max(...zs) - top;
  const scale = Math.min((width - 28) / w, (height - 22) / h);
  const x = value => (width - w * scale) / 2 + (value - left) * scale;
  const y = value => (height - h * scale) / 2 + (value - top) * scale;
  if (!context) return () => {};
  context.beginPath();
  track.outline.forEach((point, i) => {
    const xx = x(point.x), yy = y(point.z);
    if (i) context.lineTo(xx, yy);
    else context.moveTo(xx, yy);
  });
  context.closePath();
  context.lineJoin = "round";
  context.lineWidth = mini ? 11 : 8;
  context.strokeStyle = mini ? "#081722b3" : "#304759";
  context.stroke();
  context.lineWidth = mini ? 3.2 : 2.5;
  context.strokeStyle = mini ? "#eefbff" : "#9ab8c7";
  context.stroke();
  const line = track.sample(0);
  context.beginPath();
  context.moveTo(x(line.x - line.rx * 9), y(line.z - line.rz * 9));
  context.lineTo(x(line.x + line.rx * 9), y(line.z + line.rz * 9));
  context.lineWidth = 2.4;
  context.strokeStyle = "#9aeeff";
  context.stroke();
  return (racer, own, target = context) => {
    if (racer.dnf || (!own && racer.finishedAt !== null)) return;
    const point = track.sample(racer.distance);
    target.beginPath();
    target.arc(x(point.x + point.rx * racer.lane), y(point.z + point.rz * racer.lane),
      own ? 4.2 : 2.8, 0, Math.PI * 2);
    target.fillStyle = own ? "#8de9ff" : "#ffc194";
    target.fill();
  };
}

function createCourseCards() {
  for (const course of TRACKS) {
    const card = document.createElement("button");
    card.type = "button";
    card.dataset.course = course.id;
    card.className = "course-card";
    const art = document.createElement("div");
    art.className = "course-art";
    art.style.setProperty("--sky", course.colors[0]);
    art.style.setProperty("--land", course.colors[2]);
    const canvas = document.createElement("canvas");
    canvas.width = 150;
    canvas.height = 85;
    canvas.setAttribute("aria-hidden", "true");
    art.append(canvas);
    const caption = document.createElement("div");
    caption.className = "course-caption";
    const title = document.createElement("strong");
    title.textContent = course.name;
    const difficulty = document.createElement("small");
    difficulty.textContent = course.difficulty;
    caption.append(title, difficulty);
    card.append(art, caption);
    card.addEventListener("click", () => selectCourse(course.id));
    courseGrid.append(card);
    outline(canvas, getTrack(course.id), true);
  }
}

function selectCourse(id) {
  selected = id;
  for (const card of courseGrid.children) card.setAttribute("aria-pressed", String(card.dataset.course === id));
  const course = getTrack(id);
  const best = bestTime(id, mode === "trial");
  byId("selected-info").textContent = course.name + " · " + course.description +
    (mode !== "online" && Number.isFinite(best) ? " 自己ベスト " + formatTime(best) : "");
  ranking.show(id);
}

function selectMode(value) {
  mode = value;
  for (const id of Object.keys(modes)) byId("mode-" + id).setAttribute("aria-pressed", String(value === id));
  byId("online-entry").hidden = value !== "online";
  start.textContent = modes[value];
  setDirectoryActive(value === "online" && state === "setup");
  byId("setup-message").textContent = "";
  selectCourse(selected);
}

function isActive() {
  return state === "countdown" || state === "racing";
}

function showState(value) {
  state = value;
  setDirectoryActive(value === "setup" && mode === "online");
  setup.hidden = value !== "setup";
  lobby.hidden = value !== "lobby";
  game.hidden = !setup.hidden || !lobby.hidden;
  game.dataset.state = value;
  byId("hud").hidden = !isActive() || menuOpen;
  byId("paused").hidden = value !== "paused" && !menuOpen;
  byId("result").hidden = value !== "finished";
  if (!isActive()) clearInput();
}

function clearInput() {
  held.clear();
  buttons.forEach(button => button.classList.remove("pressed"));
  if (online) online.control(EMPTY_INPUT, true);
}

function input() {
  const actions = [...held.values()];
  return {
    gas: actions.includes("gas"),
    brake: actions.includes("brake"),
    turn: Number(actions.includes("right")) - Number(actions.includes("left"))
  };
}

function cleanupRace() {
  cancelAnimationFrame(frameId);
  frameId = 0;
  const previous = race;
  race = null;
  previous?.scene?.dispose();
}

function setupScreen(message = "") {
  cleanupRace();
  menuOpen = false;
  showState("setup");
  selectCourse(selected);
  byId("setup-message").textContent = message;
  start.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function prepareRace(track, racers, isOnline, isTrial = false) {
  cleanupRace();
  menuOpen = false;
  clearInput();
  const oldCanvas = byId("track");
  const canvas = oldCanvas.cloneNode();
  canvas.setAttribute("aria-label", track.name + "の3Dコース");
  oldCanvas.replaceWith(canvas);
  const map = byId("map");
  const mapBase = document.createElement("canvas");
  mapBase.width = map.width;
  mapBase.height = map.height;
  const drawMarker = outline(mapBase, track);
  const mapContext = map.getContext("2d");
  const drawMap = () => {
    if (!mapContext) return;
    mapContext.clearRect(0, 0, map.width, map.height);
    mapContext.drawImage(mapBase, 0, 0);
    for (let i = racers.length - 1; i >= 0; i--) drawMarker(racers[i], i === 0, mapContext);
  };
  showState("countdown");
  byId("map-title").textContent = track.name;
  byId("place-stat").hidden = isTrial;
  byId("lap-total").textContent = " / " + (isTrial ? 1 : LAPS);
  game.dataset.contact = "false";
  byId("race-message").textContent = "";
  pause.textContent = isOnline ? "↩" : "Ⅱ";
  pause.setAttribute("aria-label", isOnline ? "退出メニュー" : "一時停止");
  byId("pause-title").textContent = isOnline ? "部屋から退出する？" : "一時停止";
  byId("exit-race").textContent = isOnline ? "部屋から退出する" : "モード選択に戻る";
  byId("restart").hidden = isOnline;
  try {
    race = {
      track, racers, player: racers[0], isOnline, isTrial, elapsed: 0, remaining: isOnline ? 5 : 3,
      laps: isTrial ? 1 : LAPS, ticks: 0, accumulator: 0, tape: isTrial ? [] : null, drawMap, canvas
    };
    race.scene = createScene(canvas, racers, track);
    canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      if (race?.canvas !== canvas) return;
      leaveOnline();
      setupScreen("3Dの描画が中断されたよ。もう一度レースを始めてね。");
    });
    lastFrame = 0;
    window.scrollTo(0, 0);
    resize();
    refreshHud();
    if (matchMedia("(pointer: fine)").matches) pause.focus({ preventScroll: true });
    schedule();
    return true;
  } catch (error) {
    console.error(error);
    leaveOnline();
    setupScreen("3Dを表示できなかったよ。別のブラウザで試してね。");
    return false;
  }
}

function startCPU() {
  const racers = [
    createRacer(0, { name: "あなた" }),
    ...Array.from({ length: 3 }, (_, i) => createRacer(i + 1, { name: "CPU " + (i + 1), cpu: true }))
  ];
  prepareRace(getTrack(selected), racers, false);
}

function startTrial() {
  prepareRace(getTrack(selected), [createTrialRacer()], false, true);
}

function startLocalRace() {
  if (mode === "trial") startTrial();
  else startCPU();
}

function refreshHud() {
  const { player, racers, track, elapsed, remaining, laps } = race;
  placeNumber.nodeValue = rankRacers(racers).indexOf(player) + 1;
  lapNumber.nodeValue = Math.min(laps, Math.floor(Math.max(0, player.distance) / track.length) + 1);
  time.textContent = formatTime(player.finishedAt ?? elapsed);
  const kph = Math.round(player.speed * 3.6);
  speed.textContent = kph;
  speedBar.value = kph;
  byId("boost").hidden = player.boost <= 0 || Math.abs(player.lane) > track.halfWidth - .2;
  const contact = player.contact > .18;
  byId("impact").hidden = !contact;
  game.dataset.contact = String(contact);
  countdown.hidden = state !== "countdown" && elapsed > .75;
  const text = state === "countdown" ? String(Math.max(1, Math.ceil(remaining))) : "GO!";
  if (countdown.textContent !== text) countdown.textContent = text;
}

function tickLocal(dt) {
  if (state === "countdown") {
    race.remaining -= dt;
    if (race.remaining > 0) return;
    dt = -race.remaining;
    showState("racing");
  }
  race.player.input = input();
  if (race.isTrial) return tickTrial(dt);
  stepRace(race.track, race.racers, dt, race.elapsed);
  race.elapsed += dt;
  if (race.player.finishedAt !== null) finishCPU();
}

function tickTrial(dt) {
  const { track, racers, player, tape } = race;
  race.accumulator += dt;
  while (race.accumulator + 1e-9 >= STEP) {
    race.accumulator -= STEP;
    recordTrialInput(tape, player.input);
    stepRace(track, racers, STEP, race.ticks * STEP, 1);
    race.ticks++;
    race.elapsed = race.ticks * STEP;
    if (player.finishedAt !== null || race.ticks >= TRIAL_MAX_TICKS) {
      finishTrial();
      return;
    }
  }
}

function tickOnline(dt, stamp) {
  const snapshot = race.snapshot;
  if (!snapshot) return;
  const age = (stamp - race.receivedAt) / 1000;
  race.remaining = Math.max(0, snapshot.countdown - age);
  if (snapshot.phase === "racing") race.elapsed = snapshot.elapsed + Math.min(.16, age);
  const drive = menuOpen ? EMPTY_INPUT : input();
  online.control(drive);
  if (snapshot.phase !== "racing") return;
  for (const racer of race.racers) {
    const target = snapshot.racers.find(entry => entry.id === racer.id);
    const own = racer === race.player;
    racer.finishedAt = target.finishedAt;
    racer.dnf = target.dnf;
    racer.contact = Math.max(0, target.contact - age);
    if (own && isDriving(racer) && online.joined && age < .55) {
      applyDrive(race.track, racer, drive, dt);
      racer.distance += racer.speed * dt;
    }
    const lead = Math.min(.12, age) * target.speed;
    const distanceError = target.distance + lead - racer.distance;
    const blend = 1 - Math.exp(-(own ? 8 : 16) * dt);
    const snap = !isDriving(racer) || Math.abs(distanceError) > 13;
    racer.distance += distanceError * (snap ? 1 : blend);
    racer.lane += (target.lane - racer.lane) * (snap ? 1 : blend);
    racer.speed += (target.speed - racer.speed) * (snap ? 1 : blend * (own ? .46 : 1));
    if (!own || snap) {
      racer.steer = target.steer;
      racer.boost = target.boost;
    }
  }
  if (race.player.finishedAt !== null && online.joined) {
    setRaceMessage("ゴール！ ほかの選手のゴールを待っています。");
  }
}

function resize() {
  if (!race?.scene || game.hidden) return;
  race.scene.resize(game.clientWidth, game.clientHeight);
  race.scene.render(state, 0, true);
  race.drawMap();
}
function schedule() {
  if (!frameId) frameId = requestAnimationFrame(frame);
}
function frame(stamp) {
  frameId = 0;
  if (!race || !isActive()) return;
  const dt = lastFrame ? Math.min(.1, (stamp - lastFrame) / 1000) : 0;
  lastFrame = stamp;
  if (race.isOnline) tickOnline(dt, stamp);
  else if (dt) tickLocal(dt);
  refreshHud();
  race.scene.render(state, dt, false);
  race.drawMap();
  if (isActive()) schedule();
}

function togglePause() {
  if (!race) return;
  if (race.isOnline && isActive()) {
    menuOpen = !menuOpen;
    clearInput();
    showState(state);
    if (menuOpen) resume.focus();
    return;
  }
  if (state === "paused") {
    lastFrame = 0;
    showState(previousState);
    schedule();
  } else if (isActive()) {
    previousState = state;
    showState("paused");
    cancelAnimationFrame(frameId);
    frameId = 0;
    resume.focus();
  }
}

function finishCPU() {
  const { track, player, racers } = race;
  const prior = bestTime(track.id);
  const record = player.finishedAt < prior;
  if (record) save(BEST_PREFIX + track.id, String(player.finishedAt));
  byId("result-title").textContent = "レース終了";
  byId("trial-submit").hidden = true;
  byId("result-ranking").hidden = true;
  byId("result-place-line").hidden = false;
  byId("result-stats").hidden = false;
  byId("race-order").hidden = true;
  byId("result-place").textContent = rankRacers(racers).indexOf(player) + 1;
  byId("result-time").textContent = formatTime(player.finishedAt);
  byId("best-time").textContent = formatTime(Math.min(prior, player.finishedAt));
  byId("record").hidden = !record;
  byId("result-note").textContent = "";
  retry.hidden = false;
  retry.disabled = false;
  retry.textContent = "同じコースでもう一度";
  showState("finished");
  retry.focus({ preventScroll: true });
}

function finishTrial() {
  const { track, player } = race;
  const finished = player.finishedAt !== null;
  const prior = bestTime(track.id, true);
  const improved = finished && player.finishedAt < prior;
  if (improved) save(TRIAL_BEST_PREFIX + track.id, String(player.finishedAt));
  byId("result-title").textContent = finished ? "タイムアタック完走" : "タイムアップ";
  byId("result-place-line").hidden = true;
  byId("result-stats").hidden = false;
  byId("race-order").hidden = true;
  byId("record").hidden = !improved;
  byId("result-time").textContent = finished ? formatTime(player.finishedAt) : "未完走";
  byId("best-time").textContent = formatTime(improved ? player.finishedAt : prior);
  byId("result-note").textContent = finished ? "" : "2分以内に1周するとランキングに登録できるよ。";
  byId("trial-submit").hidden = !finished;
  byId("submit-time").disabled = false;
  byId("trial-status").textContent = "";
  trialName.value = load(NAME_KEY) ?? "";
  byId("result-ranking").hidden = false;
  retry.hidden = false;
  retry.disabled = false;
  retry.textContent = "同じコースでもう一度";
  showState("finished");
  retry.focus({ preventScroll: true });
}

let trialPlayer;
async function submitTrial(event) {
  event.preventDefault();
  const run = race;
  if (!run?.isTrial || run.player.finishedAt === null) return;
  const name = trialName.value.trim();
  if (!name) {
    byId("trial-status").textContent = "表示する名前を入力してね。";
    trialName.focus();
    return;
  }
  save(NAME_KEY, name);
  trialPlayer ??= load(PLAYER_KEY) || crypto.randomUUID();
  save(PLAYER_KEY, trialPlayer);
  const button = byId("submit-time");
  const status = byId("trial-status");
  button.disabled = true;
  status.textContent = "走行記録を確認中…";
  try {
    const result = await raceRequest("/race/leaderboard", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocol: TRIAL_PROTOCOL, track: run.track.id, player: trialPlayer, name, tape: run.tape })
    });
    if (race !== run) return;
    status.textContent = (result.updated ? "登録できたよ！ " : "登録済みの自己ベスト ") +
      result.rank + "位 · " + formatTime(result.seconds);
  } catch {
    if (race !== run) return;
    button.disabled = false;
    status.textContent = "登録できなかったよ。もう一度試せるよ。";
  }
}

function setRaceMessage(text) {
  const output = byId("race-message");
  if (output.textContent !== text) output.textContent = text;
}

function fillList(container, rows) {
  const fragment = document.createDocumentFragment();
  for (const [label, value, emphasized] of rows) {
    const item = document.createElement("li");
    if (emphasized) item.className = "own";
    const name = document.createElement("span");
    name.textContent = label;
    const status = document.createElement("strong");
    status.textContent = value;
    item.append(name, status);
    fragment.append(item);
  }
  container.replaceChildren(fragment);
}

function finishOnline(snapshot, id) {
  menuOpen = false;
  const first = state !== "finished";
  const ordered = rankRacers(snapshot.racers);
  if (first) {
    for (const racer of race.racers) Object.assign(racer, snapshot.racers.find(entry => entry.id === racer.id));
    byId("result-title").textContent = "レース終了";
    byId("trial-submit").hidden = true;
    byId("result-ranking").hidden = true;
    byId("result-place-line").hidden = true;
    byId("result-stats").hidden = true;
    byId("record").hidden = true;
    byId("race-order").hidden = false;
    fillList(byId("race-order"), ordered.map(racer =>
      [racer.name + (racer.id === id ? "（あなた）" : ""), racer.dnf ? "途中終了" : formatTime(racer.finishedAt), racer.id === id]));
    showState("finished");
    resize();
  }
  const host = snapshot.host === id;
  const count = snapshot.players.filter(player => player.connected).length;
  retry.hidden = !host || count < ROOM_SIZE;
  retry.disabled = retry.hidden;
  retry.textContent = "同じメンバーでもう一度";
  byId("result-note").textContent = count < ROOM_SIZE ? "再戦するには新しい部屋を作ってね。" :
    host ? "同じ4人で再戦できるよ。" : "ホストが再戦を選ぶと、もう一度走れるよ。";
  if (first) (retry.hidden ? byId("back-to-courses") : retry).focus({ preventScroll: true });
}

function lobbySnapshot(snapshot, id) {
  const count = snapshot.players.filter(player => player.connected).length;
  const host = snapshot.host === id;
  byId("lobby-count").textContent = "参加者 " + count + " / 4人";
  byId("lobby-course").textContent = getTrack(snapshot.trackId).name + " · 3周";
  fillList(byId("seats"), Array.from({ length: ROOM_SIZE }, (_, slot) => {
    const player = snapshot.players.find(entry => entry.slot === slot);
    if (!player) return ["参加者を待っています", "空き", false];
    const own = player.id === id;
    const suffix = own ? "（あなた）" : "";
    const label = player.id === snapshot.host ? "ホスト" : "参加済み";
    return [player.name + suffix, player.connected ? label : "再接続待ち", own];
  }));
  byId("online-start").disabled = !host || count < ROOM_SIZE;
  byId("online-start").textContent = count < ROOM_SIZE ? "あと " + (ROOM_SIZE - count) + "人でスタート" :
    host ? "4人でレース開始 →" : "ホストの開始を待っています";
}

function onlineSnapshot(snapshot, id) {
  const formerPhase = onlinePhase;
  onlinePhase = snapshot.phase;
  if (snapshot.phase === "lobby") {
    lobbySnapshot(snapshot, id);
    return;
  }
  if (!race || (snapshot.phase === "countdown" && formerPhase === "finished")) {
    const track = getTrack(snapshot.trackId);
    const ordered = [snapshot.racers.find(racer => racer.id === id), ...snapshot.racers.filter(racer => racer.id !== id)];
    if (!track || !ordered[0] || !prepareRace(track, ordered.map(racer => ({ ...racer })), true)) return;
  }
  race.snapshot = snapshot;
  race.receivedAt = performance.now();
  if (snapshot.phase === "finished") {
    finishOnline(snapshot, id);
  } else if (snapshot.phase !== state) {
    showState(snapshot.phase);
  }
}

function rememberRoom(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  history.replaceState(null, "", url);
}

function joinOnline(code, request) {
  if (!ROOM_CODE.test(code)) {
    byId("setup-message").textContent = "部屋一覧から、参加する部屋を選び直してね。";
    return;
  }
  leaveOnline();
  const name = nickname.value.trim();
  if (name) save(NAME_KEY, name);
  showState("lobby");
  window.scrollTo(0, 0);
  byId("join-invite").hidden = true;
  byId("lobby-course").textContent = "コース情報を確認中…";
  byId("lobby-count").textContent = "参加者 0 / 4人";
  byId("online-start").disabled = true;
  byId("online-start").textContent = "接続中…";
  fillList(byId("seats"), Array.from({ length: ROOM_SIZE }, () => ["参加者を待っています", "空き", false]));
  const link = new URL(location.href);
  link.searchParams.set("room", code);
  byId("invite-link").value = link.href;
  byId("invite-link").hidden = true;
  rememberRoom(code);
  online = new OnlineRace(code, { ...request, name }, {
    status(message) {
      byId("lobby-message").textContent = message;
      if (race) setRaceMessage(message);
      if (state === "finished" && message) byId("result-note").textContent = message;
    },
    state: onlineSnapshot,
    error(message) {
      online = null;
      onlinePhase = null;
      rememberRoom(null);
      setupScreen(message);
    }
  });
  online.open();
}

function leaveOnline() {
  if (!online) return;
  online.leave();
  online = null;
  onlinePhase = null;
  rememberRoom(null);
}

for (const id of Object.keys(modes)) byId("mode-" + id).addEventListener("click", () => selectMode(id));
start.addEventListener("click", () => {
  if (mode === "online") joinOnline(makeRoomCode(), { type: "create", trackId: selected });
  else startLocalRace();
});
byId("open-ranking").addEventListener("click", () => ranking.open(selected));
byId("reload-ranking").addEventListener("click", () => ranking.show(selected));
byId("close-ranking").addEventListener("click", () => {
  ranking.close();
  byId("open-ranking").focus();
});
byId("trial-submit").addEventListener("submit", submitTrial);
byId("result-ranking").addEventListener("click", () => {
  setupScreen();
  ranking.open(selected);
});
byId("copy-link").addEventListener("click", async () => {
  const field = byId("invite-link");
  try {
    await navigator.clipboard.writeText(field.value);
    byId("lobby-message").textContent = "招待リンクをコピーしたよ。";
  } catch {
    field.hidden = false;
    field.focus();
    field.select();
  }
});
byId("online-start").addEventListener("click", () => online?.start());
byId("leave-lobby").addEventListener("click", () => { leaveOnline(); setupScreen(); });
pause.addEventListener("click", togglePause);
resume.addEventListener("click", togglePause);
byId("restart").addEventListener("click", startLocalRace);
byId("exit-race").addEventListener("click", () => { leaveOnline(); setupScreen(); });
byId("back-to-courses").addEventListener("click", () => { leaveOnline(); setupScreen(); });
retry.addEventListener("click", () => {
  if (race?.isOnline) online?.start();
  else startLocalRace();
});

window.addEventListener("keydown", event => {
  if (event.code === "Escape" && !event.repeat) togglePause();
  if (!isActive() || menuOpen || !keys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  held.set(event.code, keys.get(event.code));
});
window.addEventListener("keyup", event => held.delete(event.code));
window.addEventListener("blur", () => {
  clearInput();
  if (isActive() && !race.isOnline) togglePause();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  clearInput();
  if (isActive() && !race.isOnline) togglePause();
});
for (const button of buttons) {
  button.addEventListener("pointerdown", event => {
    if (!isActive() || menuOpen || event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    held.set(event.pointerId, button.dataset.input);
    button.classList.add("pressed");
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, event => {
      held.delete(event.pointerId);
      if (![...held.values()].includes(button.dataset.input)) button.classList.remove("pressed");
    });
  }
}

createCourseCards();
nickname.value = load(NAME_KEY) ?? "";
selectMode("cpu");
start.disabled = false;
new ResizeObserver(resize).observe(game);
const invited = new URL(location.href).searchParams.get("room")?.trim().toUpperCase();
if (invited && ROOM_CODE.test(invited)) {
  selectMode("online");
  const token = savedRoomToken(invited);
  if (token) joinOnline(invited, { type: "resume", token });
  else {
    const join = byId("join-invite");
    join.hidden = false;
    join.addEventListener("click", () => joinOnline(invited, { type: "join" }));
  }
}
