import { getTrack } from "./touge-racing-tracks.mjs";
import { formatTime, ROOM_CODE, ROOM_SIZE } from "./touge-racing-rules.mjs?v=5";

const byId = id => document.getElementById(id);

export async function raceRequest(path, options = {}) {
  const url = new URL(path, window.HKRankingConfig?.endpoint);
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error("race-http-" + response.status);
  return response.json();
}

export function createRoomDirectory(onJoin) {
  const list = byId("room-list");
  const status = byId("room-list-status");
  const reload = byId("reload-rooms");
  let active = false, timer, signature, request = 0;

  function showRooms(rooms) {
    const clean = rooms.filter(room => ROOM_CODE.test(room.id) && getTrack(room.track));
    const current = JSON.stringify(clean);
    if (signature === current) return;
    signature = current;
    const focusedRoom = document.activeElement?.dataset.room;
    list.replaceChildren(...clean.map(room => {
      const item = document.createElement("li");
      const detail = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = room.host + "の部屋";
      const subline = document.createElement("small");
      subline.textContent = getTrack(room.track).name + " · " + room.players + " / " + ROOM_SIZE + "人";
      detail.append(title, subline);
      const join = document.createElement("button");
      join.type = "button";
      join.className = "secondary";
      join.dataset.room = room.id;
      join.disabled = room.phase !== "lobby" || room.players >= ROOM_SIZE;
      join.textContent = room.phase === "lobby"
        ? (join.disabled ? "満員" : "参加する")
        : room.phase === "finished" ? "終了" : "対戦中";
      join.setAttribute("aria-label", join.textContent + " · " + title.textContent + " · " + getTrack(room.track).name);
      join.addEventListener("click", () => onJoin(room.id));
      item.append(detail, join);
      return item;
    }));
    if (focusedRoom) {
      [...list.querySelectorAll("button")].find(button => button.dataset.room === focusedRoom)?.focus();
    }
  }

  async function refresh() {
    if (!active || document.hidden) return;
    const version = ++request;
    reload.disabled = true;
    if (!signature) status.textContent = "部屋を探しています…";
    try {
      const result = await raceRequest("/race/rooms");
      if (version !== request) return;
      showRooms(result.rooms);
      status.textContent = result.rooms.length ? "" : "募集中の部屋がないよ。「このコースで部屋を作る」から始めよう。";
    } catch {
      if (version === request) status.textContent = "部屋一覧を読み込めなかったよ。「更新」でもう一度試せるよ。";
    } finally {
      if (version === request) reload.disabled = false;
    }
  }

  reload.addEventListener("click", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  return enabled => {
    if (enabled === active) return;
    active = enabled;
    if (active) {
      refresh();
      timer = setInterval(refresh, 8000);
    } else {
      request++;
      clearInterval(timer);
    }
  };
}

export function createRankingPanel() {
  const panel = byId("rank-panel");
  const title = byId("rank-title");
  const status = byId("rank-status");
  const table = byId("rank-table");
  const body = byId("rank-rows");
  const open = byId("open-ranking");
  let request = 0;

  async function show(trackId) {
    if (panel.hidden) return;
    const version = ++request;
    title.textContent = getTrack(trackId).name + "のランキング";
    status.textContent = "ランキングを読み込み中…";
    table.hidden = true;
    try {
      const result = await raceRequest("/race/leaderboard?track=" + encodeURIComponent(trackId));
      if (version !== request) return;
      body.replaceChildren(...result.entries.map(entry => {
        const row = document.createElement("tr");
        for (const content of [entry.rank + "位", entry.name, formatTime(entry.seconds)]) {
          const cell = document.createElement("td");
          cell.textContent = content;
          row.append(cell);
        }
        return row;
      }));
      table.hidden = !result.entries.length;
      status.textContent = result.entries.length ? "" : "まだ記録がないよ。タイムアタックで1周して登録しよう。";
    } catch {
      if (version === request) status.textContent = "ランキングを読み込めなかったよ。「更新」でもう一度試せるよ。";
    }
  }
  return {
    show,
    open(trackId) {
      panel.hidden = false;
      open.setAttribute("aria-expanded", "true");
      show(trackId);
      panel.scrollIntoView({ block: "nearest" });
      title.focus({ preventScroll: true });
    },
    close() {
      request++;
      panel.hidden = true;
      open.setAttribute("aria-expanded", "false");
    }
  };
}
