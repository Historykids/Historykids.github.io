(function(){
 'use strict';const A=window.HKCommunity,card=document.getElementById('tenkaSeason1Card');if(!A||!card)return;let sequence=0,checkedIdentity=null;
 const hide=()=>{sequence++;checkedIdentity=null;card.hidden=true;card.style.display='none';};
 async function refresh(){const run=++sequence,token=A.identity(false);try{const result=await A.request('/wealth/tenka/season1/access',undefined,false);if(run!==sequence||token!==A.identity(false))return;checkedIdentity=token;card.hidden=!result.allowed;card.style.display=result.allowed?'':'none';}catch{hide();}}
 window.addEventListener('storage',e=>{if(e.key===null||['hk_wealth_identity_v1','hk_account_profile_v1'].includes(e.key)){hide();refresh();}});window.addEventListener('hk-account-sync',()=>{if(checkedIdentity!==A.identity(false)){hide();refresh();}});window.addEventListener('focus',refresh);refresh();
})();
