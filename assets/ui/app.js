(function () {
  "use strict";
  const C = window.HKCore, W = window.HKWallet,
    $ = (id) => document.getElementById(id),
    E = C.esc,
    ds = window.dataSets;
  const legacyEraMeta = {
    kamakura: { en: "KAMAKURA", years: "1185–1333" },
    muromachi: { en: "MUROMACHI", years: "1336–1573" },
    sengoku: { en: "SENGOKU", years: "1467–1600" },
    edo: { en: "EDO", years: "1603–1868" },
  };
  const eraMeta = Object.fromEntries(C.eraOrder.filter((era) => ds[era]).map((era) => [era, ds[era].meta || legacyEraMeta[era]]));
  const answerKanji = {
    こめ: "米",
    えど: "江戸",
    おおさか: "大坂",
    さんきん: "参勤",
    ばら: "原",
    くさ: "草",
    ぽるとがる: "ポルトガル",
    でじま: "出島",
    めいれき: "明暦",
    しんよしわら: "新吉原",
    げんろく: "元禄",
    きょうほう: "享保",
    ようしょ: "洋書",
    まちびけし: "町火消",
    もの: "物",
    たぬま: "田沼",
    てんめい: "天明",
    かんせい: "寛政",
    いこくせん: "異国船",
    おおしおへいはちろう: "大塩平八郎",
    てんぽう: "天保",
    くろふね: "黒船",
    わしん: "和親",
    あんせい: "安政",
    さくらだもんがい: "桜田門外",
    たいせい: "大政",
    めいじ: "明治",
    むろまち: "室町",
    なんぼくちょう: "南北朝",
    きんかく: "金閣",
    きたやま: "北山",
    かんごう: "勘合",
    えいきょう: "永享",
    かきつ: "嘉吉",
    おうにん: "応仁",
    やましろ: "山城",
    ぎんかく: "銀閣",
    めいおう: "明応",
    てっぽう: "鉄砲",
    きりすと: "キリスト",
    いつくしま: "厳島",
    げんぺい: "源平",
    だんのうら: "壇ノ浦",
    しゅご: "守護",
    じとう: "地頭",
    かまくら: "鎌倉",
    よりとも: "頼朝",
    しっけん: "執権",
    わだ: "和田",
    じょうきゅう: "承久",
    ごせいばいしきもく: "御成敗式目",
    ほうじ: "宝治",
    だいぶつ: "大仏",
    ぶんえい: "文永",
    こうあん: "弘安",
    とくせいれい: "徳政令",
    しもつき: "霜月",
    げんこう: "元弘",
    じょうど: "浄土",
    りんざい: "臨済",
    じしゅう: "時宗",
    そうとう: "曹洞",
    にちれん: "日蓮",
    おけはざま: "桶狭間",
    かわなかじま: "川中島",
    ぎふ: "岐阜",
    のぶなが: "信長",
    あねがわ: "姉川",
    ひえいざん: "比叡山",
    ながしの: "長篠",
    あづち: "安土",
    ほんのうじ: "本能寺",
    やまざき: "山崎",
    しずがたけ: "賤ヶ岳",
    こまき: "小牧",
    ながくて: "長久手",
    かんぱく: "関白",
    きゅうしゅう: "九州",
    かたながりれい: "刀狩",
    おだわら: "小田原",
    みぶんとうせいれい: "身分統制令",
    ぶんろく: "文禄",
    けいちょう: "慶長",
    ひでよし: "秀吉",
    せきがはら: "関ヶ原",
    らくいち: "楽市",
    らくざ: "楽座",
    たいこう: "太閤",
  };
  const records = [];
  for (const [era, set] of Object.entries(ds))
    for (const [chapter, questions] of Object.entries(set.chapters))
      for (const [name, entry] of Object.entries(questions)) {
        const answers = set.blanks[name] || [];
        let i = 0;
        const question = C.questionText(name);
        const title = question.replace(/〇+/g, () => {
          const a = answers[i], label = entry.answerLabels?.[i];
          i++;
          return label || answerKanji[a] || a || "〇";
        });
        records.push({
          ...entry,
          era,
          chapter,
          name,
          question,
          title,
          answers,
          id: era + "|" + name,
        });
      }
  for (const r of records) {
    let index = 0;
    r.titleHTML = (ds[r.era].ruby[r.name] || E(r.question)).replace(/〇+/g, () => {
      const reading = r.answers[index], label = r.answerLabels?.[index] || answerKanji[reading];
      index++;
      return label
        ? `<ruby>${E(label)}<rt>${E(reading)}</rt></ruby>`
        : E(reading || "〇");
    });
  }
  function safeGet(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  const state = {
    got: {},
    wrong: safeGet("hk_wrong_v2", {}),
    money: W.snapshot().balance,
    city: safeGet("city_v1", []),
    residents: safeGet("hk_residents_v1", []),
    ruby: safeGet("hk_ruby_v2", true),
    era: safeGet("hk_era_v2", "edo"),
  };
  if (!ds[state.era]) state.era = "edo";
  if (!Number.isFinite(state.money) || state.money < 0) state.money = 0;
  if (!Array.isArray(state.city)) state.city = [];
  const storedLayout = safeGet("hk_town_layout_v2", null);
  const legacyTown = !C.validTownLayout(storedLayout);
  const sourceLayout = legacyTown ? { width: 30, height: 18 } : storedLayout;
  const migratedCity = [], sourceCells = new Set();
  for (const [i, b] of state.city.entries()) {
    if (
      !b ||
      !C.items.some((item) => item.id === b.type && item.cat !== "resident") ||
      !Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.x >= sourceLayout.width || b.y < 0 || b.y >= sourceLayout.height ||
      (legacyTown && sourceCells.has(b.x + "," + b.y))
    )
      continue;
    let id = String(b.id || "legacy-" + i);
    if (migratedCity.some((item) => item.id === id)) id += "-legacy-" + i;
    sourceCells.add(b.x + "," + b.y);
    migratedCity.push({
      id,
      type: b.type,
      x: b.x,
      y: b.y,
      rot: Number.isFinite(Number(b.rot)) ? ((Math.round(Number(b.rot) / 90) * 90) % 360 + 360) % 360 : 0,
    });
  }
  const arrangedTown = C.arrangeCity(migratedCity, { legacy: legacyTown, layout: legacyTown ? { ...C.town, height: C.town.minHeight } : { ...C.town, ...storedLayout } });
  state.city = arrangedTown.city;
  Object.assign(C.town, arrangedTown.layout);
  const residentIds = new Set();
  state.residents = (Array.isArray(state.residents) ? state.residents : []).filter((r) => {
    if (!r || typeof r.id !== "string" || residentIds.has(r.id) || !Number.isInteger(r.x) || !Number.isInteger(r.y) || r.x < 0 || r.x >= sourceLayout.width || r.y < 0 || r.y >= sourceLayout.height) return false;
    residentIds.add(r.id); return true;
  }).slice(0, 100).map((r) => ({ id: r.id, x: r.x + (legacyTown ? 15 : 0), y: r.y + (legacyTown ? 11 : 0) }));
  const residentEngine = window.HKResidents?.createEngine();
  let residentPaused = false, residentFrame = null, residentLastTime = null, residentLastUI = 0;

  if (
    !state.wrong ||
    typeof state.wrong !== "object" ||
    Array.isArray(state.wrong)
  )
    state.wrong = {};
  for (const [era, set] of Object.entries(ds)) {
    state.got[era] = safeGet(set.LS_KEY, {});
    if (
      !state.got[era] ||
      typeof state.got[era] !== "object" ||
      Array.isArray(state.got[era])
    )
      state.got[era] = {};
  }
  for (const r of records) {
    if (r.legacyName && state.got[r.era][r.legacyName])
      state.got[r.era][r.name] = true;
    if (r.legacyName && state.wrong[r.era + "|" + r.legacyName])
      state.wrong[r.id] = true;
  }
  let view = "learn",
    mode = "choice",
    queue = [],
    qi = 0,
    cardPractice = null,
    answered = false,
    pending = null,
    toastTimer,
    lastUndo = null;
  function save() {
    try {
      for (const [era, set] of Object.entries(ds))
        localStorage.setItem(set.LS_KEY, JSON.stringify(state.got[era]));
      state.money = W.snapshot().balance;
      localStorage.setItem("city_v1", JSON.stringify(state.city));
      localStorage.setItem("hk_town_layout_v2", JSON.stringify({ version: C.town.version, width: C.town.width, height: C.town.height }));
      localStorage.setItem("hk_residents_v1", JSON.stringify(state.residents));
      localStorage.setItem("hk_wrong_v2", JSON.stringify(state.wrong));
      localStorage.setItem("hk_ruby_v2", JSON.stringify(state.ruby));
      localStorage.setItem("hk_era_v2", JSON.stringify(state.era));
      $("saveWarning").hidden = true;
    } catch {
      $("saveWarning").hidden = false;
    }
  }
  function got(r) {
    return !!state.got[r.era][r.name];
  }
  function eraRecords() {
    return records
      .filter((r) => r.era === state.era)
      .sort((a, b) => a.year - b.year);
  }
  function notify(text, undo = null) {
    clearTimeout(toastTimer);
    $("toastText").textContent = text;
    $("toast").hidden = false;
    lastUndo = undo;
    $("undoBtn").hidden = !undo;
    toastTimer = setTimeout(
      () => {
        $("toast").hidden = true;
        lastUndo = null;
      },
      undo ? 12000 : 4500,
    );
  }
  function renderStats() {
    const a = eraRecords(),
      n = a.filter(got).length;
    state.money = W.snapshot().balance;
    $("moneyValue").textContent = state.money;
    $("eraGot").textContent = n;
    $("eraTotal").textContent = a.length;
    $("eraPercent").textContent = Math.round((n / a.length) * 100) + "%";
    $("eraProgress").max = a.length;
    $("eraProgress").value = n;
    $("allGot").textContent = records.filter(got).length;
    $("wrongCount").textContent = records.filter(
      (r) => state.wrong[r.id] && !got(r),
    ).length;
    $("eraTabs").innerHTML = Object.entries(eraMeta)
      .map(([era, m]) => {
        const arr = records.filter((r) => r.era === era),
          g = arr.filter(got).length;
        const label = `${ds[era].title} · ${m.years} · ${g}/${arr.length}枚収集`;
        return `<button class="era-tab ${era === state.era ? "active" : ""}" data-era="${era}" aria-pressed="${era === state.era}" aria-label="${E(label)}" title="${E(label)}"><strong>${E(ds[era].title.replace(/時代$/, ""))}</strong><span class="mini-progress" aria-hidden="true"><i style="width:${(g / arr.length) * 100}%"></i></span></button>`;
      })
      .join("");
    $("eraSelectionHint").textContent = `${ds[state.era].title} · ${eraMeta[state.era].years}`;
    $("lessonName").textContent = ds[state.era].title + "を探検";
    $("rubyBtn").innerHTML =
      "ふりがな <b>" + (state.ruby ? "ON" : "OFF") + "</b>";
    $("rubyBtn").setAttribute("aria-pressed", state.ruby);
    document.body.classList.toggle("no-ruby", !state.ruby);
  }
  function pendingQuestions() {
    return eraRecords().filter(
      (r) => !got(r) && ($("practiceFilter").value !== "wrong" || state.wrong[r.id]),
    );
  }
  function currentQuestion() {
    return cardPractice || queue[qi];
  }
  function previousQuestion() {
    if (cardPractice) return;
    const ordered = eraRecords(), position = ordered.indexOf(currentQuestion());
    return pendingQuestions().filter((r) => ordered.indexOf(r) < position).pop();
  }
  function updateQuizNavigation() {
    $("prevBtn").disabled = !previousQuestion();
    $("nextBtn").disabled = !currentQuestion();
    $("nextBtn").textContent = cardPractice
      ? (pendingQuestions().length ? "未正解の問題へ" : "時代カードに戻る")
      : "次の問題";
  }
  function rebuildQueue(target) {
    cardPractice = null;
    queue = pendingQuestions();
    qi = Math.max(
      0,
      queue.findIndex((r) => r.id === target),
    );
    renderQuestion();
  }
  function moveQuestion(direction) {
    if (cardPractice) { rebuildQueue(); return; }
    const ordered = eraRecords(), position = ordered.indexOf(currentQuestion());
    const next = direction < 0
      ? previousQuestion()
      : pendingQuestions().find((r) => ordered.indexOf(r) > position) || pendingQuestions()[0];
    if (direction < 0 && !next) return;
    rebuildQueue(next?.id);
  }
  function renderQuestion() {
    const r = currentQuestion();
    // Only an explicit card selection can reopen a question already solved.
    if (!cardPractice && r && got(r)) { moveQuestion(1); return; }
    answered = false;
    $("quizFeedback").hidden = true;
    $("hintText").hidden = true;
    $("answerInput").value = "";
    $("answerInput").disabled = false;
    $("answerForm").querySelector("button").disabled = false;
    $("hintBtn").disabled = false;
    const complete = !r && eraRecords().every(got);
    $("quizPanel").classList.toggle("quiz-complete", complete);
    for (const selector of [".answer-mode", ".reward-help", ".quiz-bottom"])
      $("quizPanel").querySelector(selector).hidden = !r;
    updateQuizNavigation();
    if (!r) {
      $("qChapter").textContent = complete ? ds[state.era].title + " · コンプリート！" : "復習完了";
      $("qCount").textContent = "";
      $("qYear").textContent = "✓";
      $("qYearSuffix").textContent = "";
      $("qYear").parentElement.classList.remove("period-date");
      $("qTitle").textContent = complete ? "すべての問題を正解しました！" : "復習する問題はありません。";
      $("qInstruction").textContent = complete
        ? "もう一度解きたいときは、下の時代カードをタップしてね。"
        : "出題範囲を「未正解の問題」にすると、続きを解けるよ。";
      $("choices").innerHTML = "";
      $("choices").hidden = true;
      $("answerForm").hidden = true;
      $("hintBtn").disabled = true;
      $("nextBtn").disabled = true;
      return;
    }
    $("nextBtn").disabled = false;
    $("qChapter").textContent = r.chapter;
    $("qCount").textContent = cardPractice ? "カードから解き直し" : qi + 1 + " / " + queue.length;
    $("qYear").textContent = C.dateValue(r);
    $("qYearSuffix").textContent = C.dateSuffix(r);
    $("qYear").parentElement.classList.toggle("period-date", !!r.dateLabel);
    $("qTitle").innerHTML = ds[r.era].ruby[r.name] || E(r.question);
    $("qInstruction").textContent =
      mode === "choice"
        ? "〇に入ることばを選んでね。"
        : "〇の部分を、ひらがなで答えてね。";
    const choices = C.choiceAnswers(r, records);
    $("choices").innerHTML = choices
      .map(
        (a, i) =>
          `<button data-answer="${E(a)}"><span>${["A", "B", "C", "D"][i]}</span><span>${E(a)}</span></button>`,
      )
      .join("");
    $("choices").hidden = mode !== "choice";
    $("answerForm").hidden = mode !== "type";
  }
  function check(raw, btn) {
    if (answered) return;
    const r = currentQuestion();
    if (!r) return;
    if (!C.tokens(raw).length) {
      notify("答えを入力してね。");
      $("answerInput").focus();
      return;
    }
    const ok = C.answerOK(raw, r.answers);
    let rewardFailed = false;
    if (ok) {
      answered = true;
      const fresh = !got(r);
      state.got[r.era][r.name] = true;
      delete state.wrong[r.id];
      const reward = mode === "type" ? 20 : 10;

      $("quizFeedback").className = "feedback";
      $("quizFeedback").innerHTML =
        `<strong>正解！ ${fresh ? "カードをゲット · ＋" + reward + "両" + (mode === "type" ? "（入力ボーナス2倍！）" : "") : "よく覚えていたね！"}</strong><span>${r.titleHTML}</span><p>${E(r.text)}</p>`;
      $("choices")
        .querySelectorAll("button")
        .forEach((b) => {
          b.disabled = true;
          if (C.answerOK(b.dataset.answer, r.answers))
            b.classList.add("correct");
        });
      $("answerInput").disabled = true;
      $("answerForm").querySelector("button").disabled = true;
      $("hintBtn").disabled = true;
      if (fresh) W.adjust(reward, () => { save(); renderStats(); }, () => {
        rewardFailed = true;
        delete state.got[r.era][r.name];
        save(); renderStats(); renderCards();
        if (state.era === r.era && (currentQuestion() === r || !currentQuestion())) {
          rebuildQueue(r.id);
          $("quizFeedback").className = "feedback wrong";
          $("quizFeedback").textContent = "両を保存できませんでした。この問題にもう一度答えると受け取れます。";
          $("quizFeedback").hidden = false;
        }
        $("saveWarning").hidden = false;
      });
    } else {
      if (!got(r)) state.wrong[r.id] = true;
      if (btn) {
        btn.classList.add("incorrect");
        btn.disabled = true;
      }
      $("quizFeedback").className = "feedback wrong";
      $("quizFeedback").innerHTML =
        "<strong>もう一度考えてみよう。</strong>ヒント：" + E(r.text);
    }
    $("quizFeedback").hidden = false;
    save();
    if (rewardFailed) $("saveWarning").hidden = false;
    renderStats();
    renderCards();
    if (ok && got(r) && !cardPractice && eraRecords().every(got)) {
      const feedback = $("quizFeedback").innerHTML;
      rebuildQueue();
      $("quizFeedback").innerHTML = feedback;
      $("quizFeedback").hidden = false;
    } else updateQuizNavigation();
  }
  function cardHTML(r) {
    const done = got(r);
    return `<button class="history-card ${done ? "done" : ""}" data-card="${E(r.id)}"><span class="card-top"><span class="card-year ${r.dateLabel ? "period-date" : ""}">${E(C.dateValue(r))}<small>${C.dateSuffix(r)}</small></span><span>${done ? "✓" : "？"}</span></span><div class="card-title"><span class="card-icon" aria-hidden="true">${r.icon}</span>${done ? r.titleHTML : ds[r.era].ruby[r.name] || E(r.question)}</div><span class="card-foot ${done ? "card-done" : ""}">${done ? "収集済み · 解説・解き直し" : E(r.chapter) + " · クイズに挑戦"}</span></button>`;
  }
  function renderCards() {
    $("collection").innerHTML = eraRecords().map(cardHTML).join("");
    if (view === "book") renderBook();
  }
  function renderBook() {
    const q = C.normalize($("bookSearch").value),
      chapter = $("chapterFilter").value,
      f = $("cardFilter").value;
    const arr = eraRecords().filter(
      (r) =>
        (chapter === "all" || r.chapter === chapter) &&
        (f === "all" || (f === "got" ? got(r) : !got(r))) &&
        C.normalize([r.name, r.title, r.text, ...r.answers].join(" ")).includes(
          q,
        ),
    );
    $("bookCount").textContent = arr.length + "枚";
    $("bookGrid").innerHTML = arr.length
      ? arr.map(cardHTML).join("")
      : '<div class="empty">見つからなかったよ。ことばや条件を変えてみてね。</div>';
  }
  function renderTimeline() {
    $("timeline").innerHTML = eraRecords()
      .sort((a, b) => a.year - b.year)
      .map(
        (r) =>
          `<div class="timeline-row"><span class="timeline-year ${r.dateLabel ? "period-date" : ""}">${E(C.dateText(r))}</span><button data-detail="${E(r.id)}"><strong>${r.titleHTML}</strong><p>${E(r.text)}</p></button></div>`,
      )
      .join("");
  }
  const labels = {
    learn: ["LET’S EXPLORE HISTORY", "歴史の冒険をはじめよう。"],
    book: ["THE HISTORY COLLECTION", "知ったことが、宝ものになる。"],
    timeline: ["A JOURNEY THROUGH TIME", "歴史を、ひとつながりに。"],
    town: ["LEARN & BUILD", "わたしだけの町をつくろう。"],
    games: ["TIME TO PLAY", "遊びながら、もっと夢中に。"],
    howto: ["HOW TO PLAY", "両をゲットして、自分の町を作ろう。"],
  };
  function setView(v, updateHash = true) {
    if (!labels[v]) v = "learn";
    const previousView = view;
    view = v;
    document
      .querySelectorAll(".view")
      .forEach((el) => (el.hidden = el.id !== "view-" + v));
    const navView = v === "book" ? "games" : v;
    document.querySelectorAll(".nav [data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === navView);
      if (b.dataset.view === navView) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("pageEyebrow").textContent = labels[v][0];
    $("pageTitle").textContent = labels[v][1];
    $("eraSection").hidden = ["town", "games", "howto"].includes(v);
    if (v === "book") renderBook();
    if (v === "timeline") renderTimeline();
    if (v === "town") {
      renderTown();
      window.dispatchEvent(new CustomEvent("hk-town-open"));
      // Keep the town usable if module/CDN/WebGL support is unavailable.
      setTimeout(() => {
        if (view !== "town" || window.HKTownReady) return;
        $("town2d").click();
        $("townCanvas").innerHTML = '<div class="town-loading">マス目で町を表示しています。<br>建物を選んで配置・移動できます。</div>';
      }, 1500);
    }
    if (updateHash) history.replaceState(null, "", "#" + v);
    if (previousView !== v && (previousView === "howto" || v === "howto")) window.scrollTo(0, 0);
  }
  function setEra(era) {
    if (!ds[era]) return;
    state.era = era;
    $("practiceFilter").value = "new";
    save();
    $("chapterFilter").innerHTML =
      '<option value="all">すべての章</option>' +
      Object.keys(ds[era].chapters)
        .map((ch) => `<option>${E(ch)}</option>`)
        .join("");
    renderStats();
    rebuildQueue();
    renderCards();
    if (view === "timeline") renderTimeline();
  }
  function openDialog(title, html) {
    $("dialogTitle").textContent = title;
    $("dialogBody").innerHTML = html;
    if (!$("dialog").open) $("dialog").showModal();
  }
  function detail(r, fromCard = true) {
    if (!r) return;
    openDialog(
      "歴史カード",
      `<div class="detail-year ${r.dateLabel ? "period-date" : ""}">${E(C.dateValue(r))}<small>${C.dateSuffix(r)}</small></div><span class="chip">${E(ds[r.era].title)} · ${E(r.chapter)}</span><h3 class="detail-title">${r.titleHTML}</h3><p class="detail-reading">こたえ：${E(r.answers.join("・"))}</p><p class="detail-text">${E(r.text)}</p>${r.source ? `<a href="${E(r.source)}" target="_blank" rel="noopener">資料で詳しく読む</a>` : ""}${fromCard || !got(r) ? `<div class="dialog-actions"><button class="primary" data-practice="${E(r.id)}">${got(r) ? "この問題を解き直す" : "この問題に挑戦"}</button></div>` : '<p class="muted">解き直すときは、時代カードをタップしてね。</p>'}`,
    );
  }
  function shop(cat = "all") {
    openDialog(
      "町づくりショップ",
      `<p>所持金 <b>${state.money}両</b> · はじめての正解は、選択で10両・入力で2倍の20両！</p><div class="town-tools"><button data-shopcat="all" class="${cat === "all" ? "active" : ""}">すべて</button><button data-shopcat="building" class="${cat === "building" ? "active" : ""}">建物</button><button data-shopcat="nature" class="${cat === "nature" ? "active" : ""}">自然</button><button data-shopcat="infrastructure" class="${cat === "infrastructure" ? "active" : ""}">道・橋</button><button data-shopcat="resident" class="${cat === "resident" ? "active" : ""}">住民</button></div><div class="shop-grid">${C.items
        .filter((i) => cat === "all" || cat === i.cat)
        .map(
          (i) =>
            `<article class="shop-item"><span aria-hidden="true">${i.icon}</span><h3>${i.name}</h3><small>${i.price}両${i.cat !== "resident" ? " · " + i.width + "×" + i.depth + "マス" : ""}</small><button data-buy="${i.id}" ${state.money < i.price ? "disabled" : ""}>${state.money < i.price ? "両が足りない" : i.cat === "resident" ? "町に迎える" : "選んで配置"}</button></article>`,
        )
        .join("")}</div>`,
    );
  }
  function renderTown() {
    $("townExtent").textContent = C.town.width + "×" + C.town.height + "マス · " + (C.town.width * C.town.height).toLocaleString("ja-JP") + "マスの町";
    $("placeX").max = C.town.width; $("placeY").max = C.town.height;
    $("buildingCount").textContent = "建物 " + state.city.length + " 個 · 農民 " + state.residents.length + " 人";
    renderResidents();
    $("townBuildings").innerHTML = state.city.length
      ? state.city
          .map((b) => {
            const item = C.items.find((i) => i.id === b.type);
            const f = C.footprint(b);
            return `<div class="building-item"><span>${item.icon} ${item.name}<small>${f.width}×${f.depth}マス · 横 ${b.x + 1} · 縦 ${b.y + 1}</small></span><button data-move="${E(b.id)}">移動</button><button data-rotate="${E(b.id)}">回転</button><button data-delete="${E(b.id)}">削除</button></div>`;
          })
          .join("")
      : '<div class="empty">まだ建物がないよ。クイズに正解して、ショップで選んでみよう！</div>';
    if (!$("townGrid").hidden) renderGrid();
    window.dispatchEvent(new CustomEvent("hk-town-change"));
  }
  function renderGrid() {
    const occupied = new Map(), highlighted = new Set(), g = C.gridStyle;
    for (const b of state.city) for (const c of C.occupiedCells(b)) occupied.set(c.x + "," + c.y, b);
    const valid = pending && C.canPlace(state.city, pending.x, pending.y, pending.id, pending.type, pending.rot);
    if (pending) for (const c of C.occupiedCells(pending)) highlighted.add(c.x + "," + c.y);
    let html = `<div class="grid-map ${pending ? "placing" : ""}" role="group" aria-label="町の配置マス" style="--town-columns:${C.town.width};--town-cell:${g.cell}px;--town-gap:${g.gap}px">`;
    for (let y = 0; y < C.town.height; y++)
      for (let x = 0; x < C.town.width; x++) {
        const k = x + "," + y, b = occupied.get(k), item = b && C.items.find((i) => i.id === b.type);
        html += `<button class="grid-cell ${b ? "occupied" : ""} ${highlighted.has(k) ? valid ? "pending" : "pending blocked" : ""}" data-cell="${k}" aria-label="横${x + 1} 縦${y + 1}${item ? " " + item.name + "の敷地" : " 空き地"}"></button>`;
      }
    for (const b of state.city) {
      const f = C.footprint(b), item = C.items.find((i) => i.id === b.type);
      html += `<button class="map-building ${f.width * f.depth === 1 ? "compact" : ""} type-${b.type}" data-building="${E(b.id)}" style="left:${b.x * g.pitch}px;top:${b.y * g.pitch}px;width:${f.width * g.pitch - g.gap}px;height:${f.depth * g.pitch - g.gap}px" aria-label="${item.name} ${f.width}×${f.depth}マス 横${b.x + 1} 縦${b.y + 1}"><span aria-hidden="true">${item.icon}</span><small>${item.name}<br>${f.width}×${f.depth}</small></button>`;
    }
    html += '<div id="residentMapLayer" aria-hidden="true"></div></div>';
    $("townGrid").innerHTML = html;
    updateResidentMap(residentEngine?.snapshot() || []);
  }
  let walletPurchase = false;
  function walletError(error) {
    if (error?.message === "purchase-cancelled") return;
    if (error?.message === "insufficient") { renderStats(); notify("両が足りないよ。残高を確認してね。"); return; }
    $("saveWarning").hidden = false; notify("両の更新ができませんでした。ブラウザの保存設定を確認してね。");
  }
  function addResident() {
    if (walletPurchase) return;
    state.money = W.snapshot().balance;
    if (!residentEngine || state.money < 10) { notify("農民を迎えるには10両が必要だよ。"); return; }
    if (state.residents.length >= 100) { notify("この町の農民は100人までです。"); return; }
    residentEngine.sync(state.residents, state.city);
    const spawn = residentEngine.nearest(Math.floor(C.town.width / 2), Math.floor(C.town.height / 2));
    if (!spawn) { notify("農民が歩ける空きマスをつくってね。"); return; }
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random();
    walletPurchase = true;
    W.buy(10, () => state.residents.length < 100, () => {
      walletPurchase = false;
      state.residents.push({ id, x: spawn.x, y: spawn.y });
      save(); renderStats(); $("dialog").close(); setView("town");
      notify("農民を迎えたよ！10両 · 「農民を見る」で暮らしを眺めよう。"); watchResident(id);
    }, error => { walletPurchase = false; walletError(error); });
  }
  function dismissResident(id) {
    const resident = state.residents.find((r) => r.id === id);
    if (!resident) return;
    state.residents = state.residents.filter((r) => r.id !== id); save(); renderTown();
    notify("農民が町を出ました。", () => {
      if (!state.residents.some((r) => r.id === id) && state.residents.length < 100) { state.residents.push(resident); save(); renderTown(); }
    });
  }
  function watchResident(id) {
    if (!state.residents.some((r) => r.id === id)) return;
    if (window.HKTownReady) $("town3d").click();
    window.dispatchEvent(new CustomEvent("hk-resident-watch", { detail: id }));
    const actor = residentEngine?.snapshot().find((r) => r.id === id);
    if (!window.HKTownReady && actor) $("townGrid").querySelector(`[data-cell="${Math.round(actor.x)},${Math.round(actor.y)}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
  function renderResidents() {
    if (!residentEngine) return;
    residentEngine.sync(state.residents, state.city);
    $("residentCount").textContent = state.residents.length + "人";
    $("residentPause").disabled = !state.residents.length;
    $("residentList").innerHTML = state.residents.length ? state.residents.map((r, i) =>
      `<div class="resident-item"><span class="resident-avatar" aria-hidden="true">👨‍🌾</span><div><b>農民 ${i + 1}</b><small data-resident-status="${E(r.id)}"></small></div><button data-watch-resident="${E(r.id)}">農民を見る</button><button data-dismiss-resident="${E(r.id)}" class="text-button">帰す</button></div>`
    ).join("") : '<p class="muted small">ショップの「住民」から、農民を迎えられるよ。</p>';
    updateResidentUI(residentEngine.snapshot()); startResidentLoop();
  }
  function updateResidentUI(actors) {
    $("residentList").querySelectorAll("[data-resident-status]").forEach((el) => {
      const actor = actors.find((a) => a.id === el.dataset.residentStatus);
      if (actor) el.textContent = (actor.phase === "walk" ? "🚶" : actor.icon) + " " + actor.text;
    });
  }
  function updateResidentMap(actors) {
    const layer = $("residentMapLayer");
    if (!layer || $("townGrid").hidden) return;
    const ids = new Set(actors.map((a) => a.id));
    for (const el of [...layer.children]) if (!ids.has(el.dataset.person)) el.remove();
    for (const actor of actors) {
      let el = [...layer.children].find((e) => e.dataset.person === actor.id);
      if (!el) { el = document.createElement("span"); el.className = "map-resident"; el.dataset.person = actor.id; layer.append(el); }
      el.textContent = "👨‍🌾" + (actor.phase === "walk" ? "" : actor.icon);
      el.style.transform = `translate(${C.gridStyle.cell / 2 + actor.x * C.gridStyle.pitch}px,${C.gridStyle.cell / 2 + actor.y * C.gridStyle.pitch}px)`;
      el.title = actor.text;
    }
  }
  function startResidentLoop() {
    if (residentFrame !== null || !residentEngine || view !== "town" || residentPaused || document.hidden || !state.residents.length) return;
    residentLastTime = null;
    const frame = (time) => {
      residentFrame = null;
      if (view !== "town" || residentPaused || document.hidden || !state.residents.length) return;
      if (residentLastTime === null) residentLastTime = time;
      if (time - residentLastTime >= 32) {
        const actors = residentEngine.tick((time - residentLastTime) / 1000); residentLastTime = time;
        window.dispatchEvent(new CustomEvent("hk-residents-frame", { detail: actors }));
        updateResidentMap(actors);
        if (time - residentLastUI > 400) { updateResidentUI(actors); residentLastUI = time; }
      }
      residentFrame = requestAnimationFrame(frame);
    };
    residentFrame = requestAnimationFrame(frame);
  }
  $("residentPause").onclick = () => {
    residentPaused = !residentPaused; residentLastTime = null; $("residentPause").textContent = residentPaused ? "動きを再開" : "動きを止める";
    $("residentPause").setAttribute("aria-pressed", String(residentPaused)); startResidentLoop();
  };
  document.addEventListener("visibilitychange", () => { residentLastTime = null; startResidentLoop(); });
  function startPlacement(type, id = null) {
    $("dialog").close();
    setView("town");
    const item = C.items.find((i) => i.id === type),
      b = id && state.city.find((b) => b.id === id);
    if (!item || (!id && state.money < item.price)) return;
    const rot = b?.rot || 0;
    const cell = b || C.findPlot(state.city, type, rot);
    if (!cell) { notify("この建物の敷地が入る空き地がないよ。建物を移動して場所を空けてね。"); return; }
    pending = { type, id, x: cell.x, y: cell.y, rot };
    $("placement").hidden = false;
    $("placementTitle").textContent =
      item.name + (id ? "を移動" : "を配置 · " + item.price + "両");
    $("placeX").value = cell.x + 1;
    $("placeY").value = cell.y + 1;
    updatePlacement();
    if (!$("townGrid").hidden) $("townGrid").querySelector(`[data-cell="${cell.x},${cell.y}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
    $("placement").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function updatePlacement() {
    if (!pending) return;
    const x = Number($("placeX").value) - 1,
      y = Number($("placeY").value) - 1;
    pending.x = x;
    pending.y = y;
    const f = C.footprint(pending), valid = C.canPlace(state.city, x, y, pending.id, pending.type, pending.rot);
    $("placeConfirm").disabled = !valid;
    $("placementHint").textContent = valid
      ? f.width + "×" + f.depth + "マス · 横 " + (x + 1) + " · 縦 " + (y + 1) + " から置きます。"
      : f.width + "×" + f.depth + "マスの敷地が必要だよ。ほかの建物や町の外に重ならない場所を選んでね。";
    if (!$("townGrid").hidden) renderGrid();
    window.dispatchEvent(new CustomEvent("hk-placement", { detail: pending }));
  }
  function cancelPlacement() {
    pending = null;
    $("placement").hidden = true;
    window.dispatchEvent(new CustomEvent("hk-placement", { detail: null }));
    renderTown();
  }
  function commitPlacement() {
    if (!pending || walletPurchase) return;
    state.money = W.snapshot().balance;
    const p = pending,
      item = C.items.find((i) => i.id === p.type);
    if (!C.canPlace(state.city, p.x, p.y, p.id, p.type, p.rot)) {
      updatePlacement();
      return;
    }
    if (p.id) {
      const b = state.city.find((b) => b.id === p.id);
      if (!b) return;
      b.x = p.x;
      b.y = p.y;
      b.rot = p.rot;
    } else {
      if (state.money < item.price) {
        notify("両が足りないよ。");
        return;
      }
      walletPurchase = true;
      W.buy(item.price, () => pending === p && C.canPlace(state.city, p.x, p.y, p.id, p.type, p.rot), () => {
        walletPurchase = false;
        state.city.push({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random(), type: p.type, x: p.x, y: p.y, rot: p.rot });
        save(); renderStats(); cancelPlacement(); notify(item.name + "を置いたよ！");
      }, error => { walletPurchase = false; walletError(error); });
      return;
    }
    save();
    renderStats();
    cancelPlacement();
    notify(item.name + "を置いたよ！");
  }
  function deleteBuilding(id) {
    const b = state.city.find((b) => b.id === id);
    if (!b) return;
    if (pending?.id === id) cancelPlacement();
    state.city = state.city.filter((b) => b.id !== id);
    save();
    renderTown();
    notify("建物を削除したよ。", () => {
      if (C.canPlace(state.city, b.x, b.y, null, b.type, b.rot)) {
        state.city.push(b);
        save();
        renderTown();
        notify("建物を元に戻したよ。");
      } else notify("元の場所に建物があるため戻せません。");
    });
  }
  function settings() {
    openDialog(
      "記録・設定",
      `<div class="settings-row"><h3>記録の保存</h3><p>カード、両、町はこのブラウザに保存されます。別の端末には自動で移りません。</p><button id="exportBtn">記録をダウンロード</button> <label class="import-label">記録を読み込む <input id="importFile" type="file" accept="application/json,.json"></label></div><div class="settings-row"><h3>最初から遊ぶ</h3><p>すべての時代のカード・復習記録・両・町が初期化されます。先に記録を保存しておくと戻せます。</p><button id="resetRequest">記録をリセット</button></div>`,
    );
  }
  function exportState() {
    state.money = W.snapshot().balance;
    const blob = new Blob(
        [
          JSON.stringify(
            { version: 3, townLayout: { width: C.town.width, height: C.town.height }, exportedAt: new Date().toISOString(), ...state },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "historykids-record-" + C.dayKey() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importState(text) {
    const v = JSON.parse(text);
    if (
      ![2, 3].includes(v.version) ||
      !v.got ||
      !Number.isSafeInteger(v.money) ||
      v.money < 0 ||
      !Array.isArray(v.city) ||
      v.city.length > C.town.width * C.town.maxHeight
    )
      throw Error("format");
    const legacy = v.version === 2;
    if (!legacy && !C.validTownLayout(v.townLayout)) throw Error("town-layout");
    const layout = legacy ? { width: 30, height: 18 } : v.townLayout;
    if (v.city.length > layout.width * layout.height) throw Error("city-size");
    const city = [], anchors = new Set();
    for (const b of v.city) {
      if (
        !b ||
        !C.items.some((i) => i.id === b.type && i.cat !== "resident") ||
        !Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.x >= layout.width || b.y < 0 || b.y >= layout.height ||
        ![0, 90, 180, 270].includes(Number(b.rot) || 0) ||
        (legacy ? anchors.has(b.x + "," + b.y) : !C.canPlace(city, b.x, b.y, null, b.type, Number(b.rot) || 0, layout)) ||
        typeof b.id !== "string" ||
        city.some((a) => a.id === b.id)
      )
        throw Error("city");
      anchors.add(b.x + "," + b.y);
      city.push({
        id: b.id,
        type: b.type,
        x: b.x,
        y: b.y,
        rot: Number(b.rot) || 0,
      });
    }
    const residents = v.residents === undefined ? [] : v.residents;
    if (!Array.isArray(residents) || residents.length > 100) throw Error("residents");
    const ids = new Set();
    for (const r of residents) {
      if (!r || typeof r.id !== "string" || ids.has(r.id) || !Number.isInteger(r.x) || !Number.isInteger(r.y) || r.x < 0 || r.x >= layout.width || r.y < 0 || r.y >= layout.height) throw Error("residents");
      ids.add(r.id);
    }
    const got = {};
    for (const era of Object.keys(ds)) {
      got[era] = {};
      for (const r of records.filter((r) => r.era === era))
        if (v.got[era]?.[r.name] === true) got[era][r.name] = true;
    }
    const importedTown = legacy ? C.arrangeCity(city, { legacy: true, layout: { ...C.town, height: C.town.minHeight } }) : { city, layout };
    W.replace(v.money, () => {
    Object.assign(C.town, importedTown.layout);
    Object.assign(state, {
      money: v.money,
      city: importedTown.city,
      residents: residents.map((r) => ({ id: r.id, x: r.x + (legacy ? 15 : 0), y: r.y + (legacy ? 11 : 0) })),
      got,
      wrong: {},
      ruby: v.ruby !== false,
    });
    for (const r of records) if (v.wrong?.[r.id]) state.wrong[r.id] = true;
    save();
    cancelPlacement();
    setEra(ds[v.era] ? v.era : "edo");
    notify("記録を読み込んだよ。");
    }, walletError);
  }
  document.addEventListener("click", (e) => {
    const guideLink = e.target.closest("a[data-guide-target]");
    if (guideLink) {
      e.preventDefault();
      const target = document.getElementById(guideLink.dataset.guideTarget);
      target?.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.view) {
      setView(b.dataset.view);
      return;
    }
    if (b.dataset.era) {
      setEra(b.dataset.era);
      return;
    }
    if (b.dataset.mode) {
      mode = b.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((a) => {
        a.classList.toggle("active", a === b);
        a.setAttribute("aria-pressed", a === b);
      });
      renderQuestion();
      return;
    }
    if (b.dataset.answer) {
      check(b.dataset.answer, b);
      return;
    }
    if (b.dataset.card) {
      const r = records.find((r) => r.id === b.dataset.card);
      if (!r) return;
      if (got(r)) detail(r);
      else {
        setEra(r.era);
        rebuildQueue(r.id);
        setView("learn");
        $("quizPanel").scrollIntoView({ block: "center" });
      }
      return;
    }
    if (b.dataset.detail) {
      detail(records.find((r) => r.id === b.dataset.detail), false);
      return;
    }
    if (b.dataset.practice) {
      const r = records.find((r) => r.id === b.dataset.practice);
      if (!r) return;
      $("dialog").close();
      setEra(r.era);
      if (got(r)) { cardPractice = r; renderQuestion(); }
      else rebuildQueue(r.id);
      setView("learn");
      $("quizPanel").scrollIntoView({ block: "center" });
      return;
    }
    if (b.dataset.shopcat) {
      shop(b.dataset.shopcat);
      return;
    }
    if (b.dataset.buy === "farmer") { addResident(); return; }
    if (b.dataset.watchResident) { watchResident(b.dataset.watchResident); return; }
    if (b.dataset.dismissResident) { dismissResident(b.dataset.dismissResident); return; }
    if (b.dataset.buy) {
      startPlacement(b.dataset.buy);
      return;
    }
    if (b.dataset.cell) {
      const [x, y] = b.dataset.cell.split(",").map(Number);
      if (pending) {
        $("placeX").value = x + 1;
        $("placeY").value = y + 1;
        updatePlacement();
      } else {
        const item = state.city.find((a) => C.containsCell(a, x, y));
        if (item) buildingDetail(item.id);
        else notify("ショップで建物を選んでから、置く場所を決めてね。");
      }
      return;
    }
    if (b.dataset.move) {
      const a = state.city.find((a) => a.id === b.dataset.move);
      if (a) startPlacement(a.type, a.id);
      return;
    }
    if (b.dataset.building) { buildingDetail(b.dataset.building); return; }
    if (b.dataset.delete) {
      deleteBuilding(b.dataset.delete);
      return;
    }
    if (b.dataset.rotate) {
      const a = state.city.find((a) => a.id === b.dataset.rotate);
      if (a) {
        const rot = ((a.rot || 0) + 90) % 360;
        if (!C.canPlace(state.city, a.x, a.y, a.id, a.type, rot)) { notify("回転すると敷地が重なります。「移動」から向きと場所を選んでね。"); return; }
        a.rot = rot;
        save();
        renderTown();
      }
      return;
    }
  });
  function buildingDetail(id) {
    const b = state.city.find((a) => a.id === id);
    if (!b) return;
    const item = C.items.find((a) => a.id === b.type);
    openDialog(
      item.icon + " " + item.name,
      `<p>${C.footprint(b).width}×${C.footprint(b).depth}マスの敷地 · 横 ${b.x + 1} · 縦 ${b.y + 1}</p><div class="dialog-actions"><button data-move="${E(id)}">場所を変える</button><button data-rotate="${E(id)}">90度回転</button><button data-delete="${E(id)}">削除</button></div>`,
    );
  }
  $("answerForm").onsubmit = (e) => {
    e.preventDefault();
    if (!e.isComposing) check($("answerInput").value);
  };
  $("answerInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.isComposing) e.preventDefault();
  });
  $("prevBtn").onclick = () => moveQuestion(-1);
  $("nextBtn").onclick = () => moveQuestion(1);
  $("hintBtn").onclick = () => {
    const r = currentQuestion();
    if (!r) return;
    $("hintText").textContent =
      r.text +
      "（答えのはじめは「" +
      r.answers.map((a) => a[0]).join("・") +
      "」）";
    $("hintText").hidden = false;
  };
  $("practiceFilter").onchange = () => rebuildQueue();
  $("bookSearch").oninput = renderBook;
  $("chapterFilter").onchange = renderBook;
  $("cardFilter").onchange = renderBook;
  $("rubyBtn").onclick = () => {
    state.ruby = !state.ruby;
    save();
    renderStats();
  };
  $("walletBtn").onclick = () => shop();
  $("shopBtn").onclick = () => shop();
  $("dialogClose").onclick = () => $("dialog").close();
  $("dialog").addEventListener("click", (e) => {
    if (e.target === $("dialog")) {
      const r = $("dialog").getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        $("dialog").close();
    }
  });
  $("reviewBtn").onclick = () => {
    const first = records.find((r) => state.wrong[r.id] && !got(r));
    if (!first) {
      notify("間違えた問題はまだないよ。");
      return;
    }
    setEra(first.era);
    $("practiceFilter").value = "wrong";
    rebuildQueue();
    setView("learn");
  };
  $("placeX").oninput = updatePlacement;
  $("placeY").oninput = updatePlacement;
  $("placeRotate").onclick = () => { if (pending) { pending.rot = (pending.rot + 90) % 360; updatePlacement(); } };
  $("placeConfirm").onclick = commitPlacement;
  $("placeCancel").onclick = cancelPlacement;
  $("town2d").onclick = () => {
    $("townCanvas").hidden = true;
    $("townGrid").hidden = false;
    $("town2d").classList.add("active");
    $("town3d").classList.remove("active");
    $("town2d").setAttribute("aria-pressed", "true");
    $("town3d").setAttribute("aria-pressed", "false");
    renderGrid();
    $("townHelp").textContent = "町の地図を横・縦にスクロールできます。建物を選ぶと敷地をまとめて移動できます。";
  };
  $("town3d").onclick = () => {
    $("townCanvas").hidden = false;
    $("townGrid").hidden = true;
    $("townHelp").textContent = "指1本で回転、2本で拡大・移動。建物をタップすると操作できます。";
    $("town3d").classList.add("active");
    $("town2d").classList.remove("active");
    $("town3d").setAttribute("aria-pressed", "true");
    $("town2d").setAttribute("aria-pressed", "false");
    window.dispatchEvent(new CustomEvent("hk-town-open"));
    setTimeout(() => { if (view === "town" && !window.HKTownReady) $("town2d").click(); }, 1500);
  };
  $("cameraReset").onclick = () =>
    window.dispatchEvent(new CustomEvent("hk-camera-reset"));
  $("undoBtn").onclick = () => {
    const f = lastUndo;
    lastUndo = null;
    if (f) f();
  };
  $("settingsBtn").onclick = settings;
  $("mobileSettings").onclick = settings;
  $("aboutBtn").onclick = () =>
    openDialog(
      "歴史キッズについて",
      '<div class="dialog-body-text"><img class="about-image" src="./かわいい青いクジラ.png" alt="サイト管理人のクジラのアイコン"><h3>サイト管理人：しろながす</h3><p>クイズ・年表・カードを通じて、子どもたちが歴史に親しめるサイトを目指して開発・運営しています。</p><p>ひらがなでの回答やふりがなに対応。小学生から高校生まで、自分のペースで楽しめます。</p><p>年号や時代の区切りには複数の考え方がある場合があります。学校で使う教科書とあわせて学んでください。</p></div>',
    );
  $("contactBtn").onclick = () =>
    openDialog(
      "お問い合わせ",
      '<p>ご意見・ご要望・誤字や歴史内容のご指摘は、こちらのフォームからお知らせください。</p><div class="dialog-actions"><a href="https://docs.google.com/forms/d/e/1FAIpQLSdHvqKAszs5j860tNIeesVlE83pMpP_qP9QrNLuJJaZ9g3h5Q/viewform" target="_blank" rel="noopener">お問い合わせフォームを開く</a></div>',
    );
  $("dialogBody").addEventListener("click", (e) => {
    const id = e.target.id;
    if (id === "exportBtn") exportState();
    if (id === "resetRequest")
      openDialog(
        "記録をリセットしますか？",
        '<p>カード、復習記録、両、町がすべて消えます。保存した記録ファイルがあれば読み込んで戻せます。</p><div class="dialog-actions"><button id="resetConfirm" class="primary">すべてリセットする</button><button id="resetCancel">やめる</button></div>',
      );
    if (id === "resetCancel") settings();
    if (id === "resetConfirm") {
      W.replace(0, () => {
      for (const era of Object.keys(ds)) state.got[era] = {};
      state.money = 0;
      state.city = [];
      state.residents = [];
      C.town.height = C.town.minHeight;
      state.wrong = {};
      save();
      $("dialog").close();
      cancelPlacement();
      renderStats();
      rebuildQueue();
      renderCards();
      notify("記録をリセットしたよ。");
      }, walletError);
    }
    if (e.target.dataset.delete) $("dialog").close();
  });
  $("dialogBody").addEventListener("change", async (e) => {
    if (e.target.id !== "importFile") return;
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify("記録ファイルが大きすぎます。");
      return;
    }
    try {
      importState(await file.text());
      $("dialog").close();
    } catch {
      notify(
        "このファイルは読み込めません。歴史キッズの記録ファイルを選んでください。",
      );
    }
  });
  window.addEventListener("hashchange", () =>
    setView(location.hash.slice(1), false),
  );
  window.addEventListener("hk-wallet-change", () => {
    state.money = W.snapshot().balance; renderStats();
    if (view === "town") renderTown();
    if ($("dialog").open && $("dialogBody").querySelector("[data-buy]")) shop();
  });
  window.addEventListener("storage", e => {
    if (e.key !== "hk_wallet_v2" && e.key !== "money_v1") notify("別のタブで記録が更新されました。読み直すと反映されます。");
  });
  window.HK = {
    state,
    records,
    get pending() {
      return pending;
    },
    setCell(x, y) {
      if (!pending) return;
      $("placeX").value = x + 1;
      $("placeY").value = y + 1;
      updatePlacement();
    },
    buildingDetail,
    watchResident,
    get residentActors() { return residentEngine?.snapshot() || []; },
    notify,
  };
  const unresolved = W.snapshot().pending;
  if (unresolved) W.finish(unresolved.id, () => { renderStats(); }, walletError);
  const reviewParams = new URLSearchParams(location.search);
  if ((legacyTown && (state.city.length || state.residents.length)) || arrangedTown.moved) save();
  const reviewing = reviewParams.get("review") === "1";
  setEra(reviewing && ds[reviewParams.get("era")] ? reviewParams.get("era") : state.era);
  if (reviewing) { $("practiceFilter").value = "wrong"; rebuildQueue(); }
  setView(reviewing ? "learn" : location.hash.slice(1) || "learn", false);
})();
