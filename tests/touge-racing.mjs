import assert from "node:assert/strict";
import { RaceRoom } from "../server/ranking-api/touge-racing.mjs";
import { getTrack, LAPS, TRACKS } from "../assets/ui/touge-racing-tracks.mjs";
import { COUNTDOWN, RACE_PROTOCOL, STEP, createRacer, rankRacers, stepRace, turnAt } from "../assets/ui/touge-racing-rules.mjs";

function steering(track, racer, offset = 0) {
  const distance = (racer.distance + track.length) % track.length;
  const pad = track.pads.find(p => distance >= p.distance - 26 && distance <= p.distance + track.padLength);
  const drift = turnAt(track, racer.distance, 6) * racer.speed ** 2 * .029;
  const correction = ((pad?.lane ?? offset) - racer.lane) * 2.7 + drift;
  return { gas: true, brake: false, turn: correction > 2.1 ? 1 : correction < -2.1 ? -1 : 0 };
}

assert.equal(TRACKS.length, 10);
assert.equal(new Set(TRACKS.map(spec => spec.id)).size, 10);
for (const { id } of TRACKS) {
  const track = getTrack(id);
  assert(track.length > 500);
  assert.deepEqual(track.sample(0), track.sample(track.length));
  assert.equal(track.pads.length, 3);
  assert(track.pads.every(pad => Math.abs(pad.lane) + track.padHalfWidth < track.halfWidth));
  const player = createRacer(0);
  const racers = [player, ...[1, 2, 3].map(slot => createRacer(slot, { cpu: true }))];
  let boosted = false;
  for (let elapsed = 0; elapsed < 360 && player.finishedAt === null; elapsed += STEP) {
    player.input = steering(track, player);
    stepRace(track, racers, STEP, elapsed);
    boosted ||= player.boost > 0;
  }
  assert.equal(player.distance, track.length * LAPS, id + " can finish");
  assert(boosted, id + " can boost");
}
console.log("All ten tracks load, support boost, and finish three laps against three CPUs.");

class Socket extends EventTarget {
  sent = [];
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.dispatchEvent(new Event("close")); }
  last(type) { return this.sent.findLast(message => message.type === type); }
}
let now = 1000;
const room = new RaceRoom({ clock: () => now, autoRun: false });
function connect(type, options = {}) {
  const socket = new Socket();
  const peer = room.attach(socket);
  room.message(peer, JSON.stringify({ type, protocol: RACE_PROTOCOL, ...options }));
  return { socket, peer, joined: socket.last("joined"), seq: 0 };
}
function send(client, type, fields = {}) {
  room.message(client.peer, JSON.stringify({ type, ...fields }));
}

assert.equal(connect("join").socket.last("error").code, "room-missing");
assert.equal(connect("create", { trackId: "bogus" }).socket.last("error").code, "invalid-track");
const host = connect("create", { trackId: "harbor", name: "A" });
const players = [host, ...["B", "C", "D"].map(name => connect("join", { name }))];
assert.equal(host.socket.last("state").players.length, 4);
assert(host.socket.last("state").players.every(player => !("token" in player)));
const fifth = connect("join", { name: "E" });
assert(fifth.joined);
assert.equal(host.socket.last("state").players.length, 5);
send(fifth, "leave");
send(players[1], "start");
assert.equal(room.phase, "lobby");
send(host, "start");
assert.equal(room.phase, "countdown");
assert.equal(host.socket.last("state").countdown, COUNTDOWN);
assert.equal(connect("join").socket.last("error").code, "in-progress");

for (let frame = 0; frame < 4500 && room.phase !== "finished"; frame++) {
  now += STEP * 1000;
  if (frame === 300) {
    const old = players[3];
    old.socket.close();
    const resumed = connect("resume", { token: old.joined.token });
    assert.equal(resumed.joined.id, old.joined.id);
    assert.equal(resumed.joined.ack, old.seq);
    players[3] = { ...resumed, seq: old.seq };
  }
  if (frame % 3 === 0) {
    players.forEach((client, i) => {
      const racer = room.racers.find(r => r.id === client.joined.id);
      send(client, "input", { seq: ++client.seq, ...steering(room.track, racer, -3.6 + i * 2.3) });
    });
  }
  room.tick(now);
}
assert.equal(room.phase, "finished");
const state = host.socket.last("state");
assert(state.racers.every(racer => racer.finishedAt > 0 && !racer.dnf && !("input" in racer)));
const order = rankRacers(state.racers);
assert.deepEqual(order.map(r => r.finishedAt), order.map(r => r.finishedAt).sort((a, b) => a - b));
assert(players.every(client => client.socket.last("state").phase === "finished"));
send(host, "start");
assert.equal(room.phase, "countdown");
for (const client of players.slice(1)) send(client, "leave");
now += (COUNTDOWN + 1) * 1000;
room.tick(now);
assert.equal(room.racers.filter(racer => racer.dnf).length, 3);
host.socket.close();
now += 13000;
room.tick(now);
assert.equal(room.phase, "lobby");
assert.equal(room.track, null);
console.log("Five seats accepted, shared start and results, reconnect, rematch, departure, and room cleanup passed.");

