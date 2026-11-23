import { enterTerrain, moveAcrossTerrain, turnAcrossTerrain, updateTerrainProgress } from "./touge-racing-terrain.mjs?v=28";
import { courseRamps, ITEM_ZONE_AFTER, ITEM_ZONE_BEFORE, ITEM_LANES, LAPS, driveSample, lapDistance, racerWorldPosition, rampHeight } from "./touge-racing-tracks.mjs?v=28";

export const RACE_PROTOCOL = "touge-racing-1";
export const CPU_FIELD_SIZE = 4;
export const ROOM_SIZE = CPU_FIELD_SIZE;
export const MIN_ROOM_PLAYERS = 2;
export const VISIBLE_RIVALS = 16;
export const COUNTDOWN = 5;
export const RACE_LIMIT = 360;
export const ITEM_RESPAWN_SECONDS = 1;
export const PULSE_LIFETIME = 2.6;
const PULSE_SPEED = 88;
export const STEP = 1 / 30;
export const TRIAL_PROTOCOL = "touge-time-attack-14";
export const RAMP_TAP_TRIAL_PROTOCOL = "touge-time-attack-13";
export const ALL_RAMPS_PROTOCOL = "touge-time-attack-12";
export const GROUND_JUMP_TRIAL_PROTOCOL = "touge-time-attack-11";
export const MANUAL_TRIAL_PROTOCOL = "touge-time-attack-10";
export const ASSISTED_TRIAL_PROTOCOL = "touge-time-attack-9";
export const TERRAIN_TRIAL_PROTOCOL = "touge-time-attack-8";
export const TURBO_TRIAL_PROTOCOL = "touge-time-attack-7";
export const OFFROAD_TRIAL_PROTOCOL = "touge-time-attack-6";
export const SHORTCUT_TRIAL_PROTOCOL = "touge-time-attack-5";
export const MAIN_ROAD_TRIAL_PROTOCOL = "touge-time-attack-4";
export const PREVIOUS_TRIAL_PROTOCOL = "touge-time-attack-3";
export const usesTrialTerrain = protocol => [TRIAL_PROTOCOL, RAMP_TAP_TRIAL_PROTOCOL, ALL_RAMPS_PROTOCOL, GROUND_JUMP_TRIAL_PROTOCOL, MANUAL_TRIAL_PROTOCOL, ASSISTED_TRIAL_PROTOCOL, TERRAIN_TRIAL_PROTOCOL].includes(protocol);
export const JUMP_KEYS = Object.freeze(["J", "K", "L", "I"]);
export const JUMP_COMMAND_TIME = 1.05;
export const JUMP_BOOST_SPEED = 82;
const JUMP_BOOST_SECONDS = 2.1;
const jumpCommands = [
  [1, 3, 2, 4, 1, 2],
  [3, 1, 4, 2, 3, 4],
  [2, 4, 1, 3, 2, 1]
].map(Object.freeze);
export const jumpCommand = rampId => jumpCommands[rampId];
export const TRIAL_LIMIT = 360;
export const DEFAULT_RACE_SPEED = "150cc";
export const RACE_SPEEDS = Object.freeze({
  "100cc": { label: "100cc", scale: .8, description: "ゆったり" },
  "150cc": { label: "150cc", scale: 1, description: "スタンダード" },
  "200cc": { label: "200cc", scale: 1.22, description: "ハイスピード" },
  dopagaki: { label: "ドパガキ", scale: 1.56, description: "超高速・ネオン演出" }
});
const standardSpeed = RACE_SPEEDS[DEFAULT_RACE_SPEED].scale;
export const isRaceSpeed = value => typeof value === "string" && Object.hasOwn(RACE_SPEEDS, value);
export const DOPA_COLORS = ["#41efff", "#ff5de2", "#ffe04f", "#a381ff", "#97ff7c", "#ff8d55"];
export const DOPA_SKY = ["#221655", "#9c4c9a"];
export const CPU_DIFFICULTIES = Object.freeze({
  easy: { label: "やさしい", speed: .77, acceleration: .77, corner: 10.5, itemDelay: 1.45 },
  normal: { label: "ふつう", speed: 1, acceleration: 1, corner: 8.2, itemDelay: .7 },
  hard: { label: "むずかしい", speed: 1.14, acceleration: 1.22, corner: 6.8, itemDelay: .38 }
});
export const TRIAL_MAX_TICKS = TRIAL_LIMIT * 30;
export const ROOM_CODE = /^[2-9A-HJ-NP-Z]{6}$/;
export const EMPTY_INPUT = Object.freeze({ gas: false, brake: false, turn: 0, drift: false, item: false });
export const LOBBY_CHAT_LIMIT = 20;
export const LOBBY_CHAT_COOLDOWN = 1000;
export const LOBBY_PHRASES = Object.freeze({
  hello: "よろしく！", ready: "準備OK！", wait: "ちょっと待って！",
  start: "始めよう！", goodLuck: "がんばろう！", course: "このコース楽しみ！",
  thanks: "ありがとう！", sorry: "ごめん！", rematch: "もう一戦やろう！",
  goodRace: "いいレースだった！", lastRace: "これがラスト！", bye: "また遊ぼう！"
});
export const LOBBY_EMOJIS = Object.freeze({
  wave: "👋", like: "👍", salute: "🫡", smile: "😄", lol: "😂", wow: "😮",
  fire: "🔥", flag: "🏁", car: "🏎️", trophy: "🏆", clap: "👏", party: "🎉"
});
export function lobbyChatText(id) {
  if (typeof id !== "string") return null;
  if (Object.hasOwn(LOBBY_PHRASES, id)) return LOBBY_PHRASES[id];
  return Object.hasOwn(LOBBY_EMOJIS, id) ? LOBBY_EMOJIS[id] : null;
}
export const COLORS = [0x37b8d5, 0xed6d4e, 0xecc372, 0x92abec, 0x74db91, 0xd892f2, 0xf5a55a, 0xec8da7];
const startingLanes = [-1.9, 2.85, -2.9, .4];
const startingDistances = [-14, -5.5, -8.5, -11.5];
const cruise = [0, 42, 40, 38.5];

