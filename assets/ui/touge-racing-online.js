import { RACE_PROTOCOL } from "./touge-racing-rules.mjs?v=6";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const messages = {
  "room-missing": "部屋が見つからないよ。部屋一覧を更新して、入り直してね。",
  "in-progress": "この部屋はすでにレースが始まっているよ。",
  "expired": "再接続できる時間が過ぎたよ。",
  "code-used": "もう一度、部屋を作ってね。",
  "version": "ゲームが更新されたよ。ページを再読み込みしてね。",
  "replaced": "別のタブから同じ部屋に接続したよ。",
  "idle": "しばらく操作がなかったため、部屋から退出したよ。",
  "unavailable": "オンラインに接続できないよ。少し待ってから試してね。",
  "connection": "通信が切れたよ。部屋一覧から入り直せるよ。"
};

export function makeRoomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => ALPHABET[byte & 31]).join("");
}

function storageKey(code) {
  return "historykids.tougeRacing.room." + code;
}

export function savedRoomToken(code) {
  try { return sessionStorage.getItem(storageKey(code)); } catch { return null; }
}

function remember(code, token) {
  try {
    if (token) sessionStorage.setItem(storageKey(code), token);
    else sessionStorage.removeItem(storageKey(code));
  } catch {}
}

export class OnlineRace {
  constructor(code, request, handlers) {
    this.code = code;
    this.request = request;
    this.handlers = handlers;
    this.sequence = 0;
    this.token = request.token;
    this.input = { gas: false, brake: false, turn: 0 };
  }

  open() {
    if (this.closed) return;
    this.handlers.status(this.token ? "部屋に再接続中…" : "オンラインに接続中…");
    try {
      const endpoint = window.HKRankingConfig?.endpoint;
      if (!endpoint) return this.fail("unavailable");
      const url = new URL("/race/socket", endpoint);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("room", this.code);
      const socket = new WebSocket(url);
      this.socket = socket;
      this.timeout = setTimeout(() => socket.close(), 5500);
      socket.addEventListener("open", () => {
        const message = this.token ? { type: "resume", token: this.token } : this.request;
        this.send({ ...message, protocol: RACE_PROTOCOL });
      });
      socket.addEventListener("message", event => this.message(socket, event.data));
      socket.addEventListener("close", () => this.disconnected(socket));
    } catch {
      this.fail("unavailable");
    }
  }

  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try { this.socket.send(JSON.stringify(message)); } catch {}
  }

  message(socket, data) {
    if (socket !== this.socket || this.closed || typeof data !== "string" || data.length > 1500000) return;
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === "hello" && message.protocol !== RACE_PROTOCOL) return this.fail("version");
    if (message.type === "error") return this.fail(message.code);
    if (message.type === "joined") {
      this.id = message.id;
      this.token = message.token;
      this.sequence = Math.max(this.sequence, message.ack);
      remember(this.code, this.token);
      this.joined = true;
      this.disconnectedAt = 0;
      clearTimeout(this.timeout);
      clearInterval(this.keepAlive);
      this.keepAlive = setInterval(() => this.send({ type: "ping" }), 4500);
      this.handlers.status("");
      return;
    }
    if (message.type === "state" && this.joined) {
      this.phase = message.phase;
      this.handlers.state(message, this.id);
    }
  }

  disconnected(socket) {
    if (socket !== this.socket || this.closed) return;
    this.joined = false;
    clearTimeout(this.timeout);
    clearInterval(this.keepAlive);
    if (!this.token) return this.fail("unavailable");
    this.disconnectedAt ||= Date.now();
    if (Date.now() - this.disconnectedAt >= 10500) return this.fail("connection");
    this.handlers.status("通信が切れたよ。再接続中…");
    this.retry = setTimeout(() => this.open(), 650);
  }

  control(input, force = false) {
    const changed = input.turn !== this.input.turn || input.gas !== this.input.gas || input.brake !== this.input.brake ||
      input.drift !== this.input.drift || input.item !== this.input.item;
    this.input = input;
    if (!this.joined || !["countdown", "racing"].includes(this.phase)) return;
    const now = performance.now();
    if (!force && !changed && now - (this.inputAt || 0) < 85) return;
    this.inputAt = now;
    this.send({ type: "input", seq: ++this.sequence, ...input });
  }

  start() {
    this.send({ type: "start" });
  }

  leave() {
    if (this.joined) this.send({ type: "leave" });
    remember(this.code, null);
    this.close();
  }

  fail(code) {
    if (["expired", "room-missing", "replaced", "idle"].includes(code)) remember(this.code, null);
    this.close();
    this.handlers.error(messages[code] || messages.connection);
  }

  close() {
    this.closed = true;
    clearTimeout(this.timeout);
    clearTimeout(this.retry);
    clearInterval(this.keepAlive);
    try { this.socket?.close(1000, "done"); } catch {}
  }
}
