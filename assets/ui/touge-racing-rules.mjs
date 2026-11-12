import { LAPS } from "./touge-racing-tracks.mjs";

export const RACE_PROTOCOL = "touge-racing-1";
export const CPU_FIELD_SIZE = 4;
export const ROOM_SIZE = CPU_FIELD_SIZE;
export const MIN_ROOM_PLAYERS = 2;
export const VISIBLE_RIVALS = 16;
export const COUNTDOWN = 5;
export const RACE_LIMIT = 180;
export const STEP = 1 / 30;
export const TRIAL_PROTOCOL = "touge-time-attack-2";
export const TRIAL_LIMIT = 120;
export const TRIAL_MAX_TICKS = TRIAL_LIMIT * 30;
export const ROOM_CODE = /^[2-9A-HJ-NP-Z]{6}$/;
export const EMPTY_INPUT = Object.freeze({ gas: false, brake: false, turn: 0, drift: false, item: false });
export const COLORS = [0x37b8d5, 0xed6d4e, 0xecc372, 0x92abec, 0x74db91, 0xd892f2, 0xf5a55a, 0xec8da7];
const startingLanes = [-1.9, 2.85, -2.9, .4];
const startingDistances = [-14, -5.5, -8.5, -11.5];
const cruise = [0, 42, 40, 38.5];

export const ITEMS = Object.freeze({
  turbo: { icon: "⚡", label: "ターボ", color: "#ffd566" },
  shield: { icon: "⬡", label: "ガード", color: "#8ddcff" },
  pulse: { icon: "◎", label: "パルス", color: "#f3a3ff" }
});
const itemTypes = Object.keys(ITEMS);

