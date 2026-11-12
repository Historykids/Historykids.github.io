import {
  BOOST_PADS, LAPS, PAD_HALF_WIDTH, PAD_LENGTH, ROAD_HALF, TRACK_LENGTH, createScene, trackSample
} from "./touge-racing-scene.js";

const byId = id => document.getElementById(id);
const game = byId("game");
const canvas = byId("track");
const hud = byId("hud");
const intro = byId("intro");
const paused = byId("paused");
const result = byId("result");
const start = byId("start");
const pause = byId("pause");
const resume = byId("resume");
const retry = byId("retry");
const countdown = byId("countdown");
const time = byId("time");
const speed = byId("speed");
const speedBar = byId("speed-bar");
const boostLabel = byId("boost");
const placeNumber = byId("place").firstChild;
const lapNumber = byId("lap").firstChild;
const touchButtons = [...document.querySelectorAll("[data-input]")];

const STORAGE_KEY = "historykids.tougeRacing.best.v1";
const racerConfigs = [
  { color: 0x37b8d5, lane: -1.9, distance: -14 },
  { color: 0xed6d4e, lane: 2.85, distance: -5.5, cruise: 42 },
  { color: 0xecc372, lane: -2.9, distance: -8.5, cruise: 40 },
  { color: 0x92abec, lane: .4, distance: -11.5, cruise: 38.5 }
];
const racers = racerConfigs.map(config => ({ ...config }));
const player = racers[0];
const finishLine = TRACK_LENGTH * LAPS;
const steering = new Map();
const keys = new Map([
  ["ArrowUp", "gas"], ["KeyW", "gas"],
  ["ArrowDown", "brake"], ["KeyS", "brake"],
  ["ArrowLeft", "left"], ["KeyA", "left"],
  ["ArrowRight", "right"], ["KeyD", "right"]
]);
const frame = {};
const next = {};
let scene;
let state = "loading";
let previousState;
let frameId = 0;
let lastFrame = 0;
let elapsed = 0;
let remaining = 0;
let bestTime = readBestTime();

function readBestTime() {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) return saved;
  } catch {
    // The race still works when the browser blocks storage.
  }
  return Infinity;
}

function formatTime(seconds) {
  const ticks = Math.round(seconds * 100);
  const minutes = Math.floor(ticks / 6000);
  const secs = String(Math.floor(ticks / 100) % 60).padStart(2, "0");
  const cents = String(ticks % 100).padStart(2, "0");
  return `${minutes}:${secs}.${cents}`;
}

