const PROFILE = "historykids.tougeRacing.profile.v1";
const LEGACY_NAME = "historykids.tougeRacing.nickname";

export function readRaceStorage(key) {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
  } catch {}
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function saveRaceStorage(key, value) {
  try { localStorage.setItem(key, value); }
  catch {
    try { sessionStorage.setItem(key, value); } catch {}
  }
}

export const cleanRaceName = value =>
  [...String(value ?? "").normalize("NFKC").replace(/[\p{C}<>]/gu, "").trim()].slice(0, 14).join("");

export function suggestedName() {
  return cleanRaceName(readRaceStorage(LEGACY_NAME));
}

export function raceName() {
  return cleanRaceName(readRaceStorage(PROFILE));
}

export function saveRaceName(value) {
  const name = cleanRaceName(value);
  if (name) {
    saveRaceStorage(PROFILE, name);
    saveRaceStorage(LEGACY_NAME, name);
  }
  return name;
}

export function safeRacePage(target) {
  if (!target) return "";
  try {
    const page = new URL(target, location.href);
    if (page.origin !== location.origin) return "";
    const file = page.pathname.split("/").pop();
    if (!["touge-racing-rooms.html", "touge-racing-play.html", "touge-racing-ranking.html"].includes(file)) return "";
    return file + page.search;
  } catch { return ""; }
}

export function requireRaceName() {
  const name = raceName();
  if (name) return name;
  const target = safeRacePage(location.href);
  location.replace("./touge-racing.html?next=" + encodeURIComponent(target));
  return "";
}
