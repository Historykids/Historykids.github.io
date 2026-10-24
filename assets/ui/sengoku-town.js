/* A server-confirmed permanent reward; the account owns its campaign separately from ryo. */
(function(){
 'use strict';const A=window.HKCommunity;if(!A)return;let available=false,sequence=0,verifiedToken='';
 const identity=()=>{try{return A.identity(false);}catch{return '';}};
 function emit(){window.dispatchEvent(new CustomEvent('hk-sengoku-reward'));}
 async function refresh(){const run=++sequence,token=identity();available=false;verifiedToken='';emit();if(!token)return;
  try{window.HKAccountSync?.assertActive();const data=await A.request('/wealth/sengoku',undefined,false);if(run!==sequence||identity()!==token)return;window.HKAccountSync?.assertActive();available=!!data.state?.claimedRewards?.includes('unification-castle');verifiedToken=token;emit();}catch{}
 }
 window.HKSengokuTown=Object.freeze({available:()=>available&&verifiedToken===identity(),refresh});
 window.addEventListener('storage',e=>{if(e.key==='hk_wealth_identity_v1'||e.key==='hk_account_profile_v1'||e.key===null)refresh();});window.addEventListener('focus',refresh);window.addEventListener('hk-account-sync',e=>{if(e.detail?.state==='changed'){sequence++;available=false;verifiedToken='';emit();}});
 refresh();
})();
