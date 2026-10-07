const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
function page(seed={}){
 const dom=new JSDOM(read('index.html'),{url:'https://historykids.github.io/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 for(const [key,value] of Object.entries(seed))w.localStorage.setItem(key,value);
 for(const file of ['data/dataset.js','data/ancient.js','data/meiji.js','data/modern.js','assets/ui/core.js','assets/ui/residents.js','assets/ui/wallet.js','assets/ui/app.js'])w.eval(read(file));
 return{dom,w,$:id=>w.document.getElementById(id),click:s=>{const el=w.document.querySelector(s);assert(el,s);el.click();}};
}
test('Meiji has 24 unique dated cards and four equally long choices with the shared online answers',()=>{
 const p=page(),rows=p.w.HK.records.filter(q=>q.era==='meiji');assert.equal(rows.length,24);assert.equal(new Set(rows.map(q=>q.id)).size,24);
 assert.equal(p.w.HKCore.eraOrder.indexOf('meiji'),10);assert.equal(Object.keys(p.w.dataSets.meiji.chapters).length,3);
 for(const q of rows){assert(q.year>=1868&&q.year<=1912);assert(q.source.startsWith('https://'));assert(q.text);assert(!q.title.includes('〇'));const choices=p.w.HKCore.choiceAnswers(q,p.w.HK.records);assert.equal(new Set(choices).size,4);assert(choices.every(a=>[...a].length===[...q.answers.join('・')].length));}
 assert(p.w.HK.records.some(q=>q.era==='meiji'&&q.year===1894&&q.text.includes('1899')),'Treaty signing and implementation must remain distinct');
 execFileSync(process.execPath,['scripts/ranking-questions.cjs'],{cwd:root});p.w.close();
});
test('Meiji learning skips saved cards, pays each new card once and preserves the previous town and collection',()=>{
 const old='1603 〇〇幕府がはじまる',p=page({money_v1:'120',cards_edo_complete_v1:JSON.stringify({[old]:true}),city_v1:JSON.stringify([{id:'old-house',type:'house',x:5,y:5,rot:0}])});
 p.click('[data-era="meiji"]');const rows=p.w.HK.records.filter(q=>q.era==='meiji').sort((a,b)=>a.year-b.year);
 assert.equal(p.$('qTitle').innerHTML,p.w.dataSets.meiji.ruby[rows[0].name]);p.click('#choices [data-answer="'+rows[0].answers[0]+'"]');assert.equal(p.w.HK.state.money,130);
 p.click('#nextBtn');p.click('[data-mode="type"]');p.$('answerInput').value=rows[1].answers[0];p.$('answerForm').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(p.w.HK.state.money,150);
 const seed=Object.fromEntries(Object.keys(p.w.localStorage).map(k=>[k,p.w.localStorage.getItem(k)])),again=page(seed);assert.equal(again.w.HK.state.era,'meiji');assert.equal(again.$('qTitle').innerHTML,again.w.dataSets.meiji.ruby[rows[2].name]);assert(again.w.HK.state.got.edo[old]);assert.equal(again.w.HK.state.city[0].id,'old-house');
 again.click('#collection .history-card.done');again.click('[data-practice]');again.$('answerInput').value=rows[0].answers[0];again.$('answerForm').dispatchEvent(new again.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(again.w.HK.state.money,150);again.w.close();p.w.close();
});
test('Meiji appears in the era picker, card book and chronological timeline',()=>{
 const p=page();assert.equal(p.$('eraTabs').querySelectorAll('button').length,14);p.click('[data-era="meiji"]');p.click('[data-view="book"]');assert.equal(p.$('bookGrid').querySelectorAll('[data-card]').length,24);assert.equal(p.$('chapterFilter').options.length,4);
 p.click('[data-view="timeline"]');assert.equal(p.$('timeline').querySelectorAll('.timeline-row').length,24);assert(p.$('timeline').textContent.includes('1868'));assert(p.$('timeline').textContent.includes('1911'));p.w.close();
});
console.log(checks+' Meiji integration checks passed.');
