(function(){
  "use strict";
  let local=false, botTimer=null, generation=0, rows=[], lastFinished='', starting=1000, difficulty='normal';
  const $=id=>document.getElementById(id),clone=value=>JSON.parse(JSON.stringify(value));
  const oldCleanup=window.cleanupLocal,oldRender=window.renderGame,oldTimeout=window.maybeAutoTimeout;
  function clearBot(){generation++;clearTimeout(botTimer);botTimer=null;}
  window.cleanupLocal=function(){clearBot();local=false;rows=[];oldCleanup();};
  // Practice uses the same betting, side-pot and seven-card evaluator as online.
  // The local adapter never writes a practice hand to Firebase.
  function localRef(){return {transaction(fn,done){try{const before=roomData,room=fn(clone(before));if(!room){done?.(null,false);return Promise.resolve();}roomData=room;logChanges(before,room);renderRoom(room);done?.(null,true);scheduleBot();return Promise.resolve();}catch(e){done?.(e,false);return Promise.reject(e);}},off(){},update(){return Promise.resolve();},onDisconnect(){return {cancel(){}};}};}
  function startPractice(){
    if(roomRef)cleanupLocal();clearBot();local=true;rows=[];lastFinished='';difficulty=$('cpu-level').value;starting=STARTING_CHIPS;
    myName=String($('home-name').value||'あなた').trim().slice(0,12)||'あなた';try{localStorage.setItem('edo_poker_name',myName);}catch{}
    const room={game:'poker5',status:'lobby',hostId:myId,maxPlayers:4,smallBlind:10,bigBlind:20,handNo:0,dealerSeat:-1,players:{}};room.players[myId]=playerBase(myName,0);
    ['慎重な商人','大胆な武士','読みの奉行'].forEach((name,i)=>{room.players['cpu'+i]={...playerBase(name,i+1),cpu:true,style:i};});roomData=startNewHandState(room,true);roomCode='CPU';roomRef=localRef();renderRoom(roomData);scheduleBot();
  }
  function logChanges(before,after){for(const [id,p] of Object.entries(after.players||{})){if(before.players?.[id]?.lastAction!==p.lastAction&&p.lastAction)rows.unshift(p.name+'：'+p.lastAction);}rows=rows.slice(0,8);}
  function chooseBot(room,id,random=Math.random){
    const p=room.players[id],hole=parseJSON(p.hole,[]),board=parseJSON(room.community,[]),need=Math.max(0,room.currentBet-p.currentBet);let strength=.2;
    // Decisions use this player's cards and the visible board only.
    if(board.length>=3){const rank=bestOfSeven([...hole,...board]);strength=[.18,.42,.64,.73,.80,.86,.92,.97,1][rank.score[0]]||.15;}
    else if(hole.length===2){const a=rankValue(hole[0]),b=rankValue(hole[1]);strength=a===b?.5+a/35:(a+b)/45+(hole[0][1]===hole[1][1]?.09:0)+(Math.abs(a-b)===1?.04:0);}
    const style=p.style??1,odds=need/(Math.max(1,totalPot(room))+need),luck=random(),max=p.currentBet+p.chips,min=room.currentBet+(room.minRaise||room.bigBlind),pressure=need/Math.max(1,p.chips);
    const threshold=difficulty==='easy'?.12:difficulty==='hard'?.30:.22;
    if(need>0&&((strength+(.12*(style-1)))<odds+threshold||pressure>.5&&strength<.60)&&luck>.15)return {action:'fold',amount:0};
    if(strength>.65&&luck<(.20+style*.12)&&max>=min&&room.currentBet<200)return {action:'betraise',amount:Math.min(max,Math.max(min,room.currentBet+Math.round(totalPot(room)*.4/10)*10))};
    return {action:need?'call':'check',amount:0};
  }
  function rankValue(card){return '23456789TJQKA'.indexOf(card[0])+2;}
  function scheduleBot(){clearTimeout(botTimer);botTimer=null;if(!local||!roomData||roomData.status!=='playing')return;const actor=playerBySeat(roomData,roomData.turnSeat);if(!actor?.p.cpu)return;const token=generation,hand=roomData.handNo,phase=roomData.phase,seat=roomData.turnSeat;botTimer=setTimeout(()=>{if(!local||token!==generation||roomData.handNo!==hand||roomData.phase!==phase||roomData.turnSeat!==seat)return;const decision=chooseBot(roomData,actor.id);roomRef.transaction(room=>{if(room.turnSeat!==seat||room.handNo!==hand)return;applyAction(room,actor.id,decision.action,decision.amount);return room;});},750);}
  window.maybeAutoTimeout=function(){oldTimeout();if(local)scheduleBotIfNeeded();};
  function scheduleBotIfNeeded(){if(!botTimer&&local&&roomData?.status==='playing')scheduleBot();}
  function renderHelp(d){
    const me=d.players?.[myId];if(!me)return;const board=parseJSON(d.community,[]),hole=parseJSON(me.hole,[]);
    const best=board.length>=3&&hole.length===2?bestOfSeven([...hole,...board]):null;
    $('current-hand-name').textContent=best?best.name:me.out?'今回は観戦中':hole.length===2&&hole[0][0]===hole[1][0]?'ポケットペア':'まだ場のカードを待とう';
    document.querySelectorAll('#my-cards [data-card],#community [data-card]').forEach(card=>card.classList.toggle('best-five',!!best?.cards.includes(card.dataset.card)));
    const need=Math.max(0,(d.currentBet||0)-(me.currentBet||0));$('poker-coach').textContent=d.status==='playing'?(need?'コールに必要：'+Math.min(need,me.chips)+'チップ。降りる選択もできるよ。':'追加の支払いなしでチェックできます。'):'場の5枚と手札2枚から、強い5枚を選ぶルールです。';
    $('practice-mark').hidden=!local;$('practice-mark').textContent='CPU練習 · '+({easy:'やさしい',normal:'ふつう',hard:'むずかしい'}[difficulty]);$('poker-history').textContent=rows.length?rows.join('\n'):(d.message||'');
    if(local&&(d.status==='showdown'||d.status==='gameover')){const key=d.handNo+':'+d.status;if(lastFinished!==key){lastFinished=key;try{let stats=JSON.parse(localStorage.getItem('hk_poker_practice_v1')||'{"hands":0,"wins":0}');stats.hands++;const awards=parseJSON(d.showdown,{}).awards||{};if(awards[myId]>0)stats.wins++;localStorage.setItem('hk_poker_practice_v1',JSON.stringify(stats));$('practice-stats').textContent='練習の記録：'+stats.hands+'ハンド · '+stats.wins+'回ポット獲得';}catch{}}}
    const change=me.chips+(d.status==='playing'?me.invested:0)-starting;
    $('chip-change').textContent=local?'練習チップの増減 '+(change>=0?'+':'')+change:'ゲーム内のチップで遊ぼう';
  }
  window.renderGame=function(d){oldRender(d);renderHelp(d);};
  function preset(factor){if(!roomData)return;const p=roomData.players?.[myId];if(!p)return;const min=roomData.currentBet?(roomData.currentBet+(roomData.minRaise||20)):20,max=p.currentBet+p.chips;const target=factor===0?min:roomData.currentBet+Math.round(Math.max(20,totalPot(roomData)*factor)/10)*10;$('bet-amount').value=Math.min(max,Math.max(min,target));lastInputTouched=Date.now();}
  $('practice-btn').onclick=startPractice;document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(Number(b.dataset.preset)));
  window.HKPokerPractice={startPractice,chooseBot,get local(){return local;}};
})();
