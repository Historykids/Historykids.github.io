(function(){
 'use strict';
 const $=id=>document.getElementById(id),A=window.HKCommunity;if(!$('view-notifications')||!A)return;
 const readKey='hk_notice_read_v1',draftKey='hk_notice_draft_v1';let notices=[],unreadBefore=0,loading=false,sending=false,draft=null,role=false;
 const visible=()=>!$('view-notifications').hidden;
 const status=(text,error=false)=>{$('noticeStatus').textContent=text;$('noticeStatus').classList.toggle('error',error);};
 function lastRead(){try{return Number(localStorage.getItem(readKey))||0;}catch{return 0;}}
 function noticeCard(n,isNew=false){
  const article=document.createElement('article');article.className='notice-card';const meta=document.createElement('div');meta.className='notice-meta';
  const sender=document.createElement('span');sender.className='notice-sender';sender.textContent='運営からのお知らせ';const time=document.createElement('time');time.dateTime=new Date(n.createdAt).toISOString();time.textContent=new Date(n.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
  meta.append(sender,time);if(isNew){const fresh=document.createElement('span');fresh.className='notice-new';fresh.textContent='NEW';meta.append(fresh);}
  const title=document.createElement('h3'),body=document.createElement('p');body.className='notice-body';title.textContent=n.title;body.textContent=n.body;article.append(meta,title,body);return article;
 }
 function render(){
  const unread=notices.filter(n=>n.id>lastRead()).length;$('noticeUnread').hidden=!unread;$('noticeUnread').textContent=unread>99?'99+':String(unread);
  $('noticeNav').setAttribute('aria-label','通知'+(unread?' · 未読'+unread+'件':''));$('noticeCount').textContent=notices.length+'件のお知らせ';
  $('noticeList').replaceChildren(...notices.map(n=>noticeCard(n,n.id>unreadBefore)));$('noticeEmpty').hidden=notices.length>0;
  if(visible()&&notices.length){try{localStorage.setItem(readKey,String(notices[0].id));}catch{}$('noticeUnread').hidden=true;$('noticeNav').setAttribute('aria-label','通知');}
 }
 async function checkRole(){
  try{role=!!(await window.HKAdmin.session()).admin;}catch{role=false;}$('noticeCompose').hidden=!role;
 }
 async function load(){
  if(loading)return;loading=true;$('noticeRefresh').disabled=true;unreadBefore=lastRead();
  try{const data=await A.request('/wealth/notices',undefined,false);if(!Array.isArray(data.notices))throw Error('connection');notices=data.notices;render();status('最新のお知らせを読み込みました。');}
  catch(error){status(A.errorText(error),true);}finally{loading=false;$('noticeRefresh').disabled=false;}
 }
 function controls(){for(const el of $('noticeForm').querySelectorAll('input,textarea,button'))el.disabled=sending;for(const b of $('noticePreview').querySelectorAll('button'))b.disabled=sending;}
 $('noticeForm').onsubmit=e=>{
  e.preventDefault();if(sending||!role)return;const title=$('noticeTitle').value.trim(),body=$('noticeBody').value.trim();if(!title||Array.from(title).length>80||!body||Array.from(body).length>2000){status(A.errorText(Error('notice-input')),true);return;}
  if(!draft||draft.title!==title||draft.body!==body)draft={requestId:crypto.randomUUID(),title,body};
  try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{status('下書きを保存できません。保存設定を確認してから配信してください。',true);return;}
  $('noticePreviewCard').replaceChildren(noticeCard({...draft,createdAt:Date.now()}));$('noticePreview').hidden=false;status('内容を確認して「全員に配信する」を押すと公開されます。');
 };
 $('noticeEdit').onclick=()=>{$('noticePreview').hidden=true;$('noticeTitle').focus();};
 for(const id of ['noticeTitle','noticeBody'])$(id).addEventListener('input',()=>{$('noticePreview').hidden=true;});
 $('noticeSend').onclick=async()=>{
  if(sending||!draft||!role||$('noticePreview').hidden)return;sending=true;controls();
  try{const data=await A.request('/wealth/admin/notices',draft,false);notices=data.notices;render();draft=null;try{localStorage.removeItem(draftKey);}catch{}$('noticeForm').reset();$('noticePreview').hidden=true;status('運営からのお知らせを、全員の通知ページへ配信しました。');}
  catch(error){if(error.message==='admin-required'){role=false;$('noticeCompose').hidden=true;}status(A.errorText(error),true);}finally{sending=false;controls();}
 };
 $('noticeRefresh').onclick=load;
 window.addEventListener('hk-view-change',e=>{if(e.detail==='notifications'){load();checkRole();}});
 window.addEventListener('hk-admin-change',()=>{if(visible())checkRole();});
 window.addEventListener('storage',e=>{if(e.key===readKey)render();if(e.key==='hk_wealth_identity_v1'||e.key===null){role=false;$('noticeCompose').hidden=true;if(visible())checkRole();}});
 try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved&&typeof saved.title==='string'&&typeof saved.body==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(saved.requestId)){draft=saved;$('noticeTitle').value=saved.title;$('noticeBody').value=saved.body;}}catch{}
 load();if(visible())checkRole();setInterval(()=>{if(!document.hidden)load();},60000);
})();
