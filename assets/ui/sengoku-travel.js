(function(){
 'use strict';
 const $=id=>document.getElementById(id),A=window.HKCommunity,R=window.HKSengokuKuniMap;if(!$('wtCards')||!A||!R)return;
 const fmt=n=>Number(n||0).toLocaleString('ja-JP'),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const errors={'world-account':'最初にアカウント名を入力してね。ログインは不要です。','world-name':'名前は1〜24文字の文字・数字・空白・ハイフン・下線で入力してね。','world-name-used':'その名前は使用されています。別の名前を入力してね。','world-name-fixed':'保存済みの名前で続けてね。','nickname-blocked':'その名前は使えません。別の名前を入力してね。','world-spawn-unavailable':'その土地の戦況が変わりました。別の出発地点を選んでね。','world-pending':'途中のクイズを終えてから変更してね。','world-incoming':'攻撃を受けています。防衛が終わってから変更してね。','world-active-changed':'別の画面でワールドが変更されました。最新の戦況を確認してください。','world-conflict':'戦況が更新されました。内容を確認してもう一度選んでね。','world-client-update':'ページを読み直して最新のルールで参加してください。','account-session-expired':'ログイン期限が切れました。アカウント画面でログイン・ログアウトを確認してね。','account-changed':'アカウントが切り替わりました。このページを読み直してください。','banned':'この参加情報では利用できません。','storage':'このブラウザに参加情報を保存できません。保存設定を確認してください。'};
 let listing=null,active=null,selected=0,busy=false,online=false,reading=false,changed=false,key='',token='',journal=null,epoch=0;
 const status=(text,bad=false)=>{$('wtStatus').textContent=text;$('wtStatus').classList.toggle('error',bad);},error=e=>errors[e.message]||A.errorText(e),same=()=>A.identity(false)===token;
 function save(){try{if(journal)localStorage.setItem(key,JSON.stringify(journal));else localStorage.removeItem(key);}catch{throw Error('storage');}}
 function render(){
  const named=!!listing?.account?.name,current=active?.activeWorldId,source=active?.own;
  $('wtNameForm').hidden=named;$('wtIdentityName').hidden=!named;$('wtIdentityName').textContent=named?'参加名：'+listing.account.name+(listing.account.signedIn?' · ログイン済み':' · ゲスト参加'):'';
  $('wtCurrent').textContent=current?'現在：ワールド '+current:'最初のワールドを選ぼう';$('wtCards').replaceChildren();
  for(const w of listing?.worlds||[]){
   const b=el('button','travel-card');b.type='button';b.dataset.world=w.id;b.setAttribute('aria-pressed',String(w.id===selected));b.setAttribute('aria-label','ワールド '+w.id+' · '+w.players+'人'+(current===w.id?' · 現在のワールド':''));
   const head=el('div','travel-card-head');head.append(el('span','travel-number',String(w.id).padStart(2,'0')),el('span','travel-badge',current===w.id?'現在地':w.own?'参加済み':w.id>=4?'新ワールド':'初参加'));b.append(head,el('h3','','ワールド '+w.id));
   const dl=el('dl');for(const [name,value]of [['参加人数',fmt(w.players)+'人'],['自分の領土',w.own?fmt(w.own.territories)+'地域':'—'],['攻撃兵',w.own?fmt(w.own.soldiers)+'人':'—']]){const d=el('div');d.append(el('dt','',name),el('dd','',value));dl.append(d);}b.append(dl,el('p','',w.own?'武将 '+fmt(w.own.generals)+'人 · 保存した続きから':fmt(w.startingRegions.length)+'か所から新しく出発'));b.disabled=busy||changed;b.onclick=()=>{selected=w.id;render();};$('wtCards').append(b);
  }
  const w=listing?.worlds?.find(w=>w.id===selected);$('wtDetail').hidden=!w;if(w){
   const old=$('wtRegion').value,ids=w.own?[w.own.home]:w.startingRegions;$('wtRegion').replaceChildren(...ids.map(id=>{const o=el('option','',R.region(id).name);o.value=id;return o;}));if(ids.includes(old))$('wtRegion').value=old;else if(ids.includes('owari'))$('wtRegion').value='owari';
   $('wtDetailTitle').textContent='ワールド '+w.id+(w.own?'へ、ふたたび。':'で、新たな旗を。');$('wtDetailText').textContent=w.own?'あなたの領土 '+fmt(w.own.territories)+'地域・攻撃兵 '+fmt(w.own.soldiers)+'人・武将 '+fmt(w.own.generals)+'人を保存しています。':current?'現在のワールドの進行を残して、この世界では新しく出発します。':'出発地点を選んで、天下統一への一歩を踏み出そう。';
   const blocked=source?.state.pending?'途中のクイズを保存しています。ゲームに戻って終えてから変更してください。':source?.incoming?'現在のワールドで攻撃を受けています。防衛が終わってから変更できます。':'';
   $('wtBlock').hidden=!blocked;$('wtBlock').textContent=blocked;$('wtRegionLabel').hidden=!!w.own;$('wtRegion').disabled=busy||!!journal||changed;$('wtSpawnHint').textContent=w.own?'保存した領地・兵士・武将・同盟をそのまま再開します。':ids.length?'日本・海外の守備兵0人・保護期間外・合戦中ではない土地を選べます。':'現在この世界には開始できる土地がありません。';
   $('wtEnter').textContent=current===selected?'現在のワールド':w.own?'保存した続きに戻る':'この国でワールド '+selected+'へ';$('wtEnter').disabled=busy||!online||!named||!!journal||changed||!!blocked||current===selected||!ids.length;
   $('wtPlay').hidden=!current;$('wtPlay').textContent=current===selected?'このワールドで遊ぶ →':'現在のゲームへ戻る →';
  }
  $('wtNameSave').disabled=busy||!online||!!journal||changed;$('wtRefresh').disabled=busy||changed;$('wtRetry').hidden=!journal;$('wtRetry').disabled=busy||changed;
 }
 async function refresh(recover=true){
  if(busy||reading||changed)return;reading=true;const run=epoch;try{window.HKAccountSync?.assertActive();const view=await A.request('/wealth/sengoku/world',undefined,false),list=await A.request('/wealth/sengoku/worlds',undefined,false);if(run!==epoch||!same())return;
   if(list.worldCount!==5||list.guestEntry!=='name-first-v1')throw Error('world-client-update');active=view;listing=list;online=true;if(!list.worlds.some(w=>w.id===selected))selected=view.activeWorldId||[...list.worlds].sort((a,b)=>a.players-b.players||a.id-b.id)[0]?.id;render();status('ワールドごとの進行を確認して、次の舞台を選ぼう。');if(journal&&recover)await send();
  }catch(e){if(run!==epoch||!same())return;online=false;status(error(e),true);render();}finally{reading=false;}
 }
 async function send(){
  if(busy||changed||!journal)return;busy=true;render();const run=epoch,payload=journal;
  try{window.HKAccountSync?.assertActive();const result=await A.request('/wealth/sengoku/world/action',payload,false);if(run!==epoch||!same())return;active=result;journal=null;save();busy=false;reading=false;await refresh(false);status(payload.type==='profile'?'名前を保存しました。ワールドと出発地点を選ぼう。':'ワールド '+result.activeWorldId+' に切り替えました。「このワールドで遊ぶ」から続けよう。');
  }catch(e){if(run!==epoch||!same())return;if(/^(world-|account-|nickname|banned)/.test(e.message)){journal=null;save();busy=false;reading=false;await refresh(false);status(error(e),true);}else{online=false;status('操作はこのブラウザに保存済みです。通信が戻ったら「保存した操作を再試行」で確認できます。',true);}}
  finally{if(run===epoch){busy=false;render();}}
 }
 function action(type,extra){if(busy||!online||journal||changed)return;try{window.HKAccountSync?.assertActive();journal={rules:7,activeWorldId:active?.activeWorldId||null,type,...extra,revision:active?.own?.revision||0,requestId:crypto.randomUUID()};save();send();}catch(e){journal=null;status(error(e),true);render();}}
 function invalidate(){epoch++;changed=true;online=false;listing=null;active=null;journal=null;render();status(errors['account-changed'],true);}
 $('wtNameForm').onsubmit=e=>{e.preventDefault();action('profile',{name:$('wtName').value});};$('wtEnter').onclick=()=>action(active?.activeWorldId?'switch':'join',{worldId:selected,region:$('wtRegion').value});$('wtRefresh').onclick=()=>refresh();$('wtRetry').onclick=()=>send();
 window.addEventListener('storage',e=>{if(e.key===null||['hk_wealth_identity_v1','hk_account_profile_v1'].includes(e.key))invalidate();});window.addEventListener('hk-account-sync',e=>{if(e.detail?.state==='changed')invalidate();});window.addEventListener('online',()=>refresh());window.addEventListener('focus',()=>refresh());setInterval(()=>{if(!document.hidden)refresh();},15000);
 (async()=>{try{window.HKAccountSync?.assertActive();token=A.identity(true);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));key='hk_sengoku_travel_v1_'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved.requestId==='string')journal=saved;}catch{}await refresh();}catch(e){status(error(e),true);render();}})();
})();