export const ITEMS = Object.freeze({
  turbo: { icon: "⚡", label: "ターボ", color: "#ffd566" },
  shield: { icon: "⬡", label: "ガード", color: "#8ddcff" },
  pulse: { icon: "◎", label: "パルス", color: "#f3a3ff" },
  grip: { icon: "✦", label: "グリップ", color: "#9dffac" },
  backPulse: { icon: "⇠", label: "バックパルス", color: "#ffa3d2" },
  recovery: { icon: "↺", label: "リカバー", color: "#ffd1a2" }
});
const itemTypes = Object.keys(ITEMS);
const TURBO_SECONDS = 2.2;
const LEGACY_OFFROAD_SECONDS = 14;

export function createRacer(slot, { id = String(slot), name = "", cpu = false, grid = false, difficulty = "normal" } = {}) {
  return {
    id, name, slot, color: COLORS[slot % COLORS.length], cpu, difficulty,
    lane: grid ? [-4.6, -1.55, 1.55, 4.6][slot % 4] : startingLanes[slot],
    distance: grid ? -6 - Math.floor(slot / 4) * 5.4 : startingDistances[slot],
    speed: 0, shortcut: false, offroadTime: 0, turboTime: 0, lateralSpeed: 0, steer: 0, boost: 0, lastPad: -1, contact: 0,
    finishedAt: null, dnf: false, input: EMPTY_INPUT,
    airY: 0, verticalSpeed: 0, airborne: false, jumpHeld: false, jumpAge: 0, trick: false, landing: 0,
    jumpRamp: -1, jumpProgress: 0, jumpBoost: 0,
    drifting: false, driftCharge: 0, shield: 0, grip: 0, slow: 0, pickup: 0, item: null, lastBox: -1, itemHeld: false, itemReady: 0
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, delta) => value + clamp(target - value, -delta, delta);
const frame = {}, next = {};

export function turnAt(track, distance, lookAhead, shortcut = false) {
  const p = driveSample(track, distance, shortcut, frame);
  const ahead = driveSample(track, distance + lookAhead * (shortcut ? track.shortcut.ratio : 1), shortcut, next);
  return ahead.fx * p.rx + ahead.fz * p.rz;
}

export function applyDrive(track, racer, input, dt, speedScale = standardSpeed) {
  if (track.manualDrive && !track.assistedSteering && !racer.free) enterTerrain(track, racer);
  const handlingStep = dt * speedScale;
  const halfWidth = raceHalfWidth(track, racer);
  const turn = racer.free ? 0 : turnAt(track, racer.distance, 6, racer.shortcut);
  racer.steer = approach(racer.steer, input.turn, handlingStep * 6.2);
  const normalSpeed = racer.speed / speedScale;
  const drifting = !!input.drift && !!input.turn && normalSpeed >= 15 && (racer.free || Math.abs(racer.lane) < halfWidth);
  if (drifting) racer.driftCharge = Math.min(1.5, racer.driftCharge + dt);
  else if (racer.drifting) {
    if (racer.driftCharge >= .55) racer.boost = Math.max(racer.boost, racer.driftCharge >= 1.05 ? 1.65 : .85);
    racer.driftCharge = 0;
  }
  racer.drifting = drifting;
  const gripping = racer.grip > 0;
  const slip = -turn * normalSpeed ** 2 * (drifting ? .019 : .029) * (gripping ? .52 : 1);
  const grip = (input.brake ? 1.25 : 1) * (gripping ? 1.16 : 1);
  const lateralTarget = (racer.steer * (drifting ? 11.5 : 8.5) * grip + slip) * Math.min(1, normalSpeed / 16);
  const accelerationStep = handlingStep * speedScale;
  if (racer.free) turnAcrossTerrain(racer, input, dt, speedScale);
  else {
    racer.lateralSpeed = approach(racer.lateralSpeed, lateralTarget * speedScale, accelerationStep * (input.brake ? 31 : 23));
    racer.lane = clamp(racer.lane + racer.lateralSpeed * dt, -halfWidth - 2, halfWidth + 2);
  }

  const distanceOnLap = ((racer.distance % track.length) + track.length) % track.length;
  const padIndex = track.pads.findIndex(pad =>
    distanceOnLap >= pad.distance && distanceOnLap <= pad.distance + track.padLength
  );
  if (!racer.airborne && (!racer.free || track.manualDrive && racer.onAsphalt) && !racer.shortcut && padIndex >= 0 && normalSpeed > 8 &&
      Math.abs(racer.lane - track.pads[padIndex].lane) < track.padHalfWidth) {
    const padId = Math.floor(racer.distance / track.length) * track.pads.length + padIndex;
    if (padId !== racer.lastPad) racer.boost = 1.65;
    racer.lastPad = padId;
  }
  racer.boost = Math.max(0, racer.boost - dt);
  racer.jumpBoost = Math.max(0, (racer.jumpBoost ?? 0) - dt);
  const rough = !racer.airborne && isRoughSurface(track, racer);
  const boosting = boostRemaining(racer) > 0 && !rough;
  const heavyTerrain = rough && track.terrain && !track.legacyTerrainSpeed && !gripping;
  const launchBoost = racer.jumpBoost > 0 && !rough && racer.slow <= 0;
  const limit = heavyTerrain ? 19 : racer.slow > 0 ? 25 :
    rough ? (gripping ? 43 : 24) : launchBoost ? JUMP_BOOST_SPEED : boosting ? 63 : drifting ? 42 : 47;
  const target = input.gas || boosting ? limit * speedScale : 0;
  const terrainDrag = heavyTerrain ? 55 : 24;
  if (input.brake) racer.speed = Math.max(0, racer.speed - accelerationStep * Math.max(32, terrainDrag));
  else if (rough || input.gas || boosting) {
    const acceleration = rough ? (racer.speed > target ? terrainDrag : 24) : launchBoost ? 44 : boosting ? 31 : 20;
    racer.speed = approach(racer.speed, target, accelerationStep * acceleration);
  } else racer.speed = Math.max(0, racer.speed - accelerationStep * 8.5);
}

function applyCPU(track, racer, dt, speedScale) {
  const corner = Math.abs(turnAt(track, racer.distance, 14, racer.shortcut));
  const level = CPU_DIFFICULTIES[racer.difficulty] ?? CPU_DIFFICULTIES.normal;
  const cornerPenalty = racer.grip > 0 ? .5 : 1;
  const normal = cruise[racer.slot] * level.speed + 1.8 * Math.sin(racer.distance * .04 + racer.slot) - level.corner * corner * cornerPenalty;
  const target = racer.slow > 0 || (track.offroad && racer.shortcut && !terrainTraction(track, racer))
    ? 23 : boostRemaining(racer) > 0 ? 56 : normal;
  racer.boost = Math.max(0, racer.boost - dt);
  racer.speed = approach(racer.speed, target * speedScale, dt * (17 + racer.slot) * level.acceleration * speedScale ** 2);
  const cut = track.shortcut;
  const beforeEntry = cut && cut.from - lapDistance(track, racer.distance);
  const entry = cut && !track.terrain && (!track.offroad || terrainTraction(track, racer)) && racer.difficulty === "hard" && beforeEntry >= 0 && beforeEntry < 90;
  const lane = racer.shortcut ? 0 : entry ? cut.lane : startingLanes[racer.slot] + Math.sin(racer.distance * .033 + racer.slot) * 1.1;
  const change = approach(racer.lane, lane, dt * 2.9 * speedScale) - racer.lane;
  racer.lateralSpeed = change / dt;
  racer.steer = racer.lateralSpeed * .15;
  racer.lane += change;
}

export function raceHalfWidth(track, racer) {
  return racer.shortcut ? track.shortcut.halfWidth : track.halfWidth;
}

function terrainTraction(track, racer) {
  return (track.turboCuts ? racer.turboTime : racer.offroadTime) > 0;
}

export function isRoughSurface(track, racer) {
  if (racer.free) return !racer.onAsphalt && !terrainTraction(track, racer);
  const edge = raceHalfWidth(track, racer) - (track.terrain && !track.legacyTerrainSpeed ? 0 : .2);
  return (Math.abs(racer.lane) > edge || (!!track.offroad && racer.shortcut)) &&
    !terrainTraction(track, racer);
}

export function boostRemaining(racer) {
  return Math.max(racer.boost, racer.turboTime ?? 0, racer.jumpBoost ?? 0);
}

function activateTurbo(track, racer) {
  racer.boost = Math.max(racer.boost, TURBO_SECONDS);
  if (track.turboCuts) racer.turboTime = Math.max(racer.turboTime, TURBO_SECONDS);
}

export function advanceRacer(track, racer, dt, speedScale = standardSpeed) {
  const cut = track.shortcut, step = racer.speed * dt;
  if (track.terrain) {
    if (!racer.free && !racer.cpu && Math.abs(racer.lane) > track.halfWidth + 1) enterTerrain(track, racer);
    if (racer.free) moveAcrossTerrain(track, racer, dt);
    else racer.distance += step;
    return;
  }
  if (!cut) { racer.distance += step; return; }
  const progress = lapDistance(track, racer.distance);
  if (racer.shortcut) {
    const distanceToExit = (cut.to - progress) / cut.ratio;
    if (step < distanceToExit) {
      racer.distance += step * cut.ratio;
      return;
    }
    racer.distance += cut.to - progress + step - distanceToExit;
    racer.lane = clamp(racer.lane + cut.lane, -track.halfWidth - 2, track.halfWidth + 2);
    racer.shortcut = false;
    if (track.turboCuts) racer.turboTime = 0;
    return;
  }
  const distanceToEntry = cut.from - progress;
  if ((!track.offroad || terrainTraction(track, racer)) && distanceToEntry >= 0 && step > distanceToEntry &&
      Math.abs(racer.lane - cut.lane) <= cut.halfWidth - .8) {
    racer.distance += distanceToEntry + (step - distanceToEntry) * cut.ratio;
    racer.lane -= cut.lane;
    racer.shortcut = true;
    // Sustain the item boost for the cut at speed, without extending it on the regular road.
    if (track.turboCuts) racer.turboTime = Math.max(racer.turboTime, cut.length / (49 * speedScale) + .8);
    return;
  }
  racer.distance += step;
}

function stepJump(track, racer, before, dt) {
  if (!track.manualDrive) return;
  const p = racerWorldPosition(track, racer);
  const ground = track.heightAt(p.x,p.z) + rampHeight(track,racer);
  const pressed = racer.input.jump && !racer.jumpHeld;
  racer.jumpHeld = !!racer.input.jump;
  const commandKey = racer.jumpKeys?.shift() ?? racer.input.jumpKey;
  const legacyAction = track.legacyJumpAction || track.legacyGroundJump;
  racer.landing = Math.max(0,racer.landing-dt);
  if (racer.airborne) {
    racer.jumpAge += dt;
    if (legacyAction) {
      if (pressed && racer.jumpAge < 1.1) racer.trick = true;
    } else if (!racer.trick && racer.jumpProgress >= 0 && racer.jumpRamp >= 0) {
      const command = jumpCommand(racer.jumpRamp);
      if (racer.jumpAge > JUMP_COMMAND_TIME + 1e-9) racer.jumpProgress = -1;
      else if (commandKey) {
        if (commandKey !== command[racer.jumpProgress]) racer.jumpProgress = -1;
        else racer.trick = ++racer.jumpProgress === command.length;
      }
    }
    racer.verticalSpeed -= 24*dt;
    racer.airY += racer.verticalSpeed*dt;
    if (racer.airY <= ground && racer.verticalSpeed < 0) {
      racer.airborne = false;
      racer.airY = ground;
      racer.landing = racer.trick ? 1 : .3;
      if (racer.trick) {
        if (legacyAction) racer.boost = Math.max(racer.boost, 1.15);
        else racer.jumpBoost = JUMP_BOOST_SECONDS;
      }
      racer.trick = false;
      racer.jumpRamp = -1;
      if (racer.jumpKeys) racer.jumpKeys.length = 0;
    }
    return;
  }
  racer.airY = ground;
  racer.jumpAge = 0;
  // Ground hops are retained only when replaying records from before ramp-only jumps.
  if (track.legacyGroundJump && pressed && racer.speed > 5) {
    racer.airborne = true;
    racer.verticalSpeed = 7.8;
  }
  for (const ramp of track.ramps) {
    const edge = track.sample(ramp.distance+ramp.length);
    const a = (before.x-edge.x)*edge.fx+(before.z-edge.z)*edge.fz;
    const b = (p.x-edge.x)*edge.fx+(p.z-edge.z)*edge.fz;
    const lateral = (p.x-edge.x)*edge.rx+(p.z-edge.z)*edge.rz;
    if (a<0 && b>=0 && Math.abs(lateral-ramp.lane)<ramp.halfWidth && racer.speed>12) {
      racer.airborne = true;
      racer.airY = track.heightAt(p.x,p.z)+ramp.height;
      racer.verticalSpeed = 9+Math.min(75,racer.speed)*.04;
      racer.trick = legacyAction && (pressed || racer.cpu);
      racer.jumpRamp = ramp.id;
      racer.jumpProgress = 0;
      break;
    }
  }
}

export const isDriving = racer => !racer.dnf && racer.finishedAt === null;

export function endLastRacer(racers) {
  if (racers.length < MIN_ROOM_PLAYERS || racers.some(racer => racer.dnf)) return;
  const remaining = racers.filter(isDriving);
  if (remaining.length !== 1) return;
  const [last] = remaining;
  last.dnf = last.lastPlace = true;
  last.speed = last.boost = last.turboTime = last.jumpBoost = 0;
  last.input = EMPTY_INPUT;
  last.itemQueued = false;
}

export function cruiseAfterFinish(track, racer, dt, speedScale = standardSpeed) {
  if (racer.finishedAt === null || racer.dnf) return;
  if (!racer.cruising) {
    if (racer.free) {
      const start = track.sample(0);
      racer.lane = (racer.x - start.x) * start.rx + (racer.z - start.z) * start.rz;
    }
    racer.distance = LAPS * track.length;
    racer.lane = clamp(racer.lane, -track.halfWidth + 1.25, track.halfWidth - 1.25);
    racer.cruising = true;
    racer.free = racer.shortcut = racer.drifting = false;
    racer.onAsphalt = true;
    racer.steer = racer.lateralSpeed = racer.contact = racer.driftCharge = 0;
    racer.item = null;
    racer.airborne = false;
  }
  const corner = Math.abs(turnAt(track, racer.distance, 16));
  const targetSpeed = (28 - 10 * corner) * Math.sqrt(speedScale);
  racer.speed = approach(racer.speed, targetSpeed, 16 * dt);
  racer.distance += racer.speed * dt;
  const lane = ((racer.slot % 4) - 1.5) * Math.min(1.75, track.halfWidth * .32);
  racer.lane = approach(racer.lane, lane, 1.9 * dt);
  if(track.manualDrive){
    const position=racerWorldPosition(track,racer);
    racer.airY=track.heightAt(position.x,position.z);
  }
}

function resolveContact(track, a, b) {
  if (a.free || b.free || a.shortcut !== b.shortcut) return;
  const ratio = a.shortcut ? track.shortcut.ratio : 1;
  const width = 2.15, length = 3.95, halfLap = track.length / 2;
  let forward = b.distance - a.distance;
  if (Math.abs(forward) > halfLap) {
    forward = ((forward + halfLap) % track.length + track.length) % track.length - halfLap;
  }
  forward /= ratio;
  const side = b.lane - a.lane;
  const lengthOverlap = length - Math.abs(forward);
  const widthOverlap = width - Math.abs(side);
  if (lengthOverlap <= 0 || widthOverlap <= 0) return;

  // Separate the cars along the shallower overlap, even while they remain in contact.
  const bumperContact = Math.abs(side) <= .55 && Math.abs(forward) >= 1.25;
  if (!bumperContact && widthOverlap < lengthOverlap) {
    const direction = side < 0 ? -1 : 1;
    const edge = raceHalfWidth(track, a) + 2;
    const aBefore = a.lane, bBefore = b.lane;
    a.lane = clamp(a.lane - direction * widthOverlap / 2, -edge, edge);
    b.lane = clamp(b.lane + direction * (widthOverlap - Math.abs(a.lane - aBefore)), -edge, edge);
    a.lane = clamp(b.lane - direction * width, -edge, edge);
    const closing = direction * (a.lateralSpeed - b.lateralSpeed);
    if (closing > .65 || (Math.abs(b.lane - bBefore) > .16 && !a.contact && !b.contact)) {
      const push = Math.min(3, .5 + Math.max(0, closing) * .36);
      a.lateralSpeed -= direction * push;
      b.lateralSpeed += direction * push;
      if (!a.shield) a.speed *= .985;
      if (!b.shield) b.speed *= .985;
      a.contact = b.contact = .32;
    }
  } else {
    const front = forward >= 0 ? b : a;
    const rear = front === a ? b : a;
    const separation = lengthOverlap * ratio / 2;
    const cut = track.shortcut;
    const room = a.shortcut ? cut.to - lapDistance(track, front.distance) : Infinity;
    const back = a.shortcut ? lapDistance(track, rear.distance) - cut.from : Infinity;
    front.distance += Math.min(separation, Math.max(0, room - .001));
    rear.distance -= Math.min(separation, Math.max(0, back));
    const closing = rear.speed - front.speed;
    if (closing > 0) {
      rear.speed -= closing * (rear.shield > 0 ? .3 : .68);
      front.speed += closing * .28;
      if (closing > 1.35) a.contact = b.contact = .32;
    }
  }
}

export function pulseDistance(pulse, elapsed) {
  const direction = pulse.kind === "backPulse" ? -1 : 1;
  return pulse.startDistance + direction * (pulse.speed ?? PULSE_SPEED) * Math.max(0, elapsed - pulse.launchedAt);
}

export function pulsePosition(track, pulse, elapsed) {
  const distance = pulseDistance(pulse, elapsed);
  if (pulse.free) {
    const traveled = distance - pulse.startDistance;
    return { free: true, distance: pulse.startDistance, lane: 0, heading: pulse.heading,
      x: pulse.x + Math.sin(pulse.heading) * traveled, z: pulse.z + Math.cos(pulse.heading) * traveled };
  }
  if (pulse.branchStart === undefined || !track.shortcut) return { distance, lane: pulse.lane, shortcut: false };
  const cut = track.shortcut;
  const offset = (distance - pulse.branchStart) * cut.ratio;
  if (offset >= 0 && offset < cut.to - cut.from) {
    return { distance: pulse.branchStart + offset, lane: pulse.lane, shortcut: true };
  }
  const traveledOnBranch = offset < 0 ? 0 : cut.to - cut.from;
  return { distance: distance + traveledOnBranch * (1 - 1 / cut.ratio),
    lane: clamp(pulse.lane + cut.lane, -track.halfWidth, track.halfWidth), shortcut: false };
}

function useItem(track, racer, projectiles, launchedAt, speedScale) {
  if (racer.item === "turbo") activateTurbo(track, racer);
  if (racer.item === "shield") racer.shield = 4;
  if (racer.item === "grip") racer.grip = 4;
  if (racer.item === "recovery") {
    racer.slow = 0;
    racer.speed = Math.max(racer.speed, 38 * speedScale);
    racer.boost = Math.max(racer.boost, .65);
  }
  if (racer.item === "pulse" || racer.item === "backPulse") {
    const direction = racer.item === "pulse" ? 1 : -1;
    const cut = track.shortcut;
    const branchStart = racer.shortcut ? racer.distance - lapDistance(track, racer.distance) + cut.from : undefined;
    const distance = racer.shortcut ? branchStart + (racer.distance - branchStart) / cut.ratio : racer.distance;
    projectiles.push({
      ...(racer.free ? { free: true, heading: racer.heading,
        x: racer.x + direction * 3.25 * Math.sin(racer.heading),
        z: racer.z + direction * 3.25 * Math.cos(racer.heading) } : {}),
      branchStart, kind: racer.item, ownerId: racer.id, launchedAt, speed: PULSE_SPEED * speedScale,
      startDistance: distance + direction * 3.25,
      lane: clamp(racer.lane, -raceHalfWidth(track, racer), raceHalfWidth(track, racer))
    });
  }
  racer.item = null;
}

export function createRaceItems(track) {
  return { respawns: Array(track.itemLines.length * ITEM_LANES.length).fill(0), projectiles: [] };
}

function hitWindow(start, end, radius) {
  if (start === end) return Math.abs(start) <= radius ? [0, 1] : [1, 0];
  const near = (-radius - start) / (end - start), far = (radius - start) / (end - start);
  return [Math.max(0, Math.min(near, far)), Math.min(1, Math.max(near, far))];
}

function terrainPulseHit(track, old, rival, from, to) {
  const a = racerWorldPosition(track, old), b = racerWorldPosition(track, rival);
  const p = racerWorldPosition(track, from), q = racerWorldPosition(track, to);
  const x = a.x - p.x, z = a.z - p.z;
  const dx = b.x - q.x - x, dz = b.z - q.z - z;
  const length = dx * dx + dz * dz;
  const t = length > 0 ? clamp(-(x * dx + z * dz) / length, 0, 1) : 0;
  return (x + dx * t) ** 2 + (z + dz * t) ** 2 <= 2.45 ** 2 ? t : Infinity;
}

function stepProjectiles(track, projectiles, moving, previous, elapsed, dt, finishLine) {
  const end = elapsed + dt;
  let remaining = 0;
  for (const pulse of projectiles) {
    const expiresAt = pulse.launchedAt + PULSE_LIFETIME;
    if (elapsed >= expiresAt) continue;
    const from = pulsePosition(track, pulse, elapsed), to = pulsePosition(track, pulse, end);
    let hit = null, earliest = Math.min(1, (expiresAt - elapsed) / dt);
    for (const [index, rival] of moving.entries()) {
      if(track.manualDrive&&rival.airborne){
        const position=racerWorldPosition(track,rival);
        if(rival.airY-track.heightAt(position.x,position.z)>2.5)continue;
      }
      if (rival.id === pulse.ownerId || (!track.terrain && rival.distance >= finishLine)) continue;
      const old = previous[index];
      if (old.free || rival.free || pulse.free) {
        const t = terrainPulseHit(track, old, rival, from, to);
        if (t <= earliest) { hit = rival; earliest = t; }
        continue;
      }
      if (old.shortcut !== from.shortcut || rival.shortcut !== to.shortcut || from.shortcut !== to.shortcut) continue;
      const gap = old.distance - from.distance;
      const startGap = gap - Math.round(gap / track.length) * track.length;
      const endGap = startGap + (rival.distance - old.distance) - (to.distance - from.distance);
      const [frontIn, frontOut] = hitWindow(startGap, endGap, 2.7 * (to.shortcut ? track.shortcut.ratio : 1));
      const [sideIn, sideOut] = hitWindow(old.lane - from.lane, rival.lane - to.lane, 1.8);
      const entry = Math.max(frontIn, sideIn);
      if (entry <= Math.min(frontOut, sideOut) && (entry < earliest || entry === earliest && !hit)) {
        earliest = entry;
        hit = rival;
      }
    }
    if (hit?.shield > 0) hit.shield = 0;
    else if (hit) {
      hit.speed *= .68;
      hit.slow = 1.05;
    } else if (end < expiresAt) projectiles[remaining++] = pulse;
  }
  projectiles.length = remaining;
}

function raceItems(track, racer, from, elapsed, dt, { respawns, projectiles }, speedScale, wasFree = false) {
  if ((!wasFree && !racer.free || track.manualDrive && racer.onAsphalt && !racer.airborne) && !racer.shortcut && !racer.item && racer.distance > from && Math.abs(racer.lane) <= track.halfWidth + .75) {
    const lapStart = Math.floor(racer.distance / track.length) * track.length;
    for (const [gate, line] of track.itemLines.entries()) {
      const at = lapStart + line;
      if (racer.distance < at - ITEM_ZONE_BEFORE || from > at + ITEM_ZONE_AFTER) continue;
      const visit = Math.floor(lapStart / track.length) * track.itemLines.length + gate;
      if (racer.lastBox === visit) break;
      let closest = -1, reach = track.halfWidth * .22 + .75;
      ITEM_LANES.forEach((lane, slot) => {
        const index = gate * ITEM_LANES.length + slot;
        const distance = Math.abs(racer.lane - track.halfWidth * lane);
        if (respawns[index] <= elapsed && distance < reach) {
          closest = index;
          reach = distance;
        }
      });
      if (closest !== -1) {
        respawns[closest] = elapsed + ITEM_RESPAWN_SECONDS;
        const types = track.layoutScale > 1 ? itemTypes.length : 3;
        const lap = Math.floor(lapStart / track.length);
        racer.item = line === track.offroadItemLine ? "turbo" : itemTypes[(racer.slot + gate + lap * 2) % types];
        racer.lastBox = visit;
        racer.pickup = .95;
        racer.itemReady = elapsed + (CPU_DIFFICULTIES[racer.difficulty] ?? CPU_DIFFICULTIES.normal).itemDelay;
      }
      break;
    }
  }
  if (racer.item && (racer.cpu ? elapsed >= racer.itemReady : (racer.input.item && !racer.itemHeld) || racer.itemQueued)) {
    useItem(track, racer, projectiles, elapsed + dt, speedScale);
  }
  racer.itemHeld = !!racer.input.item;
  racer.itemQueued = false;
}

function resolveRaceContacts(track, moving) {
  if (moving.length <= 1) return;
  const lapPosition = racer => ((racer.distance % track.length) + track.length) % track.length;
  for (let pass = 0; pass < 2; pass++) {
    const sorted = moving.map(racer => ({ racer, position: lapPosition(racer) })).sort((a, b) => a.position - b.position);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < i + sorted.length; j++) {
        const next = sorted[j % sorted.length];
        const gap = next.position - sorted[i].position + (j >= sorted.length ? track.length : 0);
        if (gap > 4.2 * (sorted[i].racer.shortcut ? track.shortcut.ratio : 1)) break;
        resolveContact(track, sorted[i].racer, next.racer);
      }
    }
  }
}

