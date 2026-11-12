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
  for (let elapsed = 0; elapsed < 150 && player.finishedAt === null; elapsed += STEP) {
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
assert.equal(connect("join").socket.last("error").code, "full");
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
console.log("Four human seats, shared start and results, reconnect, rematch, departure, and room cleanup passed.");

const { DatabaseSync } = await import("node:sqlite");
const { TougeRaceHub } = await import("../server/ranking-api/touge-racing-hub.mjs");
const { createTrialRacer, recordTrialInput, replayTrial, TRIAL_PROTOCOL } = await import("../assets/ui/touge-racing-rules.mjs");
const track = getTrack("yunagi");

function trial(track, idleTicks = 0) {
  const player = createTrialRacer();
  const racers = [player], tape = [];
  let tick = 0;
  while (player.finishedAt === null && tick < 3600) {
    player.input = tick < idleTicks ? { gas: false, brake: false, turn: 0 } : steering(track, player);
    recordTrialInput(tape, player.input);
    stepRace(track, racers, STEP, tick++ * STEP, 1);
  }
  assert.equal(player.distance, track.length);
  assert.equal(replayTrial(track, tape), player.finishedAt);
  assert.equal(replayTrial(track, [...tape, [5, 1]]), null);
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
assert.equal((await submit({ ...record, tape: [[5, 3601]] })).status, 400);
const first = await (await submit(record)).json();
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
console.log("All ten time trials, front/side impacts, live directory lifecycle, replay validation, and per-track ranking passed.");