export function createRacer(slot, { id = String(slot), name = "", cpu = false, grid = false } = {}) {
  return {
    id, name, slot, color: COLORS[slot % COLORS.length], cpu,
    lane: grid ? [-4.6, -1.55, 1.55, 4.6][slot % 4] : startingLanes[slot],
    distance: grid ? -6 - Math.floor(slot / 4) * 5.4 : startingDistances[slot],
    speed: 0, lateralSpeed: 0, steer: 0, boost: 0, lastPad: -1, contact: 0,
    finishedAt: null, dnf: false, input: EMPTY_INPUT,
    drifting: false, driftCharge: 0, shield: 0, slow: 0, item: null, lastBox: -1, itemHeld: false, itemReady: 0
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, delta) => value + clamp(target - value, -delta, delta);
const frame = {}, next = {};

export function turnAt(track, distance, lookAhead) {
  const p = track.sample(distance, frame);
  const ahead = track.sample(distance + lookAhead, next);
  return ahead.fx * p.rx + ahead.fz * p.rz;
}

export function applyDrive(track, racer, input, dt) {
  const turn = turnAt(track, racer.distance, 6);
  racer.steer = approach(racer.steer, input.turn, dt * 6.2);
  const drifting = !!input.drift && !!input.turn && racer.speed >= 15 && Math.abs(racer.lane) < track.halfWidth;
  if (drifting) racer.driftCharge = Math.min(1.5, racer.driftCharge + dt);
  else if (racer.drifting) {
    if (racer.driftCharge >= .55) racer.boost = Math.max(racer.boost, racer.driftCharge >= 1.05 ? 1.65 : .85);
    racer.driftCharge = 0;
  }
  racer.drifting = drifting;
  const slip = -turn * racer.speed ** 2 * (drifting ? .019 : .029);
  const grip = input.brake ? 1.25 : 1;
  const lateralTarget = (racer.steer * (drifting ? 11.5 : 8.5) * grip + slip) * Math.min(1, racer.speed / 16);
  racer.lateralSpeed = approach(racer.lateralSpeed, lateralTarget, dt * (input.brake ? 31 : 23));
  racer.lane = clamp(racer.lane + racer.lateralSpeed * dt, -track.halfWidth - 2, track.halfWidth + 2);

  const distanceOnLap = ((racer.distance % track.length) + track.length) % track.length;
  const padIndex = track.pads.findIndex(pad =>
    distanceOnLap >= pad.distance && distanceOnLap <= pad.distance + track.padLength
  );
  if (padIndex >= 0 && racer.speed > 8 &&
      Math.abs(racer.lane - track.pads[padIndex].lane) < track.padHalfWidth) {
    const padId = Math.floor(racer.distance / track.length) * track.pads.length + padIndex;
    if (padId !== racer.lastPad) racer.boost = 1.65;
    racer.lastPad = padId;
  }
  racer.boost = Math.max(0, racer.boost - dt);
  const rough = Math.abs(racer.lane) > track.halfWidth - .2;
  const boosting = racer.boost > 0 && !rough;
  const limit = racer.slow > 0 ? 25 : rough ? 24 : boosting ? 63 : drifting ? 42 : 47;
  if (input.brake) racer.speed = Math.max(0, racer.speed - dt * 32);
  else if (rough || input.gas || boosting) {
    racer.speed = approach(racer.speed, input.gas || boosting ? limit : 0, dt * (rough ? 24 : boosting ? 31 : 20));
  } else racer.speed = Math.max(0, racer.speed - dt * 8.5);
}

function applyCPU(track, racer, dt) {
  const corner = Math.abs(turnAt(track, racer.distance, 14));
  const normal = cruise[racer.slot] + 1.8 * Math.sin(racer.distance * .04 + racer.slot) - 8.2 * corner;
  const target = racer.slow > 0 ? 23 : racer.boost > 0 ? 56 : normal;
  racer.boost = Math.max(0, racer.boost - dt);
  racer.speed = approach(racer.speed, target, dt * (17 + racer.slot));
  const lane = startingLanes[racer.slot] + Math.sin(racer.distance * .033 + racer.slot) * 1.1;
  const change = approach(racer.lane, lane, dt * 2.9) - racer.lane;
  racer.lateralSpeed = change / dt;
  racer.steer = racer.lateralSpeed * .15;
  racer.lane += change;
}

export const isDriving = racer => !racer.dnf && racer.finishedAt === null;

function resolveContact(track, a, b) {
  const width = 2.15, length = 3.95, halfLap = track.length / 2;
  let forward = b.distance - a.distance;
  if (Math.abs(forward) > halfLap) {
    forward = ((forward + halfLap) % track.length + track.length) % track.length - halfLap;
  }
  const side = b.lane - a.lane;
  const lengthOverlap = length - Math.abs(forward);
  const widthOverlap = width - Math.abs(side);
  if (lengthOverlap <= 0 || widthOverlap <= 0) return;

  // Separate the cars along the shallower overlap, even while they remain in contact.
  const bumperContact = Math.abs(side) <= .55 && Math.abs(forward) >= 1.25;
  if (!bumperContact && widthOverlap < lengthOverlap) {
    const direction = side < 0 ? -1 : 1;
    const edge = track.halfWidth + 2;
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
    front.distance += lengthOverlap / 2;
    rear.distance -= lengthOverlap / 2;
    const closing = rear.speed - front.speed;
    if (closing > 0) {
      rear.speed -= closing * (rear.shield > 0 ? .3 : .68);
      front.speed += closing * .28;
      if (closing > 1.35) a.contact = b.contact = .32;
    }
  }
}

function useItem(racer, rivals) {
  if (racer.item === "turbo") racer.boost = Math.max(racer.boost, 2.2);
  if (racer.item === "shield") racer.shield = 4;
  if (racer.item === "pulse") {
    let closest;
    for (const rival of rivals) {
      const ahead = rival.distance - racer.distance;
      if (ahead > 0 && ahead < 38 && (!closest || rival.distance < closest.distance)) closest = rival;
    }
    if (!closest) return;
    if (closest.shield > 0) closest.shield = 0;
    else {
      closest.speed *= .68;
      closest.slow = 1.05;
    }
  }
  racer.item = null;
}

function raceItems(track, racer, rivals, from, elapsed) {
  const lap = Math.floor(racer.distance / track.length);
  for (const [index, line] of track.itemLines.entries()) {
    const at = lap * track.length + line;
    const box = lap * track.itemLines.length + index;
    if (!racer.item && from <= at && racer.distance > at && Math.abs(racer.lane) < track.halfWidth && box !== racer.lastBox) {
      racer.item = itemTypes[(racer.slot + index + lap) % itemTypes.length];
      racer.lastBox = box;
      racer.itemReady = elapsed + .7;
    }
  }
  if (racer.item && (racer.cpu ? elapsed >= racer.itemReady : (racer.input.item && !racer.itemHeld) || racer.itemQueued)) {
    useItem(racer, rivals);
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
        if (gap > 4.2) break;
        resolveContact(track, sorted[i].racer, next.racer);
      }
    }
  }
}

