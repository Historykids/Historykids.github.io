(function(){
 'use strict';
 const $=id=>document.getElementById(id),R=window.HKSengokuRules,A=window.HKCommunity;if(!R||!A||!$('sgCampaign'))return;
 const keys=R.keys,fmt=n=>Number(n||0).toLocaleString('ja-JP'),short=n=>n>=100000000?(n/100000000).toFixed(n%100000000?1:0)+'億':n>=100000?(n/10000).toFixed(n%10000?1:0)+'万':fmt(n);
 const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const messages={'sengoku-input':'入力した内容を確認してください。','sengoku-conflict':'別の画面で進行が更新されました。最新の状態を読み込みます。','sengoku-request':'前の操作と内容が変わっています。最新の状態を確認してください。','sengoku-food':'兵糧が足りません。無料の軍事訓練で増やそう。','sengoku-merit':'軍功が足りません。軍事訓練や合戦で増やそう。','sengoku-capacity':'兵の上限を超えています。武将や本拠城を育てよう。','sengoku-route':'進軍路がつながっていません。マップで出陣できる地域を選んでね。','sengoku-formation':'部隊の人数を確認してください。総兵力と出陣上限の範囲で編成できます。','sengoku-pending':'途中の合戦・訓練を先に終えてください。','sengoku-battle':'合戦の状態が変わりました。最新の進行を読み込みます。','sengoku-phase':'問題が進んでいます。最新の進行を読み込みます。','sengoku-port':'港の開放には3地域の支配と本拠城Lv.2が必要です。','sengoku-general':'その武将はまだ仲間になっていないか、上限に達しています。','sengoku-account':'ランキングへの参加にはログインしてください。','sengoku-max':'本拠城は最大レベルです。','sengoku-unfinished':'47地域を制覇すると、次の周回を始められます。','sengoku-not-started':'まずは勢力を選んでね。','account-session-expired':'ログイン期限が切れました。アカウントページでログインすると続きを遊べます。','account-changed':'アカウントが切り替わりました。ページを読み直してください。','banned':'このアカウントでは参加できません。','nickname-blocked':'このアカウント名ではランキングに参加できません。'};
 let data=null,ownerKey=null,token='',epoch=0,busy=false,connected=false,pendingAction=null,tab='map',selected=null,planned=null,formationDraft=null,tactic='balanced',period='alltime',boardRun=0,mapReady=false,dbPromise=null,cacheQueue=Promise.resolve(),cachedOnly=false,profileChanged=false,resultDismissed=null,mapZoom=1;
 const state=()=>data?.state,identity=()=>{try{return A.identity(false);}catch{return '';}};
 function status(text,error=false){$('sgStatus').textContent=text;const bar=$('sgStatus').closest('.status-bar');bar.classList.toggle('error',error);}
 const errorText=e=>messages[e?.message]||A.errorText(e);
 function mutationButton(label,fn,disabled=false,cls='secondary'){
  const b=node('button',cls,label);b.type='button';b.dataset.mutation='true';b.dataset.unavailable=String(disabled);b.onclick=fn;return b;
 }
 function controls(){
  const blocked=busy||!connected||!!pendingAction||profileChanged;
  document.querySelectorAll('[data-mutation]').forEach(b=>{b.disabled=blocked||b.dataset.unavailable==='true';});
  for(const id of ['sgBattleStart','sgTrain','sgFortify','sgUnlockPort','sgNext','sgRetreatCommit'])$(id).disabled=blocked||$(id).dataset.unavailable==='true';
  $('sgPublish').disabled=busy||profileChanged||!!state()?.published||(data?.account.signedIn&&(!connected||!!pendingAction));
  $('sgBattleForm').querySelectorAll('input').forEach(e=>{e.disabled=blocked;});$('sgRefresh').disabled=busy;$('sgRetry').hidden=!pendingAction;$('sgRetry').disabled=busy||profileChanged;
 }
 function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((yes,no)=>{if(!window.indexedDB){no(Error('indexeddb'));return;}const request=indexedDB.open('historykids-sengoku-v1',1),timer=setTimeout(()=>no(Error('indexeddb-timeout')),1500);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('campaigns'))request.result.createObjectStore('campaigns',{keyPath:'owner'});};request.onsuccess=()=>{clearTimeout(timer);yes(request.result);};request.onerror=request.onblocked=()=>{clearTimeout(timer);no(Error('indexeddb'));};
  });return dbPromise;
 }
 async function cacheGet(key){
  if(!key)return null;try{const db=await openDB();return await new Promise((yes,no)=>{const t=db.transaction('campaigns','readonly'),r=t.objectStore('campaigns').get(key);r.onsuccess=()=>yes(r.result||null);r.onerror=()=>no(Error('indexeddb'));});}catch{try{return JSON.parse(localStorage.getItem('hk_sengoku_cache_v1_'+key)||'null');}catch{return null;}}
 }
 function cachePut(){
  if(!ownerKey)return Promise.resolve();const snapshot={owner:ownerKey,response:data,action:pendingAction},key=ownerKey;
  cacheQueue=cacheQueue.catch(()=>{}).then(async()=>{try{const db=await openDB();await new Promise((yes,no)=>{const t=db.transaction('campaigns','readwrite');t.objectStore('campaigns').put(snapshot);t.oncomplete=()=>yes();t.onerror=t.onabort=()=>no(Error('indexeddb'));});}catch{try{localStorage.setItem('hk_sengoku_cache_v1_'+key,JSON.stringify(snapshot));}catch{if(key===ownerKey)$('sgSaveStatus').textContent='サーバーに保存済み';}}});return cacheQueue;
 }
 async function keyFor(currentToken){const meta=window.HKAccountSync?.meta();if(meta?.owner)return meta.owner;try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(currentToken))),b=>b.toString(16).padStart(2,'0')).join('');}catch{return null;}}
 function syncCards(s){
  try{window.HKAccountSync?.assertActive();let changed=false;for(const era of ['sengoku','muromachi']){const key='cards_'+era+'_complete_v1',cards=JSON.parse(localStorage.getItem(key)||'{}');if(!cards||Array.isArray(cards)||typeof cards!=='object')continue;
   let update=false;for(const id of s.learnedCards){if(id.startsWith(era+'|')&&!cards[id.slice(era.length+1)]){cards[id.slice(era.length+1)]=true;update=true;}}
   if(update){localStorage.setItem(key,JSON.stringify(cards));changed=true;}}
   if(changed)window.dispatchEvent(new CustomEvent('hk-progress-change',{detail:{source:'sengoku'}}));
  }catch{$('sgSaveStatus').textContent='カードの保存設定を確認してください';}
 }
 function accept(value,sequence,verified=true){
  if(sequence!==epoch||identity()!==token||profileChanged)return false;
  if(value.protocol!=='sengoku-v1'||!Number.isSafeInteger(value.revision)||value.state&&!Array.isArray(value.state.ownedRegions))throw Error('connection');
  if(data&&!cachedOnly&&value.revision<data.revision)return false;data=value;ownerKey=value.owner||ownerKey;cachedOnly=!verified;
  if(verified&&value.state)syncCards(value.state);if(!selected||!R.region(selected))selected=value.state?.capital||'23';
  if(value.state){formationDraft=R.formation(value.state);if(planned&&!R.reachable(value.state,planned))planned=null;}
  render();return true;
 }
 async function load({recover=true}={}){
  if(busy||profileChanged)return;const sequence=epoch,current=token;
  try{const value=await A.request('/wealth/sengoku',undefined,false);if(sequence!==epoch||identity()!==current)return;connected=true;if(accept(value,sequence)){await cachePut();status('進行は自動保存されています。好きなところで、ひと休みできます。');}
   if(recover&&pendingAction){await execute(pendingAction,true);return;}
  }catch(e){if(sequence===epoch){connected=false;status(errorText(e),true);$('sgSaveStatus').textContent=state()?'保存した進行を表示中':'接続待ち';}}
  finally{controls();}
 }
 async function execute(payload,retry=false){
  if(busy||profileChanged)return;const sequence=epoch,current=token;
  try{window.HKAccountSync?.assertActive();}catch(e){status(errorText(e),true);return;}
  busy=true;pendingAction=payload;controls();await cachePut();status(retry?'同じ操作を確認しています。':'進行を保存しています。');
  try{
   const value=await A.request('/wealth/sengoku/action',payload,false);if(sequence!==epoch||identity()!==current)return;connected=true;accept(value,sequence);pendingAction=null;await cachePut();
   $('sgSaveStatus').textContent='自動保存済み';status(value.replayed?'保存済みの操作を復元しました。':'進行を保存しました。');
   if(payload.type==='start'||payload.type==='campaign'){selected=state().capital;planned=null;setTab('map',true);}
   else if(['begin','answer','next','retreat'].includes(payload.type)){setTab('battle');if(payload.type==='begin')$('sgQuiz').scrollIntoView({behavior:'smooth',block:'start'});}
   if(payload.type==='publish')loadBoard();
  }catch(e){if(sequence!==epoch||identity()!==current)return;
   if(e.message.startsWith('sengoku-')||['nickname-blocked','banned','account-session-expired'].includes(e.message)){
    pendingAction=null;await cachePut();status(errorText(e),true);
    if(['sengoku-conflict','sengoku-battle','sengoku-phase','sengoku-started'].includes(e.message)){busy=false;await load({recover:false});status(errorText(e),true);}
    if(e.message==='account-session-expired'){connected=false;}
   }else{connected=false;status('通信を確認できません。同じ操作を再試行すると、保存済みの結果を確認できます。',true);}
  }finally{if(sequence===epoch){busy=false;controls();}}
 }
 function act(type,extra={}){if(busy||pendingAction||!connected||profileChanged)return;execute({type,...extra,revision:data?.revision||0,requestId:uuid()});}
 function setTab(name,scroll=false){tab=name;for(const key of ['map','battle','camp','board']){$('sgView-'+key).hidden=key!==name;const b=$('sgTab-'+key);b.classList.toggle('active',key===name);if(key===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}if(name==='board')loadBoard();if(scroll)$('sgView-'+name).scrollIntoView({behavior:'smooth',block:'start'});}
 function renderFactions(){
  $('sgFactions').replaceChildren(...R.factions.map(f=>{const g=R.generals[f.general],b=mutationButton('',()=>act('start',{factionId:f.id}),false,'faction-choice');b.style.setProperty('--choice-color',f.color);b.append(node('span','faction-mark',f.crest),node('span','faction-place',f.place),node('h3','',g.name),node('p','',f.description),node('strong','',g.description),node('span','choose-arrow','→'));b.setAttribute('aria-label',g.name+'で始める');return b;}));
 }
 function render(){
  const s=state();$('sgWelcome').hidden=!!s;$('sgCampaign').hidden=!s;if(!s){renderFactions();controls();return;}
  const f=R.faction(s.factionId),g=R.active(s);document.documentElement.style.setProperty('--faction',f.color);document.body.classList.toggle('golden-banner',s.claimedRewards.includes('golden-banner'));
  $('sgCrest').textContent=f.crest;$('sgFactionMotto').textContent=f.motto;$('sgFactionName').textContent=f.name;$('sgGeneralSummary').textContent=R.generals[g.id].name+' Lv.'+g.level;
  $('sgOwned').textContent=s.ownedRegions.length;$('sgArmy').textContent=short(R.troops(s.army));$('sgMerit').textContent=short(s.resources.militaryMerit);$('sgFood').textContent=short(s.resources.food);
  $('sgProgress').setAttribute('aria-valuenow',s.ownedRegions.length);$('sgProgress').firstElementChild.style.width=(s.ownedRegions.length/47*100)+'%';$('sgProgressText').textContent=s.ownedRegions.length===47?'天下統一、成る。':'天下統一への道';$('sgCycle').textContent=(s.unifications+(s.ownedRegions.length===47?0:1))+'周目';
  const options=R.regions.map(r=>{const e=node('option','',r.name+(s.ownedRegions.includes(r.id)?' · 自国':R.reachable(s,r.id)?' · 出陣可':''));e.value=r.id;return e;});$('sgRegionSelect').replaceChildren(...options);$('sgRegionSelect').value=selected;
  renderMap();renderRegion();renderFrontiers();renderPrep();renderQuiz();renderCamp();
  if(s.pending)tab='battle';setTabDisplay();$('sgPublish').textContent=s.published?'参加中・成績は自動更新':data.account.signedIn?'アカウント名でランキングに参加':'ログインしてランキングに参加';$('sgPublish').disabled=!!s.published||busy;
  $('sgSaveStatus').textContent=cachedOnly?'端末に保存した進行':'自動保存済み';controls();
 }
 function setTabDisplay(){for(const key of ['map','battle','camp','board']){$('sgView-'+key).hidden=key!==tab;const b=$('sgTab-'+key);b.classList.toggle('active',key===tab);if(key===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}}
 function selectRegion(id){selected=id;$('sgRegionSelect').value=id;renderMap();renderRegion();controls();}
 function renderMap(){
  const s=state();if(!mapReady||!s)return;$('sgPortBadge').textContent=s.port?'港 開放済み':'港 未開放';
  $('sgMap').querySelectorAll('path[data-code]').forEach(p=>{const id=p.dataset.code.padStart(2,'0'),r=R.region(id),owned=s.ownedRegions.includes(id),frontier=R.reachable(s,id);p.setAttribute('class',[owned?'owned':frontier?'frontier':'',selected===id?'selected':''].filter(Boolean).join(' '));p.setAttribute('aria-label',r.name+' · '+(owned?'自国':frontier?'出陣できる地域':'未攻略'));p.setAttribute('aria-pressed',String(selected===id));});
  $('sgMap').querySelectorAll('text[data-region-label]').forEach(e=>e.classList.toggle('owned-label',s.ownedRegions.includes(e.dataset.regionLabel)));
 }
 async function loadMap(){
  try{const response=await fetch('./assets/maps/japan-prefectures.svg');if(!response.ok)throw Error('map-http');const doc=new DOMParser().parseFromString(await response.text(),'image/svg+xml'),svg=doc.documentElement;
   const sourcePaths=[...svg.querySelectorAll('path[data-code]')],ids=sourcePaths.map(p=>p.getAttribute('data-code').padStart(2,'0'));
   if(svg.localName!=='svg'||sourcePaths.length!==47||new Set(ids).size!==47||ids.some(id=>!R.region(id)))throw Error('map-format');
   // Copy geometry only. Never insert executable nodes/attributes from an SVG response.
   const imported=document.createElementNS('http://www.w3.org/2000/svg','svg');imported.setAttribute('viewBox','0 0 2000 2000');imported.setAttribute('role','group');imported.setAttribute('aria-label','現代の47都道府県を使った全国マップ');
   for(const original of sourcePaths){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',original.getAttribute('d')||'');path.dataset.code=original.getAttribute('data-code');imported.append(path);}
   $('sgMap').replaceChildren(imported);
   const centers=new Map();imported.querySelectorAll('path[data-code]').forEach(p=>{const id=p.dataset.code.padStart(2,'0');p.setAttribute('role','button');p.setAttribute('tabindex','0');p.onclick=()=>selectRegion(id);p.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();selectRegion(id);}};
    try{const box=p.getBBox(),x=box.x+box.width/2,y=box.y+box.height/2;centers.set(id,{x,y});const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',x);text.setAttribute('y',y);text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','central');text.dataset.regionLabel=id;text.textContent=R.region(id).name;imported.append(text);}catch{}
   });
   for(const route of R.routes.filter(r=>r.sea)){const a=centers.get(route.ends[0]),b=centers.get(route.ends[1]);if(!a||!b)continue;const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('class','sea-line');imported.prepend(line);}
   mapReady=true;zoomMap(1);renderMap();
  }catch(error){console.warn('Sengoku map unavailable',error);$('sgMap').textContent='地図を表示できません。上の「地域を選ぶ」と下の城一覧からも出陣できます。';}
 }
 function renderRegion(){
  const s=state(),r=R.region(selected),owned=s.ownedRegions.includes(selected),can=R.reachable(s,selected),e=R.enemy(s,selected),panel=$('sgRegionInfo');
  const tag=node('span','region-status',owned?'自国領':can?'出陣できる地域':'未攻略'),castle=node('p','castle-name',r.castle),crest=node('span','region-crest',owned?R.faction(s.factionId).crest:'城');crest.setAttribute('aria-hidden','true');
  const details=node('dl','region-details'),leader=Object.values(R.generals).find(g=>g.region===r.id);
  const rows=owned?[['領土','あなたの勢力'],['本拠城',s.capital===r.id?'ここが本拠':'攻略済み'],['進軍路','隣の地域へ']]:[['守備隊',leader?leader.name+'（創作配置）':'城の守備隊'],['守備兵力',fmt(e.army)+'人'],['城レベル','Lv.'+e.level],['守備兵種',R.units[e.unit].name],['初回攻略','軍功'+e.reward]];
  for(const [label,value]of rows){const row=node('div');row.append(node('dt','',label),node('dd','',value));details.append(row);}
  const hint=node('p','muted',owned?'この地域と進軍路がつながる城へ進めます。':can?'部隊と作戦を選んで出陣しよう。正解数が戦力を押し上げます。':'自国につながる進軍路が必要です。海路は港を開放すると使えます。');
  const action=mutationButton(owned?'武将・城を育てる':can?'この城へ出陣':'進軍路がつながっていません',()=>owned?setTab('camp',true):plan(selected),!owned&&!can||!!s.pending,'primary');panel.replaceChildren(tag,node('h3','',r.name),castle,crest,details,hint,action);
 }
 function renderFrontiers(){const s=state(),front=R.regions.filter(r=>R.reachable(s,r.id));$('sgFrontiers').replaceChildren(...front.map(r=>{const b=node('button','',r.castle);b.type='button';b.append(node('span','',r.name+' · '+fmt(R.enemy(s,r.id).army)+'人'));b.onclick=()=>{selectRegion(r.id);$('sgRegionInfo').scrollIntoView({behavior:'smooth',block:'nearest'});};return b;}));if(!front.length)$('sgFrontiers').append(node('p','muted',s.ownedRegions.length===47?'全国制覇を達成しました。次の周回も、いつでも始められます。':'港を開放すると、新しい海路がつながります。'));}
 function plan(id){if(!state()||!R.reachable(state(),id))return;planned=id;selected=id;formationDraft=R.formation(state());tactic='balanced';resultDismissed=state().lastResult?.id||null;renderPrep();renderQuiz();setTab('battle');$('sgBattlePrep').scrollIntoView({behavior:'smooth',block:'start'});controls();}
 function readFormation(){return Object.fromEntries(keys.map(k=>[k,Number($('sgTroops-'+k)?.value||0)]));}
 function updateEstimate(){
  const s=state();if(!s)return;formationDraft=readFormation();tactic=$('sgBattleForm').querySelector('input[name=tactic]:checked')?.value||'balanced';const valid=!!planned&&R.reachable(s,planned)&&R.validFormation(s,formationDraft),e=planned?R.enemy(s,planned):null;
  $('sgPower0').textContent=valid?fmt(R.power(s,formationDraft,tactic,0,planned)):'—';$('sgPower5').textContent=valid?fmt(R.power(s,formationDraft,tactic,5,planned)):'—';$('sgEnemyPower').textContent=e?fmt(e.army):'—';
  const cost=valid?R.foodCost(s,formationDraft,tactic):0;$('sgBattleCost').textContent=valid?'出陣に使う兵糧 '+fmt(cost)+' ／ 所持 '+fmt(s.resources.food):'マップで出陣先を選び、人数を出陣上限の範囲で編成してください。';
  $('sgBattleStart').dataset.unavailable=String(!valid||s.resources.food<cost||!!s.pending);controls();
 }
 function renderPrep(){
  const s=state();$('sgTargetTitle').textContent=planned?R.region(planned).castle+'へ出陣':'マップで出陣先を選ぼう';$('sgTargetHint').textContent=planned?R.region(planned).name+' ／ 守備兵種 '+R.units[R.region(planned).unit].name:'軍事訓練は、いつでも兵糧なしで挑戦できます。';
  formationDraft||=R.formation(s);$('sgFormation').replaceChildren(...keys.map(k=>{const u=R.units[k],label=node('label','',u.name),input=node('input');input.type='number';input.min='0';input.max=s.army[k];input.step='1';input.inputMode='numeric';input.id='sgTroops-'+k;input.value=formationDraft[k];input.oninput=updateEstimate;label.htmlFor=input.id;label.append(input,node('span','', '所持 '+fmt(s.army[k])+'人'));return label;}));
  $('sgTactics').replaceChildren(...Object.entries(R.tactics).map(([id,t])=>{const label=node('label','tactic-card'),input=node('input');input.type='radio';input.name='tactic';input.value=id;input.checked=tactic===id;input.onchange=updateEstimate;label.append(input,document.createTextNode(t.name),node('span','',t.description));return label;}));
  $('sgFormationNote').textContent='出陣上限 '+fmt(R.capacity(s))+'人。0人にした兵種は待機します。';$('sgTrain').dataset.unavailable=String(!!s.pending);updateEstimate();
 }
 function renderQuiz(){
  const s=state(),p=s.pending;$('sgQuiz').hidden=!p;const showResult=!!s.lastResult&&s.lastResult.id!==resultDismissed;$('sgBattlePrep').hidden=!!p||showResult;$('sgResult').hidden=!!p||!showResult;$('sgRetreatConfirm').hidden=true;
  if(!p){if(showResult)renderResult(s.lastResult);return;}
  $('sgQuizFlag').textContent=R.faction(s.factionId).crest;$('sgQuizContext').textContent=p.mode==='training'?'軍事訓練':R.region(p.target).castle+'の合戦';$('sgQuizCounter').textContent=(p.index+1)+' / 5';
  $('sgQuizSteps').replaceChildren(...Array.from({length:5},(_,i)=>node('span',i<p.index?'done':i===p.index?'current':'')));$('sgQuizBoost').textContent='現在 '+p.correct+'問正解 · 合戦の戦力＋'+p.correct*10+'%';
  $('sgFeedback').hidden=p.phase!=='review';$('sgAnswers').hidden=p.phase!=='question';$('sgQuestion').textContent=p.question?.prompt||p.feedback.prompt;
  if(p.phase==='question'){$('sgAnswers').replaceChildren(...p.question.choices.map((text,index)=>{const b=mutationButton('',()=>act('answer',{battleId:p.id,index:p.index,choice:index}),false,'');b.append(node('span','',String.fromCharCode(65+index)),document.createTextNode(text));b.setAttribute('aria-label',String.fromCharCode(65+index)+' '+text);return b;}));}
  else{const f=p.feedback;$('sgFeedback').classList.toggle('wrong',!f.correct);$('sgFeedbackVerdict').textContent=f.correct?'正解。その知識が、軍を支える。':'ここで覚えて、次の一手へ。';$('sgCorrectAnswer').textContent=f.correctText;$('sgExplanation').textContent=f.explanation;$('sgQuestionSource').hidden=!f.source;if(f.source)$('sgQuestionSource').href=f.source;}
 }
 function renderResult(result){
  const s=state(),box=$('sgResult'),victory=result.outcome==='victory',training=result.outcome==='training',retreat=result.outcome==='retreat',unified=victory&&s.ownedRegions.length===47;box.className='result-panel'+(victory?' victory':'');
  const title=unified?'天下統一、ここに成る。':victory?R.region(result.target).castle+'を攻略。':training?'訓練を終え、軍は育つ。':retreat?'次の戦いに、力を蓄える。':'この一戦が、次への糧になる。';
  const seal=node('span','result-seal',unified?'統':victory?'勝':training?'学':retreat?'帰':'再');seal.setAttribute('aria-hidden','true');
  const desc=node('p','',retreat?'途中の問題は、次の挑戦で生かそう。':training?'正解した知識と、新しい兵が仲間に加わりました。':victory?'新たな一城が、あなたの勢力に加わりました。':'領土・武将・兵士はそのまま。軍隊を育てて、もう一度挑もう。');
  const stats=node('div','result-stats');for(const [label,value]of [['正答',result.correct+' / 5'],...(result.mode==='battle'&&!retreat?[['自軍戦力',fmt(result.attack)],['敵戦力',fmt(result.defense)]]:[]),['支配地域',s.ownedRegions.length+' / 47']]){const el=node('div','',label);el.append(node('strong','',value));stats.append(el);}
  const rewards=node('div','result-rewards');rewards.append(node('span','', '軍功 ＋'+fmt(result.merit)),node('span','', '兵糧 ＋'+fmt(result.food)));if(result.spentFood)rewards.append(node('span','', '出陣時 −'+fmt(result.spentFood)));if(result.added)rewards.append(node('span','', '足軽 ＋'+result.added+'人'));
  for(const id of result.unlocked)rewards.append(node('span','',R.generals[id]?R.generals[id].name+'が加入':id==='golden-banner'?'金の軍旗を獲得':'天下統一城を獲得'));
  const actions=node('div','result-actions'),map=node('button','secondary','全国マップへ');map.type='button';map.onclick=()=>setTab('map',true);actions.append(map);
  if(unified){const castle=node('a','primary','天下統一城を町に置く');castle.href='./#town';actions.append(castle);const next=mutationButton('次の周回を始める',()=>showCampaignChoices(),false,'primary');actions.append(next);}
  else{const train=mutationButton('もう一度、軍事訓練',()=>act('begin',{mode:'training'}));actions.append(train);if(result.target&&R.reachable(s,result.target)){const again=node('button','primary','編成を見直して再出陣');again.type='button';again.onclick=()=>{plan(result.target);};actions.append(again);}}
  const review=node('details','answer-review');review.append(node('summary','', '5問の答えと解説を見る'));
  for(const f of result.review){const row=node('article');row.append(node('h4','',(f.correct?'○ ':'× ')+f.prompt),node('p','', 'あなたの回答：'+f.chosen+' ／ 正解：'+f.correctText),node('p','',f.explanation));if(f.source){const link=node('a','', '資料を読む ↗');link.href=f.source;link.target='_blank';link.rel='noopener';row.append(link);}review.append(row);}
  box.replaceChildren(seal,node('h3','',title),desc,stats,rewards,actions,review);
 }
 function showCampaignChoices(){
  const box=$('sgResult'),section=node('div','campaign-next');section.append(node('h3','', '次の周回の勢力を選ぶ'),node('p','muted','武将・軍勢・城・資源・獲得報酬を引き継ぎ、敵が強くなった47地域へ。現在の領土は選んだ本拠の1地域からになります。'));
  for(const f of R.factions)section.append(mutationButton(f.name+'で次の周回へ',()=>act('campaign',{factionId:f.id}),false,'secondary'));box.replaceChildren(section);controls();
 }
 function renderCamp(){
  const s=state(),locked=!!s.pending;$('sgCapacity').textContent='出陣上限 '+fmt(R.capacity(s))+'人';
  $('sgGenerals').replaceChildren(...Object.entries(R.generals).map(([id,g])=>{const own=s.generals.find(a=>a.id===id),active=s.activeGeneral===id,card=node('article','general-card'+(active?' active':own?'':' locked'));card.append(node('span','general-mark',own?g.mark:'鍵'),node('small','',own?'Lv.'+own.level+(active?' · 出陣武将':''):'未加入'),node('h3','',g.name),node('p','',g.description));
   if(own){const bar=node('div','experience'),fill=node('span');fill.style.width=(own.level===20?100:own.experience/(own.level*100)*100)+'%';bar.append(fill);card.append(bar,node('small','',own.level===20?'最大レベル':'経験 '+own.experience+' / '+own.level*100));card.append(mutationButton(active?'出陣中':'出陣武将にする',()=>act('commander',{generalId:id}),active||locked),mutationButton(own.level>=20?'鍛錬完了':'鍛錬 · 軍功'+own.level*80,()=>act('upgrade',{generalId:id}),own.level>=20||s.resources.militaryMerit<own.level*80||locked));}
   else card.append(node('p','',g.milestone?g.milestone+'地域を支配すると加入':R.region(g.region).name+'の城を攻略すると加入'));return card;}));
  $('sgRecruitment').replaceChildren(...keys.map(k=>{const u=R.units[k],card=node('article','recruit-card'),label=node('label','', '募兵数'),select=node('select'),action=mutationButton('',()=>act('recruit',{unit:k,count:Number(select.value)}),false,'secondary');select.id='sgRecruit-'+k;label.htmlFor=select.id;select.setAttribute('aria-label',u.name+'の募兵数');for(const amount of [50,100,500,1000]){const o=node('option','',fmt(amount)+'人');o.value=amount;select.append(o);}select.value=100;
   const update=()=>{const amount=Number(select.value),cost=Math.ceil(amount*u.cost/100);action.textContent='兵糧'+cost+'で募る';action.dataset.unavailable=String(locked||R.troops(s.army)+amount>R.capacity(s)||s.resources.food<cost);controls();};select.onchange=update;
   label.append(select);card.append(node('span','unit-symbol',u.icon),node('h3','',u.name),node('strong','',fmt(s.army[k])+'人'),node('p','',R.units[u.strong].name+'に強く、'+R.units[u.weak].name+'に弱い。'),label,action);update();return card;}));
  $('sgFortTitle').textContent=R.region(s.capital).castle+' Lv.'+s.fortLevel;$('sgFortCost').textContent=s.fortLevel>=10?'本拠城は最大レベルです。':'強化費：軍功'+s.fortLevel*120+'・兵糧'+s.fortLevel*50;$('sgFortify').dataset.unavailable=String(locked||s.fortLevel>=10||s.resources.militaryMerit<s.fortLevel*120||s.resources.food<s.fortLevel*50);
  $('sgPortCost').textContent=s.port?'港は開放済み。海を越える進軍路が使えます。':'開放費：軍功150・兵糧100 ／ 3地域支配・本拠Lv.2';$('sgUnlockPort').textContent=s.port?'港は開放済み':'港を開放';$('sgUnlockPort').dataset.unavailable=String(locked||s.port||s.ownedRegions.length<3||s.fortLevel<2||s.resources.militaryMerit<150||s.resources.food<100);
  const reward=$('sgReward'),earned=s.claimedRewards.includes('unification-castle'),copy=node('div');reward.className='reward-panel'+(earned?'':' locked');copy.append(node('p','eyebrow',earned?'PERMANENT REWARD':'THE CONQUEROR’S REWARD'),node('h3','',earned?'天下人の証を、あなたの町へ。':'四十七の地の先に、特別な一城。'),node('p','',earned?'天下統一城は永久保有。町づくりショップの特別報酬から、無料で1城を設置できます。削除後の再配置も可能です。':'47地域を制覇すると、金色の屋根と軍旗を持つ「天下統一城」が町に設置できるようになります。通常販売はありません。'));if(earned){const link=node('a','', 'わたしの町へ →');link.href='./#town';copy.append(link);}reward.replaceChildren(node('span','building-mark',earned?'統':'城'),copy);
 }
 async function loadBoard(){
  const run=++boardRun,sequence=epoch,current=token;$('sgBoardStatus').textContent='順位を読み込んでいます。';$('sgBoardAll').setAttribute('aria-pressed',String(period==='alltime'));$('sgBoardWeek').setAttribute('aria-pressed',String(period==='weekly'));
  try{const board=await A.request('/wealth/sengoku/board?period='+period,undefined,false);if(run!==boardRun||sequence!==epoch||identity()!==current)return;
   const columns=period==='weekly'?['順位','武将名','今週の軍功','最多制覇','天下統一']:['順位','武将名','最多制覇','倒した敵将','累計軍功','天下統一'];const tr=node('tr');for(const label of columns){const th=node('th','',label);th.scope='col';tr.append(th);}$('sgBoardHead').replaceChildren(tr);
   $('sgBoardRows').replaceChildren(...board.entries.map(r=>{const row=node('tr',r.id===board.own?.id?'own':'');const values=period==='weekly'?[r.rank,r.name,fmt(r.weekMerit),r.territories+' / 47',r.unifications+'回']:[r.rank,r.name,r.territories+' / 47',r.defeated+'人',fmt(r.merit),r.unifications+'回'];values.forEach((value,i)=>{const td=node('td');if(i===2)td.append(node('strong','',String(value)));else td.textContent=value;row.append(td);});return row;}));
   $('sgBoardStatus').textContent=board.entries.length?board.total+'人の戦績':'まだ記録がありません。最初の天下人を目指そう。';$('sgOwnRank').textContent=board.own?'あなたの順位 '+board.own.rank+'位 · '+board.own.name:'';
   $('sgBoardInfo').textContent=period==='weekly'?'今週獲得した軍功の順。同点は先に達成した人が上位。月曜日0:00（日本時間）に新しい大会へ。':'最多制覇地域数 → 倒した地域の敵将数 → 累計獲得軍功 → 達成日時の順です。';
  }catch(e){if(run===boardRun&&sequence===epoch)$('sgBoardStatus').textContent=errorText(e);}
 }
 for(const b of document.querySelectorAll('[data-sg-tab]'))b.onclick=()=>setTab(b.dataset.sgTab,true);
 function zoomMap(value){mapZoom=Math.min(3,Math.max(1,value));const svg=$('sgMap').querySelector('svg');if(!svg)return;svg.style.width=mapZoom*100+'%';svg.style.height=mapZoom*100+'%';if(mapZoom===1){$('sgMap').scrollLeft=0;$('sgMap').scrollTop=0;}$('sgMapZoomOut').disabled=mapZoom===1;$('sgMapZoomIn').disabled=mapZoom===3;}
 $('sgMapZoomIn').onclick=()=>zoomMap(mapZoom+.5);$('sgMapZoomOut').onclick=()=>zoomMap(mapZoom-.5);$('sgMapZoomReset').onclick=()=>zoomMap(1);
 $('sgRegionSelect').onchange=()=>selectRegion($('sgRegionSelect').value);$('sgTrain').onclick=()=>act('begin',{mode:'training'});
 $('sgBattleForm').onsubmit=e=>{e.preventDefault();act('begin',{mode:'battle',target:planned,formation:readFormation(),tactic:$('sgBattleForm').querySelector('input[name=tactic]:checked')?.value||'balanced'});};
 $('sgAutoFormation').onclick=()=>{formationDraft=R.formation(state());renderPrep();};$('sgFortify').onclick=()=>act('fortify');$('sgUnlockPort').onclick=()=>act('port');
 $('sgNext').onclick=()=>{const p=state()?.pending;if(!p)return;act('next',{battleId:p.id,index:p.index});};$('sgRetreat').onclick=()=>{$('sgRetreatConfirm').hidden=false;};$('sgRetreatCancel').onclick=()=>{$('sgRetreatConfirm').hidden=true;};$('sgRetreatCommit').onclick=()=>{const p=state()?.pending;if(p)act('retreat',{battleId:p.id});};
 $('sgRefresh').onclick=()=>{if(profileChanged){location.reload();return;}load();if(tab==='board')loadBoard();};$('sgRetry').onclick=()=>pendingAction&&execute(pendingAction,true);
 $('sgBoardAll').onclick=()=>{period='alltime';loadBoard();};$('sgBoardWeek').onclick=()=>{period='weekly';loadBoard();};$('sgBoardRefresh').onclick=loadBoard;$('sgPublish').onclick=()=>{if(!data?.account.signedIn){location.href='./account.html';return;}act('publish');};
 function changed(){epoch++;boardRun++;connected=false;busy=false;data=null;pendingAction=null;ownerKey=null;profileChanged=true;$('sgCampaign').hidden=true;$('sgWelcome').hidden=true;$('sgRegionInfo').replaceChildren();$('sgGenerals').replaceChildren();$('sgBoardRows').replaceChildren();$('sgResult').replaceChildren();$('sgAnswers').replaceChildren();$('sgQuestion').textContent='';$('sgCorrectAnswer').textContent='';$('sgExplanation').textContent='';
  for(const id of ['sgRecruitment','sgFormation','sgTactics','sgFrontiers','sgReward'])$(id).replaceChildren();
  for(const id of ['sgFactionName','sgFactionMotto','sgGeneralSummary','sgQuizContext','sgFeedbackVerdict','sgOwnRank','sgFortTitle','sgFortCost','sgPortCost'])$(id).textContent='';
  for(const id of ['sgOwned','sgArmy','sgMerit','sgFood','sgPower0','sgPower5','sgEnemyPower'])$(id).textContent='—';
  document.body.classList.remove('golden-banner');$('sgMap').querySelectorAll('path[data-code]').forEach(p=>{p.removeAttribute('class');p.setAttribute('aria-pressed','false');p.setAttribute('aria-label',R.region(p.dataset.code.padStart(2,'0')).name);});
  status('アカウントが切り替わりました。「再接続・更新」でページを読み直してください。',true);controls();}
 window.addEventListener('storage',e=>{if(e.key==='hk_wealth_identity_v1'||e.key==='hk_account_profile_v1'||e.key===null)changed();});window.addEventListener('hk-account-sync',e=>{if(e.detail?.state==='changed')changed();});
 window.addEventListener('online',()=>load());window.addEventListener('focus',()=>{if(!busy&&!pendingAction&&!profileChanged)load({recover:false});});
 async function init(){
  const sequence=epoch;try{window.HKAccountSync?.assertActive();token=A.identity(true);ownerKey=await keyFor(token);if(sequence!==epoch)return;const saved=await cacheGet(ownerKey);if(sequence!==epoch)return;
   if(saved&&saved.owner===ownerKey){const a=saved.action;pendingAction=a&&typeof a.type==='string'&&typeof a.requestId==='string'&&Number.isSafeInteger(a.revision)?a:null;if(saved.response&&saved.response.owner===ownerKey){try{accept(saved.response,sequence,false);if(state()?.pending)tab='battle';}catch{data=null;}}}
   await load();
  }catch(e){status(errorText(e),true);controls();}
 }
 loadMap();init();
})();
