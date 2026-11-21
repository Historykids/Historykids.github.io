import { TRACKS } from "./touge-racing-tracks.mjs?v=23";
import { createRankingPanel, mountSpeedPicker } from "./touge-racing-menu.js?v=23";
import { requireRaceName } from "./touge-racing-profile.mjs?v=6";

const name = requireRaceName();
if (name) {
  const page = document.getElementById("ranking-page");
  const profile = document.getElementById("profile-link");
  const select = document.getElementById("rank-course");
  profile.textContent = name + " · 名前を変更";
  for (const track of TRACKS) {
    const option = document.createElement("option");
    option.value = track.id;
    option.textContent = track.region + " · " + track.name;
    select.append(option);
  }
  const chosen = new URL(location.href).searchParams.get("track");
  select.value = TRACKS.some(track => track.id === chosen) ? chosen : TRACKS[0].id;
  const show = createRankingPanel();
  let speedClass = mountSpeedPicker(next => {
    speedClass = next;
    refresh();
  });
  const refresh = () => {
    const url = new URL(location.href);
    url.searchParams.set("track", select.value);
    history.replaceState(null, "", url);
    profile.href = "./touge-racing.html?edit=1&next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
    const tryTrack = document.getElementById("try-track");
    tryTrack.href = "./touge-racing-play.html?" + new URLSearchParams({ mode: "trial", track: select.value, speedClass });
    show(select.value, speedClass);
  };
  select.addEventListener("change", refresh);
  document.getElementById("reload-ranking").addEventListener("click", refresh);
  page.hidden = false;
  refresh();
}
