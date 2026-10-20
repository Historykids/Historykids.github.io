(function(){
 'use strict';
 const $=id=>document.getElementById(id),A=window.HKCommunity;if(!$('view-notifications')||!A)return;
 const draftKey='hk_notice_draft_v1';let notices=[],recipients=[],unreadBefore=new Set(),loading=false,sending=false,draft=null,role=false,epoch=0;
 const identity=()=>{try{return A.identity(false);}catch{return '';}},readKey=()=> 'hk_notice_seen_v3_'+(identity().slice(0,12)||'anonymous');
 const visible=()=>!$('view-notifications').hidden;
 const status=(text,error=false)=>{$('noticeStatus').textContent=text;$('noticeStatus').classList.toggle('error',error);};
 function lastRead(){try{const value=JSON.parse(localStorage.getItem(readKey())||'[]');return new Set(Array.isArray(value)?value.map(String):[]);}catch{return new Set();}}
 function noticeCard(n,isNew=false){
  const article=document.createElement('article');article.className='notice-card';const meta=document.createElement('div');meta.className='notice-meta';
  const sender=document.createElement('span');sender.className='notice-sender';sender.textContent='運営からのお知らせ';const time=document.createElement('time');time.dateTime=new Date(n.createdAt).toISOString();time.textContent=new Date(n.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
  meta.append(sender,time);if(n.audience==='personal'){const personal=document.createElement('span');personal.className='notice-personal';personal.textContent='あなた宛て';meta.append(personal);}if(isNew){const fresh=document.createElement('span');fresh.className='notice-new';fresh.textContent='NEW';meta.append(fresh);}
  const title=document.createElement('h3'),body=document.createElement('p');body.className='notice-body';title.textContent=n.title;body.textContent=n.body;article.append(meta,title,body);return article;
 }
 function render(){
  const seen=lastRead(),unread=notices.filter(n=>!seen.has(String(n.id))).length;$('noticeUnread').hidden=!unread;$('noticeUnread').textContent=unread>99?'99+':String(unread);
  $('noticeNav').setAttribute('aria-label','通知'+(unread?' · 未読'+unread+'件':''));$('noticeCount').textContent=notices.length+'件のお知らせ';
  $('noticeList').replaceChildren(...notices.map(n=>noticeCard(n,!unreadBefore.has(String(n.id)))));$('noticeEmpty').hidden=notices.length>0;
  if(visible()&&notices.length){try{localStorage.setItem(readKey(),JSON.stringify([...new Set([...seen,...notices.map(n=>String(n.id))])].slice(-1000)));}catch{}$('noticeUnread').hidden=true;$('noticeNav').setAttribute('aria-label','通知');}
 }
 async function checkRole(){
  const sequence=epoch,token=identity();
  try{const auth=await window.HKAdmin.session();if(sequence!==epoch||identity()!==token)return;role=!!auth.admin;if(role){const data=await A.request('/wealth/admin/recipients',undefined,false);if(sequence!==epoch||identity()!==token)return;recipients=data.recipients;renderRecipients();}}
  catch{role=false;}$('noticeCompose').hidden=!role;
 }
 async function load(){
  if(loading)return;loading=true;$('noticeRefresh').disabled=true;unreadBefore=lastRead();const sequence=epoch,token=identity();
  try{const data=await A.request('/wealth/notices',undefined,false);if(sequence!==epoch||identity()!==token)return;if(!Array.isArray(data.notices))throw Error('connection');notices=data.notices;render();status('最新のお知らせを読み込みました。');}
  catch(error){if(sequence===epoch)status(A.errorText(error),true);}finally{loading=false;$('noticeRefresh').disabled=false;if(sequence!==epoch)load();}
 }
 function renderRecipients(){
  const selected=$('noticeRecipient').value||draft?.recipient||'',placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='配信する登録者を選ぶ';
  const options=recipients.map(r=>{const option=document.createElement('option');option.value=r.id;option.textContent=r.name+' · ↻'+r.rebirths+'回 · ID '+r.id.slice(0,8);return option;});
  $('noticeRecipient').replaceChildren(placeholder,...options);$('noticeRecipient').value=recipients.some(r=>r.id===selected)?selected:'';audienceChanged();
 }
 function audienceChanged(){$('noticeRecipientField').hidden=$('noticeAudience').value!=='personal';$('noticeRecipient').required=$('noticeAudience').value==='personal';$('noticePreview').hidden=true;}
 function controls(){for(const el of $('noticeForm').querySelectorAll('input,textarea,select,button'))el.disabled=sending;for(const b of $('noticePreview').querySelectorAll('button'))b.disabled=sending;}
 $('noticeForm').onsubmit=e=>{
  e.preventDefault();if(sending||!role)return;const title=$('noticeTitle').value.trim(),body=$('noticeBody').value.trim();if(!title||Array.from(title).length>80||!body||Array.from(body).length>2000){status(A.errorText(Error('notice-input')),true);return;}
  const recipient=$('noticeAudience').value==='personal'?$('noticeRecipient').value:'',person=recipients.find(r=>r.id===recipient);
  if($('noticeAudience').value==='personal'&&!person){status('配信する登録者を選んでください。',true);return;}
  if(!draft||draft.title!==title||draft.body!==body||(draft.recipient||'')!==recipient)draft={requestId:crypto.randomUUID(),title,body,recipient};
  try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{status('下書きを保存できません。保存設定を確認してから配信してください。',true);return;}
  const target=person?person.name+'さん（ID '+person.id.slice(0,8)+'）':'全員';$('noticePreviewTarget').textContent='配信先：'+target;
  $('noticeSend').textContent=person?'この人に配信する':'全員に配信する';$('noticePreviewCard').replaceChildren(noticeCard({...draft,audience:person?'personal':'all',createdAt:Date.now()}));$('noticePreview').hidden=false;status('配信先と内容を確認して、配信ボタンを押してください。');
 };
 $('noticeEdit').onclick=()=>{$('noticePreview').hidden=true;$('noticeTitle').focus();};
 for(const id of ['noticeTitle','noticeBody'])$(id).addEventListener('input',()=>{$('noticePreview').hidden=true;});
 $('noticeAudience').onchange=audienceChanged;$('noticeRecipient').onchange=()=>{$('noticePreview').hidden=true;};
 $('noticeSend').onclick=async()=>{
  if(sending||!draft||!role||$('noticePreview').hidden)return;sending=true;controls();const sequence=epoch;
  try{const data=await A.request(draft.recipient?'/wealth/admin/personal-notices':'/wealth/admin/notices',draft,false);if(sequence!==epoch)return;notices=data.notices;render();draft=null;try{localStorage.removeItem(draftKey);}catch{}$('noticeForm').reset();audienceChanged();$('noticePreview').hidden=true;status(data.sent?.audience==='personal'?data.sent.recipientName+'さんのみに配信しました。':'運営からのお知らせを、全員の通知ページへ配信しました。');}
  catch(error){if(error.message==='admin-required'){role=false;$('noticeCompose').hidden=true;}status(A.errorText(error),true);}finally{sending=false;controls();}
 };
 $('noticeRefresh').onclick=()=>{load();if(visible())checkRole();};
 window.addEventListener('hk-view-change',e=>{if(e.detail==='notifications'){load();checkRole();}});
 window.addEventListener('hk-admin-change',()=>{epoch++;notices=[];render();load();if(visible())checkRole();});
 window.addEventListener('storage',e=>{if(e.key===readKey())render();if(e.key==='hk_wealth_identity_v1'||e.key===null){epoch++;notices=[];recipients=[];draft=null;role=false;$('noticeForm').reset();$('noticePreview').hidden=true;$('noticeCompose').hidden=true;render();load();if(visible())checkRole();}});
 try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved&&typeof saved.title==='string'&&typeof saved.body==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(saved.requestId)){draft=saved;$('noticeTitle').value=saved.title;$('noticeBody').value=saved.body;$('noticeAudience').value=saved.recipient?'personal':'all';audienceChanged();}}catch{}
 load();if(visible())checkRole();setInterval(()=>{if(!document.hidden)load();},60000);
})();
