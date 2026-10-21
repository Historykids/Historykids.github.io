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
 const messages={"poker-client-update":"ルールが更新されました。ページを読み直して参加してください。","poker-buyin":"持ち込みは20両以上の整数にしてください。","poker-turn":"相手の番です。部屋を更新してください。","poker-state-changed":"対戦が進みました。部屋を更新して次の操作を選んでください。","poker-raise":"レイズは表示された最小額から持ち込みの残額までで入力してください。","poker-check":"追加のベットがあるため、コールかフォールドを選んでください。","poker-action":"操作を確認してもう一度選んでください。","poker-action-reused":"送信済みの操作と内容が違います。部屋を更新してください。",'identity-unavailable':'登録情報を保存できません。ブラウザの保存設定を確認してください。','poker-locked':'対戦にはリボーン10回以上が必要です。','poker-name':'成金ランキングで利用できる名前に変更してから参加してください。','poker-stake':'掛け金は1両以上の整数にしてください。','poker-stake-changed':'部屋の掛け金が変わりました。表示額を確認してもう一度参加してください。','poker-spectating':'このハンドは始まっています。観戦しながら次のハンドを待ってね。','poker-full':'この部屋は満室です。部屋一覧から空いている部屋を選んでね。','poker-settlement-pending':'前のハンドの払い戻しを確認しています。','poker-already-joined':'参加情報を復元しています。','poker-already-drawn':'カードは交換済みです。結果を待ってね。','poker-open':'このハンドの状態が変わりました。最新の状態を確認してください。','poker-ticket':'このブラウザの参加情報を確認できません。','pending-round':'先に途中のカジノを終えてください。','insufficient':'参加に必要な両が足りません。','rate-limited':'接続が混み合っています。少し待ってから更新してください。','admin-required':'通知の管理には管理者権限が必要です。','notice-conflict':'別の画面で変更されています。いったんキャンセルし、一覧を更新して通知を選び直してください。','notice-gone':'この通知は削除されています。送信済み一覧を更新してください。','notice-recipient':'配信先の登録者を選び直してください。','poker-room':'その部屋は見つかりません。部屋一覧を更新してください。','notice-input':'件名は80文字以内、本文は2,000文字以内で入力してください。','notice-changed':'前の配信内容を確認してから、新しい通知を作成してください。','nickname-blocked':'その名前は使えません。別の名前を入力してください。','nickname':'名前を入力してください。','record-changed':'登録情報が更新されました。もう一度参加してください。'};
 window.HKCommunity=Object.freeze({request,identity,errorText:e=>messages[e?.message]||'接続を確認できません。通信が戻ると再読み込みで途中から復元できます。'});
})();
