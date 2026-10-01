(function () {
  "use strict";
  const C = window.HKCore,
    $ = (id) => document.getElementById(id);
  let revision = 0;
  function message(s) {
    $("tbody").replaceChildren();
    const tr = document.createElement("tr"),
      td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty-cell";
    td.textContent = s;
    tr.append(td);
    $("tbody").append(tr);
  }
  async function load() {
    const rev = ++revision,
      period = $("period").value,
      mode = $("mode").value,
      era = mode === "allera" ? "ALL" : $("era").value,
      key = C.periodKey(period),
      edition = $("edition").value,
      answers = $("answerMode").value,
      group = (edition === "v3" ? "v3_" : "") + mode + "_" + era + (edition === "v3" ? "_" + answers : "");
    $("answerModeWrap").hidden = edition !== "v3";
    $("eraWrap").hidden = mode === "allera";
    $("key").textContent = " " + key;
    let best = 0;
    try {
      const storageKey = edition === "v3" ? "hk_best_v3_" + period + "_" + key + "_" + mode + "_" + era + "_sprint_" + answers : "hk_best_v2_" + period + "_" + key + "_" + mode + "_" + era;
      const record = JSON.parse(localStorage.getItem(storageKey) || "null");
      best = edition === "v3" ? (record?.correct === 10 ? Number(record.ms) || 0 : 0) : Number(record) || 0;
    } catch {}
    $("personal").textContent = best
      ? (best / 1000).toFixed(2) + "秒"
      : "この設定ではまだ挑戦していません。";
    message("記録を読み込み中…");
    $("rankStatus").textContent = "";
    $("reload").disabled = true;
    try {
      const conn = await Promise.race([
        window.HKCloud.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("timeout")), 12000),
        ),
      ]);
      const scores = await Promise.race([
        conn.db
          .collection(`fast_scores/${period}/${key}/${group}/entries`)
          .orderBy("ms", "asc")
          .limit(100)
          .get(),
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("timeout")), 12000),
        ),
      ]);
      if (rev !== revision) return;
      $("tbody").replaceChildren();
      let i = 0;
      scores.forEach((doc) => {
        const d = doc.data(),
          tr = document.createElement("tr"),
          time = d.ts?.toDate
            ? d.ts
                .toDate()
                .toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
            : "—";
        for (const value of [
          String(++i),
          String(d.name || "歴史探検家"),
          Number.isFinite(d.ms) ? (d.ms / 1000).toFixed(2) + "秒" : "—",
          time,
        ]) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        $("tbody").append(tr);
      });
      if (!i) message("まだ記録がないよ。最初の挑戦をしてみよう！");
      $("rankStatus").textContent = "日本時間の期間で表示しています。";
    } catch (e) {
      if (rev !== revision) return;
      message("みんなの記録を読み込めませんでした。");
      $("rankStatus").textContent =
        "接続を確認して「記録を更新」を押してください。早押しと自己ベストは通信がなくても使えます。";
      console.warn("Leaderboard unavailable", e);
    } finally {
      if (rev === revision) $("reload").disabled = false;
    }
  }
  $("reload").onclick = load;
  for (const id of ["period", "mode", "era", "edition", "answerMode"]) $(id).onchange = load;
  const params = new URLSearchParams(location.search);
  for (const id of ["period", "mode", "era", "edition", "answerMode"]) {
    const value = params.get(id);
    if ([...$(id).options].some((o) => o.value === value)) $(id).value = value;
  }
  load();
})();
