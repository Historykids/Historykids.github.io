(function(){
 'use strict';
 const key='hk_wealth_identity_v1';
 function identity(create=true){
  try{let token=localStorage.getItem(key);if(/^[a-f0-9]{64}$/.test(token||''))return token;if(!create)return '';
   token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem(key,token);if(localStorage.getItem(key)!==token)throw Error();return token;
  }catch{throw Error('identity-unavailable');}
 }
 async function request(path,body,create=true){
  const base=window.HKRankingConfig?.endpoint;if(!base)throw Error('not-configured');const token=identity(create),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(new URL(path,base).href,{method:body?'POST':'GET',mode:'cors',cache:'no-store',signal:controller.signal,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'connection');return data;}finally{clearTimeout(timer);}
 }
 const messages={'identity-unavailable':'登録情報を保存できません。ブラウザの保存設定を確認してください。','poker-locked':'対戦にはリボーン10回以上が必要です。','poker-name':'成金ランキングで利用できる名前に変更してから参加してください。','poker-stake':'掛け金は1両以上の整数にしてください。','poker-stake-changed':'部屋の掛け金が変わりました。表示額を確認してもう一度参加してください。','poker-spectating':'このハンドは始まっています。観戦しながら次のハンドを待ってね。','poker-full':'6席すべて使用中です。次のハンドを観戦席で待ってね。','poker-settlement-pending':'前のハンドの払い戻しを確認しています。','poker-already-joined':'参加情報を復元しています。','poker-already-drawn':'カードは交換済みです。結果を待ってね。','poker-open':'このハンドの状態が変わりました。最新の状態を確認してください。','poker-ticket':'このブラウザの参加情報を確認できません。','pending-round':'先に途中のカジノを終えてください。','insufficient':'参加に必要な両が足りません。','rate-limited':'接続が混み合っています。少し待ってから更新してください。','admin-required':'配信には管理者権限が必要です。','notice-input':'件名は80文字以内、本文は2,000文字以内で入力してください。','notice-changed':'前の配信内容を確認してから、新しいお知らせを作成してください。','nickname-blocked':'その名前は使えません。別の名前を入力してください。','nickname':'名前を入力してください。','record-changed':'登録情報が更新されました。もう一度参加してください。'};
 window.HKCommunity=Object.freeze({request,identity,errorText:e=>messages[e?.message]||'接続を確認できません。通信が戻ると再読み込みで途中から復元できます。'});
})();
