import { createScene } from "./touge-racing-scene.js?v=7";
import { getTrack, LAPS, TRACKS } from "./touge-racing-tracks.mjs?v=7";
import {
  EMPTY_INPUT, ROOM_CODE, CPU_DIFFICULTIES, CPU_FIELD_SIZE, MIN_ROOM_PLAYERS, VISIBLE_RIVALS, ITEMS, STEP, TRIAL_LIMIT, TRIAL_MAX_TICKS, TRIAL_PROTOCOL,
  applyDrive, createItemRespawns, createRacer, createTrialRacer, formatTime, isDriving, lapTime, rankRacers, recordTrialInput, stepRace
} from "./touge-racing-rules.mjs?v=7";
import { OnlineRace, makeRoomCode, savedRoomToken } from "./touge-racing-online.js?v=6";
import { createRoomDirectory, raceRequest } from "./touge-racing-menu.js?v=7";

import { mountRaceUI } from "./touge-racing-ui.js?v=7";
import { requireRaceName, readRaceStorage as load, saveRaceStorage as save, safeRacePage } from "./touge-racing-profile.mjs?v=6";

const profile = requireRaceName();
if (profile) initialize(profile);

function initialize(profile) {
  const params = new URL(location.href).searchParams;
  const mode = document.body.dataset.racePage === "rooms" ? "online" : params.get("mode") === "trial" ? "trial" : "cpu";
  mountRaceUI(document.getElementById("race-app"), mode === "trial", mode === "cpu" ? CPU_DIFFICULTIES : null, LAPS);
  const byId = id => document.getElementById(id);
  const setup = byId("setup"), lobby = byId("lobby"), game = byId("game");
  const start = byId("start"), pause = byId("pause"), resume = byId("resume"), retry = byId("retry");
  const courseGrid = byId("course-grid");
  const keyboardHelp = document.querySelector(".race-heading .keyboard");
  const countdown = byId("countdown");
  const time = byId("time"), speed = byId("speed"), speedBar = byId("speed-bar");
  const placeNumber = byId("place").firstChild, lapNumber = byId("lap").firstChild;
  const buttons = [...document.querySelectorAll("[data-input]")];
  const held = new Map();
  const keys = new Map([
    ["ArrowUp", "gas"], ["KeyW", "gas"], ["ArrowDown", "brake"], ["KeyS", "brake"],
    ["ArrowLeft", "left"], ["KeyA", "left"], ["ArrowRight", "right"], ["KeyD", "right"],
    ["ShiftLeft", "drift"], ["ShiftRight", "drift"], ["Space", "item"]
  ]);

  const BEST_PREFIX = "historykids.tougeRacing.best.long.";
  const TRIAL_BEST_PREFIX = "historykids.tougeRacing.trial.best.3laps.";
  const CPU_DIFFICULTY_KEY = "historykids.tougeRacing.cpuDifficulty";
  const cpuDifficulty = byId("cpu-difficulty");
  const itemHint = matchMedia("(any-pointer: coarse)").matches ? "アイテムボタンで使う" : "Spaceで使う";
  const lapHud = [...document.querySelectorAll("#lap-hud dd")];
  const lapResult = [...document.querySelectorAll("#result-laps dd")];
  const PLAYER_KEY = "historykids.tougeRacing.trial.player";
  const defaultTrack = TRACKS[0].id;
  const chosen = params.get("track");
  let selected = TRACKS.some(course => course.id === chosen) ? chosen : defaultTrack;
  let state = "setup";
  let race, online, onlinePhase, previousState, menuOpen = false;
  let frameId = 0, lastFrame = 0, itemTap = false;
  const setDirectoryActive = createRoomDirectory(code => joinOnline(code, { type: "join" }));
  const modes = {
    cpu: "CPUと対戦する →", online: "このコースで部屋を作る →", trial: "タイムアタック開始 →"
  };

  function bestTime(id, trial = false) {
    const key = (trial ? TRIAL_BEST_PREFIX : BEST_PREFIX) + id;
    const saved = Number(load(key));
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
      const region = document.createElement("span");
      region.className = "course-region";
      region.textContent = course.region;
      caption.append(region, title, difficulty);
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
    byId("selected-info").textContent = course.region + " · 1周 " + (course.length / 1000).toFixed(2) + " km · " + course.description +
      (mode !== "online" && Number.isFinite(best) ? " 自己ベスト " + formatTime(best) : "");
    if (mode === "trial") byId("open-ranking").href = "./touge-racing-ranking.html?track=" + encodeURIComponent(id);
  }

  function setupMenu() {
    byId("online-entry").hidden = mode !== "online";
    byId("game-title").textContent = { cpu: "CPU対戦", online: "オンライン対戦", trial: "タイムアタック" }[mode];
    start.textContent = modes[mode];
    document.title = byId("game-title").textContent + "｜峠レーシング 3D";
    if (mode === "online") byId("courses-title").textContent = "コースを選んで部屋を作る";
    if (mode === "trial") {
      keyboardHelp.textContent = "↑↓←→ / WASD　Shiftでドリフト";
      byId("race-tip").textContent = "1人で3周。周回ごとのラップを計測し、3周の合計タイムで競うよ。";
    }
    const label = byId("profile-link");
    label.textContent = profile + " · 名前を変更";
    label.href = "./touge-racing.html?edit=1&next=" + encodeURIComponent(safeRacePage(location.href));
    setDirectoryActive(mode === "online");
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
    itemTap = false;
    buttons.forEach(button => button.classList.remove("pressed"));
    if (online) online.control(EMPTY_INPUT, true);
  }

  function input() {
    const actions = [...held.values()];
    return {
      gas: actions.includes("gas"),
      brake: actions.includes("brake"),
      turn: Number(actions.includes("right")) - Number(actions.includes("left")),
      drift: actions.includes("drift"), item: itemTap || actions.includes("item")
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

  function prepareRace(track, racers, isOnline, isTrial = false, snapshot = null) {
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
    byId("item-hud").hidden = isTrial;
    byId("lap-total").textContent = " / " + LAPS;
    if (isTrial) byId("result-laps").hidden = true;
    for (const button of buttons) if (button.dataset.input === "item") button.hidden = isTrial;
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
        ticks: 0, accumulator: 0, tape: isTrial ? [] : null, drawMap, canvas, snapshot,
        itemRespawns: !isOnline && !isTrial ? createItemRespawns(track) : null
      };
      race.scene = createScene(canvas, racers, track, { showItems: !isTrial && !!track.region });
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
      createRacer(0, { name: profile }),
      ...Array.from({ length: CPU_FIELD_SIZE - 1 }, (_, i) => createRacer(i + 1, { name: "CPU " + (i + 1), cpu: true, difficulty: cpuDifficulty.value }))
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

  function showLapTimes(fields, elapsed = null) {
    const ends = race.player.lapEnds;
    fields.forEach((field, index) => {
      const split = lapTime(ends, index);
      const active = elapsed !== null && index === ends.length;
      const value = Number.isFinite(split) ? split : active ? elapsed - (ends.at(-1) ?? 0) : null;
      const text = value === null ? "—" : formatTime(value);
      if (field.textContent !== text) field.textContent = text;
      field.parentElement.dataset.active = String(active);
    });
  }

  function refreshHud() {
    const { player, racers, track, elapsed, remaining } = race;
    const place = race.snapshot?.rank ?? rankRacers(racers).indexOf(player) + 1;
    placeNumber.nodeValue = place;
    game.dataset.rank = String(place);
    byId("field-size").textContent = (race.snapshot?.fieldSize ?? racers.length) + "台中";
    const item = ITEMS[player.item];
    byId("item-icon").textContent = item?.icon ?? "◇";
    byId("item-name").textContent = item?.label ?? (player.shield > 0 ? "ガード中" : player.grip > 0 ? "グリップ中" : player.slow > 0 ? "パルス被弾" : "アイテムなし");
    byId("item-hud").style.setProperty("--item-color", item?.color ?? "#a7bcdb");
    byId("item-hud").dataset.ready = String(!!item);
    byId("item-hint").textContent = item ? (player.pickup > 0 ? "アイテムをゲット！" : itemHint) : "紫の箱を通過";
    byId("drift-label").hidden = !player.drifting;
    byId("drift-meter").value = player.driftCharge;
    lapNumber.nodeValue = race.isTrial ? Math.min(LAPS, player.lapEnds.length + 1)
      : Math.min(LAPS, Math.floor(Math.max(0, player.distance) / track.length) + 1);
    if (race.isTrial) showLapTimes(lapHud, elapsed);
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
    const { track, racers, player } = race;
    race.accumulator += dt;
    while (race.accumulator + 1e-9 >= STEP) {
      race.accumulator -= STEP;
      player.input = input();
      itemTap = false;
      if (race.isTrial) recordTrialInput(race.tape, player.input);
      stepRace(track, racers, STEP, race.ticks * STEP, LAPS, race.itemRespawns);
      race.ticks++;
      race.elapsed = race.ticks * STEP;
      if (race.isTrial && (player.finishedAt !== null || race.ticks >= TRIAL_MAX_TICKS)) {
        finishTrial();
        return;
      }
      if (!race.isTrial && player.finishedAt !== null) {
        finishCPU();
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
    online.control(drive, itemTap);
    itemTap = false;
    if (snapshot.phase !== "racing") return;
    for (const racer of race.racers) {
      const target = race.targets?.get(racer.id);
      if (!target) continue;
      const own = racer === race.player;
      racer.finishedAt = target.finishedAt;
      racer.dnf = target.dnf;
      racer.contact = Math.max(0, target.contact - age);
      racer.item = target.item;
      racer.shield = target.shield;
      racer.grip = Math.max(0, (target.grip ?? 0) - age);
      racer.pickup = Math.max(0, (target.pickup ?? 0) - age);
      racer.slow = target.slow;
      if (own && isDriving(racer) && online.joined && age < .55) {
        applyDrive(race.track, racer, drive, dt);
        racer.distance += racer.speed * dt;
      }
      const lead = Math.min(.095, age) * target.speed;
      const distanceError = target.distance + lead - racer.distance;
      const blend = 1 - Math.exp(-(own ? 8 : 16) * dt);
      const snap = !isDriving(racer) || Math.abs(distanceError) > 13;
      if (!own || Math.abs(distanceError) > .08) racer.distance += distanceError * (snap ? 1 : blend);
      if (!own || Math.abs(target.lane - racer.lane) > .04) racer.lane += (target.lane - racer.lane) * (snap ? 1 : blend);
      racer.speed += (target.speed - racer.speed) * (snap ? 1 : blend * (own ? .46 : 1));
      if (!own || snap) {
        racer.steer = target.steer;
        racer.boost = target.boost;
        racer.drifting = target.drifting;
        racer.driftCharge = target.driftCharge;
      } else if (target.boost > racer.boost + .18) racer.boost = target.boost;
    }
    if (race.player.finishedAt !== null && online.joined) {
      setRaceMessage("ゴール！ ほかの選手のゴールを待っています。");
    }
  }

  function renderScene(dt, resetCamera) {
    const boxes = race.isOnline ? race.snapshot?.itemRespawns : race.itemRespawns;
    race.scene.render(state, dt, resetCamera, boxes, race.elapsed);
  }

  function resize() {
    if (!race?.scene || game.hidden) return;
    race.scene.resize(game.clientWidth, game.clientHeight);
    renderScene(0, true);
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
    renderScene(dt, false);
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
    byId("result-laps").hidden = false;
    showLapTimes(lapResult);
    byId("result-note").textContent = finished ? "" : (TRIAL_LIMIT / 60) + "分以内に3周するとランキングに登録できるよ。";
    byId("trial-submit").hidden = !finished;
    byId("submit-time").disabled = false;
    byId("trial-status").textContent = "";
    byId("trial-profile").textContent = profile + "の記録として登録";
    byId("result-ranking").href = "./touge-racing-ranking.html?track=" + encodeURIComponent(track.id);
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
    trialPlayer ??= load(PLAYER_KEY) || crypto.randomUUID();
    save(PLAYER_KEY, trialPlayer);
    const button = byId("submit-time");
    const status = byId("trial-status");
    button.disabled = true;
    status.textContent = "走行記録を確認中…";
    try {
      const result = await raceRequest("/race/leaderboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocol: TRIAL_PROTOCOL, track: run.track.id, player: trialPlayer, name: profile, tape: run.tape })
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
      for (const racer of race.racers) Object.assign(racer, race.targets.get(racer.id));
      byId("result-title").textContent = "レース終了";
      byId("trial-submit").hidden = true;
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
    retry.hidden = !host || count < MIN_ROOM_PLAYERS;
    retry.disabled = retry.hidden;
    retry.textContent = "同じメンバーでもう一度";
    byId("result-note").textContent = count < MIN_ROOM_PLAYERS ? "再戦には2人以上必要だよ。" :
      host ? "残っているメンバーで再戦できるよ。" : "ホストが再戦を選ぶと、もう一度走れるよ。";
    if (first) (retry.hidden ? byId("back-to-courses") : retry).focus({ preventScroll: true });
  }

  function lobbySnapshot(snapshot, id) {
    const count = snapshot.players.filter(player => player.connected).length;
    const host = snapshot.host === id;
    byId("lobby-count").textContent = "参加者 " + count + "人";
    byId("lobby-course").textContent = getTrack(snapshot.trackId).name + " · 3周";
    fillList(byId("seats"), snapshot.players.map(player => {
      const own = player.id === id;
      const suffix = own ? "（あなた）" : "";
      const label = player.id === snapshot.host ? "ホスト" : "参加済み";
      return [player.name + suffix, player.connected ? label : "再接続待ち", own];
    }));
    byId("online-start").disabled = !host || count < MIN_ROOM_PLAYERS;
    byId("online-start").textContent = count < MIN_ROOM_PLAYERS ? "もう1人の参加を待っています" :
      host ? "レース開始 →" : "ホストの開始を待っています";
  }

  function mergeNearby(snapshot, id) {
    const targets = new Map(snapshot.racers.map(racer => [racer.id, racer]));
    race.targets = targets;
    const local = targets.get(id);
    if (local && race.player.id !== id) Object.assign(race.player, local);
    for (const rival of race.racers.slice(1)) if (!targets.has(rival.id)) rival.dnf = true;
    const retained = new Set(race.racers.filter(racer => targets.has(racer.id)).map(racer => racer.id));
    for (const racer of snapshot.racers) {
      if (retained.has(racer.id)) continue;
      const spot = race.racers.find((candidate, index) => index > 0 && !targets.has(candidate.id));
      if (!spot) break;
      Object.assign(spot, createRacer(racer.slot, { grid: true }), racer);
    }
  }

  function onlineSnapshot(snapshot, id) {
    const formerPhase = onlinePhase;
    onlinePhase = snapshot.phase;
    if (snapshot.phase === "lobby") {
      lobbySnapshot(snapshot, id);
      return;
    }
    if (!race || (snapshot.phase === "countdown" && formerPhase === "finished")) {
      const track = getTrack(snapshot.trackId, { classic: snapshot.layout !== "long" });
      const own = snapshot.racers.find(racer => racer.id === id);
      if (!track || !own) return;
      const initial = [own, ...snapshot.racers.filter(racer => racer.id !== id).slice(0, VISIBLE_RIVALS)];
      const racers = initial.map(racer => Object.assign(createRacer(racer.slot, { grid: true }), racer));
      while (racers.length <= VISIBLE_RIVALS) {
        const index = racers.length;
        racers.push(Object.assign(createRacer(index, { id: "empty-" + index, grid: true }), { dnf: true }));
      }
      if (!prepareRace(track, racers, true, false, snapshot)) return;
    }
    mergeNearby(snapshot, id);
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
    showState("lobby");
    window.scrollTo(0, 0);
    byId("join-invite").hidden = true;
    byId("lobby-course").textContent = "コース情報を確認中…";
    byId("lobby-count").textContent = "参加者 0人";
    byId("online-start").disabled = true;
    byId("online-start").textContent = "接続中…";
    byId("seats").replaceChildren();
    const link = new URL(location.href);
    link.searchParams.set("room", code);
    byId("invite-link").value = link.href;
    byId("invite-link").hidden = true;
    rememberRoom(code);
    online = new OnlineRace(code, { ...request, name: profile }, {
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

  if (cpuDifficulty) {
    const preferred = load(CPU_DIFFICULTY_KEY);
    cpuDifficulty.value = Object.hasOwn(CPU_DIFFICULTIES, preferred) ? preferred : "normal";
    cpuDifficulty.addEventListener("change", () => save(CPU_DIFFICULTY_KEY, cpuDifficulty.value));
  }
  start.addEventListener("click", () => {
    if (mode === "online") joinOnline(makeRoomCode(), { type: "create", trackId: selected, layout: "long" });
    else startLocalRace();
  });
  byId("trial-submit").addEventListener("submit", submitTrial);
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
    if (event.code === "Space" && !event.repeat) itemTap = true;
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
      if (button.dataset.input === "item") itemTap = true;
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
  setupMenu();
  start.disabled = false;
  new ResizeObserver(resize).observe(game);
  const invited = new URL(location.href).searchParams.get("room")?.trim().toUpperCase();
  if (mode === "online" && invited && ROOM_CODE.test(invited)) {
    const token = savedRoomToken(invited);
    if (token) joinOnline(invited, { type: "resume", token });
    else {
      const join = byId("join-invite");
      join.hidden = false;
      join.addEventListener("click", () => joinOnline(invited, { type: "join" }));
    }
  }

}