const { DatabaseSync } = await import("node:sqlite");
const { TougeRaceHub } = await import("../server/ranking-api/touge-racing-hub.mjs");
const { CPU_DIFFICULTIES, createRaceItems, createTrialRacer, lapTime, recordTrialInput, replayTrial, TRIAL_MAX_TICKS, TRIAL_PROTOCOL } = await import("../assets/ui/touge-racing-rules.mjs");
const track = getTrack("yunagi");

function trial(track, idleTicks = 0, laps = LAPS) {
  const player = createTrialRacer();
  const racers = [player], tape = [];
  let tick = 0;
  while (player.finishedAt === null && tick < TRIAL_MAX_TICKS) {
    player.input = tick < idleTicks ? { gas: false, brake: false, turn: 0 } : steering(track, player);
    recordTrialInput(tape, player.input);
    stepRace(track, racers, STEP, tick++ * STEP, laps);
  }
  assert.equal(player.distance, track.length * laps);
  assert.equal(player.lapEnds.length, laps);
  assert.equal(player.lapEnds.at(-1), player.finishedAt);
  assert.equal(Math.round(player.lapEnds.reduce((sum, _, index) => sum + lapTime(player.lapEnds, index), 0) * 100),
    Math.round(player.finishedAt * 100));
  const protocol = laps === 1 ? "touge-time-attack-2" : TRIAL_PROTOCOL;
  assert.equal(replayTrial(track, tape, protocol), player.finishedAt);
  assert.equal(replayTrial(track, [...tape, [5, 1]], protocol), null);
  assert.equal(player.item, null);
  if (track.layoutScale > 1 && !idleTicks) {
    assert(player.lapEnds.every((_, index) => {
      const seconds = lapTime(player.lapEnds, index);
      return seconds >= 50 && seconds <= 70;
    }), track.id + " laps take around a minute");
  }
  return tape;
}
for (const { id } of TRACKS) trial(getTrack(id));

const front = createRacer(1), rear = createRacer(0);
Object.assign(front, { distance: .3, lane: 0, speed: 12 });
Object.assign(rear, { distance: track.length - 2, lane: 0, speed: 36 });
stepRace(track, [front, rear], STEP, 1);
assert(front.speed > 12 && rear.speed < 36 && rear.contact > 0);
assert(front.distance - rear.distance + track.length >= 3.94, "Bumpers separate across the lap line");
const left = createRacer(0), right = createRacer(1);
Object.assign(left, { distance: 20, lane: .3, speed: 28, lateralSpeed: 5 });
Object.assign(right, { distance: 20, lane: 1.5, speed: 28, lateralSpeed: -4 });
stepRace(track, [left, right], STEP, 1);
assert(right.lane - left.lane >= 2.149);
assert(left.contact > 0 && right.contact > 0);
assert(left.lateralSpeed < 5 && right.lateralSpeed > -4);

const database = new DatabaseSync(":memory:");
const hub = new TougeRaceHub({ storage: { sql: { exec(query, ...params) {
  const stmt = database.prepare(query);
  if (query.trimStart().startsWith("SELECT")) return { toArray: () => stmt.all(...params) };
  stmt.run(...params);
  return { toArray: () => [] };
} } } });
const request = (path, body) => new Request("https://racing.internal" + path, body
  ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  : {});
const directoryRoom = new RaceRoom({ clock: () => now, autoRun: false });
directoryRoom.code = "ABCDEF";
directoryRoom.directory = { fetch: (url, init) => hub.fetch(new Request(url, init)) };
const listingSocket = new Socket();
const listingPeer = directoryRoom.attach(listingSocket);
directoryRoom.message(listingPeer, JSON.stringify({ type: "create", protocol: RACE_PROTOCOL, trackId: "yunagi", name: "Test" }));
await directoryRoom.listingWork;
let listing = await (await hub.fetch(request("/race/rooms"))).json();
assert.deepEqual(listing.rooms, [{ id: "ABCDEF", host: "Test", track: "yunagi", players: 1, phase: "lobby" }]);
directoryRoom.message(listingPeer, JSON.stringify({ type: "leave" }));
await directoryRoom.listingWork;
listing = await (await hub.fetch(request("/race/rooms"))).json();
assert.deepEqual(listing.rooms, []);

