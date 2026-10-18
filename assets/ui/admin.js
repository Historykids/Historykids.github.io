(function(){
 'use strict';
 const key='hk_wealth_identity_v1',$=id=>document.getElementById(id);
 const messages={'identity-unavailable':'このブラウザに登録情報を保存できません。保存設定を確認してね。','identity-required':'管理者の登録情報が必要です。','admin-required':'管理者権限がありません。','admin-claimed':'管理者はすでに別の登録情報に紐づいています。','admin-code-invalid':'コードが違うよ。もう一度入力してね。','rate-limited':'試行回数が多いため、1分ほど待ってからもう一度お試しください。','admin-changed':'別の画面で設定が変わりました。最新の状態を読み込み直してね。','admin-input':'対象と操作内容を確認してください。','admin-words':'NGワードは1行に1つ、各24文字以内・100個までです。','record-gone':'対象の登録が見つかりません。'};
 const errorText=e=>messages[e?.message]||'接続できませんでした。通信を確認して、もう一度お試しください。';
 function identity(create=false){
  try{
   const saved=localStorage.getItem(key);if(/^[a-f0-9]{64}$/.test(saved||''))return saved;if(!create)return '';
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem(key,token);if(localStorage.getItem(key)!==token)throw Error();return token;
  }catch{throw Error('identity-unavailable');}
 }
 async function request(path,body,create=false){
  const token=identity(create),base=window.HKRankingConfig?.endpoint;if(!token)throw Error('identity-required');if(!base)throw Error('not-configured');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(new URL(path,base).href,{method:body?'POST':'GET',mode:'cors',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'admin-unavailable');return data;}finally{clearTimeout(timer);}
 }
 async function session(){return identity()?request('/wealth/admin/session'):{admin:false};}
 async function claim(code){const data=await request('/wealth/admin/claim',{code:typeof code==='string'?code.normalize('NFKC').trim():''},true);if(!data.admin)throw Error('admin-required');window.dispatchEvent(new Event('hk-admin-change'));return data;}
 window.HKAdmin=Object.freeze({claim,session,errorText});
 if(!$('adminPanel'))return;
 let state=null,busy=false,pending=null,epoch=0;
 const status=(text,error=false)=>{$('adminMessage').textContent=text;$('adminMessage').classList.toggle('error',error);};
 function controls(){
  for(const button of $('adminPanel').querySelectorAll('button'))button.disabled=busy;
  $('adminWords').disabled=busy;$('adminSearch').disabled=busy;
 }
 function render(){
  if(!state)return;
  $('adminTotal').textContent=state.total.toLocaleString('ja-JP');$('adminBanned').textContent=state.entries.filter(e=>e.banned).length.toLocaleString('ja-JP');$('adminWordCount').textContent=state.words.length.toLocaleString('ja-JP');
  const query=$('adminSearch').value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP'),fragment=document.createDocumentFragment();let shown=0;
  for(const entry of state.entries.filter(e=>e.name.normalize('NFKC').toLocaleLowerCase('ja-JP').includes(query))){
   const row=document.createElement('tr');for(const value of [entry.name,window.HKAmounts.format(entry.score)+'点',entry.rebirths.toLocaleString('ja-JP')+'回',entry.banned?'BAN中':entry.nameBlocked?'名前NG':'公開中']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
   const cell=document.createElement('td'),button=document.createElement('button');button.type='button';button.dataset.adminTarget=entry.id;button.textContent=entry.banned?'BANを解除':'BANする';button.className=entry.banned?'admin-restore':'admin-ban';cell.append(button);row.append(cell);fragment.append(row);shown++;
  }
  $('adminRows').replaceChildren(fragment);$('adminShown').textContent=shown+'件を表示（最大500件）';$('adminNoEntries').hidden=shown>0;controls();
 }
 function accept(data){if(!data.admin||!Array.isArray(data.entries)||!Array.isArray(data.words))throw Error('admin-required');state=data;$('adminWords').value=data.words.join('\n');$('adminPanel').hidden=false;$('adminAccess').hidden=true;$('adminEntry').hidden=false;render();}
 async function load(){
  if(busy)return;busy=true;controls();const sequence=++epoch;
  try{const auth=await session();$('adminEntry').hidden=!auth.admin;if(!auth.admin){state=null;$('adminPanel').hidden=true;$('adminAccess').hidden=location.hash!=='#admin';return;}const data=await request('/wealth/admin/board');if(sequence===epoch){accept(data);status('最新の管理情報を読み込みました。');if(location.hash==='#admin')$('adminPanel').scrollIntoView({block:'start'});}}
  catch(error){if(sequence===epoch){status(errorText(error),true);if(error.message==='admin-required'||error.message==='identity-required'){$('adminPanel').hidden=true;$('adminEntry').hidden=true;$('adminAccess').hidden=location.hash!=='#admin';}}}
  finally{busy=false;controls();}
 }
 $('adminRows').onclick=e=>{
  const button=e.target.closest('[data-admin-target]');if(!button||busy)return;const entry=state?.entries.find(x=>x.id===button.dataset.adminTarget);if(!entry)return;
  pending={id:entry.id,banned:!entry.banned,expectedRevision:state.revision};$('adminConfirmName').textContent=entry.name;$('adminConfirmText').textContent=entry.banned?'この登録のBANを解除します。名前がNGワードに該当する場合は、別の名前への変更が必要です。':'この登録を成金ランキングから非表示にし、同じ登録情報からの再登録を停止します。';$('adminCommit').textContent=entry.banned?'BANを解除する':'この登録をBANする';$('adminConfirm').hidden=false;
 };
 $('adminCancel').onclick=()=>{pending=null;$('adminConfirm').hidden=true;};
 $('adminCommit').onclick=async()=>{
  if(!pending||busy)return;const action=pending,sequence=epoch;busy=true;controls();
  try{const data=await request('/wealth/admin/moderate',action);if(sequence!==epoch)return;accept(data);pending=null;$('adminConfirm').hidden=true;status(action.banned?'BANしました。':'BANを解除しました。');window.dispatchEvent(new Event('hk-wealth-moderated'));}
  catch(error){status(errorText(error),true);pending=null;$('adminConfirm').hidden=true;}
  finally{busy=false;controls();}
 };
 $('adminWordsForm').onsubmit=async e=>{
  e.preventDefault();if(!state||busy)return;const words=$('adminWords').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),sequence=epoch;busy=true;controls();
  try{const data=await request('/wealth/admin/words',{words,expectedRevision:state.revision});if(sequence!==epoch)return;accept(data);status('NGワードを保存しました。既存の登録にも反映しました。');window.dispatchEvent(new Event('hk-wealth-moderated'));}catch(error){if(sequence===epoch)status(errorText(error),true);}finally{busy=false;controls();}
 };
 $('adminRefresh').onclick=load;$('adminSearch').oninput=render;
 window.addEventListener('hk-admin-change',load);window.addEventListener('hashchange',()=>{if(location.hash==='#admin')load();});window.addEventListener('storage',e=>{if(e.key===key||e.key===null){++epoch;state=null;pending=null;$('adminPanel').hidden=true;$('adminEntry').hidden=true;$('adminConfirm').hidden=true;busy=false;load();}});
 load();
})();
