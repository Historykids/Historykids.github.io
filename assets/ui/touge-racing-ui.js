import { JUMP_KEYS, JUMP_COMMAND_TIME, jumpCommand, LOBBY_CHAT_COOLDOWN, LOBBY_CHAT_LIMIT, LOBBY_EMOJIS, LOBBY_PHRASES, lobbyChatText } from "./touge-racing-rules.mjs?v=28";

export function mountRaceUI(root, showRankings, difficulties, laps) {
  const lapRows = showRankings ? Array.from({ length: laps }, (_, index) =>
    `<div><dt>LAP ${index + 1}</dt><dd>—</dd></div>`).join("") : "";
  const difficultyOptions = difficulties ? Object.entries(difficulties).map(([value, level]) =>
    `<option value="${value}">${level.label}</option>`).join("") : "";
  root.innerHTML = `
    <section class="setup" id="setup" aria-labelledby="game-title">
        <div class="race-heading">
          <div>
            <p class="course"><span class="checker" aria-hidden="true"></span> 峠レーシング 3D</p>
            <h1 id="game-title"></h1>
          </div>
          <p class="keyboard">↑↓←→ / WASD　Shift ドリフト　Space アイテム　J・K・L・I 空中コマンド</p>
          <p class="touch-hint">操作　画面のボタン</p>
        </div>
        <section id="online-entry" class="online-entry" aria-labelledby="entry-title" hidden>
          <div class="room-header">
            <div><h2 id="entry-title">オンラインの部屋一覧</h2><p>参加できる部屋を選ぼう。</p></div>
            <button class="secondary" id="reload-rooms" type="button">更新</button>
          </div>
          <button class="secondary" id="join-invite" type="button" hidden>招待された部屋に入る</button>
          <p id="room-list-status" class="directory-status" role="status"></p>
          <ul id="room-list" class="room-list"></ul>
        </section>
        <p id="setup-message" class="setup-message" role="status"></p>
        <fieldset class="speed-picker" id="race-speed"><legend>走る速さ</legend></fieldset>
        <section aria-labelledby="courses-title">
          <div class="course-heading">
            <div><h2 id="courses-title">コースを選ぶ</h2><p id="selected-info"></p></div>
            <div class="course-actions">
              ${difficulties ? `<label class="cpu-setting" for="cpu-difficulty"><span>CPUの強さ</span><select id="cpu-difficulty">${difficultyOptions}</select></label>` : ""}
              ${showRankings ? '<a class="secondary" id="open-ranking" href="./touge-racing-ranking.html">ランキング</a>' : ""}
              <button class="primary" id="start" type="button" disabled>CPUと対戦する →</button>
            </div>
          </div>
          <p class="new-course-announcement">新コース3つが登場 <span>フィルン峠・メリディアン埠頭・プナ海岸</span></p>
          <div id="course-grid" class="course-grid" aria-label="全13コース"></div>
        </section>
        <div class="race-preferences">
          <p class="control-tip" id="race-tip">ドリフトを続けて離すと加速。新3コースは、ジャンプ中に表示された6つのキーを順に押すと着地で加速。草地はターボで横切ろう。</p>
          <label class="race-sound"><input id="race-sound" type="checkbox"> 効果音</label>
        </div>
      </section>

      ${showRankings ? `
      <section class="lobby" id="ghost-choice" aria-labelledby="ghost-title" hidden>
        <div class="lobby-main">
          <button class="secondary back-button" id="ghost-back" type="button">← コース選択に戻る</button>
          <h1 id="ghost-title" tabindex="-1">ゴーストを表示</h1>
          <p class="lobby-course" id="ghost-course"></p>
          <p class="lobby-guide">同じコース・速さのランキング1位の走りを、半透明の車で表示できます。</p>
          <button class="primary" id="start-with-ghost" type="button">ゴーストを表示して走る →</button>
          <button class="secondary" id="start-without-ghost" type="button">表示せずに走る →</button>
          <p class="lobby-message" id="ghost-loading" role="status"></p>
        </div>
      </section>` : ""}
      <section class="lobby" id="lobby" aria-labelledby="lobby-title" hidden>
        <div class="lobby-main">
          <button class="secondary back-button" id="leave-lobby" type="button">← 部屋一覧に戻る</button>
          <h1 id="lobby-title">オンライン対戦</h1>
          <p id="lobby-course" class="lobby-course"></p>
          <div class="invite-box">
            <div><span>参加者募集中</span><strong>招待リンク</strong></div>
            <button class="secondary" id="copy-link" type="button">招待リンクをコピー</button>
          </div>
          <input id="invite-link" type="url" readonly aria-label="招待リンク" hidden>
          <p class="lobby-message" id="lobby-message" role="status"></p>
          <h2 id="lobby-count">参加者 0人</h2>
          <ol class="seats" id="seats"></ol>
          <button class="primary" id="online-start" type="button" disabled>2人そろうと開始できます</button>
          <p class="lobby-guide" id="lobby-guide">2人以上でホストがレースを始められるよ。</p>
          <section class="lobby-chat" id="lobby-chat" aria-labelledby="chat-title" hidden>
            <h2 id="chat-title">部屋チャット</h2>
            <div class="lobby-chat-feed" id="chat-feed" tabindex="0" role="log" aria-label="部屋のメッセージ">
              <p id="chat-empty">定型文や絵文字を選ぶと、部屋のメンバーに届くよ。</p>
              <ol id="chat-lines"></ol>
            </div>
            <div id="chat-phrases" class="chat-buttons" role="group" aria-label="定型文"></div>
            <div id="chat-emojis" class="chat-buttons chat-emojis" role="group" aria-label="絵文字"></div>
          </section>
        </div>
      </section>

      <section class="game" id="game" data-state="countdown" aria-label="3Dレース" hidden>
        <canvas id="track" aria-label="3Dコース"></canvas>
        <div class="race-effects" id="race-effects" aria-hidden="true">
          <canvas></canvas>
          <div class="race-announce" id="race-announce" hidden><strong></strong><span></span></div>
        </div>
        <aside class="map-panel" aria-label="コースマップ">
          <canvas id="map" width="164" height="106"></canvas>
          <span id="map-title"></span>
          <span id="shortcut-hint" hidden></span>
        </aside>
        <div class="hud" id="hud">
          <div class="race-stats">
            <div class="stat"><span>周回</span><strong id="lap">1<small id="lap-total"> / 3</small></strong></div>
            <div class="stat"><span>${showRankings ? "合計タイム" : "タイム"}</span><strong id="time">0:00.00</strong></div>
          </div>
          ${showRankings ? `<dl class="lap-times" id="lap-hud" aria-label="ラップタイム">${lapRows}</dl>` : ""}
          <div class="rank-plate" id="place-stat" aria-label="現在の順位">
            <strong id="place">4<small>位</small></strong><span id="field-size"></span>
          </div>
          <div id="item-hud" class="item-hud" aria-label="アイテム">
            <span id="item-icon" aria-hidden="true">◇</span>
            <div><strong id="item-name">アイテム</strong><small id="item-hint">Spaceで使う</small></div>
          </div>
          <button class="pause" id="pause" type="button" aria-label="一時停止">Ⅱ</button>
          <div class="speedometer">
            ${showRankings ? '<small id="ghost-status" class="speed-class-tag" hidden></small>' : ""}
            <span id="speed-class-label" class="speed-class-tag"></span>
            <div><strong id="speed">0</strong> <span>km/h</span></div>
            <progress id="speed-bar" max="230" value="0" aria-label="スピード"></progress>
            <span id="boost" class="boost" hidden>ブースト</span>
            <span id="drift-label" class="drift-label" hidden>ドリフト <progress id="drift-meter" max="1.05" value="0" aria-label="ドリフト加速ゲージ"></progress></span>
          </div>
          <div class="countdown" id="countdown" role="status" hidden></div>
          <span class="impact" id="impact" hidden>接触！</span>
          <div class="jump-command" id="jump-command" hidden>
            <div class="jump-command-header"><strong>空中コマンド</strong><span id="jump-seconds"></span></div>
            <div class="jump-sequence" id="jump-sequence" aria-label="入力の順番">${jumpCommand(0).map(() => "<kbd></kbd>").join("")}</div>
            <progress id="jump-timer" max="${JUMP_COMMAND_TIME}" aria-label="残り時間"></progress>
            <div class="jump-keypad" id="jump-keypad" aria-label="コマンド入力">
              ${JUMP_KEYS.map((key, index) => `<button type="button" data-command-key="${index + 1}">${key}</button>`).join("")}
            </div>
          </div>
          <span class="jump-status" id="jump-status" role="status" hidden></span>
          <div class="race-message" id="race-message" role="status"></div>
          <div class="spectator-picker" id="spectator-picker" hidden>
            <label for="spectator-target">観戦するプレイヤー</label>
            <select id="spectator-target"><option value="">自分の車</option></select>
          </div>
          <div class="touch-controls" aria-label="タッチ操作">
            <div class="control-group">
              <button type="button" data-input="left" aria-label="左に曲がる">‹</button>
              <button type="button" data-input="right" aria-label="右に曲がる">›</button>
            </div>
            <div class="control-group control-pedals">
              <button type="button" data-input="item" aria-label="アイテムを使う">アイテム</button>
              <button type="button" data-input="drift">ドリフト</button>
              <button type="button" data-input="brake">ブレーキ</button>
              <button type="button" data-input="gas">アクセル</button>
            </div>
          </div>
        </div>
        <section class="overlay" id="paused" aria-labelledby="pause-title" hidden>
          <div class="dialog">
            <h2 id="pause-title">一時停止</h2>
            <button class="primary" id="resume" type="button">レースに戻る</button>
            <button class="secondary" id="restart" type="button">最初からやり直す</button>
            <button class="secondary" id="exit-race" type="button">コース選択に戻る</button>
          </div>
        </section>
        <section class="overlay" id="result" aria-labelledby="result-title" hidden>
          <div class="dialog">
            <h2 id="result-title">レース終了</h2>
            <p id="result-speed-class" class="result-speed-class"></p>
          <p class="result-place" id="result-place-line"><strong id="result-place"></strong> 位 / <span id="result-field"></span>台</p>
            <dl class="result-stats" id="result-stats">
              <div><dt>${showRankings ? "3周の合計タイム" : "タイム"}</dt><dd id="result-time"></dd></div>
              <div><dt>コース自己ベスト</dt><dd id="best-time"></dd></div>
            </dl>
            ${showRankings ? `<dl class="lap-times" id="result-laps" aria-label="ラップタイム" hidden>${lapRows}</dl>` : ""}
            <p class="record" id="record" role="status" hidden>自己ベスト更新！</p>
            <ol id="race-order" class="race-order" hidden></ol>
            <p id="result-note" class="result-note" role="status"></p>
            <form id="trial-submit" class="trial-submit" hidden>
              <p id="trial-profile"></p>
              <button class="primary" id="submit-time" type="submit">ランキングに登録</button>
              <p id="trial-status" role="status"></p>
            </form>
            ${showRankings ? '<a class="secondary" id="result-ranking" href="./touge-racing-ranking.html" hidden>このコースのランキング</a>' : ""}
            <button class="primary" id="retry" type="button">もう一度走る</button>
            <button class="secondary" id="back-to-courses" type="button">コース選択に戻る</button>
          </div>
        </section>
      </section>
  `;
}

