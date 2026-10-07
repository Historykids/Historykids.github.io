const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),eras=['taisho','showa','heisei'];let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
function page(file='index.html',seed={}){
 const dom=new JSDOM(read(file),{url:'https://historykids.github.io/'+file,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 let now=0;if(file==='buzzer.html'){Object.defineProperty(w.performance,'now',{value:()=>now});w.setInterval=()=>1;w.clearInterval=()=>{};}
 for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,v);
 for(const p of ['data/dataset.js','data/ancient.js','data/meiji.js','data/modern.js','assets/ui/core.js',...(file==='index.html'?['assets/ui/residents.js','assets/ui/wallet.js','assets/ui/app.js']:['assets/ui/leaderboard.js','assets/ui/challenge.js'])])w.eval(read(p));
 return{w,$:id=>w.document.getElementById(id),click:s=>{const el=w.document.querySelector(s);assert(el,s);el.click();},time:t=>{now=t;w.HKChallenge.tick();}};
}
test('modern periods contain 72 dated cards with complete explanations, ruby and four unpadded equally long choices',()=>{
 const p=page(),bounds={taisho:[1912,1926],showa:[1926,1989],heisei:[1989,2019]};assert.deepEqual(Array.from(p.w.HKCore.eraOrder.slice(-4)),['meiji',...eras]);
 for(const era of eras){const rows=p.w.HK.records.filter(q=>q.era===era);assert.equal(rows.length,24);assert.equal(new Set(rows.map(q=>q.id)).size,24);assert.equal(Object.keys(p.w.dataSets[era].chapters).length,3);
  for(const q of rows){assert(q.year>=bounds[era][0]&&q.year<=bounds[era][1]);assert(q.source.startsWith('https://'));assert(q.text.length>15);assert(!q.title.includes('〇'));assert(p.w.dataSets[era].ruby[q.name].includes('<ruby>'));const choices=p.w.HKCore.choiceAnswers(q,p.w.HK.records);assert.equal(new Set(choices).size,4);assert(choices.every(a=>/^[ぁ-ゖー]+$/.test(a)&&[...a].length===[...q.answers[0]].length));}
 }
 for(const file of ['index.html','buzzer.html']){const html=new JSDOM(read(file)),scripts=[...html.window.document.scripts].map(s=>s.getAttribute('src')||'');assert(scripts.findIndex(s=>s.includes('data/modern.js'))<scripts.findIndex(s=>s.includes('assets/ui/core.js')));assert(scripts.some(s=>s.includes('data/modern.js')));html.window.close();}
 p.w.close();
});
test('modern cards distinguish legislation, enforcement and era transitions',()=>{
 const p=page(),find=(era,answer)=>p.w.HK.records.find(q=>q.era===era&&q.answers.includes(answer));
 assert.equal(find('taisho','のうぜい').year,1925);assert(find('taisho','のうぜい').text.includes('女性にはまだ'));
 assert.equal(find('showa','にほん').year,1933);assert(p.w.HKCore.answerOK('にっぽん',find('showa','にほん').answers));assert(find('showa','にほん').text.includes('1935'));
 assert.equal(find('showa','こくみん').year,1946);assert.equal(find('showa','へいわ').year,1947);
 assert.equal(find('heisei','さいばんいん').year,2009);assert(find('heisei','さいばんいん').text.includes('2004'));
 assert.equal(find('heisei','じゅうはち').year,2016);assert(find('heisei','じゅうはち').text.includes('2015'));
 assert(find('heisei','れいわ').question.includes('4月30日'));assert(find('heisei','れいわ').text.includes('翌5月1日'));p.w.close();
});
test('each modern period appears in its book and timeline and keeps independent learning rewards across a reload',()=>{
 const p=page('index.html',{money_v1:'120',cards_edo_complete_v1:JSON.stringify({'1603 〇〇幕府がはじまる':true})});let money=120;
 for(const era of eras){p.click(`[data-era="${era}"]`);p.click('[data-mode="choice"]');const rows=p.w.HK.records.filter(q=>q.era===era).sort((a,b)=>a.year-b.year);
  assert.equal(p.$('qTitle').innerHTML,p.w.dataSets[era].ruby[rows[0].name]);p.click(`#choices [data-answer="${rows[0].answers[0]}"]`);money+=10;assert.equal(p.w.HK.state.money,money);
  p.click('#nextBtn');p.click('[data-mode="type"]');p.$('answerInput').value=rows[1].answers[0];p.$('answerForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));money+=20;assert.equal(p.w.HK.state.money,money);
  p.click('[data-view="book"]');assert.equal(p.$('bookGrid').querySelectorAll('[data-card]').length,24);assert.equal(p.$('chapterFilter').options.length,4);
  p.click('[data-view="timeline"]');assert.equal(p.$('timeline').querySelectorAll('.timeline-row').length,24);p.click('[data-view="learn"]');
 }
 const saved=Object.fromEntries(Object.keys(p.w.localStorage).map(k=>[k,p.w.localStorage.getItem(k)])),again=page('index.html',saved);assert.equal(again.w.HK.state.money,210);assert(again.w.HK.state.got.edo['1603 〇〇幕府がはじまる']);
 for(const era of eras){const rows=again.w.HK.records.filter(q=>q.era===era).sort((a,b)=>a.year-b.year);again.click(`[data-era="${era}"]`);assert.equal(again.$('qTitle').innerHTML,again.w.dataSets[era].ruby[rows[2].name]);assert.equal(Object.keys(again.w.HK.state.got[era]).length,2);}
 again.w.close();p.w.close();
});
test('buzzer practice includes all 72 modern cards with the same four-choice answers',()=>{
 const p=page('buzzer.html');p.click('[data-game="rush"]');p.click('#startBtn');p.time(3000);const questions=p.w.HKChallenge.run.qs;
 for(const era of eras)assert.equal(questions.filter(q=>q.era===era).length,24);
 for(const q of questions.filter(q=>eras.includes(q.era))){const choices=p.w.HKCore.choiceAnswers(q,questions);assert.equal(new Set(choices).size,4);assert(choices.some(a=>p.w.HKCore.answerOK(a,q.answers)));}
 p.w.close();
});
console.log(checks+' modern-period integration checks passed.');