export function stepRace(track, racers, dt, elapsed, laps = LAPS) {
  if (dt <= 0) return;
  const moving = racers.filter(isDriving);
  const previous = moving.map(racer => racer.distance);
  for (const racer of moving) {
    racer.contact = Math.max(0, racer.contact - dt);
    racer.shield = Math.max(0, racer.shield - dt);
    racer.slow = Math.max(0, racer.slow - dt);
    if (racer.cpu) applyCPU(track, racer, dt);
    else applyDrive(track, racer, racer.input, dt);
    racer.distance += racer.speed * dt;
  }
  resolveRaceContacts(track, moving);
  if (laps > 1 && track.region) moving.forEach((racer, index) => raceItems(track, racer, moving, previous[index], elapsed));
  const finishLine = track.length * laps;
  moving.forEach((racer, index) => {
    if (racer.distance < finishLine) return;
    const advance = racer.distance - previous[index];
    const portion = advance > 0 ? clamp((finishLine - previous[index]) / advance, 0, 1) : 1;
    racer.finishedAt = elapsed + dt * portion;
    racer.distance = finishLine;
    racer.speed = 0;
    racer.boost = 0;
  });
}

export function createTrialRacer() {
  return Object.assign(createRacer(0), { distance: 0, lane: 0 });
}

export function recordTrialInput(tape, input) {
  const mask = Number(input.gas) | (Number(input.brake) << 1) | ((input.turn + 1) << 2) | (input.drift ? 16 : 0);
  const last = tape.at(-1);
  if (last?.[0] === mask) last[1]++;
  else tape.push([mask, 1]);
}

export function replayTrial(track, tape, legacy = false) {
  if (!Array.isArray(tape) || !tape.length || tape.length > TRIAL_MAX_TICKS) return null;
  let total = 0;
  for (const entry of tape) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [mask, count] = entry;
    if (!Number.isInteger(mask) || mask < 0 || mask > (legacy ? 11 : 27) || (mask & 12) === 12 ||
        !Number.isInteger(count) || count < 1 || (total += count) > TRIAL_MAX_TICKS) return null;
  }
  const player = createTrialRacer();
  const racers = [player];
  let tick = 0;
  for (const [mask, count] of tape) {
    player.input = { gas: !!(mask & 1), brake: !!(mask & 2), turn: ((mask & 12) >> 2) - 1, drift: !!(mask & 16) };
    for (let run = 0; run < count; run++) {
      stepRace(track, racers, STEP, tick * STEP, 1);
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
    b.distance - a.distance || a.slot - b.slot
  );
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const ticks = Math.round(seconds * 100);
  return `${Math.floor(ticks / 6000)}:${String(Math.floor(ticks / 100) % 60).padStart(2, "0")}.${String(ticks % 100).padStart(2, "0")}`;
}
