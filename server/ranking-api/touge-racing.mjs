import { getTrack, TRACKS } from "../../assets/ui/touge-racing-tracks.mjs";
import {
  COUNTDOWN, EMPTY_INPUT, RACE_LIMIT, RACE_PROTOCOL, ROOM_CODE, MIN_ROOM_PLAYERS, VISIBLE_RIVALS, STEP, createRacer, isDriving, rankRacers, stepRace
} from "../../assets/ui/touge-racing-rules.mjs";

import { cleanRacerName, raceHub } from "./touge-racing-hub.mjs";

const ORIGIN = "https://historykids.github.io";
const RECONNECT_MS = 12000;
const TIME_AFTER_WIN = 70;
const ROOM_IDLE = 20 * 60 * 1000;
export async function racingRequest(request, env, reply) {
  const url = new URL(request.url);
  const path = url.pathname;
  const isDirectory = path === "/race/rooms" || path === "/race/leaderboard";
  if (!isDirectory && path !== "/race/status" && path !== "/race/socket") return reply({ error: "not-found" }, 404);
  if (request.method === "OPTIONS") return reply({ ok: true });
  if (request.method !== "GET" && !(path === "/race/leaderboard" && request.method === "POST")) {
    return reply({ error: "method-not-allowed" }, 405);
  }
  const limiter = env.RACING_CONNECT_LIMITER;
  if ((path === "/race/socket" || request.method === "POST") && limiter &&
      !(await limiter.limit({ key: path + ":" + (request.headers.get("CF-Connecting-IP") || "anonymous") })).success) {
    return reply({ error: "rate-limited" }, 429);
  }
  if (isDirectory) {
    const hub = raceHub(env);
    if (!hub) return reply({ error: "unavailable" }, 503);
    const response = await hub.fetch(request);
    return reply(await response.json(), response.status);
  }
  if (!env.RACING_ROOM) return reply({ error: "unavailable" }, 503);
  if (path === "/race/status") {
    return reply({ protocol: RACE_PROTOCOL, capacity: null, minimumPlayers: MIN_ROOM_PLAYERS, tracks: TRACKS.map(track => track.id) });
  }
  const code = url.searchParams.get("room");
  if (!ROOM_CODE.test(code ?? "")) return reply({ error: "invalid-room" }, 400);
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return reply({ error: "websocket-required" }, 426);
  return env.RACING_ROOM.get(env.RACING_ROOM.idFromName("touge-" + code)).fetch(request);
}

export class RaceRoom {
  constructor({ clock = () => Date.now(), autoRun = true } = {}) {
    this.clock = clock;
    this.autoRun = autoRun;
    this.peers = new Set();
    this.players = new Map();
    this.reset();
  }

  reset() {
    this.phase = "lobby";
    this.host = null;
    this.track = null;
    this.racers = [];
    this.startAt = 0;
    this.elapsed = 0;
    this.tickNumber = 0;
    this.tickedAt = 0;
    this.firstFinish = null;
    this.closedAt = 0;
    this.activityAt = this.clock();
  }

  send(peer, message) {
    if (!peer || peer.closed) return;
    try { peer.socket.send(typeof message === "string" ? message : JSON.stringify(message)); }
    catch { this.detach(peer); }
  }

  reject(peer, code) {
    this.send(peer, { type: "error", code });
    this.detach(peer);
    try { peer.socket.close(1008, code); } catch {}
  }

  attach(socket) {
    const now = this.clock();
    const peer = { socket, record: null, heardAt: now, rateAt: now, messages: 0, closed: false };
    this.peers.add(peer);
    socket.addEventListener("message", event => this.message(peer, event.data));
    socket.addEventListener("close", () => this.detach(peer));
    socket.addEventListener("error", () => this.detach(peer));
    this.send(peer, { type: "hello", protocol: RACE_PROTOCOL });
    if (!this.timer && this.autoRun) {
      this.timer = setInterval(() => this.tick(), 1000 / 30);
    }
    return peer;
  }

  detach(peer) {
    if (peer.closed) return;
    peer.closed = true;
    this.peers.delete(peer);
    const record = peer.record;
    if (record?.peer !== peer) return;
    record.peer = null;
    record.disconnectedAt = this.clock();
    if (record.racer) record.racer.input = EMPTY_INPUT;
    if (this.phase === "lobby" || this.phase === "finished") this.broadcast();
    else this.publishListing();
  }

  leave(peer) {
    const record = peer.record;
    if (record) {
      if (record.racer && isDriving(record.racer)) record.racer.dnf = true;
      this.players.delete(record.token);
      if (this.host === record.id) this.promoteHost();
      if (!this.players.size && (this.phase === "lobby" || this.phase === "finished")) this.reset();
    }
    this.detach(peer);
    this.publishListing();
    try { peer.socket.close(1000, "left"); } catch {}
  }

  promoteHost() {
    const next = [...this.players.values()].find(record => record.peer);
    this.host = next?.id ?? this.players.values().next().value?.id ?? null;
  }

