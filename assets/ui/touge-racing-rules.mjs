import { LAPS } from "./touge-racing-tracks.mjs";

export const RACE_PROTOCOL = "touge-racing-1";
export const ROOM_SIZE = 4;
export const COUNTDOWN = 5;
export const RACE_LIMIT = 180;
export const STEP = 1 / 30;
export const TRIAL_PROTOCOL = "touge-time-attack-1";
export const TRIAL_LIMIT = 120;
export const TRIAL_MAX_TICKS = TRIAL_LIMIT * 30;
export const ROOM_CODE = /^[2-9A-HJ-NP-Z]{6}$/;
export const EMPTY_INPUT = Object.freeze({ gas: false, brake: false, turn: 0 });
export const COLORS = [0x37b8d5, 0xed6d4e, 0xecc372, 0x92abec];
const startingLanes = [-1.9, 2.85, -2.9, .4];
const startingDistances = [-14, -5.5, -8.5, -11.5];
const cruise = [0, 42, 40, 38.5];

export function createRacer(slot, { id = String(slot), name = "", cpu = false } = {}) {
  return {
    id, name, slot, color: COLORS[slot], cpu,
    lane: startingLanes[slot], distance: startingDistances[slot],
    speed: 0, lateralSpeed: 0, steer: 0, boost: 0, lastPad: -1, contact: 0,
    finishedAt: null, dnf: false, input: EMPTY_INPUT
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
  const slip = -turn * racer.speed ** 2 * .029;
  const grip = input.brake ? 1.25 : 1;
  const lateralTarget = (racer.steer * 8.5 * grip + slip) * Math.min(1, racer.speed / 16);
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
  const limit = rough ? 24 : boosting ? 63 : 47;
  if (input.brake) racer.speed = Math.max(0, racer.speed - dt * 32);
  else if (rough || input.gas || boosting) {
    racer.speed = approach(racer.speed, input.gas || boosting ? limit : 0, dt * (rough ? 24 : boosting ? 31 : 20));
  } else racer.speed = Math.max(0, racer.speed - dt * 8.5);
}

function applyCPU(track, racer, dt) {
  const corner = Math.abs(turnAt(track, racer.distance, 14));
  const target = cruise[racer.slot] + 1.8 * Math.sin(racer.distance * .04 + racer.slot) - 8.2 * corner;
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
      a.speed *= .985;
      b.speed *= .985;
      a.contact = b.contact = .32;
    }
  } else {
    const front = forward >= 0 ? b : a;
    const rear = front === a ? b : a;
    front.distance += lengthOverlap / 2;
    rear.distance -= lengthOverlap / 2;
    const closing = rear.speed - front.speed;
    if (closing > 0) {
      rear.speed -= closing * .68;
      front.speed += closing * .28;
      if (closing > 1.35) a.contact = b.contact = .32;
    }
  }
}

export function stepRace(track, racers, dt, elapsed, laps = LAPS) {
  if (dt <= 0) return;
  const moving = racers.filter(isDriving);
  const previous = moving.map(racer => racer.distance);
  for (const racer of moving) {
    racer.contact = Math.max(0, racer.contact - dt);
    if (racer.cpu) applyCPU(track, racer, dt);
    else applyDrive(track, racer, racer.input, dt);
    racer.distance += racer.speed * dt;
  }
  if (moving.length > 1) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < moving.length; i++) {
        for (let j = i + 1; j < moving.length; j++) resolveContact(track, moving[i], moving[j]);
      }
    }
  }
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
  const mask = Number(input.gas) | (Number(input.brake) << 1) | ((input.turn + 1) << 2);
  const last = tape.at(-1);
  if (last?.[0] === mask) last[1]++;
  else tape.push([mask, 1]);
}

export function replayTrial(track, tape) {
  if (!Array.isArray(tape) || !tape.length || tape.length > TRIAL_MAX_TICKS) return null;
  let total = 0;
  for (const entry of tape) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [mask, count] = entry;
    if (!Number.isInteger(mask) || mask < 0 || mask > 11 ||
        !Number.isInteger(count) || count < 1 || (total += count) > TRIAL_MAX_TICKS) return null;
  }
  const player = createTrialRacer();
  const racers = [player];
  let tick = 0;
  for (const [mask, count] of tape) {
    player.input = { gas: !!(mask & 1), brake: !!(mask & 2), turn: (mask >> 2) - 1 };
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
