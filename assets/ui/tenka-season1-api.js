(function(){
 'use strict';const A=window.HKCommunity,baseRequest=A.request,gate=document.getElementById('tkAccess'),main=document.getElementById('worldMain');
 window.HKSengokuWorldRules=Object.freeze({...window.HKSengokuWorldRules,WORLD_COUNT:1});const S=window.HKSengokuRankingRules;window.HKSengokuRankingRules=Object.freeze({...S,zones:S.zones.filter(z=>z.regions.length),titles:S.titles.filter(t=>t.id==='japan')});
 let allowed=false,identity=A.identity(false),sequence=0;
 const ready=baseRequest('/wealth/tenka/season1/access',undefined,false).then(result=>{if(identity!==A.identity(false))throw Error('account-changed');allowed=result.allowed===true;if(allowed){gate.hidden=true;main.hidden=false;document.body.classList.add('tenka-authorized');}else{main.hidden=true;document.getElementById('tkAccessText').textContent='この試作サーバーは、現在の管理者アカウントだけが利用できます。管理者のアカウントでログインしてから開いてください。';}return allowed;}).catch(()=>{main.hidden=true;document.getElementById('tkAccessText').textContent='利用権限を確認できませんでした。接続を確認して、再読み込みしてください。';return false;});
 window.HKTenkaAccess=ready;
 window.HKCommunity=Object.freeze({...A,request:async(path,body,option)=>{const run=sequence;if(path.startsWith('/wealth/sengoku')){if(!await ready||!allowed||run!==sequence||identity!==A.identity(false))throw Error('tenka-owner-only');return baseRequest(path.replace('/wealth/sengoku','/wealth/tenka/season1'),body,option);}return baseRequest(path,body,option);}});
 function invalidate(){sequence++;allowed=false;main.hidden=true;gate.hidden=false;document.body.classList.remove('tenka-authorized');document.getElementById('tkAccessText').textContent='アカウントが切り替わりました。ページを読み直して利用権限を確認してください。';}
 window.addEventListener('storage',e=>{if(e.key===null||['hk_wealth_identity_v1','hk_account_profile_v1'].includes(e.key))invalidate();});window.addEventListener('hk-account-sync',e=>{if(e.detail?.state==='changed')invalidate();});
})();
