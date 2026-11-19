(function(){
 'use strict';
 const E=window.HKNeonSnake,$=id=>document.getElementById(id),canvas=$('arena'),ctx=canvas.getContext('2d'),key='hk_neon_snake_v1';if(!E||!ctx){$('saveStatus').textContent='このブラウザではCanvasを利用できません。別のブラウザで開いてください。';$('play').disabled=true;return;}
 let profile=E.profile(localStorageSafe()),arena=null,demo=new E.Arena({bots:E.CPU_COUNT,seed:71838,radius:1800,foodTarget:1000}),net=null,starting=false,gameRun=0,leaveToHome=false,playing=false,paused=false,settled=false,locked=false,keys=new Set(),camera={x:0,y:0,zoom:.85},width=innerWidth,height=innerHeight,dpr=1,last=0,accumulator=0,lastHud=0,soundOn=false,audio=null,toastUntil=0,previewTime=0;
 const mobileMode=window.HKNeonSnakeTouch.enabledForDevice();document.body.classList.toggle('mobile-controls',mobileMode);$('touchControls').hidden=!mobileMode;
 const touch=window.HKNeonSnakeTouch.create({stick:$('moveStick'),knob:$('stickKnob'),boost:$('touchBoost'),isEnabled:()=>mobileMode&&playing&&!paused&&!settled&&!locked,onChange:()=>{if(playing)net?.control(paused||locked?{x:0,y:0,boost:false}:control());}});
 if(mobileMode){$('controlGuide').textContent='左スティックで移動 · 右の加速ボタンを長押し · メニューで退出';$('gameHelp').textContent='スティックで移動 · 右ボタンで加速';canvas.setAttribute('aria-label','左スティックで移動し、右ボタンで加速するオンライン蛇アリーナ');}
 const motifs=new Map(),colors=['#9dffe0','#c8a0ff','#ffd47c','#81c9ff','#ff8aaa','#e8f7ff'],sprites=new Map(),foodSprites=new Map(),num=n=>Math.floor(n).toLocaleString('ja-JP'),time=n=>Math.floor(n/60).toString().padStart(2,'0')+':'+Math.floor(n%60).toString().padStart(2,'0');
 function localStorageSafe(){try{return localStorage.getItem(key);}catch{return null;}}
 function writable(){try{window.HKAccountSync?.assertActive();return !locked;}catch{locked=true;$('saveStatus').textContent='アカウントが変わりました。ページを読み直してください。';$('play').disabled=true;return false;}}
 const progressLabel=$('progressStatus'),loginLink=$('snakeLogin');
 let syncTimer;
 function progressStatus(message){if(progressLabel.textContent!==message)progressLabel.textContent=message;}
 function syncProgress(keepalive=false){
  const account=window.HKAccountSync,loggedIn=!!account?.meta?.();
  loginLink.hidden=loggedIn;
  if(!loggedIn||locked)return;
  account.syncSnake(keepalive).then(()=>{if(!locked&&!keepalive)progressStatus('歴史キッズのアカウントに保存済み');}).catch(error=>{
   if(locked||keepalive)return;
   progressStatus(error.message==='account-session-expired'?'端末に保存中。再ログインすると同期できます。':'端末に保存中。通信が戻ると同期します。');
   if(error.message==='account-session-expired')loginLink.hidden=false;
  });
 }
 function save(){
  if(!writable())return false;
  try{
   profile.updatedAt=Math.max(Date.now(),profile.updatedAt+1);
   localStorage.setItem(key,JSON.stringify(profile));
   window.dispatchEvent(new CustomEvent('hk-progress-change',{detail:{source:'neon-snake'}}));
   if(window.HKAccountSync?.meta?.()){
    progressStatus('アカウントに保存中…');
    clearTimeout(syncTimer);syncTimer=setTimeout(syncProgress,350);
   }
   return true;
  }catch{$('saveStatus').textContent='端末に保存できません。ブラウザの保存設定を確認してください。';return false;}
 }
 function reloadProfile(){
  const previousName=profile.name;
  profile=E.profile(localStorageSafe());
  if($('playerName').value===previousName)$('playerName').value=profile.name;
 }
 function editProfile(edit){
  if(!writable())return;
  reloadProfile();
  if(edit(profile))save();
  renderHome();
 }
 function element(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function toast(message){$('gameToast').textContent=message;$('gameToast').style.opacity='1';toastUntil=performance.now()+2300;}
 function beep(kind='eat'){if(!soundOn)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(kind==='kill'?660:480,audio.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='kill'?990:720,audio.currentTime+.08);g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.14);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.15);}catch{}}
 function art(s){
  if(s.pattern){
   const canvas=document.createElement('canvas');
   canvas.width=180;canvas.height=88;
   canvas.setAttribute('aria-hidden','true');
   drawCostumePreview(canvas.getContext('2d'),s,0);
   return canvas;
  }
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 150 75');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(ns,'path');path.setAttribute('d','M20 52 C-3 17 67 8 76 36 S138 67 126 29');path.setAttribute('fill','none');path.setAttribute('stroke',s.colors[1]);path.setAttribute('stroke-width','19');path.setAttribute('stroke-linecap','round');svg.append(path);const p=path.cloneNode();p.setAttribute('stroke',s.colors[0]);p.setAttribute('stroke-width','11');svg.append(p);for(const x of [121,130]){const eye=document.createElementNS(ns,'circle');eye.setAttribute('cx',x);eye.setAttribute('cy','24');eye.setAttribute('r','3');eye.setAttribute('fill','#efffff');svg.append(eye);const pupil=eye.cloneNode();pupil.setAttribute('r','1.5');pupil.setAttribute('cy','22.5');pupil.setAttribute('fill','#172332');svg.append(pupil);}svg.style.setProperty('--glow',s.colors[0]+'33');return svg;}
 function renderCollection(){const mount=$('skins');mount.replaceChildren();for(const s of E.skins){const owned=profile.owned.includes(s.id),chosen=profile.selected===s.id,canBuy=!owned&&s.cost&&profile.coins>=s.cost,card=element('article','skin-card'+(chosen?' selected':'')+(!owned?' locked':'')),picture=element('div','skin-art');picture.append(art(s));card.append(element('span','skin-tag',s.rarity),picture,element('h3','',s.name));const progress=s.require?Math.min(profile[s.require.key],s.require.goal):0;card.append(element('p','',s.require&&!owned?s.require.label+' · '+num(progress)+' / '+num(s.require.goal):owned?'アンロック済み': 'コインでアンロック'));const button=element('button','',chosen?'✓ 使用中':owned?'使う':s.cost?'◈ '+num(s.cost)+(canBuy?' で解放':''):'チャレンジで解放');button.type='button';button.disabled=chosen||!owned&&!canBuy||locked;button.setAttribute('aria-label',s.name+' · '+button.textContent);button.onclick=()=>editProfile(current=>E.equip(current,s.id));card.append(button);if(s.require&&!owned){const bar=element('span','skin-progress');bar.style.width=(progress/s.require.goal*100)+'%';card.append(bar);}mount.append(card);}
  $('missions').replaceChildren();for(const m of E.missions){const value=Math.min(profile.daily[m.id],m.goal),claimed=profile.daily.claimed.includes(m.id),card=element('article','mission-card');card.append(element('span','eyebrow','DAILY CHALLENGE'),element('h3','',m.title),element('p','',num(value)+' / '+num(m.goal)+m.unit+' · 報酬 '+m.reward+'コイン'));const progress=element('progress');progress.max=m.goal;progress.value=value;progress.setAttribute('aria-label',m.title+'の進捗');const button=element('button','',claimed?'✓ 受け取り済み':value>=m.goal?'◈ '+m.reward+'コインを受け取る':'プレイして進めよう');button.disabled=claimed||value<m.goal||locked;button.onclick=()=>editProfile(current=>E.claim(current,m.id));card.append(progress,button);$('missions').append(card);}
  renderTitles();
  const ready=E.missions.filter(m=>profile.daily[m.id]>=m.goal&&!profile.daily.claimed.includes(m.id)).length;$('missionCount').textContent=ready?ready+'件受取可能':'';$('skinCount').textContent=profile.owned.length+' / '+E.skins.length;
 }
 function titleName(item,tag='span',className=''){
  const label=element(tag,className,item.name);
  label.style.color=item.color;
  return label;
 }
 function renderTitles(){
  const earned=E.earnedTitles(profile), selected=E.title(profile.title),mount=$('titleCards');
  $('titlesCount').textContent=earned.length+' / '+E.titles.length;
  $('equippedTitle').replaceChildren(...(selected?['装備中 · ',titleName(selected,'strong')]:['称号なし']));
  $('clearTitle').disabled=!selected||locked;
  mount.replaceChildren();
  for(const item of E.titles){
   const unlocked=earned.includes(item),active=item===selected,card=element('article','mission-card title-card');
   card.style.setProperty('--title-ink',item.color);
   card.classList.toggle('selected',active);
   card.append(element('h3','',item.name),element('p','',item.label));
   const meter=element('progress');meter.max=item.goal;meter.value=profile[item.key];meter.setAttribute('aria-label',item.name+'の進捗');
   const button=element('button','',active?'✓ 装備中':unlocked?'装備する':'未獲得');
   button.type='button';button.disabled=active||!unlocked||locked;
   button.setAttribute('aria-label',item.name+' · '+button.textContent);
   button.onclick=()=>editProfile(current=>E.equipTitle(current,item.id));
   card.append(meter,button);mount.append(card);
  }
 }
 function renderHome(){profile=E.profile(profile);const lvl=E.level(profile),from=(lvl-1)**2*120,to=lvl**2*120;$('levelNumber').textContent=String(lvl).padStart(2,'0');$('levelProgress').max=to-from;$('levelProgress').value=profile.xp-from;$('homeBest').textContent=num(profile.best);$('homeKills').textContent=num(profile.totalKills);$('coins').textContent=num(profile.coins);$('selectedSkin').textContent=E.skin(profile.selected).name;$('skinRarity').textContent=E.skin(profile.selected).rarity;renderCollection();}
 function showTab(tab){
  for(const panel of ['skins','missions','titles']){
   $(panel).hidden=panel!==tab;
   $(panel+'Tab').setAttribute('aria-pressed',String(panel===tab));
  }
  $('collectionHint').textContent={skins:'コインとチャレンジで解放',missions:'毎日0時（日本時間）に更新',titles:'装備した称号は名前の上に表示'}[tab];
  if(tab==='titles'||location.hash==='#titles'){
   const url=new URL(location.href);url.hash=tab==='titles'?'titles':'';
   history.replaceState(null,'',url);
  }
 }
 const onlineErrors={'snake-full':'このアリーナは満員です。別のアリーナを選んでください。','snake-update':'ゲームが更新されました。ページを読み直してください。','snake-resume-expired':'前の対戦は終了しています。もう一度プレイしてください。','snake-replaced':'別の画面で同じ対戦が開かれました。','snake-unavailable':'対戦サーバーに接続できません。少し待って再試行してください。'};
 function connectedArena(value,first){arena=value;if(!first)return;starting=false;playing=true;paused=false;settled=false;leaveToHome=false;keys.clear();touch.reset();camera={x:arena.player.x,y:arena.player.y,zoom:.93};last=performance.now();accumulator=0;lastHud=0;$('home').hidden=true;$('gameHud').hidden=false;$('play').disabled=false;$('play').innerHTML='オンラインでプレイ <span>↗</span>';document.body.classList.add('playing');for(const id of ['pauseDialog','resultDialog'])if($(id).open)$(id).close();canvas.focus();toast(mobileMode?'左スティックで移動 · 右ボタンで加速 · 登場後3秒間は衝突から保護':'WASD / 矢印キーで移動 · Spaceで加速 · 登場後3秒間は衝突から保護');hud();}
 function start(){if(!writable()||starting)return;const name=$('playerName').value.trim().slice(0,16)||'PLAYER';reloadProfile();if(profile.name!==name){profile.name=name;save();}net?.close();starting=true;settled=false;leaveToHome=false;keys.clear();touch.reset();$('play').disabled=true;$('play').textContent='接続中…';$('saveStatus').textContent='オンラインのアリーナに接続しています。';const run=++gameRun,owner=window.HKAccountSync?.meta?.()?.owner||localStorageSafeIdentity();
  net=new window.HKNeonSnakeOnline.OnlineClient({endpoint:window.HKRankingConfig?.endpoint,room:$('roomSelect').value,name:profile.name,skin:profile.selected,title:profile.title,ownerKey:owner,viewRadius:()=>Math.min(1400,Math.hypot(width,height)/(2*camera.zoom)+120),onState:(value,first)=>{if(run===gameRun)connectedArena(value,first);},onStatus:(text,state)=>{if(run!==gameRun)return;$('networkStatus').textContent=text;$('networkStatus').dataset.state=state;if(starting)$('saveStatus').textContent=text;},onEvent:e=>{if(run!==gameRun)return;if(e.type==='kill'){toast(e.name+' を撃破！');beep('kill');}if(e.type==='eat')beep();},onResult:result=>{if(run!==gameRun)return;starting=false;arena=net.arena;arena.stats=result.stats;if(!arena.player)arena.player={id:result.playerId,x:0,y:0,angle:0,mass:result.stats.best,radius:13,age:10,body:[],alive:false};playing=true;arena.player.alive=false;if(leaveToHome){reward();goHome();}else end(result.reason);},onError:(code,stats)=>{if(run!==gameRun)return;starting=false;$('play').disabled=locked;$('play').innerHTML='オンラインでプレイ <span>↗</span>';const text=onlineErrors[code]||'通信を確認できません。もう一度接続してください。';$('saveStatus').textContent=text;if(playing&&stats&&!settled){arena.stats=stats;end('通信が切れたため、最後にサーバーが確認した記録を保存しました。');net?.clearResume();}else if(!settled)goHome();}});
 }
 function localStorageSafeIdentity(){try{return localStorage.getItem('hk_wealth_identity_v1')?.slice(0,16)||'guest';}catch{return 'guest';}}
 function reward(){if(settled||!arena)return null;settled=true;if(writable())profile=E.profile(localStorageSafe());const before=profile.best,earned=E.settle(profile,arena.stats);save();return{...earned,newBest:arena.stats.best>before};}
 function end(reason){if(!playing||settled)return;paused=true;keys.clear();touch.reset();const result=reward();$('resultTitle').textContent=result.newBest?'自己ベスト、更新！':'いい軌跡だった！';$('endReason').textContent=reason;$('resultLength').textContent=num(arena.stats.best);$('newBest').hidden=!result.newBest;$('resultRank').textContent=arena.stats.rank+'位';$('resultKills').textContent=arena.stats.kills+'匹';$('resultTime').textContent=time(arena.stats.seconds);$('earnedCoins').textContent=result.coins;$('earnedXp').textContent=result.xp;const unlocks=[];
  if(result.unlocked.length)unlocks.push('コスチューム獲得 · '+result.unlocked.map(id=>E.skin(id).name).join(' / '));
  if(result.unlockedTitles.length){
   if(unlocks.length)unlocks.push(' ／ ');
   unlocks.push('称号獲得 · ');
   result.unlockedTitles.forEach((item,index)=>{if(index)unlocks.push(' / ');unlocks.push(titleName(item,'strong'));});
  }
  $('unlockMessage').replaceChildren(...(unlocks.length?unlocks:['集めた光と経験値は次のプレイへ。']));if($('pauseDialog').open)$('pauseDialog').close();$('resultDialog').showModal();}
 function goHome(){net?.close();playing=false;starting=false;paused=false;keys.clear();touch.reset();arena=null;document.body.classList.remove('playing');$('gameHud').hidden=true;$('home').hidden=false;$('play').disabled=locked;$('play').innerHTML='オンラインでプレイ <span>↗</span>';$('quit').disabled=false;$('quit').textContent='報酬を受け取って退出する';for(const id of ['pauseDialog','resultDialog'])if($(id).open)$(id).close();if(!locked)reloadProfile();renderHome();$('play').focus();}
 function pause(){if(!playing||paused||settled)return;paused=true;keys.clear();touch.reset();net?.control({x:0,y:0,boost:false});hud();$('pauseDialog').showModal();}
 function resume(){if(!playing||settled||locked)return;paused=false;last=performance.now();accumulator=0;$('pauseDialog').close();canvas.focus();}
 function hud(){if(!arena)return;const p=arena.player,rank=arena.ranking();$('length').textContent=num(p.mass);$('kills').textContent=arena.stats.kills+' K.O.';$('timer').textContent=time(arena.stats.seconds);$('myRank').textContent='あなた '+arena.stats.rank+'位 / '+(arena.humans+arena.cpu)+'匹 · 人間 '+arena.humans+'人 / CPU '+arena.cpu+'匹';
  const canBoost=p.mass>=E.BOOST_MIN_MASS;
  $('boostMeter').style.width=(canBoost?E.clamp(p.mass/180*100,0,100):0)+'%';
  $('boostHint').textContent=canBoost
   ? (p.boost?'BOOST · 長さを少し消費中':mobileMode?'右ボタン長押しで加速':'Space長押しで加速')
   : '長さが1以上で加速できます';
  const mount=$('leaderboard');mount.replaceChildren();for(const [i,s]of rank.slice(0,10).entries()){const li=element('li',s.id===p.id?'me':'');const name=element('span','snake-name',s.id===p.id?s.name+' (YOU)':s.name+(s.bot?' · CPU':''));
   const title=E.title(s.title);
   if(title)name.prepend(titleName(title,'small','snake-title'));
   li.append(element('span','',String(i+1).padStart(2,'0')),name,element('span','snake-score',num(s.mass)));mount.append(li);}drawMinimap();}
 function drawMinimap(){const c=$('minimap').getContext('2d');if(!c)return;c.clearRect(0,0,150,150);c.strokeStyle='#69829133';c.beginPath();c.arc(75,75,66,0,Math.PI*2);c.stroke();for(const point of arena.positions||[]){const self=point[0]===arena.player.id;c.fillStyle=self?'#b5ffe7':point[3]?'#74859d88':'#c0afffc0';c.beginPath();c.arc(75+point[1]/arena.radius*65,75+point[2]/arena.radius*65,self?3.5:1.8,0,Math.PI*2);c.fill();}}
 function sprite(color){if(sprites.has(color))return sprites.get(color);const c=document.createElement('canvas');c.width=c.height=80;const x=c.getContext('2d');const g=x.createRadialGradient(29,24,2,39,40,31);g.addColorStop(0,'#f1fffebf');g.addColorStop(.17,color);g.addColorStop(.65,color);g.addColorStop(1,'#0b1126');x.fillStyle=g;x.beginPath();x.arc(40,40,31,0,Math.PI*2);x.fill();x.strokeStyle='#ffffff12';x.lineWidth=1.2;x.stroke();sprites.set(color,c);return c;}
 function foodSprite(color){if(foodSprites.has(color))return foodSprites.get(color);const c=document.createElement('canvas');c.width=c.height=48;const x=c.getContext('2d'),g=x.createRadialGradient(24,24,0,24,24,23);g.addColorStop(0,'#ffffff');g.addColorStop(.13,color);g.addColorStop(.25,color+'d9');g.addColorStop(.5,color+'36');g.addColorStop(1,color+'00');x.fillStyle=g;x.fillRect(0,0,48,48);foodSprites.set(color,c);return c;}
 const tile=document.createElement('canvas');tile.width=84;tile.height=48;const tx=tile.getContext('2d');for(let col=-1;col<4;col++)for(let row=-1;row<3;row++){const x=col*42,y=row*48+(col%2)*24;tx.beginPath();for(const [i,p]of [[28,0],[14,24],[-14,24],[-28,0],[-14,-24],[14,-24]].entries()){i?tx.lineTo(x+p[0],y+p[1]):tx.moveTo(x+p[0],y+p[1]);}tx.closePath();tx.fillStyle='#151d27';tx.fill();tx.strokeStyle='#0d141e';tx.lineWidth=2.5;tx.stroke();}
 let pattern=ctx.createPattern(tile,'repeat');
 function resize(){dpr=Math.min(devicePixelRatio||1,2);width=innerWidth;height=innerHeight;canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);pattern=ctx.createPattern(tile,'repeat');}
 function motif(costume){
  if(motifs.has(costume.id))return motifs.get(costume.id);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=48;
  const ink=costume.colors[2],c=canvas.getContext('2d');
  c.translate(24,24);c.fillStyle=ink;c.strokeStyle=ink;c.lineWidth=3;c.lineCap='round';c.lineJoin='round';
  const polygon=(points,fill=true)=>{
   c.beginPath();c.moveTo(...points[0]);
   points.slice(1).forEach(point=>c.lineTo(...point));
   if(fill){c.closePath();c.fill();}else c.stroke();
  };
  const dot=(x,y,r)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
  switch(costume.pattern){
   case 'stripes':
    for(const x of [-9,3])polygon([[x-5,-17],[x+1,-17],[x+9,17],[x+2,17]]);
    break;
   case 'dots':
    dot(-7,-9,4);dot(8,1,4);dot(-6,10,3);
    break;
   case 'waves':
    for(const x of [-6,6]){
     c.beginPath();c.moveTo(x-5,-14);c.bezierCurveTo(x+12,-7,x-12,7,x+5,14);c.stroke();
    }
    break;
   case 'diamonds':
    polygon([[-13,0],[0,-13],[13,0],[0,13]]);
    c.fillStyle=costume.colors[1];polygon([[-6,0],[0,-6],[6,0],[0,6]]);
    break;
   case 'bolts':
    polygon([[1,-15],[-13,3],[-2,3],[-5,15],[14,-4],[3,-4],[8,-15]]);
    break;
   case 'checks':
    for(let i=0;i<3;i++)for(let j=0;j<4;j++)if((i+j)%2===0)c.fillRect(i*7-10,j*7-14,7,7);
    break;
   case 'rosettes':
    for(const [x,y] of [[-8,-8],[7,-1],[-6,10]]){
     c.beginPath();c.ellipse(x,y,5,3.5,.6,0,Math.PI*2);c.stroke();
    }
    break;
   case 'stars':
    polygon([[0,-13],[3,-3],[12,0],[3,3],[0,13],[-3,3],[-12,0],[-3,-3]]);
    dot(-11,-10,2);dot(10,11,2);
    break;
  }
  motifs.set(costume.id,canvas);
  return canvas;
 }
 function drawBodyPattern(c,costume,points,end,radius){
  const stamp=motif(costume),size=radius*2.45,spacing=radius*2.25;
  let traveled=0,next=radius*1.1;
  c.save();c.globalAlpha=.86;
  for(let i=1;i<end;i++){
   const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
   if(len===0)continue;
   while(next<=traveled+len){
    const along=(next-traveled)/len;
    c.save();c.translate(a.x+dx*along,a.y+dy*along);c.rotate(Math.atan2(dy,dx));
    c.drawImage(stamp,-size/2,-size/2,size,size);c.restore();
    next+=spacing;
   }
   traveled+=len;
  }
  c.restore();
 }
 function drawCostumePreview(c,costume,time){
  const y=x=>44+Math.sin((x-30)/25+time*.35)*17;
  const body=Array.from({length:31},(_,i)=>({x:27+i*4,y:y(27+i*4)}));
  const head=body[0];
  drawSnake({...head,id:0,bot:true,skin:costume.id,angle:Math.atan2(head.y-body[1].y,head.x-body[1].x),radius:12,body},c);
 }
 function drawSnake(s,context=ctx){const costume=E.skin(s.skin),palette=costume.colors,r=s.radius,points=[{x:s.x,y:s.y},...s.body.map((_,i)=>E.curve(s,i,playing?arena.time:demo.time))];if(points.length<2)return;const visible=points.some(p=>Math.abs((p.x-camera.x)*camera.zoom)<width/2+80&&Math.abs((p.y-camera.y)*camera.zoom)<height/2+80);if(context===ctx&&!visible)return;const tail=Math.min(costume.pattern?Math.floor(points.length/3):points.length-2,Math.ceil(55/(s.bodyStep||E.BODY_STEP))),end=Math.max(2,points.length-tail);const path=(from,to)=>{context.beginPath();context.moveTo(points[from].x,points[from].y);for(let i=from+1;i<to-1;i++){const p=points[i],n=points[i+1];context.quadraticCurveTo(p.x,p.y,(p.x+n.x)/2,(p.y+n.y)/2);}context.lineTo(points[to-1].x,points[to-1].y);};context.save();context.lineCap='round';context.lineJoin='round';path(0,end);context.strokeStyle='#081522';context.lineWidth=r*2+3;context.shadowColor=s.boost?palette[0]:'#00000066';context.shadowBlur=s.boost?18:7;context.stroke();context.shadowBlur=0;const lastPoint=points[end-1],g=context.createLinearGradient(s.x-r,s.y-r,lastPoint.x+r,lastPoint.y+r);g.addColorStop(0,palette[0]);g.addColorStop(.4,palette[1]);g.addColorStop(.72,palette[2]||palette[0]);g.addColorStop(1,palette[1]);context.strokeStyle=g;context.lineWidth=r*2;context.stroke();context.strokeStyle='#ffffff2a';context.lineWidth=r*.32;context.translate(-r*.14,-r*.24);path(0,end);context.stroke();context.translate(r*.14,r*.24);if(costume.pattern)drawBodyPattern(context,costume,points,end,r);for(let i=end-1;i<points.length-1;i++){context.strokeStyle=palette[1];context.lineWidth=Math.max(1,2*r*(points.length-1-i)/Math.max(1,tail));context.beginPath();context.moveTo(points[i].x,points[i].y);context.lineTo(points[i+1].x,points[i+1].y);context.stroke();}context.translate(s.x,s.y);context.rotate(s.angle);const size=r*2.7;context.drawImage(sprite(palette[0]),-size/2,-size/2,size,size);for(const y of [-r*.5,r*.5]){context.fillStyle='#f1fcff';context.beginPath();context.ellipse(r*.45,y,r*.39,r*.34,0,0,Math.PI*2);context.fill();context.fillStyle='#172536';context.beginPath();context.ellipse(r*.59,y,r*.17,r*.2,0,0,Math.PI*2);context.fill();}context.restore();if(context===ctx&&s.id===arena?.player?.id&&s.age<3){context.strokeStyle='#baffe18a';context.lineWidth=1.5;context.setLineDash([3,6]);context.beginPath();context.arc(s.x,s.y,r+8,0,Math.PI*2);context.stroke();context.setLineDash([]);}}
 function draw(a,dt){const p=a.player;if(playing){const ease=1-Math.exp(-dt*8);camera.x+=(p.x-camera.x)*ease;camera.y+=(p.y-camera.y)*ease;const z=E.clamp(1.05-Math.sqrt(p.mass)/130,.56,.95);camera.zoom+=(z-camera.zoom)*Math.min(1,dt*2);}else{camera.x=0;camera.y=0;camera.zoom=.65;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0d141e';ctx.fillRect(0,0,width,height);ctx.save();ctx.translate(width/2,height/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);ctx.fillStyle=pattern;ctx.fillRect(camera.x-width/camera.zoom/2,camera.y-height/camera.zoom/2,width/camera.zoom,height/camera.zoom);ctx.strokeStyle='#e38a8a70';ctx.lineWidth=8;ctx.beginPath();ctx.arc(0,0,a.radius,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#d8a0a027';ctx.lineWidth=35;ctx.stroke();for(const f of a.food){const x=(f.x-camera.x)*camera.zoom,y=(f.y-camera.y)*camera.zoom;if(Math.abs(x)>width/2+25||Math.abs(y)>height/2+25)continue;const size=(f.rich?26:18)+Math.min(24,f.value);ctx.drawImage(foodSprite(colors[f.color%colors.length]),f.x-size/2,f.y-size/2,size,size);}for(const s of a.snakes)if(s.alive)drawSnake(s);if(playing){ctx.font='11px "Space Grotesk","Noto Sans JP",sans-serif';ctx.textAlign='center';for(const person of a.snakes.filter(s=>s.alive&&!s.bot)){ctx.fillStyle=person.id===p.id?'#bdffe4':'#f4f0ff';ctx.shadowColor='#000';ctx.shadowBlur=6;const nameY=person.y-person.radius-17;
   ctx.fillText(person.name+(person.id===p.id?' (YOU)':''),person.x,nameY);
   const title=E.title(person.title);
   if(title){
    const titleSize=Math.max(12,11/camera.zoom),titleY=nameY-13/camera.zoom;
    ctx.save();ctx.font='bold '+titleSize+'px "Space Grotesk","Noto Sans JP",sans-serif';ctx.fillStyle=title.color;
    ctx.strokeStyle='#10141e';ctx.lineWidth=2.5/camera.zoom;ctx.strokeText(title.name,person.x,titleY);
    ctx.fillText(title.name,person.x,titleY);ctx.restore();
   }}ctx.shadowBlur=0;}ctx.restore();}
 function preview(t){const c=$('skinPreview'),x=c.getContext('2d');if(!x)return;x.clearRect(0,0,700,400);const costume=E.skin(profile.selected);
  if(costume.pattern){x.save();x.scale(3.7,3.7);x.translate(4,13);drawCostumePreview(x,costume,t);x.restore();return;}
  const palette=costume.colors;for(let i=150;i>=0;i--){const v=i/150,px=100+v*480,py=175+Math.sin(v*Math.PI*2.15+t*.3)*66,r=(i>135?(155-i)/20:1)*23,size=r*2.58;x.drawImage(sprite(palette[Math.floor(i/27)%palette.length]),px-size/2,py-size/2,size,size);}const y=175+Math.sin(t*.3)*66;x.save();x.translate(100,y);x.rotate(Math.PI+.65*Math.cos(t*.3));for(const yy of [-12,12]){x.fillStyle='#f3fffc';x.beginPath();x.ellipse(10,yy,9,8,0,0,Math.PI*2);x.fill();x.fillStyle='#193234';x.beginPath();x.ellipse(14,yy,4,4.5,0,0,Math.PI*2);x.fill();}x.restore();for(let i=0;i<9;i++){const px=80+i*71,py=160+Math.sin(i*2.3+t*.1)*95,size=12+i%3*3;x.drawImage(foodSprite(colors[i%6]),px,py,size,size);}}
 function control(){let x=0,y=0;for(const k of keys){if(['a','arrowleft'].includes(k))x--;if(['d','arrowright'].includes(k))x++;if(['w','arrowup'].includes(k))y--;if(['s','arrowdown'].includes(k))y++;}const stick=touch.get();return mobileMode&&(stick.x||stick.y||stick.boost)?{...stick,boost:stick.boost||keys.has(' ')}:{x:E.clamp(x,-1,1),y:E.clamp(y,-1,1),boost:keys.has(' ')};}
 function frame(t){const dt=Math.min((t-last)/1000||0,.1);last=t;if(playing&&arena?.player){net?.control(paused||locked?{x:0,y:0,boost:false}:control());if(!locked)net?.frame(dt);draw(arena,dt);}else{if(!document.hidden){accumulator=Math.min(accumulator+dt,.15);while(accumulator>=1/60){if(demo.ended)demo=new E.Arena({bots:E.CPU_COUNT,seed:71838});demo.step(1/60,{angle:demo.aim(demo.player)});accumulator-=1/60;}}draw(demo,dt);previewTime+=dt;preview(previewTime);}if(playing&&arena?.stats&&t-lastHud>200){lastHud=t;hud();}if(t>toastUntil)$('gameToast').style.opacity='0';requestAnimationFrame(frame);}
 $('playForm').onsubmit=e=>{e.preventDefault();start();};$('skinsTab').onclick=()=>showTab('skins');$('missionsTab').onclick=()=>{renderHome();showTab('missions');};$('titlesTab').onclick=()=>showTab('titles');
 $('clearTitle').onclick=()=>editProfile(current=>E.equipTitle(current,''));$('browseSkins').onclick=()=>{showTab('skins');$('collection').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});};$('pause').onclick=pause;$('resume').onclick=resume;$('quit').onclick=()=>{if(locked){goHome();return;}leaveToHome=true;$('quit').disabled=true;$('quit').textContent='退出処理中…';net?.leave();};$('toHome').onclick=goHome;$('again').onclick=start;
 $('pauseDialog').addEventListener('cancel',e=>{e.preventDefault();resume();});$('resultDialog').addEventListener('cancel',e=>{e.preventDefault();goHome();});
 $('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent='音 '+(soundOn?'ON':'OFF');$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label','効果音を'+(soundOn?'オフ':'オン')+'にする');if(soundOn)beep();};
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{if(playing)toast('このブラウザでは全画面にできません。');else $('saveStatus').textContent='このブラウザでは全画面にできません。';}}$('fullscreen').onclick=fullscreen;
 document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'全画面を終了 ↙':'全画面 ↗';});
 window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;const k=e.key.toLowerCase();if(k==='f'){e.preventDefault();fullscreen();return;}if(!playing)return;if(['escape','p'].includes(k)){e.preventDefault();if(e.repeat)return;if(settled&&k==='escape')goHome();else if(!settled)paused?resume():pause();return;}if(k==='r'&&settled){e.preventDefault();start();return;}if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright',' '].includes(k)){e.preventDefault();if(!paused&&!locked){keys.add(k);net?.control(control());}}});window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());net?.control(paused?{x:0,y:0,boost:false}:control());});const releaseControls=()=>{keys.clear();touch.reset();net?.control({x:0,y:0,boost:false});};window.addEventListener('blur',releaseControls);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseControls();});window.addEventListener('pagehide',()=>{if(playing&&!settled)net?.send({type:'leave'});net?.close();});window.addEventListener('resize',()=>{releaseControls();resize();});
 function changed(){locked=true;pause();net?.send({type:'leave'});net?.clearResume();net?.close();$('saveStatus').textContent='アカウントが変わりました。ページを読み直してください。';$('play').disabled=true;$('resume').disabled=true;$('again').disabled=true;document.body.classList.add('account-locked');}
 function savedProfileChanged(){if(!locked&&!playing&&!starting){reloadProfile();renderHome();}}
 window.addEventListener('storage',e=>{if(e.key===null||['hk_account_profile_v1','hk_wealth_identity_v1'].includes(e.key))changed();else if(e.key===key)savedProfileChanged();});window.addEventListener('hk-account-sync',e=>{if(e.detail?.state==='changed')changed();});
 window.addEventListener('hk-neon-snake-sync',savedProfileChanged);
 window.addEventListener('focus',()=>syncProgress());window.addEventListener('online',()=>syncProgress());
 window.addEventListener('pagehide',()=>{clearTimeout(syncTimer);syncProgress(true);});
 if(window.HKAccountSync?.meta?.())setInterval(()=>{if(!document.hidden)syncProgress();},45000);
 syncProgress();
 $('playerName').value=profile.name;renderHome();if(location.hash==='#titles'){showTab('titles');$('collection').scrollIntoView();}resize();requestAnimationFrame(frame);
})();
