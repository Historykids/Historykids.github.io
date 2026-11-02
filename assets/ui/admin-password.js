(function(){
 'use strict';
 const identity=()=>{try{return localStorage.getItem('hk_wealth_identity_v1')||'';}catch{return '';}};
 const protectedPath=path=>path.split('?')[0].startsWith('/wealth/admin/')&&!['/wealth/admin/session','/wealth/admin/claim','/wealth/admin/password/setup'].includes(path.split('?')[0]);
 const texts={'admin-password-required':'管理者パスワードを入力してください。','admin-password-invalid':'管理者パスワードが違います。','admin-password-throttled':'試行回数が多いため、15分後にもう一度お試しください。','admin-password-not-configured':'管理者パスワードを設定中です。少し待ってから開き直してください。','admin-required':'このアカウントには管理者権限がありません。','admin-pin-required':'管理者パスワードを入力してください。','admin-pin-invalid':'管理者パスワードが違います。','admin-pin-locked':'入力回数が多すぎます。30分後に再試行してください。','admin-pin-setup-required':'戦国の管理画面で管理者パスワードを登録してください。','admin-pin-upgrade-required':'戦国の管理画面で管理者パスワードを再登録してください。'};
 let password='',bound='',expires=0,timer=null,pending=null,dialog=null;
 const hasPassword=()=>!!password&&bound===identity()&&expires>Date.now();
 function lock(){password=bound='';expires=0;clearTimeout(timer);timer=null;const waiter=pending;pending=null;dialog?.remove();dialog=null;waiter?.reject(Error('admin-password-required'));window.dispatchEvent(new Event('hk-admin-lock'));}
 async function check(candidate,token){
  const base=window.HKRankingConfig?.endpoint;if(!base||!token)throw Error('identity-required');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(new URL('/wealth/admin/password/check',base).href,{method:'POST',mode:'cors',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Admin-Password':candidate},body:'{}'}),data=await response.json();if(!response.ok||data.verified!==true)throw Error(data.error||'connection');}finally{clearTimeout(timeout);}
 }
 function ensure(){
  if(hasPassword())return Promise.resolve(password);
  if(pending)return pending.promise;
  if(!identity())return Promise.reject(Error('identity-required'));
  password=bound='';clearTimeout(timer);const token=identity(),form=document.createElement('form');dialog=document.createElement('dialog');dialog.className='admin-password-dialog';dialog.setAttribute('aria-labelledby','adminPasswordTitle');
  const title=document.createElement('h2');title.id='adminPasswordTitle';title.textContent='管理者パスワード';
  const description=document.createElement('p');description.textContent='管理機能を使うにはパスワードを入力してください。画面を離れるとロックされます。';
  const label=document.createElement('label');label.textContent='パスワード';const input=document.createElement('input');input.type='password';input.name='admin-password';input.autocomplete='current-password';input.required=true;input.minLength=4;input.maxLength=128;input.setAttribute('aria-label','管理者パスワード');label.append(input);
  const status=document.createElement('p');status.className='admin-password-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const actions=document.createElement('div'),submit=document.createElement('button'),cancel=document.createElement('button');submit.type='submit';submit.textContent='管理者ロックを解除';cancel.type='button';cancel.textContent='キャンセル';cancel.onclick=lock;actions.append(submit,cancel);form.append(title,description,label,status,actions);dialog.append(form);document.body.append(dialog);
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});pending={promise,resolve,reject};const waiter=pending;
  form.onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;const candidate=input.value;input.value='';submit.disabled=true;status.textContent='確認しています…';try{await check(candidate,token);if(pending!==waiter||identity()!==token)return;password=candidate;bound=token;expires=Date.now()+300000;timer=setTimeout(lock,300000);pending=null;dialog.remove();dialog=null;waiter.resolve(password);window.dispatchEvent(new Event('hk-admin-unlock'));}catch(error){if(pending===waiter){status.textContent=texts[error.message]||'接続を確認できません。もう一度お試しください。';input.focus();}}finally{submit.disabled=false;}};
  dialog.addEventListener('cancel',e=>{e.preventDefault();lock();});if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');input.focus();return promise;
 }
 window.HKAdminAccess=Object.freeze({hasPassword,lock,ensure,errorText:error=>texts[error?.message],async headers(path){return protectedPath(path)?{'X-Admin-Password':await ensure()}:{};}});
 window.addEventListener('storage',e=>{if(e.key===null||['hk_wealth_identity_v1','hk_account_profile_v1'].includes(e.key))lock();});
 window.addEventListener('hk-sengoku-invalidate',lock);window.addEventListener('pagehide',lock);document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});
})();