const record = { protocol: TRIAL_PROTOCOL, track: "yunagi", player: crypto.randomUUID(), name: "レーサーA", tape: trial(track, 10) };
const submit = run => hub.fetch(request("/race/leaderboard", run));
assert.equal((await submit({ ...record, tape: [[5, 1]], seconds: .01 })).status, 400);
assert.equal((await submit({ ...record, tape: [[5, TRIAL_MAX_TICKS + 1]] })).status, 400);
const prior = await (await submit({ ...record, protocol: "touge-time-attack-2", tape: trial(track, 0, 1) })).json();
assert(prior.updated);
assert.deepEqual((await (await hub.fetch(request("/race/leaderboard?track=yunagi"))).json()).entries, []);
assert.equal((await submit({ ...record, tape: trial(track, 0, 1) })).status, 400);
const first = await (await submit({ ...record, laps: [.01,.02,.03], seconds: .06 })).json();
assert(first.seconds > prior.seconds);
assert.deepEqual(Object.keys(first.entries[0]).sort(), ["name","rank","seconds"]);
const slower = await (await submit({ ...record, tape: trial(track, 20) })).json();
assert.equal(slower.updated, false);
assert.equal(slower.seconds, first.seconds);
const faster = await (await submit({ ...record, tape: trial(track), player: crypto.randomUUID(), name: "レーサーB" })).json();
assert.equal(faster.rank, 1);
assert.deepEqual(faster.entries.map(entry => entry.name), ["レーサーB", "レーサーA"]);
const better = await (await submit({ ...record, tape: trial(track) })).json();
assert.equal(better.updated, true);
assert.equal(better.rank, 1);
assert.deepEqual(better.entries.map(entry => entry.rank), [1, 1]);
assert(!JSON.stringify(better).includes(record.player));
const other = await (await hub.fetch(request("/race/leaderboard?track=night"))).json();
assert.deepEqual(other.entries, []);
database.close();
console.log("All ten three-lap trials, exact splits, collision physics, live rooms, replay validation and total-only ranking passed.");

const { EMPTY_INPUT, MIN_ROOM_PLAYERS, VISIBLE_RIVALS } = await import("../assets/ui/touge-racing-rules.mjs");
const world = getTrack("fuji");
const drifting = createTrialRacer();
drifting.speed = 32;
drifting.input = { ...EMPTY_INPUT, gas: true, drift: true, turn: 1 };
for (let i = 0; i < 20; i++) stepRace(world, [drifting], STEP, i * STEP, 1);
assert(drifting.drifting && drifting.driftCharge >= .55);
drifting.input = { ...EMPTY_INPUT, gas: true };
stepRace(world, [drifting], STEP, 20 * STEP, 1);
assert(!drifting.drifting && drifting.boost > .6);
const boxes = createRaceItems(world);
const itemDriver = createRacer(0);
Object.assign(itemDriver, { distance: world.itemLines[0] - .3, lane: 0, speed: 32, input: { ...EMPTY_INPUT, gas: true } });
stepRace(world, [itemDriver], STEP, 1, LAPS, boxes);
assert.equal(itemDriver.item, "turbo");
itemDriver.input = { ...EMPTY_INPUT, gas: true, item: true };
stepRace(world, [itemDriver], STEP, 1 + STEP, LAPS, boxes);
assert.equal(itemDriver.item, null);
assert(itemDriver.boost > 2);

