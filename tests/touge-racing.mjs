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
