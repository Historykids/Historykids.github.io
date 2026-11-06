/* One pass for newly observed battle events; private notices stay in the bottom bar. */
(function(){
 'use strict';
 const U=window.HKSengokuUI,C=window.HKSengokuColors,$=id=>document.getElementById(id);
 if(!U||!C||!$('worldMain'))return;
 let worldId=null,seen=new Set(),queue=[],timer=null,bar=null;
 const key=id=>'hk_war_ticker_seen_v2_'+id;
 function save(){try{sessionStorage.setItem(key(worldId),JSON.stringify([...seen].slice(-500)));}catch{}}
 function clear(){clearTimeout(timer);timer=null;queue=[];bar?.remove();bar=null;}
 function next(){
  if(timer||!queue.length)return;
  const text=queue.shift();bar=document.createElement('aside');bar.className='si-war-ticker';bar.setAttribute('aria-label','戦況速報');
  const label=document.createElement('strong');label.textContent='戦況';const viewport=document.createElement('div');viewport.className='si-ticker-viewport';
  const track=document.createElement('div');track.className='si-ticker-track is-running';track.textContent=text;viewport.append(track);bar.append(label,viewport);$('worldMain').append(bar);
  const duration=Math.min(25,Math.max(10,text.length/4));track.style.setProperty('--si-ticker-start',Math.max(250,viewport.clientWidth)+'px');track.style.setProperty('--si-ticker-duration',duration+'s');
  timer=setTimeout(()=>{timer=null;bar?.remove();bar=null;next();},duration*1000);
 }
 function render(){
  for(const old of document.querySelectorAll('.si-war-ticker'))if(old!==bar)old.remove();
  const v=U.get(),world=v?.world,count=$('siNoticeBadge'),open=$('siNotificationsOpen');
  if(open)open.hidden=!v?.own;
  const unread=(v?.strategy?.notifications||[]).filter(n=>!n.readAt&&(n.kind==='admin'||!C.hiddenSummary(n.text))).length;
  if(count){count.textContent=unread>99?'99+':String(unread);count.hidden=!unread;}
  if(!world){clear();worldId=null;return;}
  const events=world.events||[];
  if(world.id!==worldId){clear();worldId=world.id;try{seen=new Set(JSON.parse(sessionStorage.getItem(key(worldId))||'[]'));}catch{seen=new Set();}for(const e of events)seen.add(e.id);save();return;}
  for(const e of [...events].reverse()){
   if(seen.has(e.id))continue;seen.add(e.id);
   if(Date.now()-e.at<60000&&e.at<=Date.now()+5000&&!C.hiddenSummary(e.text)&&/攻撃|合戦|占領|奪還|攻略|防衛|勝利|敗北/.test(e.text))queue.push(e.text);
  }
  save();next();
 }
 window.addEventListener('hk-sengoku-view',render);window.addEventListener('hk-sengoku-ready',render);
 window.addEventListener('hk-sengoku-invalidate',()=>{clear();worldId=null;seen.clear();if($('siNoticeBadge'))$('siNoticeBadge').hidden=true;if($('siNotificationsOpen'))$('siNotificationsOpen').hidden=true;});
 render();
})();