const large = new RaceRoom({ clock: () => now, autoRun: false });
const largePeers = Array.from({ length: 35 }, (_, i) => {
  const socket = new Socket();
  const peer = large.attach(socket);
  large.message(peer, JSON.stringify({ type: i ? "join" : "create", protocol: RACE_PROTOCOL, trackId: world.id }));
  assert(socket.last("joined"));
  return { socket, peer };
});
assert.equal(large.connected(), 35);
large.message(largePeers[0].peer, JSON.stringify({ type: "start" }));
assert.equal(large.phase, "countdown");
assert(largePeers.every(({ socket }) => {
  const state = socket.last("state");
  return state.fieldSize === 35 && state.racers.length === VISIBLE_RIVALS + 1 &&
    state.racers[0].id === socket.last("joined").id && new Set(state.racers.map(racer => racer.id)).size === state.racers.length;
}));
const small = new RaceRoom({ clock: () => now, autoRun: false });
const smallHost = small.attach(new Socket());
small.message(smallHost, JSON.stringify({ type: "create", protocol: RACE_PROTOCOL, trackId: world.id }));
small.message(smallHost, JSON.stringify({ type: "start" }));
assert.equal(small.phase, "lobby");
for (let i = 1; i < MIN_ROOM_PLAYERS; i++) {
  small.message(small.attach(new Socket()), JSON.stringify({ type: "join", protocol: RACE_PROTOCOL }));
}
small.message(smallHost, JSON.stringify({ type: "start" }));
assert.equal(small.phase, "countdown");
console.log("Drift boost, item pickup/use, two-player start and 35-player room snapshots passed.");

const { smoothRacerPose } = await import("../assets/ui/touge-racing-motion.mjs");
const { worldScenery } = await import("../assets/ui/touge-racing-world.mjs");
for (const course of TRACKS) {
  const model = getTrack(course.id);
  const props = worldScenery(model);
  assert(props.length >= 4);
  assert(props.every(prop => prop.vertices.flat().every(Number.isFinite)));
}
const jittery = createRacer(0);
const pose = {};
smoothRacerPose(world, jittery, pose, STEP, true);
let lastLane = pose.lane;
let largestJump = 0;
for (let i = 0; i < 60; i++) {
  jittery.distance += 1;
  jittery.lane = i % 2 ? -2.1 : -1.7;
  jittery.steer = i % 2 ? -1 : 1;
  smoothRacerPose(world, jittery, pose, 1 / 60);
  largestJump = Math.max(largestJump, Math.abs(pose.lane - lastLane));
  assert(Number.isFinite(pose.yaw));
  lastLane = pose.lane;
}
assert(largestJump < .11, "Steering or network corrections do not jump the rendered car sideways");
console.log("All ten scenic models and smoothed position/yaw verified.");

for (const { id } of TRACKS) {
  const expanded = getTrack(id);
  assert(expanded.length >= 2500 && expanded.length <= 2750.01);
  assert.equal(expanded.halfWidth, getTrack(id, { classic: true }).halfWidth);
  assert.equal(expanded.itemLines.length, 7);
}
const edgeBoxes = createRaceItems(world);
const edgeDriver = createRacer(0);
Object.assign(edgeDriver, {
  distance: world.itemLines[0] - 4, lane: world.halfWidth + .2, speed: 30,
  input: { ...EMPTY_INPUT, gas: true }
});
stepRace(world, [edgeDriver], STEP, 2, LAPS, edgeBoxes);
assert.equal(edgeDriver.item, "turbo");
assert(edgeDriver.pickup > 0);
edgeDriver.input = { ...EMPTY_INPUT, gas: true, item: true };
stepRace(world, [edgeDriver], STEP, 2 + STEP, LAPS, edgeBoxes);
edgeDriver.input = { ...EMPTY_INPUT, gas: true };
stepRace(world, [edgeDriver], STEP, 2 + STEP * 2, LAPS, edgeBoxes);
assert.equal(edgeDriver.item, null, "A gate does not grant the same item twice");
edgeDriver.item = "grip";
edgeDriver.input = { ...EMPTY_INPUT, gas: true, item: true };
stepRace(world, [edgeDriver], STEP, 3, LAPS, edgeBoxes);
assert(edgeDriver.grip > 0);
edgeDriver.item = "recovery";
edgeDriver.itemHeld = false;
edgeDriver.slow = 1;
edgeDriver.speed = 17;
stepRace(world, [edgeDriver], STEP, 4, LAPS, edgeBoxes);
assert(edgeDriver.speed >= 38 && !edgeDriver.slow);
// Fire while the same-lane rival is beyond the old range. A closer adjacent car is safe.
for (const kind of ["pulse", "backPulse"]) {
  const direction = kind === "pulse" ? 1 : -1;
  const shooter = createRacer(0), rival = createRacer(1), adjacent = createRacer(2);
  const distance = kind === "pulse" ? world.length - 24 : 24;
  Object.assign(shooter, { distance, lane: 0, item: kind, input: { ...EMPTY_INPUT, item: true } });
  Object.assign(rival, { distance: distance + direction * 73 + (direction < 0 ? world.length : 0), lane: 0 });
  Object.assign(adjacent, { distance: distance + direction * 30, lane: 5 });
  const items = createRaceItems(world), racers = [shooter, rival, adjacent];
  stepRace(world, racers, STEP, 0, LAPS, items);
  assert.equal(shooter.item, null);
  assert.equal(rival.slow, 0);
  assert.equal(items.projectiles.length, 1);
  for (let i = 1; i <= 40 && items.projectiles.length; i++) stepRace(world, racers, STEP, i * STEP, LAPS, items);
  assert(rival.slow > 0, 'Pulse reaches a distant rival across the lap boundary');
  assert.equal(adjacent.slow, 0);
  assert.equal(shooter.slow, 0);
  assert.equal(items.projectiles.length, 0);
}
const alone = createRacer(0), emptyTrack = createRaceItems(world);
Object.assign(alone, { distance: 25, lane: 0, item: "pulse", input: { ...EMPTY_INPUT, item: true } });
stepRace(world, [alone], STEP, 0, LAPS, emptyTrack);
assert.equal(alone.item, null);
assert.equal(emptyTrack.projectiles.length, 1);
for (let i = 1; i <= 90; i++) stepRace(world, [alone], STEP, i * STEP, LAPS, emptyTrack);
assert.equal(emptyTrack.projectiles.length, 0);
assert.equal(alone.slow, 0);