function resolveTerrainContacts(racers, positions) {
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i], b = racers[j];
      if(Math.abs((a.airY??0)-(b.airY??0))>2.2)continue;
      if ((!a.free && !b.free) || a.contact > 0 || b.contact > 0) continue;
      const p = positions[i], q = positions[j];
      if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 >= 2.6 ** 2) continue;
      if (!a.shield) a.speed *= .83;
      if (!b.shield) b.speed *= .83;
      a.contact = b.contact = .32;
    }
  }
}

export function stepRace(track, racers, dt, elapsed, laps = LAPS, items = null, speedScale = standardSpeed) {
  if (dt <= 0) return;
  const moving = racers.filter(isDriving);
  const previous = moving.map(({ distance, lane, shortcut, free, x, z, heading }) => ({ distance, lane, shortcut, free, x, z, heading }));
  const before = track.terrain && previous.map(racer => racerWorldPosition(track, racer));
  for (const [index,racer] of moving.entries()) {
    racer.contact = Math.max(0, racer.contact - dt);
    racer.shield = Math.max(0, racer.shield - dt);
    racer.grip = Math.max(0, racer.grip - dt);
    racer.pickup = Math.max(0, racer.pickup - dt);
    racer.slow = Math.max(0, racer.slow - dt);
    racer.turboTime = Math.max(0, (racer.turboTime ?? 0) - dt);
    racer.offroadTime = Math.max(0, (racer.offroadTime ?? 0) - dt);
    if ((track.offroad || track.terrain) && racer.lapEnds) {
      const lap = racer.lapEnds.length;
      const item = track.turboCuts ? "turbo" : "offroad";
      if (racer.trialItemLap !== lap) {
        racer.item = item;
        racer.trialItemLap = lap;
      }
      if (racer.input.item && !racer.itemHeld && racer.item === item) {
        racer.item = null;
        if (track.turboCuts) activateTurbo(track, racer);
        else racer.offroadTime = LEGACY_OFFROAD_SECONDS;
      }
      racer.itemHeld = !!racer.input.item;
    }
    if (racer.cpu) applyCPU(track, racer, dt, speedScale);
    else applyDrive(track, racer, racer.input, dt, speedScale);
    advanceRacer(track, racer, dt, speedScale);
    if (track.manualDrive) stepJump(track, racer, before[index], dt);
  }
  resolveRaceContacts(track, moving);
  const after = track.terrain && moving.map(racer => racerWorldPosition(track, racer));
  if (after) resolveTerrainContacts(moving, after);
  const finishLine = track.length * laps;
  if (items?.projectiles.length) stepProjectiles(track, items.projectiles, moving, previous, elapsed, dt, finishLine);
  moving.forEach((racer, index) => {
    const from = previous[index].distance;
    if (items && !racer.lapEnds && (track.terrain || racer.distance < finishLine)) {
      raceItems(track, racer, from, elapsed, dt, items, speedScale, previous[index].free);
    }
    if (track.terrain) {
      const crossing = updateTerrainProgress(track, racer, before[index], after[index], dt, elapsed);
      if (crossing === null || racer.completedLaps < laps) return;
      racer.finishedAt = crossing;
      racer.speed = racer.boost = racer.turboTime = racer.jumpBoost = 0;
      return;
    }
    const advance = racer.distance - from;
    const crossing = line => elapsed + dt * (advance > 0 ? clamp((line - from) / advance, 0, 1) : 1);
    if (racer.lapEnds) {
      for (let lap = racer.lapEnds.length + 1; lap <= laps && racer.distance >= track.length * lap; lap++) {
        racer.lapEnds.push(crossing(track.length * lap));
      }
    }
    if (racer.distance < finishLine) return;
    racer.finishedAt = crossing(finishLine);
    racer.distance = finishLine;
    racer.speed = 0;
    racer.boost = 0;
    racer.turboTime = 0;
  });
}

