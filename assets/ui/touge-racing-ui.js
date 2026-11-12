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
          <p class="keyboard">↑↓←→ / WASD　Shiftでドリフト　Spaceでアイテム</p>
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
        <section aria-labelledby="courses-title">
          <div class="course-heading">
            <div><h2 id="courses-title">コースを選ぶ</h2><p id="selected-info"></p></div>
            <div class="course-actions">
              ${difficulties ? `<label class="cpu-setting" for="cpu-difficulty"><span>CPUの強さ</span><select id="cpu-difficulty">${difficultyOptions}</select></label>` : ""}
              ${showRankings ? '<a class="secondary" id="open-ranking" href="./touge-racing-ranking.html">ランキング</a>' : ""}
              <button class="primary" id="start" type="button" disabled>CPUと対戦する →</button>
            </div>
          </div>
          <div id="course-grid" class="course-grid" aria-label="全10コース"></div>
        </section>
        <div class="race-preferences">
          <p class="control-tip" id="race-tip">カーブでドリフトを続けて、離すと加速。紫の箱でアイテムをゲット。取られた箱は1秒で復活するよ。</p>
          <label class="race-sound"><input id="race-sound" type="checkbox"> 効果音</label>
        </div>
      </section>

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
            <div><strong id="speed">0</strong> <span>km/h</span></div>
            <progress id="speed-bar" max="230" value="0" aria-label="スピード"></progress>
            <span id="boost" class="boost" hidden>ブースト</span>
            <span id="drift-label" class="drift-label" hidden>ドリフト <progress id="drift-meter" max="1.05" value="0" aria-label="ドリフト加速ゲージ"></progress></span>
          </div>
          <div class="countdown" id="countdown" role="status" hidden></div>
          <span class="impact" id="impact" hidden>接触！</span>
          <div class="race-message" id="race-message" role="status"></div>
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
            <p class="result-place" id="result-place-line"><strong id="result-place"></strong> 位 / 4台</p>
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
