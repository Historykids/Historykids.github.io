/* No floating war-notification box on the game home screen. Personal notifications remain available from the dedicated notification panel. */
(function(){
 'use strict';
 const U=window.HKSengokuUI,C=window.HKSengokuColors,$=id=>document.getElementById(id);
 if(!U||!C||!$('worldMain'))return;
 // Remove legacy ticker containers left by older scripts or browser-restored DOM.
 function render(){
  for(const bar of document.querySelectorAll('.si-war-ticker'))bar.remove();
  const v=U.get(),count=$('siNoticeBadge'),open=$('siNotificationsOpen');
  if(open)open.hidden=!v?.own;
  const unread=(v?.strategy?.notifications||[]).filter(n=>!n.readAt&&!C.hiddenSummary(n.text)).length;
  if(count){count.textContent=unread>99?'99+':String(unread);count.hidden=!unread;}
 }
 window.addEventListener('hk-sengoku-view',render);
 window.addEventListener('hk-sengoku-ready',render);
 window.addEventListener('hk-sengoku-invalidate',()=>{if($('siNoticeBadge'))$('siNoticeBadge').hidden=true;if($('siNotificationsOpen'))$('siNotificationsOpen').hidden=true;});
 render();
})();