export function mountLobbyChat(room, send) {
  const panel = room.querySelector("#lobby-chat"), list = room.querySelector("#chat-lines");
  const feed = room.querySelector("#chat-feed"), empty = room.querySelector("#chat-empty");
  let enabled = false, last = 0, cooldown;
  const groups = [
    [room.querySelector("#chat-phrases"), LOBBY_PHRASES],
    [room.querySelector("#chat-emojis"), LOBBY_EMOJIS]
  ];
  for (const [group, texts] of groups) {
    for (const [preset, text] of Object.entries(texts)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = text;
      button.addEventListener("click", () => {
        if (!enabled || cooldown || !send(preset)) return;
        cooldown = setTimeout(() => { cooldown = null; updateButtons(); }, LOBBY_CHAT_COOLDOWN);
        updateButtons();
      });
      group.append(button);
    }
  }
  const buttons = panel.querySelectorAll("button");
  function updateButtons() {
    for (const button of buttons) button.setAttribute("aria-disabled", String(!enabled || !!cooldown));
  }
  function add(entry, playerId) {
    const text = lobbyChatText(entry?.preset);
    if (!text || !Number.isSafeInteger(entry.id) || entry.id <= last || typeof entry.name !== "string") return;
    const atBottom = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 32;
    last = entry.id;
    const row = document.createElement("li");
    const name = document.createElement("strong"), body = document.createElement("span");
    row.classList.toggle("own", entry.playerId === playerId);
    name.textContent = entry.playerId === playerId ? entry.name + "（自分）" : entry.name;
    body.textContent = text;
    row.append(name, body);
    list.append(row);
    if (list.childElementCount > LOBBY_CHAT_LIMIT) list.firstElementChild.remove();
    if (atBottom || entry.playerId === playerId) feed.scrollTop = feed.scrollHeight;
    empty.hidden = true;
  }
  return {
    add,
    snapshot(entries, playerId) {
      panel.hidden = !Array.isArray(entries);
      enabled = !panel.hidden;
      updateButtons();
      if (enabled) for (const entry of entries) add(entry, playerId);
    },
    disconnect() { enabled = false; updateButtons(); },
    reset() {
      clearTimeout(cooldown);
      cooldown = null;
      last = 0;
      list.replaceChildren();
      empty.hidden = false;
      enabled = false;
      panel.hidden = true;
      updateButtons();
    }
  };
}
