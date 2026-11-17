import assert from "node:assert/strict";
import { RaceRoom } from "../server/ranking-api/touge-racing.mjs";
import { driveSample, getTrack, lapDistance, LAPS, TRACKS } from "../assets/ui/touge-racing-tracks.mjs";
import { COUNTDOWN, LOBBY_CHAT_COOLDOWN, LOBBY_CHAT_LIMIT, RACE_PROTOCOL, STEP, createRacer,
  cruiseAfterFinish, endLastRacer, rankRacers, stepRace, turnAt } from "../assets/ui/touge-racing-rules.mjs";

function steering(track, racer, offset = 0, scale = 1) {
  const distance = (racer.distance + track.length) % track.length;
  const pad = track.pads.find(p => distance >= p.distance - 26 && distance <= p.distance + track.padLength);
  const drift = turnAt(track, racer.distance, 6) * (racer.speed / scale) ** 2 * .029;
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
assert.equal(host.socket.last("state").speedClass, "150cc");
const players = [host, ...["B", "C", "D"].map(name => connect("join", { name }))];
assert.equal(host.socket.last("state").players.length, 4);
assert(host.socket.last("state").players.every(player => !("token" in player)));
const fifth = connect("join", { name: "E" });
assert(fifth.joined);
assert.equal(host.socket.last("state").players.length, 5);
send(host, "chat", { preset: "ready", name: "Spoofed", text: "<script>" });
const firstMessage = host.socket.last("chat").entry;
assert.deepEqual(firstMessage, { id: 1, playerId: host.joined.id, name: "A", preset: "ready" });
assert.deepEqual(fifth.socket.last("chat").entry, firstMessage);
send(host, "chat", { preset: "fire" });
send(players[1], "chat", { preset: "constructor" });
assert.equal(room.chat.length, 1);
send(players[1], "chat", { preset: "fire" });
assert.equal(host.socket.last("chat").entry.preset, "fire");
for (let i = 0; i < LOBBY_CHAT_LIMIT; i++) {
  now += LOBBY_CHAT_COOLDOWN;
  send(host, "chat", { preset: "wait" });
}
const late = connect("join", { name: "Late" });
assert.equal(late.socket.last("state").chat.length, LOBBY_CHAT_LIMIT);
assert.equal(late.socket.last("state").chat[0].id, 3);
send(late, "leave");
send(fifth, "leave");
send(players[1], "start");
assert.equal(room.phase, "lobby");
send(host, "start");
assert.equal(room.phase, "countdown");
assert.equal(host.socket.last("state").countdown, COUNTDOWN);
send(host, "chat", { preset: "hello" });
assert.equal(host.socket.last("chat").entry.preset, "wait");
assert(!Object.hasOwn(host.socket.last("state"), "chat"));
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
const order = rankRacers(state.racers);
const finishers = order.slice(0, -1), last = order.at(-1);
assert(finishers.every(racer => racer.finishedAt > 0 && racer.cruising && !racer.dnf && !("input" in racer)));
assert(finishers[0].distance > room.track.length * LAPS + 2, "A finisher moves while the others are still racing");
assert(finishers.every((racer, index) => !index || racer.finishedAt >= finishers[index - 1].finishedAt));
assert(last.dnf && last.lastPlace && !last.cruising && last.finishedAt === null && last.speed === 0);
assert(Math.abs(state.elapsed - finishers.at(-1).finishedAt) < STEP + .001, "Cutoff happens in the second-last finisher's simulation step");
assert(!host.socket.last("state").chat);
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
console.log("Lobby chat, shared start, finish cruising, instant last-place cutoff, reconnect and room cleanup passed.");

const { DatabaseSync } = await import("node:sqlite");
const { TougeRaceHub } = await import("../server/ranking-api/touge-racing-hub.mjs");
const { CPU_DIFFICULTIES, DEFAULT_RACE_SPEED, MAIN_ROAD_TRIAL_PROTOCOL, OFFROAD_TRIAL_PROTOCOL, PREVIOUS_TRIAL_PROTOCOL, SHORTCUT_TRIAL_PROTOCOL, TURBO_TRIAL_PROTOCOL, RACE_SPEEDS, createRaceItems, createTrialRacer, lapTime,
  recordTrialInput, replayTrial, TERRAIN_TRIAL_PROTOCOL, TRIAL_MAX_TICKS, TRIAL_PROTOCOL } = await import("../assets/ui/touge-racing-rules.mjs");
const track = getTrack("yunagi");

// The road drive after finishing is cosmetic and does not alter finish time, lap count or the finishing order.
const cruiseTrack = getTrack("fuji", { freeDrive: true });
const exit = cruiseTrack.sample(0);
const coasting = { ...createRacer(0), free: true, finishedAt: 77, completedLaps: LAPS,
  x: exit.x + exit.rx * (cruiseTrack.halfWidth + 1), z: exit.z + exit.rz * (cruiseTrack.halfWidth + 1) };
for (let tick = 0; tick < 900; tick++) {
  cruiseAfterFinish(cruiseTrack, coasting, STEP);
  assert(!coasting.free && !coasting.shortcut && Math.abs(coasting.lane) < cruiseTrack.halfWidth);
}
assert(coasting.distance > LAPS * cruiseTrack.length + 400);
assert.equal(coasting.finishedAt, 77);
assert.equal(coasting.completedLaps, LAPS);
const soleDriver = createRacer(1), withdrawn = { ...createRacer(2), dnf: true };
endLastRacer([coasting, soleDriver, withdrawn]);
assert(!soleDriver.dnf, "A player who is ahead of a withdrawn entrant can still finish");

function trial(track, idleTicks = 0, laps = LAPS, speedClass = DEFAULT_RACE_SPEED) {
  const { scale } = RACE_SPEEDS[speedClass];
  const player = createTrialRacer();
  const racers = [player], tape = [];
  let tick = 0;
  while (player.finishedAt === null && tick < TRIAL_MAX_TICKS) {
    player.input = tick < idleTicks ? { gas: false, brake: false, turn: 0 } : steering(track, player, 0, scale);
    recordTrialInput(tape, player.input);
    stepRace(track, racers, STEP, tick++ * STEP, laps, null, scale);
  }
  assert.equal(player.distance, track.length * laps);
  assert.equal(player.lapEnds.length, laps);
  assert.equal(player.lapEnds.at(-1), player.finishedAt);
  assert.equal(Math.round(player.lapEnds.reduce((sum, _, index) => sum + lapTime(player.lapEnds, index), 0) * 100),
    Math.round(player.finishedAt * 100));
  const protocol = laps === 1 ? "touge-time-attack-2" : TRIAL_PROTOCOL;
  assert.equal(replayTrial(track, tape, protocol, speedClass), player.finishedAt);
  assert.equal(replayTrial(track, [...tape, [5, 1]], protocol, speedClass), null);
  assert.equal(player.item, track.turboCuts ? "turbo" : track.offroad ? "offroad" : null);
  if (track.layoutScale > 1 && !idleTicks && speedClass === DEFAULT_RACE_SPEED) {
    assert(player.lapEnds.every((_, index) => {
      const seconds = lapTime(player.lapEnds, index);
      return seconds >= 50 && seconds <= 70;
    }), track.id + " laps take around a minute");
  }
  return tape;
}
for (const { id } of TRACKS) {
  const track = getTrack(id);
  const times = Object.keys(RACE_SPEEDS).map(speedClass =>
    replayTrial(track, trial(track, 0, LAPS, speedClass), TRIAL_PROTOCOL, speedClass));
  assert(times.every((seconds, index) => !index || seconds < times[index - 1]), id + " gets faster in each speed class");
}

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
database.exec(`CREATE TABLE race_rooms (
  id TEXT PRIMARY KEY, track TEXT NOT NULL, host TEXT NOT NULL, players INTEGER NOT NULL,
  phase TEXT NOT NULL, expires INTEGER NOT NULL
)`);
database.prepare("INSERT INTO race_rooms VALUES ('ZYXWVU', 'yunagi', 'Old room', 1, 'lobby', ?)").run(Date.now() + 40000);
const hub = new TougeRaceHub({ storage: { sql: { exec(query, ...params) {
  const stmt = database.prepare(query);
  if (/^(SELECT|PRAGMA)\b/.test(query.trimStart())) return { toArray: () => stmt.all(...params) };
  stmt.run(...params);
  return { toArray: () => [] };
} } } });
const request = (path, body) => new Request("https://racing.internal" + path, body
  ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  : {});
assert.equal((await (await hub.fetch(request("/race/rooms"))).json()).rooms[0].speedClass, "150cc");
await hub.fetch(request("/internal/room", { id: "ZYXWVU", phase: "closed" }));
const directoryRoom = new RaceRoom({ clock: () => now, autoRun: false });
directoryRoom.code = "ABCDEF";
directoryRoom.directory = { fetch: (url, init) => hub.fetch(new Request(url, init)) };
const listingSocket = new Socket();
const listingPeer = directoryRoom.attach(listingSocket);
directoryRoom.message(listingPeer, JSON.stringify({ type: "create", protocol: RACE_PROTOCOL, trackId: "yunagi",
  layout: "long", name: "Test", speedClass: "dopagaki", speedClasses: true }));
await directoryRoom.listingWork;
let listing = await (await hub.fetch(request("/race/rooms"))).json();
assert.deepEqual(listing.rooms, [{ id: "ABCDEF", host: "Test", track: "yunagi", players: 1, phase: "lobby", speedClass: "dopagaki" }]);
assert.equal(listingSocket.last("state").speedClass, "dopagaki");
const olderSocket = new Socket();
directoryRoom.message(directoryRoom.attach(olderSocket), JSON.stringify({ type: "join", protocol: RACE_PROTOCOL }));
assert.equal(olderSocket.last("error").code, "version");
const guestSocket = new Socket();
const guest = directoryRoom.attach(guestSocket);
directoryRoom.message(guest, JSON.stringify({ type: "join", protocol: RACE_PROTOCOL, speedClasses: true }));
assert.equal(guestSocket.last("state").speedClass, "dopagaki");
directoryRoom.start(now);
assert.equal(guestSocket.last("state").speedClass, "dopagaki");
now = directoryRoom.startAt;
for (let i = 0; i < 90; i++) {
  now += STEP * 1000;
  if (i % 9 === 0) directoryRoom.message(listingPeer, JSON.stringify({ type: "input", seq: i + 1, gas: true, brake: false, turn: 0 }));
  directoryRoom.tick(now);
}
assert(directoryRoom.racers[0].speed > 65, "The online room simulates the host's chosen speed class");
directoryRoom.message(guest, JSON.stringify({ type: "leave" }));
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
const first = await (await submit({ ...record, protocol: PREVIOUS_TRIAL_PROTOCOL, laps: [.01,.02,.03], seconds: .06 })).json();
assert(first.seconds > prior.seconds);
assert.equal(first.speedClass, DEFAULT_RACE_SPEED);
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
for (const speedClass of ["100cc", "200cc", "dopagaki"]) {
  const tape = trial(track, 0, LAPS, speedClass);
  assert.equal((await submit({ ...record, protocol: PREVIOUS_TRIAL_PROTOCOL, speedClass, tape })).status, 400);
  const otherRun = await (await submit({ ...record, speedClass, tape })).json();
  assert.equal(otherRun.speedClass, speedClass);
  assert.deepEqual(otherRun.entries, [{ name: record.name, seconds: otherRun.seconds, rank: 1 }]);
  const chosenBoard = await (await hub.fetch(request("/race/leaderboard?track=yunagi&speedClass=" + speedClass))).json();
  assert.deepEqual(chosenBoard.entries, otherRun.entries);
}
const standardBoard = await (await hub.fetch(request("/race/leaderboard?track=yunagi&speedClass=150cc"))).json();
assert.deepEqual(standardBoard.entries, better.entries);
assert.deepEqual(await (await hub.fetch(request("/race/leaderboard?track=yunagi"))).json(), standardBoard);
assert.equal((await hub.fetch(request("/race/leaderboard?track=yunagi&speedClass=bogus"))).status, 400);
assert.equal((await submit({ ...record, speedClass: "bogus" })).status, 400);
const ghostBoard = async (speed, replay = 9, id = "yunagi") => (await (await hub.fetch(request(
  "/race/leaderboard?track=" + id + "&ghost=1&replay=" + replay + "&speedClass=" + speed))).json()).ghost;
const ghost = await ghostBoard("150cc");
assert.deepEqual(Object.keys(ghost).sort(), ["name", "protocol", "seconds", "tape"]);
assert.equal(ghost.name, better.entries[0].name);
assert.equal(ghost.protocol, TRIAL_PROTOCOL);
assert.equal(await ghostBoard("150cc", 8), null);
const oldGhostRequest = request("/race/leaderboard?track=yunagi&ghost=1&speedClass=150cc");
assert.equal((await (await hub.fetch(oldGhostRequest)).json()).ghost, null);
database.prepare("UPDATE trial_records SET tape = ? WHERE track = ? AND name = ?")
  .run(JSON.stringify(ghost.tape), "yunagi:3laps", ghost.name);
assert.equal((await (await hub.fetch(oldGhostRequest)).json()).ghost.protocol, MAIN_ROAD_TRIAL_PROTOCOL);
assert.equal(Math.round(replayTrial(track, ghost.tape) * 100), Math.round(ghost.seconds * 100));
assert((await ghostBoard("dopagaki")).seconds < ghost.seconds);
database.prepare("UPDATE trial_records SET tape = NULL WHERE track = ?").run("yunagi:3laps");
assert.equal(await ghostBoard("150cc"), null);
const leader = database.prepare("SELECT player FROM trial_records WHERE track = ? ORDER BY centis, recorded, player LIMIT 1").get("yunagi:3laps");
const tied = await (await submit({ ...record, player: leader.player, name: ghost.name, tape: ghost.tape })).json();
assert.equal(tied.updated, false);
assert.deepEqual(await ghostBoard("150cc"), ghost);
const other = await (await hub.fetch(request("/race/leaderboard?track=night"))).json();
assert.deepEqual(other.entries, []);
console.log("All ten three-lap trials, exact splits, collision physics, live rooms, replay validation and total-only ranking passed.");

const { EMPTY_INPUT, MIN_ROOM_PLAYERS, VISIBLE_RIVALS } = await import("../assets/ui/touge-racing-rules.mjs");
const world = getTrack("fuji", { offroad: false });
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
for (const freeDrive of [false, true]) {
  const viewingRoom = new RaceRoom({ clock: () => now, autoRun: false });
  const sendView = (client, type, options = {}) => viewingRoom.message(client.peer, JSON.stringify({ type, ...options }));
  function viewingClient(type, options = {}) {
    const socket = new Socket(), peer = viewingRoom.attach(socket);
    sendView({ peer }, type, { protocol: RACE_PROTOCOL, spectator: true, freeDrive, layout: "long", trackId: "fuji", ...options });
    return { socket, peer, joined: socket.last("joined") };
  }
  const clients = Array.from({ length: 35 }, (_, i) => viewingClient(i === 0 ? "create" : "join"));
  const [viewer, next] = clients;
  sendView(viewer, "start");
  viewingRoom.phase = "racing";
  const length = viewingRoom.track.length;
  viewingRoom.racers.forEach((racer, index) => { racer.distance = length * index / 35; });
  const target = clients[17].joined.id;
  sendView(viewer, "watch", { id: target });
  viewingRoom.broadcast();
  assert(!("spectators" in viewer.socket.last("state")), "Active drivers cannot spectate");
  const own = viewingRoom.racers[0];
  own.finishedAt = 30;
  cruiseAfterFinish(viewingRoom.track, own, STEP);
  viewingRoom.broadcast();
  let view = viewer.socket.last("state");
  assert.equal(view.watching, null);
  assert.equal(view.spectators.length, 34);
  assert(!view.racers.some(racer => racer.id === target), "The target starts outside the viewer's position updates");

  const cruising = own.distance;
  sendView(viewer, "watch", { id: target });
  cruiseAfterFinish(viewingRoom.track, own, STEP);
  viewingRoom.broadcast();
  view = viewer.socket.last("state");
  assert.equal(view.watching, target);
  assert.equal(view.rank, 1);
  assert.equal(view.racers[0].id, viewer.joined.id);
  assert(view.racers[0].distance > cruising, "The finisher cruises while watching someone else");
  assert.equal(view.racers[1].id, target);
  assert(view.racers.some(racer => racer.id === clients[18].joined.id), "Nearby traffic follows the spectator camera");
  assert.equal(view.racers.length, VISIBLE_RIVALS + 1);
  assert.equal(new Set(view.racers.map(racer => racer.id)).size, view.racers.length);
  assert(!("watching" in next.socket.last("state")), "Other drivers' cameras are independent");

  viewer.socket.close();
  const resumedViewer = viewingClient("resume", { token: viewer.joined.token });
  assert.equal(resumedViewer.socket.last("state").watching, target);
  sendView(resumedViewer, "watch", { id: null });
  viewingRoom.broadcast();
  assert.equal(resumedViewer.socket.last("state").watching, null);
  sendView(resumedViewer, "watch", { id: target });
  viewingRoom.racers[17].finishedAt = 31;
  viewingRoom.broadcast();
  view = resumedViewer.socket.last("state");
  assert.equal(view.watching, null);
  assert(!view.spectators.some(racer => racer.id === target));
}
console.log("Finishers can spectate distant drivers on both track layouts, return to their car and resume without changing their rank.");
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
  assert.equal(expanded.itemLines.length, 8);
  assert(expanded.itemLines.includes(expanded.offroadItemLine));
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

// Record real steering into the branch and replay the identical drive on the server.
function driveRoute(track, speedClass, useItem = true) {
  const driver = createTrialRacer(), field = [driver], tape = [];
  const { scale } = RACE_SPEEDS[speedClass];
  let entries = 0;
  for (let tick = 0; tick < TRIAL_MAX_TICKS && driver.finishedAt === null; tick++) {
    const cut = track.shortcut;
    const remaining = cut ? cut.from - lapDistance(track, driver.distance) : Infinity;
    const lane = !driver.shortcut && remaining >= 0 && remaining < 130 ? cut.lane : 0;
    const slip = turnAt(track, driver.distance, 6, driver.shortcut) * (driver.speed / scale) ** 2 * .029;
    const aim = (lane - driver.lane) * 2.7 + slip;
    driver.input = { gas: true, brake: false, turn: aim > 2.1 ? 1 : aim < -2.1 ? -1 : 0,
      item: useItem && remaining >= 0 && remaining < 33 && (driver.item === "turbo" || driver.item === "offroad") };
    recordTrialInput(tape, driver.input);
    const onBranch = driver.shortcut;
    stepRace(track, field, STEP, tick * STEP, LAPS, null, scale);
    if (!onBranch && driver.shortcut) entries++;
  }
  assert.equal(driver.lapEnds.length, 3);
  return { time: driver.finishedAt, tape, entries };
}

for (const { id } of TRACKS) {
  const route = getTrack(id), cut = route.shortcut;
  for (const end of [cut.from, cut.to]) {
    const normal = route.sample(end), branch = driveSample(route, end, true);
    assert(Math.hypot(branch.x - normal.x - normal.rx * cut.lane, branch.z - normal.z - normal.rz * cut.lane) < .001);
  }
  for (const speedClass of Object.keys(RACE_SPEEDS)) {
    const main = driveRoute(getTrack(id, { shortcuts: false }), speedClass);
    const branch = driveRoute(route, speedClass);
    assert.equal(branch.entries, LAPS, id);
    assert.equal(driveRoute(route, speedClass, false).entries, 0, id + " needs a turbo to cut");
    const oldRoute = driveRoute(getTrack(id, { offroad: false }), speedClass);
    assert.equal(oldRoute.entries, LAPS);
    assert.equal(replayTrial(route, oldRoute.tape, SHORTCUT_TRIAL_PROTOCOL, speedClass), oldRoute.time);
    const previousOffroad = driveRoute(getTrack(id, { turboCuts: false }), speedClass);
    assert.equal(previousOffroad.entries, LAPS);
    assert.equal(replayTrial(route, previousOffroad.tape, OFFROAD_TRIAL_PROTOCOL, speedClass), previousOffroad.time);
    assert(branch.time < main.time, id + " shortcut must save time");
    assert.equal(replayTrial(route, branch.tape, TURBO_TRIAL_PROTOCOL, speedClass), branch.time);
    assert.equal(replayTrial(route, main.tape, MAIN_ROAD_TRIAL_PROTOCOL, speedClass), main.time);
  }
}

const open = getTrack("fuji", { freeDrive: true });
assert.equal(open.itemLines.length, 7);
assert.equal(open.offroadItemLine, undefined);
const grass = { free: true, x: open.terrain.bounds.left + 10, z: open.terrain.bounds.top + 10, heading: Math.PI / 2 };
for (const { scale } of Object.values(RACE_SPEEDS)) {
  const roadDriver = createTrialRacer(), grassDriver = createTrialRacer();
  roadDriver.speed = grassDriver.speed = 47 * scale;
  roadDriver.input = grassDriver.input = { ...EMPTY_INPUT, gas: true };
  Object.assign(grassDriver, grass, { boost: 1.65 });
  for (let tick = 0; tick < 24; tick++) {
    stepRace(open, [roadDriver, grassDriver], STEP, tick * STEP, LAPS, null, scale);
  }
  assert.equal(roadDriver.speed, 47 * scale);
  assert.equal(grassDriver.speed, 19 * scale, "Grass slows the car even if a drift boost is active");
}
const boostedOnGrass = createTrialRacer();
Object.assign(boostedOnGrass, grass, { speed: 19, input: { ...EMPTY_INPUT, gas: true, item: true } });
stepRace(open, [boostedOnGrass], STEP, 0);
assert(boostedOnGrass.speed > 19);
assert(boostedOnGrass.free && boostedOnGrass.turboTime > 0);
boostedOnGrass.input = { ...EMPTY_INPUT, gas: true };
for (let tick = 1; tick <= 95; tick++) {
  stepRace(open, [boostedOnGrass], STEP, tick * STEP);
  if (tick === 60) assert.equal(boostedOnGrass.speed, 63, "Turbo reaches full boost speed on grass");
}
assert(boostedOnGrass.free && boostedOnGrass.turboTime === 0);
assert.equal(boostedOnGrass.speed, 19, "Grass slows the car again when turbo expires");

const escape = createTrialRacer();
Object.assign(escape, { distance: 120, lane: open.halfWidth + 1.5, speed: 42,
  input: { ...EMPTY_INPUT, gas: true, turn: 1 } });
stepRace(open, [escape], STEP, 0);
assert(escape.free);
const startX = escape.x, startZ = escape.z;
for (let tick = 1; tick < 240; tick++) {
  escape.input = { ...EMPTY_INPUT, gas: true, turn: tick < 24 ? 1 : 0 };
  stepRace(open, [escape], STEP, tick * STEP);
}
assert(escape.free);
assert(Math.hypot(escape.x - startX, escape.z - startZ) > 125, "The car can travel far beyond the road shoulder");

// Rejoin on a different part of the circuit, not just at a preset fork or merge.
const merge = open.sample(open.length * .77);
Object.assign(escape, { x: merge.x + merge.rx * 3, z: merge.z + merge.rz * 3,
  heading: Math.atan2(merge.fx, merge.fz), input: { ...EMPTY_INPUT, gas: true } });
stepRace(open, [escape], STEP, 8);
assert.equal(escape.free, false);
assert(Math.abs(lapDistance(open, escape.distance) - open.length * .77) < 5);
assert.equal(escape.lapEnds.length, 0);

const skip = createTrialRacer();
Object.assign(skip, { distance: open.length - 1, speed: 45, input: { ...EMPTY_INPUT, gas: true } });
stepRace(open, [skip], STEP, 0);
assert(skip.distance >= open.length);
assert.equal(skip.lapEnds.length, 0, "Crossing the finish line without the other gates does not count");
assert.equal(skip.finishedAt, null);

for (const { id } of TRACKS) {
  const route = getTrack(id, { freeDrive: true });
  const racer = createTrialRacer(), tape = [];
  for (let tick = 0; tick < TRIAL_MAX_TICKS && racer.finishedAt === null; tick++) {
    racer.input = steering(route, racer);
    recordTrialInput(tape, racer.input);
    stepRace(route, [racer], STEP, tick * STEP);
  }
  assert.equal(racer.lapEnds.length, LAPS, id + " checkpoint loop");
  assert.equal(replayTrial(route, tape, TRIAL_PROTOCOL), racer.finishedAt);
}

const oldTerrain = { ...open, legacyTerrainSpeed: true };
const oldRacer = createTrialRacer(), oldTape = [];
for (let tick = 0; tick < TRIAL_MAX_TICKS && oldRacer.finishedAt === null; tick++) {
  oldRacer.input = steering(oldTerrain, oldRacer, tick > 100 && tick < 220 ? oldTerrain.halfWidth : 0);
  recordTrialInput(oldTape, oldRacer.input);
  stepRace(oldTerrain, [oldRacer], STEP, tick * STEP);
}
// The previous physics gave 166.40 seconds on this run along the shoulder.
assert.equal(Math.round(oldRacer.finishedAt * 100), 16640);
assert.equal(replayTrial(open, oldTape, TERRAIN_TRIAL_PROTOCOL), oldRacer.finishedAt);
assert.equal((await submit({ ...record, track: open.id, tape: oldTape, protocol: TERRAIN_TRIAL_PROTOCOL })).status, 200);
assert.equal((await ghostBoard("150cc", 9, open.id)).protocol, TERRAIN_TRIAL_PROTOCOL);
database.close();

const terrainRoom = new RaceRoom({ clock: () => now, autoRun: false });
const terrainSockets = ["create", "join"].map(type => {
  const socket = new Socket(), peer = terrainRoom.attach(socket);
  terrainRoom.message(peer, JSON.stringify({ type, protocol: RACE_PROTOCOL, freeDrive: true, trackId: "fuji", layout: "long" }));
  return socket;
});
terrainRoom.start(now);
now = terrainRoom.startAt;
terrainRoom.tick(now);
const [pilot, rival] = terrainRoom.racers;
const field = terrainRoom.track.terrain.bounds;
Object.assign(pilot, { free: true, x: field.left + 20, z: field.top + 20, heading: Math.PI / 2, speed: 42,
  item: "pulse", itemQueued: true, input: { ...EMPTY_INPUT, gas: true } });
Object.assign(rival, { free: true, x: pilot.x + 32, z: pilot.z, heading: Math.PI / 2, input: EMPTY_INPUT });
now += STEP * 4000;
terrainRoom.tick(now);
const state8 = terrainSockets[1].last("state");
assert(state8.freeDrive);
assert(state8.racers.some(racer => racer.id === pilot.id && racer.free && racer.x > field.left + 20));
assert(pilot.speed < 42, "The online room slows an unboosted driver off-road");
assert(state8.projectiles[0].free);
for (let i = 0; i < 8 && !rival.slow; i++) {
  now += STEP * 1000;
  terrainRoom.tick(now);
}
assert(rival.slow > 0, "A pulse can hit another driver away from the road");
console.log("Terrain driving, unrestricted rejoin, sequential lap checkpoints, trial replays and online pulses verified.");
