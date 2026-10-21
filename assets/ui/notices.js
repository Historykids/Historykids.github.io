(function(){
 'use strict';
 const $=id=>document.getElementById(id),A=window.HKCommunity;if(!$('view-notifications')||!A)return;
 const draftKey='hk_notice_draft_v1';
 let notices=[],recipients=[],history=[],nextOffset=null,historyRun=0,historyLoading=false,managing=false,selection=null,mutation=null;
 let unreadBefore=new Set(),loading=false,sending=false,draft=null,role=false,epoch=0,feedRun=0;
 const identity=()=>{try{return A.identity(false);}catch{return '';}},readKey=()=> 'hk_notice_seen_v3_'+(identity().slice(0,12)||'anonymous');
 const visible=()=>!$('view-notifications').hidden;
 const status=(text,error=false)=>{$('noticeStatus').textContent=text;$('noticeStatus').classList.toggle('error',error);};
 const manageStatus=(text,error=false)=>{$('noticeManageStatus').textContent=text;$('noticeManageStatus').classList.toggle('error',error);};
 const stamp=n=>String(n.id)+(n.revision>1?':'+n.revision:'');
 const date=value=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
 const target=n=>n.audience==='personal'?n.recipientName+'さん（ID '+n.recipient.slice(0,8)+'）':'全員';
 function lastRead(){try{const value=JSON.parse(localStorage.getItem(readKey())||'[]');return new Set(Array.isArray(value)?value.map(String):[]);}catch{return new Set();}}
 function noticeCard(n,isNew=false,admin=false){
  const article=document.createElement('article');article.className='notice-card';const meta=document.createElement('div');meta.className='notice-meta';
  const sender=document.createElement('span');sender.className='notice-sender';sender.textContent='通知';const time=document.createElement('time');time.dateTime=new Date(n.createdAt).toISOString();time.textContent=date(n.createdAt);
  meta.append(sender,time);if(n.audience==='personal'){const personal=document.createElement('span');personal.className='notice-personal';personal.textContent=admin?'個人配信':'あなた宛て';meta.append(personal);}
  if(n.updatedAt){const edited=document.createElement('span');edited.className='notice-edited';edited.textContent='編集済み · '+date(n.updatedAt);meta.append(edited);}
  if(isNew){const fresh=document.createElement('span');fresh.className='notice-new';fresh.textContent='NEW';meta.append(fresh);}
  const title=document.createElement('h3'),body=document.createElement('p');body.className='notice-body';title.textContent=n.title;body.textContent=n.body;article.append(meta,title,body);
  if(admin){
   const recipient=document.createElement('p');recipient.className='notice-recipient';recipient.textContent='配信先：'+target(n);
   const actions=document.createElement('div');actions.className='notice-actions';
   for(const [action,label] of [['edit','編集'],['delete','削除']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.noticeAction=action;button.dataset.noticeId=n.id;button.setAttribute('aria-label',n.title+'を'+label);if(action==='delete')button.className='notice-danger';button.onclick=()=>openManager(n,action);actions.append(button);}
   article.append(recipient,actions);
  }
  return article;
 }
 function render(){
  const seen=lastRead(),unread=notices.filter(n=>!seen.has(stamp(n))).length;$('noticeUnread').hidden=!unread;$('noticeUnread').textContent=unread>99?'99+':String(unread);
  $('noticeNav').setAttribute('aria-label','通知'+(unread?' · 未読'+unread+'件':''));$('noticeCount').textContent=notices.length+'件の通知';
  $('noticeList').replaceChildren(...notices.map(n=>noticeCard(n,!unreadBefore.has(stamp(n)))));$('noticeEmpty').hidden=notices.length>0;
  if(visible()&&notices.length){try{localStorage.setItem(readKey(),JSON.stringify([...new Set([...seen,...notices.map(stamp)])].slice(-1000)));}catch{}$('noticeUnread').hidden=true;$('noticeNav').setAttribute('aria-label','通知');}
 }
 function closeManager(){selection=null;mutation=null;$('noticeManager').hidden=true;$('noticeUpdateForm').reset();$('noticeManagerTarget').textContent='';}
 function clearAdmin(){
  role=false;recipients=[];history=[];nextOffset=null;historyRun++;historyLoading=false;managing=false;closeManager();
  $('noticeCompose').hidden=true;$('noticeManage').hidden=true;$('noticeHistoryList').replaceChildren();$('noticeRecipient').replaceChildren();$('noticePreviewCard').replaceChildren();$('noticePreviewTarget').textContent='';$('noticePreview').hidden=true;manageStatus('');controls();manageControls();
 }
 function renderHistory(){
  $('noticeHistoryList').replaceChildren(...history.map(n=>noticeCard(n,false,true)));$('noticeHistoryEmpty').hidden=history.length>0;$('noticeHistoryMore').hidden=nextOffset===null;manageControls();
 }
 function manageControls(){
  for(const el of $('noticeManage').querySelectorAll('button,input,textarea'))el.disabled=managing;
  $('noticeHistoryMore').disabled=managing||historyLoading;$('noticeHistoryRefresh').disabled=managing||historyLoading;
 }
 async function loadHistory(append=false){
  if(!role||append&&(historyLoading||nextOffset===null))return false;
  const sequence=epoch,token=identity(),run=++historyRun,offset=append?nextOffset:0;historyLoading=true;manageControls();
  try{
   const data=await A.request('/wealth/admin/notice-history?offset='+offset,undefined,false);
   if(sequence!==epoch||identity()!==token||run!==historyRun||!role)return false;
   if(!Array.isArray(data.notices))throw Error('connection');history=append?[...history,...data.notices.filter(n=>!history.some(old=>old.id===n.id))]:data.notices;nextOffset=data.nextOffset;renderHistory();return true;
  }catch(error){if(sequence===epoch&&run===historyRun){if(error.message==='admin-required')clearAdmin();else manageStatus(A.errorText(error),true);}return false;}
  finally{if(sequence===epoch&&run===historyRun){historyLoading=false;manageControls();}}
 }
 async function checkRole(){
  const sequence=epoch,token=identity();
  try{
   const auth=await window.HKAdmin.session();if(sequence!==epoch||identity()!==token)return;
   if(!auth.admin){clearAdmin();return;}role=true;$('noticeCompose').hidden=false;$('noticeManage').hidden=false;loadHistory();
   const data=await A.request('/wealth/admin/recipients',undefined,false);if(sequence!==epoch||identity()!==token||!role)return;recipients=data.recipients;renderRecipients();
  }catch(error){if(sequence===epoch&&identity()===token){if(!role||error.message==='admin-required')clearAdmin();else status(A.errorText(error),true);}}
 }
 async function load(){
  if(loading)return;loading=true;$('noticeRefresh').disabled=true;unreadBefore=lastRead();const sequence=epoch,token=identity(),run=++feedRun;
  try{const data=await A.request('/wealth/notices',undefined,false);if(sequence!==epoch||identity()!==token||run!==feedRun)return;if(!Array.isArray(data.notices))throw Error('connection');notices=data.notices;render();status('最新の通知を読み込みました。');}
  catch(error){if(sequence===epoch)status(A.errorText(error),true);}finally{loading=false;$('noticeRefresh').disabled=false;if(sequence!==epoch)load();}
 }
 function renderRecipients(){
  const selected=$('noticeRecipient').value||draft?.recipient||'',placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='配信する登録者を選ぶ';
  const options=recipients.map(r=>{const option=document.createElement('option');option.value=r.id;option.textContent=r.name+' · ↻'+r.rebirths+'回 · ID '+r.id.slice(0,8);return option;});
  $('noticeRecipient').replaceChildren(placeholder,...options);$('noticeRecipient').value=recipients.some(r=>r.id===selected)?selected:'';audienceChanged();
 }
 function audienceChanged(){$('noticeRecipientField').hidden=$('noticeAudience').value!=='personal';$('noticeRecipient').required=$('noticeAudience').value==='personal';$('noticePreview').hidden=true;}
 function controls(){for(const el of $('noticeForm').querySelectorAll('input,textarea,select,button'))el.disabled=sending;for(const b of $('noticePreview').querySelectorAll('button'))b.disabled=sending;}
 function openManager(n,action){
  if(!role||managing)return;selection={...n,action};mutation=null;$('noticeManager').hidden=false;$('noticeManagerTitle').textContent=action==='edit'?'通知を編集する':'通知を削除する';
  $('noticeManagerTarget').textContent='配信先：'+target(n)+' ／ '+n.title;$('noticeUpdateForm').hidden=action!=='edit';$('noticeDeleteConfirm').hidden=action!=='delete';
  $('noticeUpdateTitle').value=n.title;$('noticeUpdateBody').value=n.body;manageStatus('');$('noticeManager').scrollIntoView({behavior:'smooth',block:'center'});$('noticeManager').focus();
 }
 async function changeNotice(action){
  if(!role||managing||!selection||selection.action!==action)return;
  const content=action==='edit'?{title:$('noticeUpdateTitle').value.trim(),body:$('noticeUpdateBody').value.trim()}:{};
  if(action==='edit'&&(!content.title||Array.from(content.title).length>80||!content.body||Array.from(content.body).length>2000)){manageStatus(A.errorText(Error('notice-input')),true);return;}
  const payload={id:selection.id,expectedRevision:selection.revision,...content};
  if(!mutation||JSON.stringify(mutation.payload)!==JSON.stringify(payload))mutation={payload,request:{...payload,requestId:crypto.randomUUID()}};
  const sequence=epoch,token=identity(),request=mutation.request;managing=true;manageControls();
  try{
   const data=await A.request('/wealth/admin/notice-'+action,request,false);if(sequence!==epoch||identity()!==token)return;
   feedRun++;notices=data.notices;render();closeManager();const refreshed=await loadHistory();if(sequence!==epoch||identity()!==token)return;
   manageStatus((action==='edit'?'通知を編集しました。':'通知を削除しました。')+(refreshed?'':'一覧は「一覧を更新」で確認してください。'));$('noticeHistoryRefresh').focus();
  }catch(error){if(sequence===epoch&&identity()===token){if(error.message==='admin-required')clearAdmin();else manageStatus(A.errorText(error),true);}}
  finally{if(sequence===epoch){managing=false;manageControls();}}
 }
 $('noticeUpdateForm').onsubmit=e=>{e.preventDefault();changeNotice('edit');};$('noticeDeleteCommit').onclick=()=>changeNotice('delete');
 for(const id of ['noticeUpdateCancel','noticeDeleteCancel'])$(id).onclick=()=>{if(!managing)closeManager();};
 $('noticeHistoryRefresh').onclick=()=>loadHistory();$('noticeHistoryMore').onclick=()=>loadHistory(true);
 $('noticeForm').onsubmit=e=>{
  e.preventDefault();if(sending||!role)return;const title=$('noticeTitle').value.trim(),body=$('noticeBody').value.trim();if(!title||Array.from(title).length>80||!body||Array.from(body).length>2000){status(A.errorText(Error('notice-input')),true);return;}
  const recipient=$('noticeAudience').value==='personal'?$('noticeRecipient').value:'',person=recipients.find(r=>r.id===recipient);
  if($('noticeAudience').value==='personal'&&!person){status('配信する登録者を選んでください。',true);return;}
  if(!draft||draft.title!==title||draft.body!==body||(draft.recipient||'')!==recipient)draft={requestId:crypto.randomUUID(),title,body,recipient};
  try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{status('下書きを保存できません。保存設定を確認してから配信してください。',true);return;}
  const label=person?person.name+'さん（ID '+person.id.slice(0,8)+'）':'全員';$('noticePreviewTarget').textContent='配信先：'+label;
  $('noticeSend').textContent=person?'この人に配信する':'全員に配信する';$('noticePreviewCard').replaceChildren(noticeCard({...draft,audience:person?'personal':'all',createdAt:Date.now()}));$('noticePreview').hidden=false;status('配信先と内容を確認して、配信ボタンを押してください。');
 };
 $('noticeEdit').onclick=()=>{$('noticePreview').hidden=true;$('noticeTitle').focus();};
 for(const id of ['noticeTitle','noticeBody'])$(id).addEventListener('input',()=>{$('noticePreview').hidden=true;});
 $('noticeAudience').onchange=audienceChanged;$('noticeRecipient').onchange=()=>{$('noticePreview').hidden=true;};
 $('noticeSend').onclick=async()=>{
  if(sending||!draft||!role||$('noticePreview').hidden)return;sending=true;controls();const sequence=epoch,token=identity();
  try{const data=await A.request(draft.recipient?'/wealth/admin/personal-notices':'/wealth/admin/notices',draft,false);if(sequence!==epoch||identity()!==token)return;feedRun++;notices=data.notices;render();draft=null;try{localStorage.removeItem(draftKey);}catch{}$('noticeForm').reset();audienceChanged();$('noticePreview').hidden=true;status(data.sent?.audience==='personal'?data.sent.recipientName+'さんのみに配信しました。':'通知を全員に配信しました。');loadHistory();}
  catch(error){if(sequence===epoch&&identity()===token){if(error.message==='admin-required')clearAdmin();status(A.errorText(error),true);}}finally{if(sequence===epoch){sending=false;controls();}}
 };
 $('noticeRefresh').onclick=()=>{load();if(visible())checkRole();};
 window.addEventListener('hk-view-change',e=>{if(e.detail==='notifications'){load();checkRole();}});
 function identityChanged(){epoch++;notices=[];draft=null;sending=false;clearAdmin();$('noticeForm').reset();$('noticePreview').hidden=true;render();load();if(visible())checkRole();}
 window.addEventListener('hk-admin-change',identityChanged);
 window.addEventListener('storage',e=>{if(e.key===readKey())render();if(e.key==='hk_wealth_identity_v1'||e.key===null)identityChanged();});
 try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved&&typeof saved.title==='string'&&typeof saved.body==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(saved.requestId)){draft=saved;$('noticeTitle').value=saved.title;$('noticeBody').value=saved.body;$('noticeAudience').value=saved.recipient?'personal':'all';audienceChanged();}}catch{}
 load();if(visible())checkRole();setInterval(()=>{if(!document.hidden)load();},60000);
})();
