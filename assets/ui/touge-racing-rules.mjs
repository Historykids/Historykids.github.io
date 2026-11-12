import { LAPS } from "./touge-racing-tracks.mjs";

export const RACE_PROTOCOL = "touge-racing-1";
export const ROOM_SIZE = 4;
export const COUNTDOWN = 5;
export const RACE_LIMIT = 180;
export const STEP = 1 / 30;
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
  racer.steer = change / dt * .15;
  racer.lane += change;
}

export const isDriving = racer => !racer.dnf && racer.finishedAt === null;

export function stepRace(track, racers, dt, elapsed) {
  if (dt <= 0) return;
  const moving = racers.filter(isDriving);
  for (const racer of moving) {
    racer.contact = Math.max(0, racer.contact - dt);
    if (racer.cpu) applyCPU(track, racer, dt);
    else applyDrive(track, racer, racer.input, dt);
  }
  for (let i = 0; i < moving.length; i++) {
    const a = moving[i];
    for (let j = i + 1; j < moving.length; j++) {
      const b = moving[j];
      if (a.contact || b.contact || Math.abs(a.distance - b.distance) >= 3.6 ||
          Math.abs(a.lane - b.lane) >= 1.75) continue;
      const behind = a.distance < b.distance ? a : b;
      behind.speed *= .86;
      a.contact = b.contact = .58;
    }
  }
  const finishLine = track.length * LAPS;
  for (const racer of moving) {
    const advance = racer.speed * dt;
    if (racer.distance + advance >= finishLine) {
      racer.finishedAt = elapsed + (finishLine - racer.distance) / racer.speed;
      racer.distance = finishLine;
      racer.speed = 0;
      racer.boost = 0;
    } else racer.distance += advance;
  }
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