  message(peer, raw) {
    if (peer.closed) return;
    const now = this.clock();
    if (now - peer.rateAt >= 1000) {
      peer.rateAt = now;
      peer.messages = 0;
    }
    if (++peer.messages > 48 || typeof raw !== "string" || raw.length > 600) return this.reject(peer, "input");
    let message;
    try { message = JSON.parse(raw); } catch { return this.reject(peer, "input"); }
    if (!message || typeof message !== "object" || Array.isArray(message)) return this.reject(peer, "input");
    peer.heardAt = now;
    if (!peer.record) return this.join(peer, message, now);
    const record = peer.record;
    if (message.type === "leave") return this.leave(peer);
    if (message.type === "ping") return;
    if (message.type === "start") {
      if (record.id !== this.host || !["lobby", "finished"].includes(this.phase) || this.connected() < MIN_ROOM_PLAYERS) return;
      this.start(now);
      return;
    }
    if (message.type !== "input" || !Number.isSafeInteger(message.seq) || message.seq < 1 ||
        typeof message.gas !== "boolean" || typeof message.brake !== "boolean" ||
        ![-1, 0, 1].includes(message.turn)) return this.reject(peer, "input");
    if (!record.racer || message.seq <= record.ack) return;
    record.ack = message.seq;
    record.inputAt = now;
    const previous = record.racer.input;
    record.racer.itemQueued ||= message.item === true && !previous.item;
    record.racer.input = {
      gas: message.gas, brake: message.brake, turn: message.turn, drift: message.drift === true, item: message.item === true
    };
  }

  join(peer, message, now) {
    if (message.protocol !== RACE_PROTOCOL || !["create", "join", "resume"].includes(message.type)) {
      return this.reject(peer, "version");
    }
    let record;
    if (message.type === "resume") {
      record = this.players.get(message.token);
      if (!record || (!record.peer && now - record.disconnectedAt > RECONNECT_MS)) {
        return this.reject(peer, "expired");
      }
    } else {
      if (message.type === "create") {
        if (this.track) return this.reject(peer, "code-used");
        this.track = getTrack(message.trackId);
        if (!this.track) return this.reject(peer, "invalid-track");
      } else if (!this.track) return this.reject(peer, "room-missing");
      if (this.phase !== "lobby") return this.reject(peer, "in-progress");
      const slots = new Set([...this.players.values()].map(player => player.slot));
      let slot = 0;
      while (slots.has(slot)) slot++;
      record = {
        id: crypto.randomUUID(), token: crypto.randomUUID(), name: cleanRacerName(message.name) || "レーサー " + (slot + 1),
        slot, ack: 0, inputAt: now, peer: null, racer: null
      };
      this.players.set(record.token, record);
      this.host ??= record.id;
    }
    if (record.peer) this.reject(record.peer, "replaced");
    record.peer = peer;
    peer.record = record;
    this.activityAt = now;
    this.send(peer, { type: "joined", id: record.id, token: record.token, ack: record.ack });
    this.broadcast();
  }

  connected() {
    return [...this.players.values()].filter(record => record.peer).length;
  }

  start(now) {
    this.racers = [...this.players.values()].sort((a, b) => a.slot - b.slot).map((record, gridSlot) => {
      record.racer = createRacer(gridSlot, { id: record.id, name: record.name, grid: true });
      record.inputAt = now;
      return record.racer;
    });
    this.phase = "countdown";
    this.startAt = now + COUNTDOWN * 1000;
    this.tickedAt = this.startAt;
    this.elapsed = 0;
    this.tickNumber = 0;
    this.firstFinish = null;
    this.broadcast();
  }

