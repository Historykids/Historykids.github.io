import { getTrack } from "../../assets/ui/touge-racing-tracks.mjs";
import { replayTrial, ROOM_CODE, TRIAL_PROTOCOL } from "../../assets/ui/touge-racing-rules.mjs";

const ROOM_TTL = 40000;
const RECORD_LIMIT = 20;
const MAX_PAYLOAD = 30000;
const PLAYER_KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export const cleanRacerName = value => typeof value === "string"
  ? [...value.normalize("NFKC").replace(/[\p{C}<>]/gu, "").trim()].slice(0, 14).join("")
  : "";

export function raceHub(env) {
  return env.RACING_HUB?.get(env.RACING_HUB.idFromName("touge-racing-hub"));
}

const reply = (body, status = 200) => Response.json(body, { status });

async function readRun(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_PAYLOAD || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PAYLOAD) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  }
}

export class TougeRaceHub {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS race_rooms (
      id TEXT PRIMARY KEY, track TEXT NOT NULL, host TEXT NOT NULL, players INTEGER NOT NULL,
      phase TEXT NOT NULL, expires INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS trial_records (
      track TEXT NOT NULL, player TEXT NOT NULL, name TEXT NOT NULL,
      centis INTEGER NOT NULL, recorded INTEGER NOT NULL, PRIMARY KEY(track, player)
    )`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS trial_records_order ON trial_records(track, centis, recorded, player)");
  }

  rows(query, ...args) {
    return this.sql.exec(query, ...args).toArray();
  }

  listRooms() {
    const now = Date.now();
    this.sql.exec("DELETE FROM race_rooms WHERE expires <= ?", now);
    const rooms = this.rows(`SELECT id, track, host, players, phase FROM race_rooms
      ORDER BY CASE WHEN phase = 'lobby' THEN 0 ELSE 1 END, expires DESC LIMIT 50`);
    return reply({ rooms });
  }

  updateRoom(room) {
    if (!room || !ROOM_CODE.test(room.id ?? "")) return reply({ error: "invalid-room" }, 400);
    if (room.phase === "closed") {
      this.sql.exec("DELETE FROM race_rooms WHERE id = ?", room.id);
      return reply({ ok: true });
    }
    if (!getTrack(room.track) || !Number.isInteger(room.players) || room.players < 1 ||
        !["lobby", "countdown", "racing", "finished"].includes(room.phase)) return reply({ error: "invalid-room" }, 400);
    this.sql.exec(`INSERT INTO race_rooms (id, track, host, players, phase, expires) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET track=excluded.track, host=excluded.host, players=excluded.players,
      phase=excluded.phase, expires=excluded.expires`,
      room.id, room.track, cleanRacerName(room.host) || "レーサー", room.players, room.phase, Date.now() + ROOM_TTL);
    return reply({ ok: true });
  }

  board(track) {
    const rows = this.rows(`SELECT name, centis FROM trial_records WHERE track = ?
      ORDER BY centis, recorded, player LIMIT ?`, track, RECORD_LIMIT);
    let prior, rank = 0;
    return rows.map(({ name, centis }, index) => {
      if (centis !== prior) rank = index + 1;
      prior = centis;
      return { name, seconds: centis / 100, rank };
    });
  }

  submit(run) {
    const track = getTrack(run?.track);
    const name = cleanRacerName(run?.name);
    const legacy = track && !track.region && run?.protocol === "touge-time-attack-1";
    if (!track || !name || !PLAYER_KEY.test(run?.player ?? "") || (!legacy && run.protocol !== TRIAL_PROTOCOL)) {
      return reply({ error: "invalid-record" }, 400);
    }
    const seconds = replayTrial(track, run.tape, legacy);
    if (seconds === null) return reply({ error: "invalid-replay" }, 400);
    const centis = Math.round(seconds * 100);
    const old = this.rows("SELECT centis FROM trial_records WHERE track = ? AND player = ?", track.id, run.player)[0];
    const updated = !old || centis < old.centis;
    if (updated) {
      this.sql.exec(`INSERT INTO trial_records (track, player, name, centis, recorded) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(track, player) DO UPDATE SET name=excluded.name, centis=excluded.centis, recorded=excluded.recorded`,
        track.id, run.player, name, centis, Date.now());
    }
    this.sql.exec("UPDATE trial_records SET name = ? WHERE player = ? AND name != ?", name, run.player, name);
    const best = updated ? centis : old.centis;
    const { place } = this.rows("SELECT COUNT(*) + 1 AS place FROM trial_records WHERE track = ? AND centis < ?", track.id, best)[0];
    return reply({ track: track.id, rank: place, seconds: best / 100, updated, entries: this.board(track.id) });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/internal/room" && request.method === "POST") return this.updateRoom(await request.json());
    if (url.pathname === "/race/rooms" && request.method === "GET") return this.listRooms();
    if (url.pathname !== "/race/leaderboard") return reply({ error: "not-found" }, 404);
    if (request.method === "POST") return this.submit(await readRun(request));
    const track = getTrack(url.searchParams.get("track"));
    return track ? reply({ track: track.id, entries: this.board(track.id) }) : reply({ error: "invalid-track" }, 400);
  }
}
