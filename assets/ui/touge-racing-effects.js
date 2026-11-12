const DRIFT_COLORS = ["#a6ebff", "#ffc648", "#ff76df"];
const COLORS = {
  boost: "#65e9ff", drift: "#ff84e6", item: "#ca9fff", lap: "#77efff",
  final: "#ffcb55", pass: "#aaff8c", contact: "#ff9a62", finish: "#ffd960"
};
const PRIORITY = { pass: 1, boost: 2, drift: 3, item: 4, lap: 5, final: 6 };
const NOTES = {
  count: [329], go: [392, 523, 784], drift: [587, 880], boost: [440, 659, 988],
  item: [523, 659, 1047], lap: [587, 784], final: [440, 587, 784],
  pass: [659, 880], contact: [142, 85], finish: [523, 659, 784, 1047]
};

export function createRaceEffects(game) {
  const layer = game.querySelector("#race-effects");
  const canvas = layer.querySelector("canvas");
  const context = canvas.getContext("2d");
  const banner = layer.querySelector("#race-announce");
  const [title, detail] = banner.children;
  const countdown = game.querySelector("#countdown");
  const itemIcon = game.querySelector("#item-icon");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const particles = [];
  let audio, sound = false, previous, count, announcement, time = 0;
  let finishTime = 0, celebrating = false, driftClock = 0, lastPass = -Infinity;
  let drawn = false, trails = [];
  let drivingEffect = "", driftTier = -1;
  let width = 1, height = 1;
  const anchor = {};

  function play(kind) {
    if (!sound || audio?.state !== "running") return;
    NOTES[kind].forEach((frequency, index) => {
      const at = audio.currentTime + index * .057;
      const voice = audio.createOscillator();
      const envelope = audio.createGain();
      voice.type = kind === "contact" ? "triangle" : "sine";
      voice.frequency.setValueAtTime(frequency, at);
      envelope.gain.setValueAtTime(.001, at);
      envelope.gain.exponentialRampToValueAtTime(.09, at + .012);
      envelope.gain.exponentialRampToValueAtTime(.001, at + .14);
      voice.connect(envelope);
      envelope.connect(audio.destination);
      voice.start(at);
      voice.stop(at + .15);
    });
  }

  function setSound(enabled) {
    sound = enabled;
    if (!sound) return;
    try {
      const Audio = window.AudioContext ?? window.webkitAudioContext;
      if (Audio) {
        audio ??= new Audio();
        audio.resume().catch(() => {});
      }
    } catch {
      sound = false;
    }
  }

  function reset() {
    previous = count = announcement = undefined;
    celebrating = false;
    finishTime = driftClock = time = 0;
    lastPass = -Infinity;
    trails = [];
    drivingEffect = "";
    driftTier = -1;
    particles.length = 0;
    banner.hidden = true;
    banner.getAnimations?.().forEach(animation => animation.cancel());
    game.removeAttribute("data-race-finish");
    layer.removeAttribute("data-driving");
    layer.removeAttribute("data-drift-tier");
    layer.style.removeProperty("--race-accent");
    if (context && drawn) context.clearRect(0, 0, width, height);
    drawn = false;
  }

  function resize() {
    if (!context) return;
    width = canvas.width = Math.max(1, Math.round(game.clientWidth * .72));
    height = canvas.height = Math.max(1, Math.round(game.clientHeight * .72));
    trails = Array.from({ length: 32 }, (_, index) => ({
      angle: (index + Math.random() * .7) * Math.PI / 16,
      phase: Math.random(), reach: .34 + Math.random() * .24
    }));
    drawn = false;
  }

  function message(kind, headline, caption = "", color = COLORS[kind]) {
    if (announcement && announcement.until > time && PRIORITY[kind] < announcement.priority) return;
    announcement = { until: time + (kind === "final" ? 1.3 : .92), priority: PRIORITY[kind] };
    banner.dataset.event = kind;
    banner.style.setProperty("--race-accent", color);
    title.textContent = headline;
    detail.textContent = caption;
    detail.hidden = !caption;
    banner.hidden = false;
    banner.getAnimations?.().forEach(animation => animation.cancel());
    if (!motion.matches) banner.animate?.([
      { opacity: 0, transform: "translate(-50%, -9px) scale(.82)" },
      { opacity: 1, transform: "translate(-50%, 0) scale(1.04)", offset: .20 },
      { opacity: 1, transform: "translate(-50%, 0) scale(1)" }
    ], { duration: 290, easing: "cubic-bezier(.15,.7,.25,1)" });
    play(kind);
  }

  function animateCountdown(value) {
    if (count === value) return;
    count = value;
    countdown.dataset.tick = value;
    if (!motion.matches) {
      countdown.getAnimations?.().forEach(animation => animation.cancel());
      countdown.animate?.([
        { transform: "translate(-50%, -50%) scale(1.27)", opacity: .78 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: .34 },
        { transform: "translate(-50%, -50%) scale(.94)", opacity: .95 }
      ], { duration: value === "GO!" ? 660 : 820, easing: "cubic-bezier(.19,1,.22,1)" });
    }
    if (value === "GO!") play("go");
    else if (Number(value) <= 3) play("count");
  }

  function burst(color, amount, x, y, direction = 0, confetti = false) {
    for (let index = 0; index < amount && particles.length < 80; index++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (.07 + Math.random() * .22) * (confetti ? 1.9 : 1);
      const life = (confetti ? .48 : .18) + Math.random() * (confetti ? .68 : .29);
      particles.push({
        x, y, color, life, remaining: life, confetti,
        vx: Math.cos(angle) * velocity + direction * .11,
        vy: Math.sin(angle) * velocity + (confetti ? -.22 : .085),
        size: 1.1 + Math.random() * (confetti ? 4.8 : 2.3)
      });
    }
  }

  function finish({ winner = false, record = false } = {}) {
    if (celebrating) return;
    celebrating = true;
    game.dataset.raceFinish = winner || record ? "gold" : "blue";
    drivingEffect = "";
    layer.removeAttribute("data-driving");
    banner.hidden = true;
    announcement = undefined;
    play("finish");
    if (motion.matches) return;
    finishTime = 1.16;
    [COLORS.finish, "#ff7fce", "#79eeff", "#f2fff9"].forEach((color, index) => {
      burst(color, 10, index % 2 ? .88 : .12, .51, index % 2 ? -1 : 1, true);
    });
  }

  function render(dt, scene, sample) {
    time += dt;
    finishTime = Math.max(0, finishTime - dt);
    if (announcement && announcement.until <= time) {
      announcement = undefined;
      banner.hidden = true;
    }
    const { racer, lap, place, item, active, onRoad, lapSplit, elapsed, lastLap } = sample;
    const tier = racer.driftCharge >= 1.05 ? 2 : racer.driftCharge >= .55 ? 1 : 0;
    const driving = active && racer.finishedAt === null;
    const drifting = driving && racer.drifting;
    const boosting = driving && onRoad && racer.boost > 0;
    const effect = boosting ? "boost" : drifting ? "drift" : "";
    if (drivingEffect !== effect) {
      drivingEffect = effect;
      layer.dataset.driving = effect;
    }
    if (driftTier !== tier) {
      driftTier = tier;
      layer.dataset.driftTier = String(tier);
      layer.style.setProperty("--race-accent", DRIFT_COLORS[tier]);
    }

    const newBoost = boosting && previous && (!previous.boosting || racer.boost > previous.boost + .28);
    const hit = driving && racer.contact > .18 && previous && previous.contact <= .18;
    if (driving && previous) {
      if (newBoost) {
        const fromDrift = previous.drifting && previous.tier > 0 && !drifting;
        message(fromDrift ? "drift" : "boost", fromDrift ? (previous.tier === 2 ? "SUPER DRIFT!" : "DRIFT BOOST!") : "BOOST!", fromDrift ? "ドリフト加速" : "加速中");
      }
      if (item && racer.pickup > 0 && (racer.pickup > previous.pickup + .30 || item !== previous.item)) {
        message("item", "アイテム GET!", item.label, item.color);
        if (!motion.matches) {
          itemIcon.getAnimations?.().forEach(animation => animation.cancel());
          itemIcon.animate?.([
            { transform: "scale(.84)", boxShadow: "0 0 0 0 " + item.color },
            { transform: "scale(1.22)", boxShadow: "0 0 20px 4px " + item.color, offset: .3 },
            { transform: "scale(1)", boxShadow: "0 0 0 0 transparent" }
          ], { duration: 460, easing: "ease-out" });
          burst(item.color, 12, .065, .07, 1);
        }
      }
      if (lap > previous.lap) {
        message(lastLap ? "final" : "lap", lastLap ? "FINAL LAP!" : "LAP " + lap,
          lapSplit ? "前のラップ " + lapSplit : lastLap ? "最終ラップ" : "次の周回");
      }
      if (elapsed > 2.5 && place < previous.place && time - lastPass > 1.2) {
        lastPass = time;
        message("pass", place === 1 ? "トップに浮上！" : place + "位にアップ！", "オーバーテイク");
      }
      if (hit) play("contact");
    }
    previous = { lap, place, item, pickup: racer.pickup, boost: racer.boost, boosting, drifting, tier, contact: racer.contact };
    if (!context || motion.matches) {
      if (context && drawn) context.clearRect(0, 0, width, height);
      drawn = false;
      particles.length = 0;
      return;
    }

    driftClock += dt;
    const spark = drifting && driftClock > .052;
    if (spark || newBoost || hit) {
      driftClock = 0;
      for (const side of [-1, 1]) {
        if (!scene.tirePoint(side, anchor)) continue;
        if (spark) burst(DRIFT_COLORS[tier], tier + 2, anchor.x, anchor.y, side);
        if (newBoost) burst(COLORS.boost, 7, anchor.x, anchor.y, side);
        if (hit) burst(COLORS.contact, 6, anchor.x, anchor.y, side);
      }
    }
    if (drawn) context.clearRect(0, 0, width, height);
    const speedLines = driving && onRoad ? (boosting ? 1 : Math.max(0, (racer.speed - 37) / 38)) : 0;
    drawn = speedLines > 0 || particles.length > 0;
    if (speedLines > 0) {
      const unit = Math.min(width, height);
      context.strokeStyle = "#95eaff";
      context.lineWidth = Math.max(1, unit / 340);
      context.lineCap = "round";
      for (const [index, { angle, phase, reach }] of trails.entries()) {
        if (!boosting && index % 3 !== 0) continue;
        const progress = (phase + time * 2.45) % 1;
        const x = Math.cos(angle) * width, y = Math.sin(angle) * height;
        const start = .32 + progress * reach;
        const end = start + .048 + progress * .115;
        context.globalAlpha = progress * .74 * speedLines;
        context.beginPath();
        context.moveTo(width * .5 + x * start, height * .45 + y * start);
        context.lineTo(width * .5 + x * end, height * .45 + y * end);
        context.stroke();
      }
    }
    for (let index = particles.length - 1; index >= 0; index--) {
      const spark = particles[index];
      spark.remaining -= dt;
      if (spark.remaining <= 0) {
        particles.splice(index, 1);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += dt * (spark.confetti ? .57 : .35);
      context.globalAlpha = Math.min(1, spark.remaining / spark.life * 1.75);
      context.fillStyle = spark.color;
      const x = spark.x * width, y = spark.y * height;
      context.fillRect(x, y, spark.size, spark.confetti ? spark.size * .65 : spark.size * 1.8);
    }
    context.globalAlpha = 1;
  }

  return { reset, resize, setSound, animateCountdown, render, finish, get running() { return finishTime > 0; } };
}
