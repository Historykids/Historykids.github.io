(function(){
 'use strict';
 const D=window.HKAccountData,W=window.HKWallet;
 if(!D||!W)return;
 const metaKey='hk_account_session_v1',profileKey='hk_account_profile_v1',journalKey='hk_account_switch_v1',guestKey='hk_account_guest_v1',identityKey='hk_wealth_identity_v1',rankKey='hk_rank_identity_v1';
 const offlineKey=owner=>'hk_account_offline_v1_'+owner;
 const offline=owner=>{const d=parse(offlineKey(owner));return d?.owner===owner&&d.progress?.values?d:null;};
 const caches=['hk_wealth_cache_v1','hk_leaderboard_cache_v3','hk_notice_draft_v1'];
 const errors={'account-input':'アカウント名は3〜24文字の文字・数字・_・-、パスワードは8〜128文字にしてください。','account-credentials':'アカウント名またはパスワードが違います。','account-name-taken':'このアカウント名は使用されています。別の名前にしてください。','account-already-linked':'この記録はアカウントに登録済みです。ログインしてください。','account-password':'新しいパスワードは8〜128文字にしてください。','account-try-later':'試行回数が多いため、1分ほど待ってから再試行してください。','account-session-expired':'ログインの有効期限が切れました。もう一度ログインしてください。','account-conflict':'別の端末で記録が更新されています。使う記録を選んでください。','account-save-invalid':'記録を確認できません。今の記録を残したまま、保存状態を確認してください。','account-save-large':'保存できる記録の容量を超えています。','account-changed':'別のタブでアカウントが変わりました。ページを読み直してください。','account-storage':'端末に保存できません。ブラウザの保存容量と設定を確認してください。','account-switch-first':'今のアカウントからログアウトしてから、別のアカウントへログインしてください。'};
 const get=k=>localStorage.getItem(k),parse=k=>{try{return JSON.parse(get(k)||'null');}catch{return null;}};
 let loadedProfile=null,saving=null,timer=null,lastSaved=null,conflict=false,state='guest',switching=false;
 const meta=()=>{const m=parse(metaKey);return m&&typeof m.username==='string'&&/^[a-f0-9]{64}$/.test(m.owner||'')&&Number.isSafeInteger(m.revision)?m:null;};
 function restore(map){for(const [k,v]of Object.entries(map))if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}
 try{const journal=parse(journalKey);if(journal?.before){restore(journal.before);localStorage.removeItem(journalKey);}loadedProfile=get(profileKey);}catch{state='storage';}
 function assertActive(){if(state==='storage')throw Error('account-storage');if(!switching&&(get(profileKey)!==loadedProfile||get(journalKey)))throw Error('account-changed');}
 function capture(){
  assertActive();const wallet=W.snapshot();if(wallet.unavailable)throw Error('account-save-invalid');
  const values={};for(const k of D.keys)values[k]=get(k);values.hk_wallet_v2??=JSON.stringify(wallet);
  return{version:1,values};
 }
 function emit(next,text=''){
  state=next;const m=meta();
  document.querySelectorAll('[data-account-link]').forEach(a=>{a.textContent=m?m.username+' · アカウント':'ログイン';a.title=m?'アカウントと記録の保存':'アカウント名とパスワードでログイン';});
  document.querySelectorAll('[data-account-status]').forEach(e=>{e.textContent=text||(m?'アカウントに記録を保存':'このブラウザに保存');e.dataset.state=next;});
  window.dispatchEvent(new CustomEvent('hk-account-sync',{detail:{state:next,message:text,account:m}}));
 }
 async function request(action,body,token,keepalive=false){
  const endpoint=window.HKRankingConfig?.endpoint;if(!endpoint)throw Error('not-configured');
  if(token===undefined)token=get(identityKey)||'';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{
   const data=body===undefined?undefined:JSON.stringify(body),response=await fetch(new URL('/wealth/account/'+action,endpoint).href,{method:data===undefined?'GET':'POST',mode:'cors',cache:'no-store',signal:controller.signal,keepalive:keepalive&&(!data||new TextEncoder().encode(data).length<60000),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:data})});
   const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'account-network'),{status:response.status});return result;
  }finally{clearTimeout(timeout);}
 }
 function guest(){const values={};for(const k of [...D.keys,identityKey,rankKey])values[k]=get(k);return values;}
 async function walletLock(work){
  let locks;try{locks=navigator.locks;}catch{return work();}if(!locks?.request)return work();let entered=false;
  try{return await locks.request('historykids-wallet',()=>{entered=true;return work();});}catch(error){if(!entered&&['SecurityError','NotSupportedError'].includes(error?.name))return work();throw error;}
 }
 function atomicWork(makeAfter){
  assertActive();const after=typeof makeAfter==='function'?makeAfter():makeAfter;
  const before={};for(const k of Object.keys(after))before[k]=get(k);
  switching=true;
  try{localStorage.setItem(journalKey,JSON.stringify({before}));restore(after);localStorage.removeItem(journalKey);loadedProfile=get(profileKey);}
  catch(error){try{restore(before);localStorage.removeItem(journalKey);}catch{state='storage';}throw Error('account-storage');}
  finally{switching=false;}
 }
 const atomic=makeAfter=>walletLock(()=>atomicWork(makeAfter));
 async function install(result,{register=false,keepLocal=false}={}){
  assertActive();if(!/^[a-f0-9]{64}$/.test(result.token||'')||!result.progress?.values)throw Error('account-save-invalid');
  const previous=meta();if(previous&&previous.owner!==result.owner)throw Error('account-switch-first');
  await atomic(()=>{const draft=!previous?offline(result.owner):null,after={};for(const k of D.keys)after[k]=keepLocal&&draft?(draft.progress.values[k]??null):(keepLocal||register)?get(k):result.progress.values[k]??null;
  after[offlineKey(result.owner)]=null;
  if(!previous)after[guestKey]=JSON.stringify(register?Object.fromEntries([...D.keys,identityKey,rankKey].map(k=>[k,null])):guest());
  after[identityKey]=after[rankKey]=result.token;
  after[metaKey]=JSON.stringify({username:result.username,owner:result.owner,revision:result.revision,expiresAt:result.expiresAt});after[profileKey]=crypto.randomUUID();
  for(const k of caches)after[k]=null;
  return after;});lastSaved=null;conflict=false;emit('saved','ログインしました。記録を引き継いで遊べます。');schedule();
 }
 function schedule(){if(!meta()||conflict||state==='expired'||switching)return;clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),2000);}
 async function sync(force=false,keepalive=false){
  assertActive();if(!meta())return null;if(conflict)throw Error('account-conflict');if(saving)return saving;
  const snapshot=capture(),serialized=JSON.stringify(snapshot);if(!force&&serialized===lastSaved)return meta();
  const current=meta(),profile=loadedProfile;emit('saving','記録を保存中…');
  saving=(async()=>{
   try{const r=await request('save',{revision:current.revision,progress:snapshot},undefined,keepalive);assertActive();if(profile!==loadedProfile)throw Error('account-changed');localStorage.setItem(metaKey,JSON.stringify({...current,revision:r.revision}));lastSaved=serialized;emit('saved','記録を保存しました');return r;}
   catch(error){if(error.message==='account-conflict')conflict=true;emit(error.message==='account-session-expired'?'expired':conflict?'conflict':'offline',errors[error.message]||'接続が戻ると記録の保存を再試行します');throw error;}
   finally{saving=null;}
  })();return saving;
 }
 async function logout(){
  await walletLock(async()=>{
   assertActive();if(saving)await saving;const current=meta(),expired=state==='expired'||current?.expiresAt<=Date.now();if(!expired){await sync(true);await request('logout',{});}
   atomicWork(()=>{const saved=parse(guestKey)||{},after={};if(expired)after[offlineKey(current.owner)]=JSON.stringify({owner:current.owner,revision:current.revision,progress:capture()});for(const k of [...D.keys,identityKey,rankKey])after[k]=saved[k]??null;
    for(const k of [...caches,metaKey,profileKey,guestKey])after[k]=null;return after;});
   lastSaved=null;conflict=false;emit('guest','ログアウトしました');
  });
 }
 async function useCloud(){
  assertActive();if(saving)await saving;const r=await request('load'),current=meta(),after={};
  for(const k of D.keys)after[k]=r.progress.values[k]??null;after[metaKey]=JSON.stringify({...current,revision:r.revision});after[profileKey]=crypto.randomUUID();for(const k of caches)after[k]=null;
  await atomic(after);lastSaved=JSON.stringify(capture());conflict=false;emit('saved','サーバーの記録を読み込みました');return r;
 }
 async function useLocal(){assertActive();if(saving)await saving;const r=await request('session');localStorage.setItem(metaKey,JSON.stringify({...meta(),revision:r.revision}));conflict=false;return sync(true);}
 function changed(){
  if(get(profileKey)===loadedProfile&&!get(journalKey))return;
  clearTimeout(timer);state='changed';if(document.getElementById('accountChanged'))return;
  const box=document.createElement('div');box.id='accountChanged';box.className='account-changed';box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','アカウントが変更されました');
  const p=document.createElement('p');p.textContent=errors['account-changed'];const button=document.createElement('button');button.textContent='ページを読み直す';button.onclick=()=>location.reload();box.append(p,button);document.body.append(box);button.focus();
 }
 window.addEventListener('storage',e=>{if(e.key===profileKey||e.key===journalKey||e.key===null)changed();else if(D.keys.includes(e.key))schedule();});
 window.addEventListener('hk-wallet-change',schedule);window.addEventListener('hk-progress-change',schedule);
 window.addEventListener('focus',()=>{try{assertActive();schedule();}catch{changed();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&meta())sync(false,true).catch(()=>{});});
 window.addEventListener('pagehide',()=>{if(meta())sync(false,true).catch(()=>{});});
 function start(){if(state==='storage'){emit('storage','保存設定を確認してください');return;}emit(meta()?'ready':'guest');if(meta())schedule();setInterval(()=>{if(!document.hidden&&meta())sync().catch(()=>{});},15000);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.HKAccountSync=Object.freeze({meta,offline,capture,assertActive,request,install,logout,sync,useCloud,useLocal,profileKey,metaKey,identityKey,errorText:e=>errors[e?.message]||'通信を確認して、もう一度試してください。',get state(){return state;}});
})();