// The online room queues a quick press, sends the shot to both drivers, then confirms the hit.
const pulseRoom = new RaceRoom({ clock: () => now, autoRun: false });
const onlineDrivers = ["create", "join"].map(type => {
  const socket = new Socket(), peer = pulseRoom.attach(socket);
  pulseRoom.message(peer, JSON.stringify({ type, protocol: RACE_PROTOCOL, trackId: world.id, layout: "long" }));
  return { socket, peer };
});
pulseRoom.start(now);
now = pulseRoom.startAt;
pulseRoom.tick(now);
const [thrower, defender] = pulseRoom.racers;
Object.assign(thrower, { distance: 30, lane: 0, item: "pulse" });
Object.assign(defender, { distance: 92, lane: 0, shield: 4 });
for (const [index, item] of [true, false].entries()) {
  pulseRoom.message(onlineDrivers[0].peer, JSON.stringify({ type: "input", ...EMPTY_INPUT, seq: index + 1, item }));
}
now += STEP * 2000;
pulseRoom.tick(now);
assert.equal(thrower.item, null);
for (const { socket } of onlineDrivers) {
  assert.equal(socket.last("state").projectiles.length, 1);
  assert.equal(socket.last("state").projectiles[0].kind, "pulse");
}
for (let i = 0; i < 30 && defender.shield; i++) {
  now += STEP * 1000;
  pulseRoom.tick(now);
}
assert.equal(defender.shield, 0);
assert.equal(defender.slow, 0);
assert.equal(pulseRoom.items.projectiles.length, 0);
console.log("Forward/backward projectiles, empty shots, lane collisions, lap seams and online guards passed.");

const times = Object.keys(CPU_DIFFICULTIES).map(difficulty => {
  const driver = createRacer(1, { cpu: true, difficulty });
  for (let tick = 0; tick < TRIAL_MAX_TICKS && driver.finishedAt === null; tick++) {
    stepRace(track, [driver], STEP, tick * STEP);
  }
  return driver.finishedAt;
});
assert(times.every(Number.isFinite));
assert(times[0] > times[1] && times[1] > times[2]);
const respawn = createRaceItems(world);
const edgeAtGate = () => Object.assign(createRacer(0), {
  distance: world.itemLines[0] - 3, lane: world.halfWidth + .2, speed: 30,
  input: { ...EMPTY_INPUT, gas: true }
});
const picker = edgeAtGate(), tooEarly = edgeAtGate(), inTime = edgeAtGate();
stepRace(world, [picker], STEP, 2, LAPS, respawn);
assert.equal(picker.item, "turbo");
assert.equal(respawn.respawns.filter(time => time > 0).length, 1);
assert(respawn.respawns.includes(3));
stepRace(world, [tooEarly], STEP, 2.999, LAPS, respawn);
assert.equal(tooEarly.item, null);
stepRace(world, [inTime], STEP, 3, LAPS, respawn);
assert.equal(inTime.item, "turbo");
assert(respawn.respawns.includes(4));
const solo = createTrialRacer();
Object.assign(solo, { distance: world.itemLines[0], speed: 30, input: { ...EMPTY_INPUT, gas: true } });
stepRace(world, [solo], STEP, 8, LAPS, respawn);
assert.equal(solo.item, null);
console.log("Minute-long circuits, shoulder pickup, one-second shared respawns and three CPU difficulty levels passed.");
