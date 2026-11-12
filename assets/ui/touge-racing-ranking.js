import { getTrack, LEGACY_TRACKS, TRACKS } from "./touge-racing-tracks.mjs?v=6";
import { createRankingPanel } from "./touge-racing-menu.js?v=6";
import { requireRaceName } from "./touge-racing-profile.mjs?v=6";

const name = requireRaceName();
if (name) {
  const page = document.getElementById("ranking-page");
  const profile = document.getElementById("profile-link");
  const select = document.getElementById("rank-course");
  profile.textContent = name + " · 名前を変更";
  profile.href = "./touge-racing.html?edit=1&next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
  for (const [label, tracks] of [["世界の10コース", TRACKS], ["以前のコース", LEGACY_TRACKS]]) {
    const group = document.createElement("optgroup");
    group.label = label;
    for (const track of tracks) {
      const option = document.createElement("option");
      option.value = track.id;
      option.textContent = (track.region ? track.region + " · " : "") + track.name;
      group.append(option);
    }
    select.append(group);
  }
  const chosen = new URL(location.href).searchParams.get("track");
  select.value = getTrack(chosen)?.id ?? TRACKS[0].id;
  const show = createRankingPanel();
  const refresh = () => {
    const url = new URL(location.href);
    url.searchParams.set("track", select.value);
    history.replaceState(null, "", url);
    const tryTrack = document.getElementById("try-track");
    tryTrack.hidden = !getTrack(select.value)?.region;
    tryTrack.href = "./touge-racing-play.html?mode=trial&track=" + encodeURIComponent(select.value);
    show(select.value);
  };
  select.addEventListener("change", refresh);
  document.getElementById("reload-ranking").addEventListener("click", refresh);
  page.hidden = false;
  refresh();
}