  publishListing(now = this.clock()) {
    if (!this.directory || !this.code) return;
    const players = this.connected();
    const host = [...this.players.values()].find(record => record.id === this.host)?.name;
    const entry = this.track && players ? {
      id: this.code, track: this.track.id, host, players, phase: this.phase
    } : { id: this.code, phase: "closed" };
    const signature = JSON.stringify(entry);
    if (signature === this.listingSignature && (entry.phase === "closed" || now - this.listingAt < 12000)) return;
    this.listingSignature = signature;
    this.listingAt = now;
    this.listingWork = (this.listingWork ?? Promise.resolve()).then(async () => {
      if (signature !== this.listingSignature) return;
      const response = await this.directory.fetch("https://racing.internal/internal/room", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: signature
      });
      if (!response.ok) throw new Error("Room listing update failed");
    }).catch(() => {
      if (this.listingSignature === signature) this.listingAt = this.clock() - 10000;
    });
  }

  broadcast(now = this.clock()) {
    this.publishListing(now);
    if (!this.track) return;
    const lobby = this.phase === "lobby" || this.phase === "finished";
    const players = lobby ? [...this.players.values()].map(({ id, name, slot, peer }) => ({ id, name, slot, connected: !!peer })) : [];
    const ordered = rankRacers(this.racers);
    const ranks = new Map(ordered.map((racer, index) => [racer.id, index + 1]));
    const wire = racer => ({
      id: racer.id, slot: racer.slot, name: racer.name, color: racer.color,
      distance: racer.distance, lane: racer.lane, speed: racer.speed, steer: racer.steer,
      boost: racer.boost, drifting: racer.drifting, driftCharge: racer.driftCharge, slow: racer.slow,
      item: racer.item, shield: racer.shield, contact: racer.contact, finishedAt: racer.finishedAt, dnf: racer.dnf
    });
    const snapshot = {
      type: "state", phase: this.phase, trackId: this.track.id, host: this.host, players,
      fieldSize: ordered.length, countdown: Math.max(0, (this.startAt - now) / 1000), elapsed: this.elapsed
    };
    if (lobby) {
      const message = JSON.stringify({ ...snapshot, racers: ordered.map(wire) });
      for (const record of this.players.values()) this.send(record.peer, message);
      return;
    }
    const length = this.track.length;
    const nearby = ordered.map(racer => ({
      data: wire(racer), progress: ((racer.distance % length) + length) % length
    })).sort((a, b) => a.progress - b.progress);
    const indices = new Map(nearby.map((racer, index) => [racer.data.id, index]));
    for (const record of this.players.values()) {
      if (!record.peer) continue;
      const index = indices.get(record.id);
      const count = nearby.length;
      const local = [nearby[index].data];
      let left = 1, right = 1;
      while (local.length < Math.min(count, VISIBLE_RIVALS + 1)) {
        const low = nearby[(index - left + count) % count];
        const high = nearby[(index + right) % count];
        const backward = (nearby[index].progress - low.progress + length) % length;
        const forward = (high.progress - nearby[index].progress + length) % length;
        if (backward < forward) {
          local.push(low.data);
          left++;
        } else {
          local.push(high.data);
          right++;
        }
      }
      this.send(record.peer, { ...snapshot, rank: ranks.get(record.id), racers: local });
    }
  }

  tick(now = this.clock()) {
    for (const peer of [...this.peers]) {
      if (now - peer.heardAt > (peer.record ? 24000 : 5000)) this.reject(peer, "idle");
    }
    let changed = false;
    for (const [token, record] of this.players) {
      if (!record.peer && now - record.disconnectedAt > RECONNECT_MS) {
        if (record.racer && isDriving(record.racer)) record.racer.dnf = true;
        this.players.delete(token);
        if (this.host === record.id) this.promoteHost();
        changed = true;
      }
      if (record.racer && now - record.inputAt > 600) record.racer.input = EMPTY_INPUT;
    }
    if (this.phase === "lobby" && now - this.activityAt > ROOM_IDLE) {
      for (const peer of [...this.peers]) this.reject(peer, "idle");
      this.players.clear();
    }
    if (this.phase === "countdown") {
      if (now < this.startAt) {
        if (++this.tickNumber % 3 === 0) this.broadcast(now);
        return;
      }
      this.phase = "racing";
      this.broadcast(now);
    }
    if (this.phase === "racing") {
      // Use the same fixed simulation step for all four drivers.
      let steps = 0;
      while (now - this.tickedAt + .001 >= STEP * 1000 && steps++ < 8) {
        stepRace(this.track, this.racers, STEP, this.elapsed);
        this.elapsed += STEP;
        this.tickedAt += STEP * 1000;
        this.tickNumber++;
      }
      if (this.firstFinish === null) {
        const times = this.racers.map(racer => racer.finishedAt).filter(time => time !== null);
        if (times.length) this.firstFinish = Math.min(...times);
      }
      if (this.elapsed >= RACE_LIMIT || this.elapsed >= (this.firstFinish ?? Infinity) + TIME_AFTER_WIN) {
        for (const racer of this.racers) if (isDriving(racer)) racer.dnf = true;
      }
      if (!this.racers.some(isDriving)) {
        this.phase = "finished";
        this.closedAt = now;
        this.broadcast(now);
      } else if (changed || (steps && this.tickNumber % 2 === 0)) this.broadcast(now);
    } else if (changed) this.broadcast(now);

    if (this.phase === "finished" && now - this.closedAt > 5 * 60 * 1000) {
      for (const peer of [...this.peers]) this.reject(peer, "idle");
      this.players.clear();
    }
    this.publishListing(now);
    if (!this.peers.size && !this.players.size && this.phase !== "racing" && this.phase !== "countdown") {
      this.reset();
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class TougeRaceRoom {
  constructor(_ctx, env) {
    this.room = new RaceRoom();
    this.room.directory = raceHub(env);
  }

  async fetch(request) {
    if (request.headers.get("Origin") !== ORIGIN) return new Response("Origin not allowed", { status: 403 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    this.room.code = new URL(request.url).searchParams.get("room");
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.room.attach(server);
    return new Response(null, { status: 101, webSocket: client });
  }
}
