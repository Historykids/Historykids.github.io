(function(){
 'use strict';const A=window.HKCommunity,C=window.HKSengokuChatRules,$=id=>document.getElementById(id);if(!A||!C||!$('swChatSection'))return;
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;},identity=()=>{try{return A.identity(false);}catch{return '';}};
 let draft=[],outbox=null,sending=false,reading=false,readAgain=false,canSend=false,hasProfile=false,invalid=false,seq=0,offset=0,until=0,lastMessages='',channel=null,activeWorldId=null,channelsReady=false;
 const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 const now=()=>Date.now()+offset,channelName=()=>channel?'ワールド '+channel:'全ワールド共通',errors={'chat-emoji-only':'絵文字は8個まで、定型文は1つ選んで送れます。','chat-cooldown':'連投は少し待ってね。送れる時刻を確認しています。','chat-request':'送信内容や送信先が変わりました。ページを読み直してください。','chat-channel':'チャットの範囲を選び直してください。','chat-world-membership':'ワールド別の送信は、現在参加しているワールドでできます。','world-account':'最初に戦国天下統一の画面で名前を入力してね。ログインは不要です。','banned':'このアカウントでは送信できません。','nickname-blocked':'このアカウント名では送信できません。'};
 function controls(){
  $('scLogin').hidden=hasProfile;const wait=Math.max(0,Math.ceil((until-now())/1000));
  $('scChannel').disabled=invalid||sending||!!outbox||!channelsReady;$('scPresetCategory').disabled=invalid||sending||!!outbox;
  $('scSend').disabled=invalid||sending||!!outbox||!canSend||!draft.length||wait>0;$('scRetry').hidden=!outbox;$('scRetry').disabled=invalid||sending;
  $('scUndo').disabled=sending||!!outbox||!draft.length;$('scClear').disabled=sending||!!outbox||!draft.length;
  for(const b of $('scPresets').children)b.disabled=invalid||sending||!!outbox||!canSend;
  for(const b of $('scPalette').children)b.disabled=invalid||sending||!!outbox||!canSend||draft.length>=C.MAX_EMOJIS;
  $('scRefresh').disabled=invalid||reading||sending;$('scCount').textContent=C.presets.includes(draft[0])?'定型文 1件':draft.length+' / '+C.MAX_EMOJIS;
  $('scFeedTitle').textContent=channelName();$('scMessages').setAttribute('aria-label',channelName()+'のメッセージ');
  $('scTarget').textContent='送信先：'+channelName();
  $('scChannelHint').textContent=channel?'このワールド宛てのメッセージを表示します。送信は現在このワールドに参加している人ができます。':'全5ワールドのみんなに届く共通チャットです。';
  $('scWait').textContent=hasProfile&&channel&&activeWorldId!==channel?'このワールドは閲覧できます。送信は参加中のワールドか「全ワールド共通」でできます。':wait?'次の送信まで '+wait+'秒':canSend?'絵文字か定型文を選んで送信できます。':'読むだけでも参加できます。送信するには名前を入力してね。';
 }
 function compose(){$('scDraft').textContent=draft.join('')||'絵文字を選ぼう';controls();}
 function accept(data){
  if(data.protocol!=='sengoku-emoji-chat-v1'||!Array.isArray(data.messages)||(data.channelWorldId??null)!==channel)throw Error('connection');
  offset=data.at-Date.now();channelsReady=data.scopesVersion===C.CHANNEL_VERSION;activeWorldId=data.activeWorldId||null;hasProfile=data.hasProfile??data.canSend;canSend=data.canSend&&(!channel||channelsReady);until=data.cooldownUntil||0;
  const key=JSON.stringify([channel,data.messages]);if(key!==lastMessages){lastMessages=key;const list=$('scMessages'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
   list.replaceChildren(...data.messages.filter(m=>C.valid(m.emojis)).map(m=>{const li=node('li',m.own?'emoji-message own':'emoji-message'),meta=node('div','emoji-meta');meta.append(node('strong','',m.name),node('span','',m.worldId?'WORLD '+m.worldId:'共通'),node('time','',new Date(m.at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'})));if(m.title)meta.append(node('span','sg-title',m.title.name));if(m.own)meta.append(node('span','','あなた'));li.append(meta,node('p','emoji-body',m.emojis.join('')));return li;}));
   $('scEmpty').hidden=list.children.length>0;if(nearBottom)list.scrollTop=list.scrollHeight;
  }controls();
 }
 async function refresh(){
  if(invalid||sending)return;if(reading){readAgain=true;return;}readAgain=false;const run=++seq,token=identity();reading=true;controls();
  try{const r=await A.request('/wealth/sengoku/chat'+(channel?'?world='+channel:''),undefined,false);if(run!==seq||identity()!==token||invalid)return;accept(r);$('scStatus').textContent=channelName()+' · 最新60件 · 絵文字・定型文チャット';}
  catch(e){if(run===seq&&identity()===token&&!invalid){canSend=false;$('scStatus').textContent=A.errorText(e);}}
  finally{reading=false;controls();if(readAgain&&!invalid&&!sending){readAgain=false;refresh();}}
 }
 async function send(){
  if(invalid||sending||!outbox&&(!canSend||!C.valid(draft)||until>now()))return;
  outbox||={requestId:uuid(),emojis:[...draft],...(channel?{channelWorldId:channel}:{})};const payload=outbox,run=++seq,token=identity();sending=true;controls();
  try{const r=await A.request('/wealth/sengoku/chat/send',payload,false);if(run!==seq||identity()!==token||invalid)return;accept(r);outbox=null;draft=[];compose();$('scStatus').textContent=channelName()+'に送信しました。';}
  catch(e){if(run!==seq||identity()!==token||invalid)return;if(errors[e.message]||e.message.startsWith('account-')||e.message.startsWith('sengoku-')){outbox=null;$('scStatus').textContent=errors[e.message]||A.errorText(e);if(e.message==='chat-cooldown')until=Math.max(until,now()+C.COOLDOWN);else canSend=false;}else $('scStatus').textContent='送信を確認できません。同じ内容でもう一度確認すると、送信先を変えず、二重送信せずに結果を取得します。';}
  finally{sending=false;controls();}
 }
 function clear(){seq++;invalid=true;canSend=false;hasProfile=false;draft=[];outbox=null;lastMessages='';channel=null;channelsReady=false;readAgain=false;$('scChannel').value='all';$('scMessages').replaceChildren();$('scEmpty').hidden=false;$('scStatus').textContent='アカウントが変わりました。ページを読み直してください。';compose();}
 $('scChannel').replaceChildren(...[['all','全ワールド共通'],...Array.from({length:window.HKSengokuWorldRules.WORLD_COUNT},(_,i)=>[String(i+1),'ワールド '+(i+1)])].map(([value,label])=>{const o=node('option','',label);o.value=value;return o;}));
 $('scChannel').onchange=()=>{if($('scChannel').disabled)return;seq++;channel=$('scChannel').value==='all'?null:Number($('scChannel').value);canSend=false;lastMessages='';$('scMessages').replaceChildren();$('scEmpty').hidden=false;compose();refresh();};
 $('scPalette').replaceChildren(...C.palette.map(item=>{const b=node('button','emoji-choice',item.emoji);b.type='button';b.setAttribute('aria-label',item.label);b.title=item.label;b.onclick=()=>{if(!canSend||sending||outbox||draft.length>=C.MAX_EMOJIS)return;if(C.presets.includes(draft[0]))draft=[];draft.push(item.emoji);compose();};return b;}));
 function presets(){const group=C.presetGroups.find(g=>g.id===$('scPresetCategory').value),messages=group?.messages||C.presets;$('scPresets').replaceChildren(...messages.map(text=>{const b=node('button','secondary',text);b.type='button';b.onclick=()=>{if(!canSend||sending||outbox)return;draft=[text];compose();};return b;}));controls();}
 $('scPresetCategory').replaceChildren(...[['all','すべて（'+C.presets.length+'種類）'],...C.presetGroups.map(g=>[g.id,g.name])].map(([value,label])=>{const o=node('option','',label);o.value=value;return o;}));$('scPresetCategory').onchange=presets;presets();
 $('scUndo').onclick=()=>{draft.pop();compose();};$('scClear').onclick=()=>{draft=[];compose();};$('scSend').onclick=send;$('scRetry').onclick=send;$('scRefresh').onclick=refresh;
 window.addEventListener('storage',e=>{if(e.key===null||['hk_wealth_identity_v1','hk_account_profile_v1'].includes(e.key))clear();});window.addEventListener('hk-account-sync',e=>{if(e.detail?.state==='changed')clear();});
 setInterval(()=>{if(!document.hidden&&!$('swChatSection').hidden)refresh();},10000);setInterval(()=>{if(!$('swChatSection').hidden)controls();},1000);window.HKEmojiChat=Object.freeze({refresh,clear});compose();
})();
