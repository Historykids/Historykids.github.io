import { getTrack } from "../../assets/ui/touge-racing-tracks.mjs";
import {
  DEFAULT_RACE_SPEED, isRaceSpeed, MAIN_ROAD_TRIAL_PROTOCOL, OFFROAD_TRIAL_PROTOCOL, PREVIOUS_TRIAL_PROTOCOL, replayTrial, ROOM_CODE,
  SHORTCUT_TRIAL_PROTOCOL, TERRAIN_TRIAL_PROTOCOL, TRIAL_PROTOCOL, SIX_KEY_TRIAL_PROTOCOL, RAMP_TAP_TRIAL_PROTOCOL, ALL_RAMPS_PROTOCOL, GROUND_JUMP_TRIAL_PROTOCOL, MANUAL_TRIAL_PROTOCOL, ASSISTED_TRIAL_PROTOCOL, TURBO_TRIAL_PROTOCOL, usesTrialTerrain
} from "../../assets/ui/touge-racing-rules.mjs";

const ROOM_TTL = 40000;
const RECORD_LIMIT = 20;
const MAX_PAYLOAD = 85000;
const totalBoard = (track, speedClass) => track + ":3laps" + (speedClass === DEFAULT_RACE_SPEED ? "" : ":" + speedClass);
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
    const speedColumn = `speed_class TEXT NOT NULL DEFAULT '${DEFAULT_RACE_SPEED}'`;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS race_rooms (
      id TEXT PRIMARY KEY, track TEXT NOT NULL, host TEXT NOT NULL, players INTEGER NOT NULL,
      phase TEXT NOT NULL, expires INTEGER NOT NULL, ${speedColumn}
    )`);
    if (!this.rows("PRAGMA table_info(race_rooms)").some(column => column.name === "speed_class")) {
      this.sql.exec(`ALTER TABLE race_rooms ADD COLUMN ${speedColumn}`);
    }
    this.sql.exec(`CREATE TABLE IF NOT EXISTS trial_records (
      track TEXT NOT NULL, player TEXT NOT NULL, name TEXT NOT NULL,
      centis INTEGER NOT NULL, recorded INTEGER NOT NULL, PRIMARY KEY(track, player)
    )`);
    if (!this.rows("PRAGMA table_info(trial_records)").some(column => column.name === "tape")) {
      this.sql.exec("ALTER TABLE trial_records ADD COLUMN tape TEXT");
    }
    this.sql.exec("CREATE INDEX IF NOT EXISTS trial_records_order ON trial_records(track, centis, recorded, player)");
  }

  rows(query, ...args) {
    return this.sql.exec(query, ...args).toArray();
  }

  listRooms() {
    const now = Date.now();
    this.sql.exec("DELETE FROM race_rooms WHERE expires <= ?", now);
    const rooms = this.rows(`SELECT id, track, host, players, phase, speed_class AS speedClass FROM race_rooms
      ORDER BY CASE WHEN phase = 'lobby' THEN 0 ELSE 1 END, expires DESC LIMIT 50`);
    return reply({ rooms });
  }

  updateRoom(room) {
    if (!room || !ROOM_CODE.test(room.id ?? "")) return reply({ error: "invalid-room" }, 400);
    if (room.phase === "closed") {
      this.sql.exec("DELETE FROM race_rooms WHERE id = ?", room.id);
      return reply({ ok: true });
    }
    const speedClass = room.speedClass ?? DEFAULT_RACE_SPEED;
    if (!isRaceSpeed(speedClass) || !getTrack(room.track) || !Number.isInteger(room.players) || room.players < 1 ||
        !["lobby", "countdown", "racing", "finished"].includes(room.phase)) return reply({ error: "invalid-room" }, 400);
    this.sql.exec(`INSERT INTO race_rooms (id, track, host, players, phase, expires, speed_class) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET track=excluded.track, host=excluded.host, players=excluded.players,
      phase=excluded.phase, expires=excluded.expires, speed_class=excluded.speed_class`,
      room.id, room.track, cleanRacerName(room.host) || "レーサー", room.players, room.phase, Date.now() + ROOM_TTL, speedClass);
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
    const freeDrive = usesTrialTerrain(run?.protocol);
    const total = freeDrive || [TURBO_TRIAL_PROTOCOL, SHORTCUT_TRIAL_PROTOCOL, OFFROAD_TRIAL_PROTOCOL, MAIN_ROAD_TRIAL_PROTOCOL, PREVIOUS_TRIAL_PROTOCOL].includes(run?.protocol);
    const track = getTrack(run?.track, { classic: !total, freeDrive,
      manualDrive:[TRIAL_PROTOCOL,SIX_KEY_TRIAL_PROTOCOL,RAMP_TAP_TRIAL_PROTOCOL,ALL_RAMPS_PROTOCOL,GROUND_JUMP_TRIAL_PROTOCOL,MANUAL_TRIAL_PROTOCOL].includes(run?.protocol),
      assistedSteering:[TRIAL_PROTOCOL,SIX_KEY_TRIAL_PROTOCOL,RAMP_TAP_TRIAL_PROTOCOL,ALL_RAMPS_PROTOCOL,GROUND_JUMP_TRIAL_PROTOCOL].includes(run?.protocol) });
    const speedClass = run?.speedClass ?? DEFAULT_RACE_SPEED;
    const name = cleanRacerName(run?.name);
    if (!track || !isRaceSpeed(speedClass) || !name || !PLAYER_KEY.test(run?.player ?? "") || typeof run.protocol !== "string") {
      return reply({ error: "invalid-record" }, 400);
    }
    const seconds = replayTrial(track, run.tape, run.protocol, speedClass, run.jumpSeed);
    if (seconds === null) return reply({ error: "invalid-replay" }, 400);
    const centis = Math.round(seconds * 100);
    const board = total ? totalBoard(track.id, speedClass) : track.id;
    const old = this.rows("SELECT centis, tape IS NOT NULL AS hasTape FROM trial_records WHERE track = ? AND player = ?", board, run.player)[0];
    const updated = !old || centis < old.centis;
    const tape = total ? JSON.stringify({ protocol: run.protocol, tape: run.tape, ...(run.protocol === TRIAL_PROTOCOL ? { jumpSeed: run.jumpSeed ?? 0 } : {}) }) : null;
    if (updated) {
      this.sql.exec(`INSERT INTO trial_records (track, player, name, centis, recorded, tape) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(track, player) DO UPDATE SET name=excluded.name, centis=excluded.centis,
          recorded=excluded.recorded, tape=excluded.tape`,
        board, run.player, name, centis, Date.now(), tape);
    } else if (total && centis === old.centis && !old.hasTape) {
      this.sql.exec("UPDATE trial_records SET tape = ? WHERE track = ? AND player = ?",
        tape, board, run.player);
    }
    this.sql.exec("UPDATE trial_records SET name = ? WHERE player = ? AND name != ?", name, run.player, name);
    const best = updated ? centis : old.centis;
    const { place } = this.rows("SELECT COUNT(*) + 1 AS place FROM trial_records WHERE track = ? AND centis < ?", board, best)[0];
    return reply({ track: track.id, speedClass, rank: place, seconds: best / 100, updated, entries: this.board(board) });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/internal/room" && request.method === "POST") return this.updateRoom(await request.json());
    if (url.pathname === "/race/rooms" && request.method === "GET") return this.listRooms();
    if (url.pathname !== "/race/leaderboard") return reply({ error: "not-found" }, 404);
    if (request.method === "POST") return this.submit(await readRun(request));
    const track = getTrack(url.searchParams.get("track"));
    if (!track) return reply({ error: "invalid-track" }, 400);
    const speedClass = url.searchParams.get("speedClass") ?? DEFAULT_RACE_SPEED;
    if (!isRaceSpeed(speedClass)) return reply({ error: "invalid-speed" }, 400);
    const board = totalBoard(track.id, speedClass);
    if (url.searchParams.get("ghost") === "1") {
      const leader = this.rows(`SELECT name, centis, tape FROM trial_records WHERE track = ?
        ORDER BY centis, recorded, player LIMIT 1`, board)[0];
      const stored = leader?.tape ? JSON.parse(leader.tape) : null;
      const run = Array.isArray(stored) ? { protocol: MAIN_ROAD_TRIAL_PROTOCOL, tape: stored } : stored;
      const clientReplay = url.searchParams.get("replay");
      const replayVersion = ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"].includes(clientReplay) ? Number(clientReplay) : 4;
      const requiredVersion = run?.protocol === TRIAL_PROTOCOL ? 15 : run?.protocol === SIX_KEY_TRIAL_PROTOCOL ? 14 : run?.protocol === RAMP_TAP_TRIAL_PROTOCOL ? 13 : run?.protocol === ALL_RAMPS_PROTOCOL ? 12 : run?.protocol === GROUND_JUMP_TRIAL_PROTOCOL ? 11 : run?.protocol === MANUAL_TRIAL_PROTOCOL ? 10 : run?.protocol === ASSISTED_TRIAL_PROTOCOL ? 9 : run?.protocol === TERRAIN_TRIAL_PROTOCOL ? 8 :
        run?.protocol === TURBO_TRIAL_PROTOCOL ? 7 : run?.protocol === OFFROAD_TRIAL_PROTOCOL ? 6 :
        run?.protocol === SHORTCUT_TRIAL_PROTOCOL ? 5 : 4;
      const supported = replayVersion >= requiredVersion;
      const ghost = run && supported
        ? { name: leader.name, seconds: leader.centis / 100, ...run }
        : null;
      return reply({ track: track.id, speedClass, ghost });
    }
    return reply({ track: track.id, speedClass, entries: this.board(board) });
  }
}
