(function () {
  "use strict";
  const C = window.HKCore, L = window.HKLeaderboard, $ = (id) => document.getElementById(id), E = C.esc;
  const names = { sprint: "10問決戦", rush: "60秒ラッシュ", survival: "3命サバイバル" };
  const rules = {
    sprint: "正答率と合計回答時間でスコアが決まるよ。正確さ80％・速さ20％。10問完走でランキングへ！",
    rush: "60秒で何問正解できる？間違いは残り時間が5秒減ります。コンボと早押しで高得点を狙おう。",
    survival: "間違い3回で終了。答える時間は15秒。全問突破を目指して、知識の限界に挑もう。",
  };
  let game = "sprint", run = null, qi = 0, clock = null, resultMs = 0, registrationMs = 0, composing = false, audio = null, sound = false;
  const pool = [];
  for (const [era, data] of Object.entries(window.dataSets)) for (const [chapter, questions] of Object.entries(data.chapters))
    for (const [name, entry] of Object.entries(questions)) pool.push({ ...entry, era, chapter, name, id: era + "|" + name, answers: data.blanks[name], prompt: C.dateText(entry) + "、" + C.questionText(name) });
  function settings() {
    const period = "alltime", mode = "allera", era = "ALL", answerMode = "choice", key = C.periodKey(period);
    return { period, mode, era, answerMode, game, key, group: "v4_" + mode + "_" + era + "_" + answerMode, scoreKey: "hk_best_v4_" + period + "_" + key + "_" + mode + "_" + era + "_" + game + "_" + answerMode };
  }
  function best(config) {
    if(config.game==='sprint')return L.localBest();
    try { const record = JSON.parse(localStorage.getItem(config.scoreKey)); return record && Number.isFinite(record.score) && Number.isFinite(record.ms) ? record : null; } catch { return null; }
  }
  function renderBest() {
    const old = best(settings());
    $("personalBest").textContent = old ? "この設定の自己ベスト：" + old.score + "点 · " + old.correct + "問正解 · " + L.seconds(old.ms) + "秒" : "まだ記録がないよ。最初の一押しを決めよう。";
    $("modeRule").textContent = rules[game];
    const config = settings();
    for (const link of document.querySelectorAll('a[href^="./ranking.html"]')) link.href = "./ranking.html";
  }
  function note(text) { $("note").textContent = text; $("note").hidden = false; }
  function beep(kind) {
    if (!sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context(); if (audio.state === "suspended") audio.resume().catch(() => {});
      const tones = kind === "correct" ? [523, 659, 784] : kind === "wrong" ? [200, 150] : [440];
      tones.forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * .08;
        oscillator.type = "sine"; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.07, start); gain.gain.exponentialRampToValueAtTime(.001, start + .14);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .15);
      });
    } catch {}
  }
  function lock(on) { document.querySelectorAll("[data-game]").forEach(b=>b.disabled=on); }
  function start() {
    if (clock) clearInterval(clock);
    const config = settings(), candidates = config.era === "ALL" ? [...new Map(pool.map((q) => [q.name, q])).values()] : pool.filter((q) => q.era === config.era);
    const seed = Date.now() + "|" + Math.random();
    const mixed = C.eraOrder.flatMap(era=>C.seededPick(candidates.filter(q=>q.era===era),1,seed+era));
    const online=game==='sprint'&&!!window.HKRankingConfig?.endpoint;
    run = { ...config, qs: C.seededPick(game === "sprint" ? mixed : candidates, game === "sprint" ? 10 : candidates.length, seed), start: performance.now() + 3000, phase: online?'connecting':"countdown", score: 0, correct: 0, misses: 0, combo: 0, maxCombo: 0, penalty: 0, lives: 3, log: [], totalAnswerMs:0, nextAt: 0 };
    qi = 0; resultMs = 0; registrationMs = 0; lock(true);
    $("submitStatus").textContent = ""; $("player").readOnly = false; $("submit").textContent = "この名前でベストを登録";
    $("startBox").hidden = true; $("resultBox").hidden = true; $("quizBox").hidden = false; $("note").hidden = true; $("submit").disabled = false; $("submittedRanking").hidden = true;
    $("countdown").hidden = false; $("countdown").textContent = online?'接続中…':"3"; $("gameLabel").textContent = names[game];
    $("timerLabel").textContent = game === "rush" ? "TIME LEFT" : game === "sprint" ? "合計回答時間" : "TIME";
    $("buzzZone").hidden = true; $("answerZone").hidden = true; $("feedback").hidden = true; $("nextBtn").hidden = true; $("advanceNote").hidden = true;
    $("qTitle").textContent = "準備はいい？"; $("countText").textContent = "—"; $("scoreText").textContent = "0"; $("comboText").textContent = "0"; $("livesText").textContent = game === "survival" ? "♥♥♥" : "—";
    $("prog").max = run.qs.length; $("prog").value = 0; $("quizBox").classList.remove("urgent");
    clock = setInterval(tick, 50); tick(); $("quizBox").scrollIntoView({ block: "start", behavior: "smooth" });
    if(online){const original=run;L.startChallenge().then(session=>{if(run!==original)return;const qs=session.ids.map(id=>pool.find(q=>q.id===id));if(qs.some(q=>!q))throw Error('question-version');run.qs=qs;run.ticket=session.ticket;run.timingVersion=session.timingVersion;run.start=performance.now()+3000;run.phase='countdown';tick();}).catch(()=>{if(run!==original)return;run.start=performance.now()+3000;run.phase='countdown';note('ランキングに接続できなかったので、今回は端末内で遊べます。オンラインで挑戦するとスコアを登録できます。');tick();});}
  }
  function show(now = performance.now()) {
    if(!run||run.phase==='finished')return;
    if(!run.ticket||run.timingVersion!==2){displayQuestion(now);return;}
    const original=run,index=qi;run.phase='loading';run.pendingMs=0;
    $("qTitle").textContent='次の問題を準備しています…';$("readStatus").textContent='接続中…';$("buzzZone").hidden=true;$("answerZone").hidden=true;$("feedback").hidden=true;$("nextBtn").hidden=true;$("advanceNote").hidden=true;
    L.openQuestion(run.ticket,index).then(r=>{if(run!==original||qi!==index)return;if(r.id!==run.qs[index].id)throw Error('question-version');displayQuestion();}).catch(()=>{if(run!==original||qi!==index)return;run.ticket=null;note('接続が途切れたので、今回は端末内のスコアで続けます。ランキングに登録するには、オンラインでもう一度挑戦してね。');displayQuestion();});
  }
  function displayQuestion(now = performance.now()) {
    if (!run || run.phase === "finished") return;
    const q = run.qs[qi];
    if (!q) { finish(now); return; }
    run.phase = "reading"; run.questionStart = now; run.questionDeadline = now + 30000; run.reveal = 0; run.answerDeadline = 0;
    $("countText").textContent = qi + 1 + (run.game === "sprint" ? " / 10" : "問目"); $("prog").value = run.log.length;
    $("eraBadge").textContent = window.dataSets[q.era].title + " · " + q.chapter; $("qTitle").textContent = "…";
    $("readStatus").textContent = "問題を読み上げ中…"; $("revealBar").style.width = "0%";
    $("buzzZone").hidden = false; $("buzzBtn").disabled = false; $("answerZone").hidden = true; $("feedback").hidden = true; $("nextBtn").hidden = true; $("advanceNote").hidden = true;
    $("answer").value = ""; $("answer").disabled = false; $("checkBtn").disabled = false; $("buzzBtn").focus({ preventScroll: true });
  }
  function tick() {
    if (!run || run.phase === "finished") return;
    const now = performance.now();
    if (run.phase === "countdown") {
      const remaining = Math.ceil((run.start - now) / 1000);
      if (remaining > 0) { $("countdown").textContent = String(remaining); return; }
      $("countdown").hidden = true; show(now); beep("buzz");
    }
    const elapsed = run.game==='sprint' ? run.totalAnswerMs + (["reading","answer"].includes(run.phase)?Math.max(0,now-run.questionStart):run.phase==='checking'?run.pendingMs:0) : Math.max(0, now - run.start) + run.penalty;
    $("timerText").textContent = ((run.game === "rush" ? Math.max(0, 60000 - elapsed) : elapsed) / 1000).toFixed(2) + "秒";
    $("quizBox").classList.toggle("urgent", run.game === "rush" && elapsed >= 50000);
    if (run.game === "rush" && elapsed >= 60000) { finish(now); return; }
    if (run.phase === "reading") {
      const chars = Array.from(run.qs[qi].prompt), count = Math.min(chars.length, Math.floor((now - run.questionStart) / 80));
      run.reveal = count / chars.length; $("qTitle").textContent = chars.slice(0, count).join("") || "…";
      $("revealBar").style.width = run.reveal * 100 + "%"; $("readStatus").textContent = count === chars.length ? "答えがわかったら早押し！" : "問題を読み上げ中…";
      if (now >= run.questionDeadline) resolve(false, "時間切れ", now);
    } else if (run.phase === "answer") {
      $("answerClock").textContent = Math.max(0, Math.ceil((run.answerDeadline - now) / 1000));
      if (now >= run.answerDeadline) resolve(false, "回答時間切れ", now);
    } else if (run.phase === "feedback" && now >= run.nextAt) advance();
  }
  function buzz() {
    tick(); if (!run || run.phase !== "reading") return;
    run.phase = "answer"; run.answerDeadline = performance.now() + 15000;
    $("buzzZone").hidden = true; $("answerZone").hidden = false; $("readStatus").textContent = "早押し成功！答えよう。";
    $("challengeChoices").hidden = run.answerMode !== "choice"; $("challengeForm").hidden = run.answerMode !== "type";
    $("answerPrompt").firstChild.textContent = run.answerMode === "choice" ? "答えを選んでね。残り " : "ひらがなで答えてね。残り ";
    $("challengeChoices").innerHTML = C.choiceAnswers(run.qs[qi], pool).map((answer, i) => `<button data-choice="${E(answer)}"><span>${i + 1}</span>${E(answer)}</button>`).join("");
    $("answerClock").textContent = "15";
    if (run.answerMode === "type") $("answer").focus({ preventScroll: true }); else $("challengeChoices").querySelector("button")?.focus({ preventScroll: true });
    beep("buzz");
  }
  function check(raw, button) {
    tick(); if (!run || run.phase !== "answer" || composing) return;
    if (!C.tokens(raw).length) { $("answer").focus(); return; }
    resolve(C.answerOK(raw, run.qs[qi].answers), raw, performance.now(), button);
  }
  function resolve(ok, raw, now, button) {
    if(!run||!["reading","answer"].includes(run.phase))return;
    if(!run.ticket||run.timingVersion!==2){completeRound(ok,raw,now,button);return;}
    const original=run,index=qi;run.phase='checking';run.pendingMs=Math.max(0,now-run.questionStart);
    $("buzzBtn").disabled=true;$("answer").disabled=true;$("checkBtn").disabled=true;$("challengeChoices").querySelectorAll('button').forEach(b=>b.disabled=true);$("readStatus").textContent='回答を確認しています…';
    L.recordAnswer(run.ticket,index,run.qs[index].id,raw).then(r=>{if(run!==original||qi!==index)return;completeRound(r.correct,raw,now,button,r.answerMs);}).catch(()=>{if(run!==original||qi!==index)return;run.ticket=null;note('接続が途切れたので、今回は端末内のスコアで続けます。ランキングに登録するには、オンラインでもう一度挑戦してね。');completeRound(ok,raw,now,button);});
  }
  function completeRound(ok, raw, now, button, measuredMs) {
    if (!run || !["reading", "answer", "checking"].includes(run.phase)) return;
    const q = run.qs[qi]; run.phase = "feedback";
    const bonus = ok ? Math.round(80 * (1 - run.reveal)) : 0;
    if (ok) { run.correct++; run.combo++; run.maxCombo = Math.max(run.combo, run.maxCombo); run.score += 100 + bonus + Math.min(100, (run.combo - 1) * 15); }
    else { run.misses++; run.combo = 0; if (run.game === "rush") run.penalty += 5000; else if(run.game === "survival")run.lives--; markWrong(q); }
    const answerMs=measuredMs??Math.max(1,Math.round(now-run.questionStart));
    run.log.push({ q, ok, raw, ms:answerMs, bonus });run.totalAnswerMs+=answerMs;
    if(run.game==='sprint')run.score=C.rankingScore(run.correct,run.totalAnswerMs);
    $("scoreText").textContent = run.score; $("comboText").textContent = run.combo; $("livesText").textContent = run.game === "survival" ? "♥".repeat(run.lives) + "♡".repeat(3 - run.lives) : "—";
    $("comboText").classList.remove("combo-pulse"); if (run.combo > 1) { void $("comboText").offsetWidth; $("comboText").classList.add("combo-pulse"); }
    $("feedback").className = "arena-feedback" + (ok ? "" : " wrong"); $("feedback").hidden = false;
    $("feedback").innerHTML = `<strong>${ok ? "正解！" + (run.combo > 1 ? " " + run.combo + " COMBO" : "") + (run.game==='sprint'?"": " ＋" + (100 + bonus + Math.min(100, (run.combo - 1) * 15)) + "点") : (raw.includes("時間切れ") ? E(raw) : "惜しい！") + (run.game === "survival" ? " 命 −1" : run.game === "rush" ? " ＋5秒" : "")}</strong><p>答え：${E(q.answers.join("・"))}${ok && bonus && run.game!=='sprint' ? " · 早押しボーナス ＋" + bonus + "点" : ""}</p><p>${E(q.text)}</p>`;
    $("qTitle").textContent = q.prompt; $("buzzZone").hidden = true; $("answer").disabled = true; $("checkBtn").disabled = true;
    $("challengeChoices").querySelectorAll("button").forEach((b) => { b.disabled = true; if (C.answerOK(b.dataset.choice, q.answers)) b.classList.add("correct"); else if (b === button) b.classList.add("incorrect"); });
    $("prog").value = run.log.length; beep(ok ? "correct" : "wrong");
    if (run.log.length === run.qs.length || (run.game === "survival" && run.lives <= 0) || (run.game === "rush" && now - run.start + run.penalty >= 60000)) { finish(now); return; }
    run.nextAt = performance.now() + (ok ? 1000 : 2400); $("nextBtn").hidden = false; $("advanceNote").hidden = false; $("nextBtn").focus({ preventScroll: true });
  }
  function markWrong(q) {
    try { let wrong = JSON.parse(localStorage.getItem("hk_wrong_v2") || "{}"); if (!wrong || Array.isArray(wrong) || typeof wrong !== "object") wrong = {}; wrong[q.id] = true; localStorage.setItem("hk_wrong_v2", JSON.stringify(wrong)); } catch {}
  }
  function advance() { if (!run || run.phase !== "feedback") return; qi++; show(); }
  function finish(now = performance.now()) {
    if (!run || run.phase === "finished") return;
    run.phase = "finished"; clearInterval(clock); clock = null; resultMs = run.game==='sprint'?Math.max(1,run.totalAnswerMs):Math.max(1, Math.round(now - run.start + run.penalty));
    $("quizBox").hidden = true; $("resultBox").hidden = false; $("resultScore").textContent = run.score.toLocaleString("ja-JP"); $("resultCorrect").textContent = run.correct + " / " + run.log.length;
    $("resultTimeLabel").textContent=run.game==='sprint'?'合計回答時間':'タイム';$("resultTime").textContent = L.seconds(resultMs) + "秒"; $("resultCombo").textContent = run.maxCombo;
    const perfect = run.game === "sprint" && run.correct === 10 && run.misses === 0;
    $("resultTitle").textContent = perfect ? "全問正解！見事な一押し。" : run.game === "survival" && run.log.length === run.qs.length && run.lives > 0 ? "全問突破！歴史の達人。" : names[run.game] + " 終了！";
    $("resultMedal").textContent = perfect ? "🏆" : run.maxCombo >= 5 ? "🔥" : "⚡";
    const record = { score: run.score, ms: resultMs, correct: run.correct, combo: run.maxCombo,...(run.game==='sprint'?{answerMs:resultMs,timingVersion:2}:{}) }, old = best(run);
    const improved = !old || (run.game === "sprint" ? C.rankingCompare(record,old)<0 : record.score > old.score || (record.score === old.score && record.ms < old.ms));
    try { if (improved) localStorage.setItem(run.scoreKey, JSON.stringify(record)); $("resultBest").textContent = improved ? "自己ベスト更新！" : "自己ベスト " + old.correct + "問正解 · " + old.score + "点"; } catch { $("resultBest").textContent = "このブラウザでは記録を保存できません。"; }
    $("resultSummary").textContent = "正答率 " + (run.log.length ? Math.round(run.correct / run.log.length * 100) : 0) + "% · 間違い " + run.misses + "回" + (run.penalty ? " · ペナルティ " + run.penalty / 1000 + "秒を含む" : "") + (run.game==='sprint'?"。正確さ80％・速さ20％のスコア。解説中の時間は含みません。":"。問題を開いて解説を確かめよう。");
    $("resultReview").innerHTML = run.log.map((round, i) => `<details class="${round.ok ? "" : "missed"}"><summary><span class="review-number">${String(i + 1).padStart(2, "0")}</span><b>${E(round.q.prompt)}</b><small>${round.ok ? "正解" : "復習"} · ${(round.ms / 1000).toFixed(1)}秒</small></summary><p class="answer-reading">答え：${E(round.q.answers.join("・"))}</p><p>${E(round.q.text)}</p></details>`).join("");
    $("reviewLink").hidden = !run.misses; const firstMiss = run.log.find((r) => !r.ok); $("reviewLink").href = "./?review=1&era=" + (firstMiss?.q.era || "edo") + "#learn";
    const complete=run.game==="sprint"&&run.log.length===10;
    $("submitBox").hidden = false;registrationMs=complete?L.registerableBest()?.ms||0:0;$("submit").disabled=!registrationMs;
    $("submitRule").textContent = registrationMs ? "自己ベスト " + L.registerableBest().score.toLocaleString("ja-JP") + "点を登録できます。高いスコアほど上位になります。" : complete?"10問完了！オンラインで10問決戦を遊ぶと、この欄からランキングに登録できます。":"10問決戦を最後まで遊ぶと登録できます。ニックネームを決めて挑戦しよう！";
    $("submittedRanking").href = "./ranking.html?registered=1#personalCard";
    $("resultBox").scrollIntoView({ block: "start", behavior: "smooth" });
    if(complete&&run.ticket)verifyResult(run);
  }
  async function verifyResult(original){
    if(original.verifying)return;original.verifying=true;$("submit").disabled=true;$("submitStatus").textContent='10問の結果を確認しています…';$("submitRule").textContent='サーバーで正解と回答時間を確認したら、ニックネームで登録できます。';
    try{
      const result=await L.finishChallenge(original.ticket,original.log,{correct:original.correct,combo:original.maxCombo});if(run!==original)return;
      resultMs=result.ms;registrationMs=result.best.ms;$("resultTime").textContent=L.seconds(resultMs)+'秒';$("resultScore").textContent=result.score.toLocaleString('ja-JP');$("resultCorrect").textContent=result.correct+' / 10';
      $("resultBest").textContent='ランキング用自己ベスト '+result.best.score.toLocaleString('ja-JP')+'点';
      $("submitRule").textContent='自己ベスト '+result.best.score.toLocaleString('ja-JP')+'点を登録できます。高いスコアほど上位になります。';
      $("resultSummary").textContent='正答率 '+result.correct*10+'％ · 合計回答時間 '+L.seconds(resultMs)+'秒。正確さ80％・速さ20％のスコア。'+(original.timingVersion===2?'解説中の時間は含みません。':'以前の方式で計測した時間から換算しています。');
      $("submitStatus").textContent='記録を確認できました。ニックネームを入力して登録しよう。';$("submitStatus").className='submit-status success';$("submit").textContent='この名前でベストを登録';$("submit").disabled=false;
    }
    catch(error){if(run!==original)return;registrationMs=0;$("submitStatus").textContent=L.errorText(error);$("submitStatus").className='submit-status error';$("submit").textContent='確認して登録する';$("submit").disabled=false;}
    finally{original.verifying=false;}
  }
  function quit() { clearInterval(clock); clock = null; run = null; resultMs = 0; lock(false); $("quizBox").hidden = true; $("resultBox").hidden = true; $("startBox").hidden = false; $("note").hidden = true; renderBest(); }
  $("startBtn").onclick = start; $("buzzBtn").onclick = buzz; $("nextBtn").onclick = advance; $("quitBtn").onclick = quit; $("againBtn").onclick = start; $("settingsBtn").onclick = quit;
  $("challengeChoices").onclick = (e) => { const b = e.target.closest("[data-choice]"); if (b) check(b.dataset.choice, b); };
  $("challengeForm").onsubmit = (e) => { e.preventDefault(); check($("answer").value); };
  $("answer").addEventListener("compositionstart", () => { composing = true; }); $("answer").addEventListener("compositionend", () => { composing = false; });
  $("answer").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
  document.addEventListener("keydown", (e) => {
    if (!run || e.isComposing || composing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.("input,select,textarea")) return;
    if ((e.code === "Space" || e.key === " ") && run.phase === "reading") { e.preventDefault(); buzz(); }
    else if (/^[1-4]$/.test(e.key) && run.phase === "answer" && run.answerMode === "choice") { e.preventDefault(); $("challengeChoices").querySelectorAll("button")[Number(e.key) - 1]?.click(); }
    else if (e.key === "Enter" && run.phase === "feedback") { e.preventDefault(); advance(); }
  });
  document.querySelectorAll("[data-game]").forEach((b) => { b.onclick = () => { if (run && run.phase !== "finished") return; game = b.dataset.game; document.querySelectorAll("[data-game]").forEach((a) => { a.classList.toggle("active", a === b); a.setAttribute("aria-pressed", String(a === b)); }); renderBest(); }; });
  $("soundBtn").onclick = () => { sound = !sound; $("soundBtn").textContent = sound ? "音 ON" : "音 OFF"; $("soundBtn").setAttribute("aria-pressed", String(sound)); beep("buzz"); };
  $("fullscreenBtn").hidden = !document.fullscreenEnabled; $("fullscreenBtn").onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { note("このブラウザでは全画面にできません。"); } };
  $("player").value = L.savedName();
  $("player").addEventListener("input", () => { $("player").setCustomValidity(""); });
  $("rankingForm").onsubmit = async event => {
    event.preventDefault();
    if (!run || run.phase !== "finished" || run.game !== "sprint" || run.log.length !== 10 || $("submit").disabled) return;
    if(!registrationMs){if(run.ticket)await verifyResult(run);if(!registrationMs)return;}
    const name = L.nickname($("player").value);
    if (!name) { $("player").setCustomValidity("ニックネームを入力してね。"); $("player").reportValidity(); $("player").focus(); return; }
    $("player").value = name;
    const original = run, ms = registrationMs;
    $("submit").disabled = true; $("submit").textContent = "登録しています…";
    $("submitStatus").textContent = "ランキングに接続しています…"; $("submitStatus").className = "submit-status";
    try {
      const published = await L.submit(name, ms);
      if (run !== original) return;
      $("submitStatus").textContent = published.renamed ? published.entry.name + "に名前を変更しました！ ベストは " + published.entry.score.toLocaleString("ja-JP") + "点" : published.updated ? published.entry.name + "でランキング登録できたよ！ " + published.entry.score.toLocaleString("ja-JP") + "点" : "登録済みのベストの方が高いよ。" + published.entry.name + "の " + published.entry.score.toLocaleString("ja-JP") + "点を残しました。";
      $("submitStatus").className = "submit-status success"; $("submit").textContent = "登録済み"; $("player").value = published.entry.name; $("player").readOnly = true; $("submittedRanking").hidden = false;
      $("submittedRanking").click();
    } catch (error) {
      if (run !== original) return;
      $("submitStatus").textContent = L.errorText(error) + " ランキング画面からも、この自己ベストを登録できます。";
      $("submitStatus").className = "submit-status error"; $("submit").disabled = false; $("submit").textContent = "もう一度登録する";
    }
  };
  window.HKChallenge = { get run() { return run; }, get qi() { return qi; }, get resultMs() { return resultMs; }, tick };
  renderBest();
})();
