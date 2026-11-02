/* New public events play once. Personal notices stay in the notification sheet. */
(function(){
 'use strict';
 const U=window.HKSengokuUI,C=window.HKSengokuColors,$=id=>document.getElementById(id);
 if(!U||!C||!$('worldMain'))return;
 const bar=document.createElement('section');bar.className='si-war-ticker';bar.hidden=true;bar.setAttribute('aria-label','戦況速報');
 const title=document.createElement('strong');title.textContent='戦況';
 const viewport=document.createElement('div');viewport.className='si-ticker-viewport';
 const track=document.createElement('div');track.className='si-ticker-track';track.setAttribute('aria-live','off');
 viewport.append(track);bar.append(title,viewport);$('worldMain').append(bar);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let worldId=null,queue=[],seen=new Set(),current=null,timer=null,checkpoint=0,clockAt=0,clockLocal=0;
 const key=e=>e.id||e.at+':'+e.text;
 const serverNow=()=>clockAt+Math.max(0,performance.now()-clockLocal);
 function stopPlayback(){clearTimeout(timer);timer=null;current=null;track.classList.remove('is-running');track.textContent='';bar.hidden=true;}
 function clear(){stopPlayback();worldId=null;queue=[];seen.clear();checkpoint=clockAt=0;}
 function show(){
  stopPlayback();
  // Do not show a delayed backlog after a disconnected or backgrounded tab returns.
  while(queue.length&&serverNow()-queue[0].at>60000)queue.shift();
  current=queue.shift()||null;if(!current)return;
  bar.hidden=false;
  track.textContent=new Date(current.at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'})+'　'+current.text;
  const duration=reduced.matches?8000:Math.max(13,(track.textContent.length*13+viewport.clientWidth)/55)*1000;
  track.style.setProperty('--si-ticker-start','16px');track.style.setProperty('--si-ticker-duration',duration/1000+'s');
  void track.offsetWidth;track.classList.add('is-running');
  const active=current;
  // A timeout also finishes static reduced-motion notices and interrupted CSS animations.
  timer=setTimeout(()=>{if(current===active)show();},duration+100);
 }
 function motion(){bar.classList.toggle('is-reduced',reduced.matches);}motion();reduced.addEventListener?.('change',motion);
 track.addEventListener('animationend',e=>{if(e.target===track&&e.animationName==='si-campaign-scroll'&&current)show();});
 function render(){
  const v=U.get(),w=v?.world,count=$('siNoticeBadge'),open=$('siNotificationsOpen');
  if(open)open.hidden=!v?.own;
  const unread=(v?.strategy?.notifications||[]).filter(n=>!n.readAt&&!C.hiddenSummary(n.text)).length;
  if(count){count.textContent=unread>99?'99+':String(unread);count.hidden=!unread;}
  if(!w||document.hidden){clear();return;}
  const events=(w.events||[]).filter(e=>Number.isFinite(e.at)&&e.text&&!C.hiddenSummary(e.text)&&!(/^(旧国70地域の地図に移行|更新により全領地の守備兵|領地調整により|世界マップへ拡張|海外を現在の国・地域に更新)/).test(e.text)).sort((a,b)=>a.at-b.at);
  const at=Number.isFinite(v.at)?v.at:Date.now();
  if(w.id!==worldId){
   clear();worldId=w.id;checkpoint=clockAt=at;clockLocal=performance.now();
   for(const e of events)seen.add(key(e));
   return; // Initial loads, reloads and world switches never replay event history.
  }
  if(at<checkpoint)return;
  clockAt=at;clockLocal=performance.now();
  for(const e of events){
   const id=key(e);if(seen.has(id))continue;seen.add(id);
   if(e.at>=checkpoint&&at-e.at<=60000)queue.push(e);
  }
  checkpoint=at;
  if(seen.size>500)seen=new Set([...seen].slice(-300));
  if(!current&&queue.length)show();
 }
 document.addEventListener('visibilitychange',clear);
 window.addEventListener('hk-sengoku-view',render);window.addEventListener('hk-sengoku-ready',render);
 window.addEventListener('hk-sengoku-invalidate',()=>{clear();if($('siNoticeBadge'))$('siNoticeBadge').hidden=true;if($('siNotificationsOpen'))$('siNotificationsOpen').hidden=true;});
 render();
})();