export function createTrialRacer() {
  return Object.assign(createRacer(0), { distance: 0, lane: 0, lapEnds: [] });
}

export function lapTime(lapEnds, index) {
  const end = lapEnds[index];
  if (end === undefined) return Infinity;
  return (Math.round(end * 100) - Math.round((lapEnds[index - 1] ?? 0) * 100)) / 100;
}

export function recordTrialInput(tape, input) {
  const mask = Number(input.gas) | (Number(input.brake) << 1) | ((input.turn + 1) << 2) |
    (input.drift ? 16 : 0) | (input.item ? 32 : 0) | (input.jump ? 64 : 0) | ((input.jumpKey ?? 0) << 7);
  const last = tape.at(-1);
  if (last?.[0] === mask) last[1]++;
  else tape.push([mask, 1]);
}

export function trialInput(mask) {
  return { gas: !!(mask & 1), brake: !!(mask & 2), turn: ((mask & 12) >> 2) - 1, drift: !!(mask & 16), item: !!(mask & 32), jump: !!(mask & 64), jumpKey: mask >> 7 };
}

export function replayTrial(track, tape, protocol = TRIAL_PROTOCOL, speedClass = DEFAULT_RACE_SPEED) {
  const legacy = protocol === "touge-time-attack-1" && !track.region;
  const singleLap = legacy || protocol === "touge-time-attack-2";
  const openTerrain = usesTrialTerrain(protocol);
  if (!isRaceSpeed(speedClass) || (!openTerrain && protocol !== TURBO_TRIAL_PROTOCOL && protocol !== OFFROAD_TRIAL_PROTOCOL && protocol !== SHORTCUT_TRIAL_PROTOCOL && protocol !== MAIN_ROAD_TRIAL_PROTOCOL &&
      (speedClass !== DEFAULT_RACE_SPEED || (!singleLap && protocol !== PREVIOUS_TRIAL_PROTOCOL)))) return null;
  if ([ALL_RAMPS_PROTOCOL, GROUND_JUMP_TRIAL_PROTOCOL, MANUAL_TRIAL_PROTOCOL].includes(protocol)) track = {...track, ramps:courseRamps(track)};
  if (protocol === TERRAIN_TRIAL_PROTOCOL) track = { ...track, legacyTerrainSpeed: true };
  if (protocol === MANUAL_TRIAL_PROTOCOL) track = { ...track, assistedSteering:false, legacyGroundJump:true };
  else if (protocol === GROUND_JUMP_TRIAL_PROTOCOL) track = { ...track, assistedSteering:true, legacyGroundJump:true };
  else if (protocol === RAMP_TAP_TRIAL_PROTOCOL || protocol === ALL_RAMPS_PROTOCOL) track = { ...track, legacyGroundJump:false, legacyJumpAction:true };
  else if (protocol === TRIAL_PROTOCOL) track = { ...track, legacyGroundJump:false, legacyJumpAction:false };
  else track = { ...track, manualDrive:false, assistedSteering:false };
  if (!openTerrain && track.terrain) track = { ...track, terrain: null, offroad: !!track.shortcut };
  if (protocol === TURBO_TRIAL_PROTOCOL && track.shortcut) track = { ...track, offroad: true, turboCuts: true };
  else if (protocol === SHORTCUT_TRIAL_PROTOCOL) track = { ...track, offroad: false, turboCuts: false };
  else if (protocol === OFFROAD_TRIAL_PROTOCOL) track = { ...track, turboCuts: false };
  else if (!openTerrain && protocol !== TURBO_TRIAL_PROTOCOL && track.shortcut) track = { ...track, shortcut: null, offroad: false, turboCuts: false };
  const { scale } = RACE_SPEEDS[speedClass];
  const laps = singleLap ? 1 : LAPS;
  const maxTicks = singleLap ? 3600 : TRIAL_MAX_TICKS;
  if (!Array.isArray(tape) || !tape.length || tape.length > maxTicks) return null;
  const usesJumpInput = [TRIAL_PROTOCOL, RAMP_TAP_TRIAL_PROTOCOL, ALL_RAMPS_PROTOCOL, GROUND_JUMP_TRIAL_PROTOCOL, MANUAL_TRIAL_PROTOCOL].includes(protocol) && track.manualDrive;
  const maxMask = usesJumpInput
    ? 123 + (protocol === TRIAL_PROTOCOL && track.ramps.length ? JUMP_KEYS.length << 7 : 0)
    : openTerrain || [TURBO_TRIAL_PROTOCOL, OFFROAD_TRIAL_PROTOCOL].includes(protocol) ? 59 : legacy ? 11 : 27;
  let total = 0;
  for (const entry of tape) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [mask, count] = entry;
    if (!Number.isInteger(mask) || mask < 0 || mask > maxMask || (mask & 12) === 12 ||
        !Number.isInteger(count) || count < 1 || (total += count) > maxTicks) return null;
  }
  const player = createTrialRacer();
  const racers = [player];
  let tick = 0;
  for (const [mask, count] of tape) {
    player.input = trialInput(mask);
    for (let run = 0; run < count; run++) {
      stepRace(track, racers, STEP, tick * STEP, laps, null, scale);
      tick++;
      if (player.finishedAt !== null) return tick === total ? player.finishedAt : null;
    }
  }
  return null;
}

export function rankRacers(racers) {
  return [...racers].sort((a, b) =>
    Number(a.dnf) - Number(b.dnf) ||
    (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) ||
    (a.finishedAt === null && b.finishedAt === null ? (b.progress ?? b.distance) - (a.progress ?? a.distance) : 0) ||
    a.slot - b.slot
  );
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const ticks = Math.round(seconds * 100);
  return `${Math.floor(ticks / 6000)}:${String(Math.floor(ticks / 100) % 60).padStart(2, "0")}.${String(ticks % 100).padStart(2, "0")}`;
}
