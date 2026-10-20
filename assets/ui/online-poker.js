(function(){
 'use strict';
 const $=id=>document.getElementById(id),W=window.HKWallet,M=window.HKAmounts,A=window.HKCommunity;
 if(!$('onlinePoker')||!A)return;
 const actionKey='hk_holdem_action_v1',reservationKey='hk_poker_reservation_v1',money=n=>M.format(n)+'両',call=(fn,...args)=>new Promise((resolve,reject)=>W[fn](...args,resolve,reject));
 let state=null,selected=false,busy=false,polling=false,holds=new Set(),handId='',clockOffset=0,leaving=false,epoch=0,selectedRoom='royal-one',raiseView='';
 try{const saved=localStorage.getItem('hk_poker_room_v1');if(saved==='royal-one'||/^royal-[1-9]\d{0,5}$/.test(saved||''))selectedRoom=saved;}catch{}
 const roomRequest=(path,body)=>A.request(body?path:path+'?room='+encodeURIComponent(selectedRoom),body?{...body,room:selectedRoom}:undefined);
 const pending=()=>{const r=W.snapshot().pending;return r?.game==='poker'&&r.data?.version===2?r:null;};
 function message(text,error=false){$('roomMessage').textContent=text;$('roomMessage').classList.toggle('error',error);}
 function reservation(){try{return JSON.parse(localStorage.getItem(reservationKey)||'null');}catch{return null;}}
 const holdem=()=>state?.rules==='holdem-v1';
 const definitive=error=>['poker-open','poker-turn','poker-state-changed','poker-action-reused','poker-check','poker-raise','poker-action','poker-ticket','poker-client-update'].includes(error.message);
 function clearAction(){try{localStorage.removeItem(actionKey);}catch{}}
 function savedAction(){
  try{const a=JSON.parse(localStorage.getItem(actionKey)||'null');if(!a)return null;
   if(!/^[A-Za-z0-9_-]{16,64}$/.test(a.id||'')||!/^[A-Za-z0-9_-]{16,64}$/.test(a.requestId||'')||typeof a.handId!=='string'||!Number.isSafeInteger(a.version)||a.version<0||!['check','call','fold','raise','allin'].includes(a.action)||a.action==='raise'&&!M.valid(a.total)){clearAction();return null;}return a;
  }catch{return null;}
 }
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
  const rooms=state.rooms||[{id:state.room,name:'第1室',seats:state.players.length,phase:state.phase}],options=rooms.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name+' · '+r.seats+'/6席 · '+(r.phase==='lobby'?(r.seats>=6?'満室':'参加受付'):r.phase==='playing'?'対戦中・観戦可':'結果発表');return o;});
  $('roomSelect').replaceChildren(...options);$('roomSelect').value=state.room;$('roomSelect').disabled=busy||polling||!!pending();$('roomTotal').textContent=rooms.length+'部屋 · 満室になると次の部屋が開きます';
  $('roomRole').textContent=mine&&holdem()&&playing?(mine.folded?'フォールド済み':mine.allin?'オールイン · 結果待ち':state.turn===mine.id?'あなたの番':'対戦中 · 相手の番'):mine?playing?(mine.folded?'フォールド済み':mine.drawn?'交換済み · 結果待ち':'あなたは対戦中'):'あなたの席':playing?'観戦中 · 次のハンドから参加':'観戦席';
  $('roomPot').textContent=money(holdem()?(state.result?.pot??M.sum(state.players.map(p=>p.invested||0))):(state.stake?M.mul(state.stake,state.players.filter(p=>p.paid).length):0));
  $('roomCount').textContent=state.players.filter(p=>p.paid).length+' / 6人';
  $('roomCommonStake').textContent=state.stake?money(state.stake):'最初の参加者が設定';
  const seats=document.createDocumentFragment();
  for(let i=0;i<6;i++){
   const p=state.players[i],seat=document.createElement('article');seat.className='room-seat'+(p?.id===state.ownId?' is-you':'')+(p&&state.result?.winners.includes(p.id)?' is-winner':'')+(p&&holdem()&&state.turn===p.id?' is-turn':'');
   const name=document.createElement('h3'),detail=document.createElement('p'),cards=document.createElement('div');cards.className='room-seat-cards';name.textContent=p?p.name:'空席 '+(i+1);detail.textContent=p?'↻ '+p.rebirths+'回 · '+(p.folded?'フォールド':!p.paid?'参加を確認中':state.phase==='showdown'?p.handName||'ハンド終了':p.drawn?'交換完了':'待機中'):'リボーン10回以上';
   if(p)for(let n=0;n<(holdem()?2:5);n++)cards.append(card(p.hand?.[n]));if(p&&holdem()){detail.textContent='↻ '+p.rebirths+'回 · '+(p.folded?'フォールド':p.allin?'オールイン':p.lastAction||'待機中');const stack=document.createElement('p');stack.className='room-seat-stack';stack.textContent=(p.dealer?'D · ':'')+(p.sb?'SB · ':'')+(p.bb?'BB · ':'')+'残り '+money(p.stack??state.stake??0)+' / ベット '+money(p.bet??0);seat.append(stack);}seat.append(name,detail,cards);seats.append(seat);
  }
  $('roomSeats').replaceChildren(seats);
  const canDraw=!holdem()&&playing&&mine&&!mine.folded&&!mine.drawn;
  $('roomHand').hidden=!playing||!mine||mine.folded;$('roomHandCards').replaceChildren(...(mine?.hand||[]).map((c,i)=>card(c,!!canDraw,i)));
  $('roomDraw').disabled=busy||polling||!canDraw;$('roomDraw').textContent=canDraw?(holds.size===5?'5枚を残して確定':(5-holds.size)+'枚を交換して確定'):'交換済み';
  $('roomHoldHint').textContent=holdem()?'あなた専用の手札2枚。共通カードと合わせて最強の5枚を作ります。':mine?.drawn?'ほかの参加者の確定を待っています。':'残すカードを押して選ぼう。交換は1回だけ。';
  $('roomJoinForm').hidden=!!mine||state.phase!=='lobby'||!eligible||!!pending();$('roomJoin').disabled=busy||polling||state.players.length>=6;
  $('roomStake').disabled=!!state.stake||busy;if(state.stake)$('roomStake').value=M.full(state.stake);
  $('roomName').disabled=busy;
  $('roomLeave').hidden=!pending()||!mine||mine.folded||(holdem()&&playing&&(mine.allin||state.turn!==mine.id));$('roomLeave').disabled=busy||polling;$('roomLeave').textContent=playing?'フォールドして退席':'参加を取り消す（全額返金）';
  $('roomLeaveConfirm').hidden=!leaving;$('roomLeaveConfirmText').textContent=playing?(holdem()?'このハンドをフォールドします。使っていない両は終了時に返ります。':'このハンドをフォールドします。掛け金は戻りません。'):'このハンドへの参加を取り消し、掛け金を全額返します。';
  $('roomLeaveCommit').disabled=busy;$('roomRefresh').disabled=busy||polling;
  $('roomWatchHint').textContent=playing&&!mine?'途中参加は観戦になります。他の人の手札は、結果発表まで非公開です。次のハンドの受付を待ってね。':state.phase==='lobby'?'同じ掛け金で2人そろうと、10秒後に自動配布。最大6人で対戦します。':'結果を10秒間表示してから、同じ部屋で次のハンドを受け付けます。';
  $('roomBoard').hidden=!holdem();$('roomBetting').hidden=!holdem();$('roomDraw').hidden=holdem();
  if(holdem()){
   $('roomStreet').textContent=({preflop:'プリフロップ',flop:'フロップ',turn:'ターン',river:'リバー'})[state.street]||(state.phase==='lobby'?'TEXAS HOLD’EM':'SHOWDOWN');
   $('roomBoardCards').replaceChildren(...Array.from({length:5},(_,i)=>card(state.board?.[i])));
   const sb=state.phase==='lobby'&&state.stake?M.pack(BigInt(state.stake)/100n||1n):state.smallBlind;
   $('roomBlinds').textContent=state.stake?'ブラインド '+money(sb)+' / '+money(state.phase==='lobby'?M.mul(sb,2):state.bigBlind):'持ち込み額に合わせてブラインドを設定';
   $('roomTurn').textContent=playing?(state.turn===state.ownId?'あなたの番です':(state.turnName||'参加者')+'さんの番'):state.phase==='lobby'?'2人以上で配布':'ハンド終了';
   const o=state.options,canBet=!!(playing&&mine&&state.turn===mine.id&&o&&!busy&&!polling&&!savedAction());
   $('roomFold').disabled=!canBet;$('roomCall').disabled=!canBet;$('roomCall').textContent=o?.check?'チェック':'コール '+money(o?.call||0);
   $('roomAllin').disabled=!canBet||(!o.canRaise&&M.cmp(o.max,state.currentBet)>0);
   $('roomRaise').disabled=!canBet||!o.canRaise;$('roomRaiseCommit').disabled=!canBet||!o.canRaise;
   const view=state.handId+':'+state.street+':'+state.actionVersion;
   if(raiseView!==view){raiseView=view;$('roomRaise').value=o?M.full(M.cmp(o.min,o.max)>0?o.max:o.min):'';}
   $('roomBetHint').textContent=savedAction()?'送信済みの操作を確認中です。「部屋を更新」で再確認できます。':o?'レイズはこのラウンドの合計額。最小 '+money(o.min)+' / 最大 '+money(o.max)+'。45秒以内に操作してください。':'操作は自分の番にできます。手札の交換はありません。';
   if(playing&&!mine)$('roomWatchHint').textContent='途中参加は観戦です。他の人の手札は結果発表まで非公開です。次のハンドから参加できます。';
   else if(state.phase==='lobby')$('roomWatchHint').textContent='同じ持ち込み額で2人そろうと10秒後に配布。持ち込みは20両以上、未使用分はハンド終了時に返ります。';
  }
  clock();if(focused!==undefined)$('roomHandCards').querySelector('[data-room-card="'+focused+'"]')?.focus();
 }
 async function reconcile(data){
  let t=data.ticket,r=pending(),saved=reservation();
  if(t?.status==='reserved'&&!r&&saved?.id===t.id){
   try{await call('beginOnlinePoker',t);r=pending();}
   catch(error){data=await roomRequest('/wealth/poker/leave',{id:t.id});t=data.ticket;clearReservation();if(t?.status==='done')await roomRequest('/wealth/poker/ack',{id:t.id});throw error;}
  }
  if(t?.status==='reserved'&&r?.id===t.id){data=await roomRequest('/wealth/poker/commit',{id:t.id});t=data.ticket;}
  if(t&&['reserved','paid'].includes(t.status)&&!pending()&&saved?.id!==t.id){data=await roomRequest('/wealth/poker/leave',{id:t.id});t=data.ticket;}
  if(t?.status==='done'){
   if(pending()?.id===t.id){const result=await call('finishOnlinePoker',t);$('roomOutcome').hidden=false;$('roomOutcomeTitle').textContent=t.kind==='refund'?'掛け金を返しました。':(t.rules==='holdem-v1'?t.won:M.cmp(result.payout,0)>0)?'あなたの勝利！':'ハンド終了';$('roomOutcomeAmount').textContent='払い戻し '+money(result.creditedPayout);message('払い戻しを保存しました。次のハンドも、この部屋で参加できます。');}
   data=await roomRequest('/wealth/poker/ack',{id:t.id});clearReservation();
  }
  return data;
 }
 async function accept(data,sequence){if(sequence!==epoch)return;selectedRoom=data.room;data=await reconcile(data);if(sequence!==epoch)return;selectedRoom=data.room;try{localStorage.setItem('hk_poker_room_v1',selectedRoom);}catch{}state=data;clockOffset=data.now-Date.now();render();}
 async function load(){
  if(busy||polling||!selected&&!pending())return;polling=true;const sequence=epoch;render();
  try{
   let data=await roomRequest('/wealth/poker');const draft=savedAction();
   if(draft){
    if(data.ticket?.id!==draft.id||data.handId!==draft.handId||['done','acked'].includes(data.ticket?.status))clearAction();
    else{try{data=await roomRequest('/wealth/poker/action',draft);clearAction();}catch(error){if(!definitive(error))throw error;clearAction();data=await roomRequest('/wealth/poker');}}
   }
   await accept(data,sequence);if(!pending())message('接続中 · 部屋を選んで参加・観戦できます。');}
  catch(error){message(A.errorText(error),true);}finally{polling=false;render();}
 }
 async function action(path,body){
  if(busy||polling)return;busy=true;const sequence=epoch;render();
  try{const data=await roomRequest(path,body);if(path==='/wealth/poker/action')clearAction();await accept(data,sequence);leaving=false;message('部屋の状態を更新しました。');}
  catch(error){if(path==='/wealth/poker/action'&&definitive(error))clearAction();message(A.errorText(error),true);}finally{busy=false;render();}
 }
 $('roomJoinForm').onsubmit=async e=>{
  e.preventDefault();if(busy||polling||!state||state.phase!=='lobby'||pending())return;const amount=M.input($('roomStake').value);
  if(!M.valid(amount)||M.cmp(amount,holdem()?20:1)<0){message(A.errorText(Error(holdem()?'poker-buyin':'poker-stake')),true);return;}if(M.cmp(W.snapshot().balance,amount)<0){message(A.errorText(Error('insufficient')),true);return;}
  busy=true;const sequence=epoch;$('roomOutcome').hidden=true;render();
  try{
   const board=await A.request('/wealth'),name=$('roomName').value.trim()||board.own?.name;if(!name)throw Error('nickname');
   const snapshot=window.HKWealthRules.readLocal(localStorage,W.snapshot()).snapshot;
   await A.request('/wealth/register',{name,snapshot,expectedRevision:board.ownRevision||0});
   const old=reservation(),id=old?.id||crypto.randomUUID();localStorage.setItem(reservationKey,JSON.stringify({id,stake:M.full(amount),room:selectedRoom}));
   await accept(await roomRequest('/wealth/poker/reserve',{id,stake:M.full(amount),rules:state.rules}),sequence);message('参加しました。同じ掛け金の相手を待っています。');
  }catch(error){message(A.errorText(error),true);}finally{busy=false;render();}
 };
 $('roomHandCards').onclick=e=>{const b=e.target.closest('[data-room-card]');if(!b||b.disabled||busy)return;const i=Number(b.dataset.roomCard);if(holds.has(i))holds.delete(i);else holds.add(i);render();$('roomHandCards').querySelector('[data-room-card="'+i+'"]')?.focus();};
 $('roomDraw').onclick=()=>{const r=pending();if(r)action('/wealth/poker/draw',{id:r.id,handId:state.handId,holds:[...holds]});};
 $('roomLeave').onclick=()=>{leaving=true;render();};$('roomLeaveCancel').onclick=()=>{leaving=false;render();};
 $('roomLeaveCommit').onclick=()=>{const r=pending();if(r)action('/wealth/poker/leave',{id:r.id});};
 function bet(type,total){
  const r=pending();if(busy||polling||!holdem()||!r||state.turn!==state.ownId||!state.options||savedAction())return;
  if(type==='raise'&&!M.valid(total)){message(A.errorText(Error('poker-raise')),true);return;}
  const draft={id:r.id,handId:state.handId,version:state.actionVersion,requestId:crypto.randomUUID(),action:type,...(type==='raise'?{total:M.full(total)}:{})};
  try{localStorage.setItem(actionKey,JSON.stringify(draft));}catch(error){message('操作を保存できません。ブラウザの保存設定を確認してください。',true);return;}
  action('/wealth/poker/action',draft);
 }
 $('roomFold').onclick=()=>bet('fold');$('roomCall').onclick=()=>bet(state.options?.check?'check':'call');$('roomAllin').onclick=()=>bet('allin');
 $('roomRaiseCommit').onclick=()=>bet('raise',M.input($('roomRaise').value));
 $('roomRefresh').onclick=load;
 $('roomSelect').onchange=()=>{if(busy||polling||pending()){$('roomSelect').value=selectedRoom;return;}selectedRoom=$('roomSelect').value;holds.clear();leaving=false;$('roomOutcome').hidden=true;load();};
 window.addEventListener('storage',e=>{if(e.key==='hk_wealth_identity_v1'||e.key===null){epoch++;state=null;holds.clear();clearAction();$('roomHand').hidden=true;$('roomHandCards').replaceChildren();$('roomSeats').replaceChildren();$('roomBoardCards').replaceChildren();$('roomBetting').hidden=true;message('登録情報が変わりました。部屋の状態を読み直してください。',true);}});
 window.addEventListener('focus',load);
 setInterval(()=>{if(!document.hidden)load();},4000);setInterval(clock,1000);
 window.HKOnlinePoker=Object.freeze({open(){selected=true;load();},close(){selected=false;}});
 if(pending()){selected=true;load();}
})();
