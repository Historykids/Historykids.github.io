(function(){
 'use strict';
 const $=id=>document.getElementById(id),W=window.HKWallet,M=window.HKAmounts,A=window.HKCommunity;
 if(!$('onlinePoker')||!A)return;
 const reservationKey='hk_poker_reservation_v1',money=n=>M.format(n)+'両',call=(fn,...args)=>new Promise((resolve,reject)=>W[fn](...args,resolve,reject));
 let state=null,selected=false,busy=false,polling=false,holds=new Set(),handId='',clockOffset=0,leaving=false,epoch=0;
 const pending=()=>{const r=W.snapshot().pending;return r?.game==='poker'&&r.data?.version===2?r:null;};
 function message(text,error=false){$('roomMessage').textContent=text;$('roomMessage').classList.toggle('error',error);}
 function reservation(){try{return JSON.parse(localStorage.getItem(reservationKey)||'null');}catch{return null;}}
 function clearReservation(){try{localStorage.removeItem(reservationKey);}catch{}}
 function clock(){const end=state?.deadline||state?.startAt||state?.nextAt;$('roomClock').textContent=end?Math.max(0,Math.ceil((end-Date.now()-clockOffset)/1000))+'秒':'受付中';}
 function card(c,button=false,index=0){
  const node=document.createElement(button?'button':'span');node.className='room-card'+(!c?' card-back':/[HD]/.test(c[1])?' card-red':'');
  if(button){node.type='button';node.dataset.roomCard=index;const held=holds.has(index);node.classList.toggle('card-held',held);node.setAttribute('aria-pressed',String(held));node.disabled=busy||!state||state.players.find(p=>p.id===state.ownId)?.drawn;node.setAttribute('aria-label',({S:'スペード',H:'ハート',D:'ダイヤ',C:'クラブ'}[c[1]])+'の'+c[0]+(held?' · 残す':' · 交換する'));}
  const rank=document.createElement('b'),suit=document.createElement('i');rank.textContent=c?(c[0]==='T'?'10':c[0]):'♔';suit.textContent=c?{S:'♠',H:'♥',D:'♦',C:'♣'}[c[1]]:'';
  node.append(rank,suit);if(button){const tag=document.createElement('small');tag.textContent=holds.has(index)?'HOLD':'交換';node.append(tag);}return node;
 }
 function render(){
  if(!state)return;const focused=document.activeElement?.dataset?.roomCard,playing=state.phase==='playing',mine=state.players.find(p=>p.id===state.ownId),eligible=(W.snapshot().rebirths??0)>=10;
  if(handId!==state.handId){handId=state.handId;holds.clear();}
  $('roomPhase').textContent=state.phase==='lobby'?'参加受付中':playing?'対戦中':'結果発表';
  $('roomRole').textContent=mine?playing?(mine.folded?'フォールド済み':mine.drawn?'交換済み · 結果待ち':'あなたは対戦中'):'あなたの席':playing?'観戦中 · 次のハンドから参加':'観戦席';
  $('roomPot').textContent=money(state.stake?M.mul(state.stake,state.players.filter(p=>p.paid).length):0);
  $('roomCount').textContent=state.players.filter(p=>p.paid).length+' / 6人';
  $('roomCommonStake').textContent=state.stake?money(state.stake):'最初の参加者が設定';
  const seats=document.createDocumentFragment();
  for(let i=0;i<6;i++){
   const p=state.players[i],seat=document.createElement('article');seat.className='room-seat'+(p?.id===state.ownId?' is-you':'')+(p&&state.result?.winners.includes(p.id)?' is-winner':'');
   const name=document.createElement('h3'),detail=document.createElement('p'),cards=document.createElement('div');cards.className='room-seat-cards';name.textContent=p?p.name:'空席 '+(i+1);detail.textContent=p?'↻ '+p.rebirths+'回 · '+(p.folded?'フォールド':!p.paid?'参加を確認中':state.phase==='showdown'?p.handName||'ハンド終了':p.drawn?'交換完了':'待機中'):'リボーン10回以上';
   if(p)for(let n=0;n<5;n++)cards.append(card(p.hand?.[n]));seat.append(name,detail,cards);seats.append(seat);
  }
  $('roomSeats').replaceChildren(seats);
  const canDraw=playing&&mine&&!mine.folded&&!mine.drawn;
  $('roomHand').hidden=!playing||!mine||mine.folded;$('roomHandCards').replaceChildren(...(mine?.hand||[]).map((c,i)=>card(c,!!canDraw,i)));
  $('roomDraw').disabled=busy||polling||!canDraw;$('roomDraw').textContent=canDraw?(holds.size===5?'5枚を残して確定':(5-holds.size)+'枚を交換して確定'):'交換済み';
  $('roomHoldHint').textContent=mine?.drawn?'ほかの参加者の確定を待っています。':'残すカードを押して選ぼう。交換は1回だけ。';
  $('roomJoinForm').hidden=!!mine||state.phase!=='lobby'||!eligible||!!pending();$('roomJoin').disabled=busy||polling||state.players.length>=6;
  $('roomStake').disabled=!!state.stake||busy;if(state.stake)$('roomStake').value=M.full(state.stake);
  $('roomName').disabled=busy;
  $('roomLeave').hidden=!pending()||!mine||mine.folded;$('roomLeave').disabled=busy||polling;$('roomLeave').textContent=playing?'フォールドして退席':'参加を取り消す（全額返金）';
  $('roomLeaveConfirm').hidden=!leaving;$('roomLeaveConfirmText').textContent=playing?'このハンドをフォールドします。掛け金は戻りません。':'このハンドへの参加を取り消し、掛け金を全額返します。';
  $('roomLeaveCommit').disabled=busy;$('roomRefresh').disabled=busy||polling;
  $('roomWatchHint').textContent=playing&&!mine?'途中参加は観戦になります。他の人の手札は、結果発表まで非公開です。次のハンドの受付を待ってね。':state.phase==='lobby'?'同じ掛け金で2人そろうと、10秒後に自動配布。最大6人で対戦します。':'結果を10秒間表示してから、同じ部屋で次のハンドを受け付けます。';
  clock();if(focused!==undefined)$('roomHandCards').querySelector('[data-room-card="'+focused+'"]')?.focus();
 }
 async function reconcile(data){
  let t=data.ticket,r=pending(),saved=reservation();
  if(t?.status==='reserved'&&!r&&saved?.id===t.id){
   try{await call('beginOnlinePoker',t);r=pending();}
   catch(error){data=await A.request('/wealth/poker/leave',{id:t.id});t=data.ticket;clearReservation();if(t?.status==='done')await A.request('/wealth/poker/ack',{id:t.id});throw error;}
  }
  if(t?.status==='reserved'&&r?.id===t.id){data=await A.request('/wealth/poker/commit',{id:t.id});t=data.ticket;}
  if(t&&['reserved','paid'].includes(t.status)&&!pending()&&saved?.id!==t.id){data=await A.request('/wealth/poker/leave',{id:t.id});t=data.ticket;}
  if(t?.status==='done'){
   if(pending()?.id===t.id){const result=await call('finishOnlinePoker',t);$('roomOutcome').hidden=false;$('roomOutcomeTitle').textContent=t.kind==='refund'?'掛け金を返しました。':M.cmp(result.payout,0)>0?'あなたの勝利！':'ハンド終了';$('roomOutcomeAmount').textContent='払い戻し '+money(result.creditedPayout);message('払い戻しを保存しました。次のハンドも、この部屋で参加できます。');}
   data=await A.request('/wealth/poker/ack',{id:t.id});clearReservation();
  }
  return data;
 }
 async function accept(data,sequence){if(sequence!==epoch)return;data=await reconcile(data);if(sequence!==epoch)return;state=data;clockOffset=data.now-Date.now();render();}
 async function load(){
  if(busy||polling||!selected&&!pending())return;polling=true;const sequence=epoch;render();
  try{await accept(await A.request('/wealth/poker'),sequence);if(!pending())message('接続中 · 部屋は1つだけです。');}
  catch(error){message(A.errorText(error),true);}finally{polling=false;render();}
 }
 async function action(path,body){
  if(busy||polling)return;busy=true;const sequence=epoch;render();
  try{await accept(await A.request(path,body),sequence);leaving=false;message('部屋の状態を更新しました。');}
  catch(error){message(A.errorText(error),true);}finally{busy=false;render();}
 }
 $('roomJoinForm').onsubmit=async e=>{
  e.preventDefault();if(busy||polling||!state||state.phase!=='lobby'||pending())return;const amount=M.input($('roomStake').value);
  if(!M.valid(amount)||M.cmp(amount,1)<0){message(A.errorText(Error('poker-stake')),true);return;}if(M.cmp(W.snapshot().balance,amount)<0){message(A.errorText(Error('insufficient')),true);return;}
  busy=true;const sequence=epoch;$('roomOutcome').hidden=true;render();
  try{
   const board=await A.request('/wealth'),name=$('roomName').value.trim()||board.own?.name;if(!name)throw Error('nickname');
   const snapshot=window.HKWealthRules.readLocal(localStorage,W.snapshot()).snapshot;
   await A.request('/wealth/register',{name,snapshot,expectedRevision:board.ownRevision||0});
   const old=reservation(),id=old?.id||crypto.randomUUID();localStorage.setItem(reservationKey,JSON.stringify({id,stake:M.full(amount)}));
   await accept(await A.request('/wealth/poker/reserve',{id,stake:M.full(amount)}),sequence);message('参加しました。同じ掛け金の相手を待っています。');
  }catch(error){message(A.errorText(error),true);}finally{busy=false;render();}
 };
 $('roomHandCards').onclick=e=>{const b=e.target.closest('[data-room-card]');if(!b||b.disabled||busy)return;const i=Number(b.dataset.roomCard);if(holds.has(i))holds.delete(i);else holds.add(i);render();$('roomHandCards').querySelector('[data-room-card="'+i+'"]')?.focus();};
 $('roomDraw').onclick=()=>{const r=pending();if(r)action('/wealth/poker/draw',{id:r.id,handId:state.handId,holds:[...holds]});};
 $('roomLeave').onclick=()=>{leaving=true;render();};$('roomLeaveCancel').onclick=()=>{leaving=false;render();};
 $('roomLeaveCommit').onclick=()=>{const r=pending();if(r)action('/wealth/poker/leave',{id:r.id});};
 $('roomRefresh').onclick=load;
 window.addEventListener('storage',e=>{if(e.key==='hk_wealth_identity_v1'||e.key===null){epoch++;state=null;holds.clear();message('登録情報が変わりました。部屋の状態を読み直してください。',true);}});
 window.addEventListener('focus',load);
 setInterval(()=>{if(!document.hidden)load();},4000);setInterval(clock,1000);
 window.HKOnlinePoker=Object.freeze({open(){selected=true;load();},close(){selected=false;}});
 if(pending()){selected=true;load();}
})();
