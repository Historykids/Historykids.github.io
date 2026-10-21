(function(){
 'use strict';
 const S=window.HKAccountSync,$=id=>document.getElementById(id),M=window.HKAmounts;if(!S)return;
 let mode='login',busy=false,pendingLogin=null,sessionExpired=false;
 function message(text,error=false){$('accountMessage').textContent=text;$('accountMessage').classList.toggle('error',error);}
 function summary(){
  const w=window.HKWallet.snapshot();$('accountBalance').textContent=M.format(w.balance)+'両';$('accountRebirths').textContent=(w.rebirths||0).toLocaleString('ja-JP')+'回';
  let count=0;try{count=JSON.parse(localStorage.getItem('city_v1')||'[]').length;}catch{}$('accountTown').textContent=count.toLocaleString('ja-JP')+'個';
 }
 function render(){
  const a=S.meta(),expired=sessionExpired||S.state==='expired';$('accountSignedIn').hidden=!a||expired;$('accountGuest').hidden=!!a&&!expired;
  if(a)$('accountTitle').textContent='おかえり、'+a.username+'。';else $('accountTitle').replaceChildren('いつもの町へ、',document.createElement('br'),'ログイン。');$('accountUsernameDisplay').textContent=a?.username||'';
  $('accountSubmit').textContent=busy?'確認しています…':mode==='register'?'今の記録でアカウントを作る':'ログイン';
  $('accountRegisterInfo').hidden=mode!=='register';$('accountPassword').autocomplete=mode==='register'?'new-password':'current-password';
  $('accountLoginTab').setAttribute('aria-pressed',String(mode==='login'));$('accountRegisterTab').setAttribute('aria-pressed',String(mode==='register'));
  $('accountConflict').hidden=S.state!=='conflict'&&!pendingLogin;$('accountExpiredLogout').hidden=!a||!expired;
  document.querySelectorAll('button,input').forEach(e=>e.disabled=busy);summary();
 }
 async function finishLogin(result,keepLocal=false){sessionExpired=false;await S.install(result,{register:mode==='register',keepLocal});$('accountPassword').value='';pendingLogin=null;message('ログインしました。「続きを遊ぶ」から遊べます。');render();}
 $('accountLoginTab').onclick=()=>{mode='login';render();};$('accountRegisterTab').onclick=()=>{mode='register';render();};
 $('accountForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;message('確認しています…');render();
  try{
   S.assertActive();const current=S.meta(),username=$('accountUsername').value,password=$('accountPassword').value;
   if(current&&username.normalize('NFKC').trim().toLocaleLowerCase('ja-JP')!==current.username.toLocaleLowerCase('ja-JP'))throw Error('account-switch-first');
   let token=localStorage.getItem(S.identityKey)||'';
   if(!/^[a-f0-9]{64}$/.test(token)){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem(S.identityKey,token);}
   const result=await S.request(mode,mode==='register'?{username,password,progress:S.capture(),rankingToken:localStorage.getItem('hk_rank_identity_v1')||undefined}:{username,password},mode==='register'?token:'');
   const draft=!current?S.offline(result.owner):null;
   if(current&&current.owner===result.owner&&current.revision!==result.revision||draft&&draft.revision!==result.revision){pendingLogin=result;message('別の端末の記録があります。使う記録を選んでください。');}
   else await finishLogin(result,!!current||!!draft);
  }catch(error){message(S.errorText(error),true);}finally{busy=false;render();}
 };
 async function run(fn,success){if(busy)return;busy=true;render();try{await fn();message(success);}catch(error){message(S.errorText(error),true);}finally{busy=false;render();}}
 $('accountSave').onclick=()=>run(()=>S.sync(true),'今の記録を保存しました。');
 $('accountExpiredLogout').onclick=()=>run(()=>S.logout(),'この端末からログアウトしました。未保存の記録は、次回このアカウントでログインするときまで端末に保持します。');
 $('accountLogout').onclick=()=>run(()=>S.logout(),'ログアウトしました。この端末ではゲストの記録に戻ります。');
 $('accountCloud').onclick=()=>run(async()=>{if(pendingLogin){await finishLogin(pendingLogin);return;}await S.useCloud();},'サーバーの記録を読み込みました。');
 $('accountLocal').onclick=()=>run(async()=>{if(pendingLogin){await finishLogin(pendingLogin,true);}await S.useLocal();},'この端末の記録を保存しました。');
 $('accountPasswordForm').onsubmit=e=>{e.preventDefault();run(async()=>{await S.sync(true);const r=await S.request('password',{password:$('accountOldPassword').value,newPassword:$('accountNewPassword').value});await S.install(r,{keepLocal:true});$('accountPasswordForm').reset();},'パスワードを変更しました。ほかの端末では再ログインしてください。');};
 window.addEventListener('hk-account-sync',e=>{if(e.detail.state==='expired'){sessionExpired=true;mode='login';$('accountUsername').value=S.meta()?.username||'';}if(e.detail.state==='conflict'||e.detail.state==='expired')message(e.detail.message,true);render();});
 try{const next=new URL(new URLSearchParams(location.search).get('next')||'./',location.href);if(next.origin===location.origin&&next.pathname.endsWith('.html')||next.origin===location.origin&&next.pathname==='/')$('accountContinue').href=next.href;}catch{}
 render();
 if(S.meta())S.request('session').then(()=>render()).catch(error=>{if(error.message==='account-session-expired'){sessionExpired=true;$('accountGuest').hidden=false;mode='login';$('accountUsername').value=S.meta()?.username||'';message(S.errorText(error),true);}else message(S.errorText(error),true);});
})();