function createMap() {
  const map = byId("map");
  const ctx = map.getContext("2d");
  const background = document.createElement("canvas");
  background.width = map.width;
  background.height = map.height;
  const brush = background.getContext("2d");
  const scale = .52;
  const projectX = x => map.width / 2 + x * scale;
  const projectY = z => map.height / 2 + z * scale;
  brush.beginPath();
  for (let i = 0; i <= 110; i++) {
    const p = trackSample(TRACK_LENGTH * i / 110);
    brush.lineTo(projectX(p.x), projectY(p.z));
  }
  brush.closePath();
  brush.lineJoin = "round";
  brush.lineWidth = 8;
  brush.strokeStyle = "#304759";
  brush.stroke();
  brush.lineWidth = 2.5;
  brush.strokeStyle = "#9ab8c7";
  brush.stroke();

  const line = trackSample(0);
  brush.beginPath();
  brush.moveTo(projectX(line.x - line.rx * 9), projectY(line.z - line.rz * 9));
  brush.lineTo(projectX(line.x + line.rx * 9), projectY(line.z + line.rz * 9));
  brush.lineWidth = 2;
  brush.strokeStyle = "#fff";
  brush.stroke();

  return function drawMap() {
    ctx.clearRect(0, 0, map.width, map.height);
    ctx.drawImage(background, 0, 0);
    for (let i = racers.length - 1; i >= 0; i--) {
      const racer = racers[i];
      const p = trackSample(racer.distance, frame);
      ctx.beginPath();
      ctx.arc(projectX(p.x + p.rx * racer.lane), projectY(p.z + p.rz * racer.lane),
        i === 0 ? 4 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#8de9ff" : "#ffc194";
      ctx.fill();
    }
  };
}

function resetRacers() {
  racers.forEach((racer, index) => {
    Object.assign(racer, racerConfigs[index], {
      speed: 0, lateralSpeed: 0, steer: 0, boost: 0, lastPad: -1,
      finishedAt: Infinity, contact: 0
    });
  });
}

function active() {
  return state === "countdown" || state === "racing";
}

function setState(nextState) {
  state = nextState;
  game.dataset.state = state;
  intro.hidden = !["loading", "ready", "error"].includes(state);
  hud.hidden = !active();
  paused.hidden = state !== "paused";
  result.hidden = state !== "finished";
  if (!active()) clearInput();
}

function clearInput() {
  steering.clear();
  touchButtons.forEach(button => button.classList.remove("pressed"));
}

function startRace() {
  clearInput();
  resetRacers();
  elapsed = 0;
  remaining = 3;
  lastFrame = 0;
  setState("countdown");
  refreshHud();
  render(0, true);
  pause.focus({ preventScroll: true });
  scheduleFrame();
}

function pauseRace() {
  if (!active()) return;
  previousState = state;
  setState("paused");
  cancelAnimationFrame(frameId);
  frameId = 0;
  resume.focus({ preventScroll: true });
}

function resumeRace() {
  if (state !== "paused") return;
  lastFrame = 0;
  setState(previousState);
  pause.focus({ preventScroll: true });
  scheduleFrame();
}

function readInputs() {
  const actions = [...steering.values()];
  return {
    gas: actions.includes("gas"),
    brake: actions.includes("brake"),
    turn: Number(actions.includes("right")) - Number(actions.includes("left"))
  };
}

function approach(value, target, delta) {
  return value + Math.max(-delta, Math.min(delta, target - value));
}

function turnAt(distance, lookAhead) {
  const p = trackSample(distance, frame);
  const ahead = trackSample(distance + lookAhead, next);
  return ahead.fx * p.rx + ahead.fz * p.rz;
}

function updatePlayer(dt) {
  const input = readInputs();
  const turn = turnAt(player.distance, 6);
  player.steer = approach(player.steer, input.turn, dt * 6.2);
  const slip = -turn * player.speed * player.speed * .029;
  const grip = input.brake ? 1.25 : 1;
  const speedRatio = Math.min(1, player.speed / 16);
  const lateralTarget = (player.steer * 8.5 * grip + slip) * speedRatio;
  player.lateralSpeed = approach(player.lateralSpeed, lateralTarget, dt * (input.brake ? 31 : 23));
  player.lane = Math.max(-ROAD_HALF - 2, Math.min(ROAD_HALF + 2, player.lane + player.lateralSpeed * dt));

  const distanceOnLap = (player.distance % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
  const padIndex = BOOST_PADS.findIndex(pad =>
    distanceOnLap >= pad.distance && distanceOnLap <= pad.distance + PAD_LENGTH
  );
  if (padIndex >= 0 && player.speed > 8 &&
      Math.abs(player.lane - BOOST_PADS[padIndex].lane) < PAD_HALF_WIDTH) {
    const padId = Math.floor(player.distance / TRACK_LENGTH) * BOOST_PADS.length + padIndex;
    if (padId !== player.lastPad) player.boost = 1.65;
    player.lastPad = padId;
  }
  player.boost = Math.max(0, player.boost - dt);
  player.contact = Math.max(0, player.contact - dt);

  const rough = Math.abs(player.lane) > ROAD_HALF - .2;
  const boosting = player.boost > 0 && !rough;
  const limit = rough ? 24 : boosting ? 63 : 47;
  if (input.brake) {
    player.speed = Math.max(0, player.speed - dt * 32);
  } else if (rough || input.gas || boosting) {
    const target = input.gas || boosting ? limit : 0;
    player.speed = approach(player.speed, target, dt * (rough ? 24 : boosting ? 31 : 20));
  } else {
    player.speed = Math.max(0, player.speed - dt * 8.5);
  }
}

function updateRival(racer, index, dt) {
  const corner = Math.abs(turnAt(racer.distance, 14));
  const cruise = racer.cruise + 1.8 * Math.sin(racer.distance * .04 + index);
  racer.speed = approach(racer.speed, cruise - 8.2 * corner, dt * (17 + index));
  const preferredLane = racerConfigs[index].lane + Math.sin(racer.distance * .033 + index) * 1.1;
  const change = approach(racer.lane, preferredLane, dt * 2.9) - racer.lane;
  racer.steer = change / dt * .15;
  racer.lane += change;

  if (Math.abs(player.distance - racer.distance) < 3.6 &&
      Math.abs(player.lane - racer.lane) < 1.75 && player.contact === 0) {
    player.speed *= .86;
    player.contact = .58;
  }
}

function updateRace(dt) {
  if (state === "countdown") {
    remaining -= dt;
    if (remaining > 0) return;
    setState("racing");
    dt = -remaining;
    if (dt === 0) return;
  }

  updatePlayer(dt);
  for (let index = 1; index < racers.length; index++) updateRival(racers[index], index, dt);
  for (const racer of racers) {
    const advance = racer.speed * dt;
    if (!Number.isFinite(racer.finishedAt) && racer.distance + advance >= finishLine) {
      racer.finishedAt = elapsed + (finishLine - racer.distance) / racer.speed;
    }
    racer.distance += advance;
  }
  elapsed += dt;
  if (Number.isFinite(player.finishedAt)) finishRace();
}

function rank() {
  return 1 + racers.slice(1).filter(racer =>
    Number.isFinite(player.finishedAt) ? racer.finishedAt < player.finishedAt : racer.distance > player.distance
  ).length;
}

function refreshHud() {
  const displayedSpeed = Math.round(player.speed * 3.6);
  placeNumber.nodeValue = rank();
  lapNumber.nodeValue = Math.min(LAPS, Math.floor(Math.max(0, player.distance) / TRACK_LENGTH) + 1);
  time.textContent = formatTime(elapsed);
  speed.textContent = displayedSpeed;
  speedBar.value = displayedSpeed;
  boostLabel.hidden = player.boost <= 0 || Math.abs(player.lane) > ROAD_HALF - .2;
  countdown.hidden = state !== "countdown" && elapsed > .75;
  const message = state === "countdown" ? String(Math.ceil(remaining)) : "GO!";
  if (countdown.textContent !== message) countdown.textContent = message;
}

function finishRace() {
  const previousBest = bestTime;
  const finishTime = player.finishedAt;
  if (finishTime < bestTime) {
    bestTime = finishTime;
    try {
      localStorage.setItem(STORAGE_KEY, String(bestTime));
    } catch {
      // Keep the record in memory for this visit.
    }
  }
  byId("result-place").textContent = rank();
  byId("result-time").textContent = formatTime(finishTime);
  byId("best-time").textContent = formatTime(bestTime);
  byId("record").hidden = finishTime >= previousBest;
  setState("finished");
  retry.focus({ preventScroll: true });
}

let drawMap;
function render(dt, resetCamera = false) {
  scene.render(state, dt, resetCamera);
  drawMap();
}

function scheduleFrame() {
  if (!frameId) frameId = requestAnimationFrame(tick);
}

function tick(timestamp) {
  frameId = 0;
  if (!active()) return;
  const dt = lastFrame ? Math.min(.1, (timestamp - lastFrame) / 1000) : 0;
  lastFrame = timestamp;
  if (dt > 0) updateRace(dt);
  refreshHud();
  render(dt);
  if (active()) scheduleFrame();
}

function unavailable(message) {
  cancelAnimationFrame(frameId);
  frameId = 0;
  setState("error");
  start.disabled = true;
  byId("error").textContent = message;
}

function resize() {
  if (!scene || state === "error") return;
  scene.resize(game.clientWidth, game.clientHeight);
  render(0, true);
}

start.addEventListener("click", startRace);
pause.addEventListener("click", pauseRace);
resume.addEventListener("click", resumeRace);
byId("restart").addEventListener("click", startRace);
retry.addEventListener("click", startRace);
window.addEventListener("keydown", event => {
  if (event.code === "Escape") {
    if (state === "paused") resumeRace();
    else pauseRace();
  }
  if (!active() || !keys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  steering.set(event.code, keys.get(event.code));
});
window.addEventListener("keyup", event => steering.delete(event.code));
window.addEventListener("blur", pauseRace);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseRace();
});

for (const button of touchButtons) {
  button.addEventListener("pointerdown", event => {
    if (!active() || event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    steering.set(event.pointerId, button.dataset.input);
    button.classList.add("pressed");
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(eventName, event => {
      steering.delete(event.pointerId);
      if (![...steering.values()].includes(button.dataset.input)) button.classList.remove("pressed");
    });
  }
}

canvas.addEventListener("webglcontextlost", event => {
  event.preventDefault();
  unavailable("3Dの描画が中断されたよ。ページを再読み込みしてね。");
});

try {
  resetRacers();
  scene = createScene(canvas, racers);
  drawMap = createMap();
  setState("ready");
  resize();
  new ResizeObserver(resize).observe(game);
  start.disabled = false;
} catch (error) {
  console.error(error);
  unavailable("3Dを表示できなかったよ。WebGL対応のブラウザで開いてね。");
}
