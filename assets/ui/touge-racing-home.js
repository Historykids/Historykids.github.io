import { getTrack } from "./touge-racing-tracks.mjs?v=6";
import { createRacer, ROOM_CODE } from "./touge-racing-rules.mjs?v=6";
import { raceName, safeRacePage, saveRaceName, suggestedName } from "./touge-racing-profile.mjs?v=6";

const dialog = document.getElementById("name-dialog");
const field = document.getElementById("racer-name");
const change = document.getElementById("change-name");
const params = new URL(location.href).searchParams;
const code = params.get("room");
const next = safeRacePage(params.get("next")) || (ROOM_CODE.test(code ?? "") ? "./touge-racing-rooms.html?room=" + code : "");

function showName() {
  field.value = raceName() || suggestedName();
  document.getElementById("name-error").textContent = "";
  dialog.showModal();
  field.focus();
}

function showProfile(name) {
  change.hidden = false;
  change.textContent = name + " · 名前を変更";
}

dialog.addEventListener("cancel", event => {
  if (!raceName()) event.preventDefault();
});
change.addEventListener("click", showName);
document.getElementById("name-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = saveRaceName(field.value);
  if (!name) {
    document.getElementById("name-error").textContent = "表示できる文字で名前を入力してね。";
    return;
  }
  if (!raceName()) {
    document.getElementById("name-error").textContent = "名前を保存できなかったよ。ブラウザの保存を有効にしてね。";
    return;
  }
  dialog.close();
  showProfile(name);
  if (next) location.replace(next);
});

const existing = raceName();
if (!existing || params.get("edit") === "1") showName();
else if (next) location.replace(next);
if (existing) showProfile(existing);

const canvas = document.getElementById("portal-course");
try {
  const { createScene } = await import("./touge-racing-scene.js?v=6");
  const track = getTrack("fuji");
  const preview = createScene(canvas, [createRacer(0), createRacer(1)], track);
  new ResizeObserver(() => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    preview.resize(canvas.clientWidth, canvas.clientHeight);
    preview.render("ready", 0, true);
  }).observe(canvas);
} catch {
  canvas.hidden = true;
}
