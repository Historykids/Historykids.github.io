const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
const eras = ['jomon','yayoi','kofun','asuka','nara','heian']; let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS', name); }
function page(file, seed = {}) {
  const dom = new JSDOM(read(file), {url: 'https://historykids.github.io/' + file, runScripts:'outside-only', pretendToBeVisual:true});
  const w = dom.window; w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true}; w.HTMLDialogElement.prototype.close=function(){this.open=false};
  let now=0; if(file==='buzzer.html') { Object.defineProperty(w.performance,'now',{value:()=>now}); w.setInterval=()=>1; w.clearInterval=()=>{}; }
  for(const [k,v] of Object.entries(seed)) w.localStorage.setItem(k, JSON.stringify(v));
  const files = file==='index.html' ? ['data/dataset.js','data/ancient.js','data/meiji.js','data/modern.js','assets/ui/core.js','assets/ui/residents.js','assets/ui/wallet.js','assets/ui/app.js'] : ['data/dataset.js','data/ancient.js','data/meiji.js','data/modern.js','assets/ui/core.js','assets/ui/leaderboard.js','assets/ui/challenge.js'];
  for(const file of files)w.eval(read(file));
  return {dom,w,$:id=>w.document.getElementById(id),click:s=>{const e=w.document.querySelector(s);assert(e,s);e.click();},time:t=>{now=t;w.HKChallenge.tick();}};
}
test('fourteen era tabs appear chronologically and every added era contains eighteen complete cards',()=>{
  const p=page('index.html');
  assert.deepEqual([...p.$('eraTabs').querySelectorAll('button')].map(b=>b.dataset.era), [...p.w.HKCore.eraOrder]);
  const legacyMulti=p.w.HK.records.find(r=>r.answers.includes('しゅご')&&r.answers.includes('じとう'));
  assert(legacyMulti.title.includes('守護')&&legacyMulti.title.includes('地頭'));
  assert(legacyMulti.titleHTML.includes('<rt>しゅご</rt>')&&legacyMulti.titleHTML.includes('<rt>じとう</rt>'));
  for(const era of eras){const rows=p.w.HK.records.filter(r=>r.era===era);assert.equal(rows.length,18,era);assert.equal(new Set(rows.map(r=>r.id)).size,18);assert.equal(Object.keys(p.w.dataSets[era].chapters).length,3);for(const r of rows){assert(r.source.startsWith('https://'));assert(!r.title.match(/〇|undefined|^-?\d+ /));assert.equal(r.question.match(/〇+/g).length,r.answers.length);assert.deepEqual(Array.from(r.question.matchAll(/〇+/g), m=>m[0].length),Array.from(r.answers,a=>Array.from(a).length));}}
  p.dom.window.close();
});
test('new eras award ten and twenty coins, save separately, and keep the existing collection and town',()=>{
  const old='1603 〇〇幕府がはじまる', seed={money_v1:120,cards_edo_complete_v1:{[old]:true},city_v1:[{id:'legacy-house',type:'house',x:5,y:5,rot:0}]};
  const p=page('index.html',seed); let expected=120;
  for(const era of eras){p.click(`[data-era="${era}"]`);let r=p.w.HK.records.filter(r=>r.era===era).sort((a,b)=>a.year-b.year)[0];p.click('#choices button[data-answer="'+r.answers.join('・')+'"]');expected+=10;assert.equal(p.w.HK.state.money,expected);assert(p.w.HK.state.got[era][r.name]);
    p.click('#nextBtn');p.click('[data-mode="type"]');const typed=p.w.HK.records.filter(r=>r.era===era).sort((a,b)=>a.year-b.year)[1];p.$('answerInput').value=typed.answers.join('・');p.$('answerForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));expected+=20;assert.equal(p.w.HK.state.money,expected);assert(p.w.HK.state.got[era][typed.name]);p.click('[data-mode="choice"]');}
  assert(p.w.HK.state.got.edo[old]);assert.equal(p.w.HK.state.city[0].id,'legacy-house');
  const stored=Object.fromEntries(Object.keys(p.w.localStorage).map(k=>[k,JSON.parse(p.w.localStorage.getItem(k))]));const again=page('index.html',stored);
  assert.equal(again.w.HK.state.era,'heian');assert.equal(again.w.HK.state.money,300);for(const era of eras)assert.equal(Object.keys(again.w.HK.state.got[era]).length,2);assert(again.w.HK.state.got.edo[old]);
  again.dom.window.close();p.dom.window.close();
});
test('books and timelines show all eighteen cards and never turn approximate dates into precise years',()=>{
  const p=page('index.html');
  for(const era of eras){p.click(`[data-era="${era}"]`);p.click('[data-view="book"]');assert.equal(p.$('bookGrid').querySelectorAll('[data-card]').length,18);assert.equal(p.$('chapterFilter').options.length,4);p.click('[data-view="timeline"]');assert.equal(p.$('timeline').querySelectorAll('.timeline-row').length,18);assert(!p.$('timeline').textContent.match(/-10000|-300|縄文時代年|弥生時代年|古墳時代年/));p.click('[data-view="learn"]');assert(!p.$('qTitle').textContent.match(/^-?\d+ /));if(p.w.HK.records.filter(r=>r.era===era).sort((a,b)=>a.year-b.year)[0].dateLabel)assert.equal(p.$('qYearSuffix').textContent,'');}
  p.dom.window.close();
});
test('the unified buzzer samples ten different eras and finishes ten mixed four-choice questions',()=>{
 const p=page('buzzer.html');p.click('#startBtn');p.time(3000);assert.equal(p.w.HKChallenge.run.group,'v4_allera_ALL_choice');
 assert.equal(p.w.HKChallenge.run.qs.length,10);assert.equal(new Set(p.w.HKChallenge.run.qs.map(q=>q.era)).size,10);assert(p.w.HKChallenge.run.qs.filter(q=>eras.includes(q.era)).length>=2);
 for(let i=0;i<10;i++){p.click('#buzzBtn');const q=p.w.HKChallenge.run.qs[p.w.HKChallenge.qi];assert(!q.prompt.match(/-10000|-300|時代年/));const choices=[...p.$('challengeChoices').querySelectorAll('button')];assert.equal(choices.length,4);assert.equal(new Set(choices.map(b=>Array.from(b.dataset.choice).length)).size,1);choices.find(b=>p.w.HKCore.answerOK(b.dataset.choice,q.answers)).click();if(i<9)p.click('#nextBtn');}
 assert.equal(p.w.HKChallenge.run.correct,10);assert.equal(p.w.HKChallenge.run.phase,'finished');assert.equal(p.$('resultReview').querySelectorAll('details').length,10);p.dom.window.close();
});
test('all-era rush includes the new periods and historic date formatting preserves BCE and approximate labels',()=>{
  const p=page('buzzer.html');p.click('[data-game="rush"]');p.click('#startBtn');p.time(3000);
  for(const era of eras)assert(p.w.HKChallenge.run.qs.some(q=>q.era===era));assert.equal(p.w.HKCore.dateText({year:-900}),'紀元前900年');assert.equal(p.w.HKCore.dateText({year:1008,dateLabel:'11世紀初め'}),'11世紀初め');assert.equal(p.w.HKCore.questionText('-10000 〇〇を使う'),'〇〇を使う');p.dom.window.close();
  const d=new JSDOM(read('ranking.html'));assert.equal(d.window.document.querySelectorAll("select").length,0);assert(d.window.document.querySelector(".rank-explanation").textContent.includes("すべての時代"));d.window.close();
});
console.log(checks+' ancient-era integration checks passed.');

