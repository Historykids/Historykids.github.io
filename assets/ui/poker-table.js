(function () {
  "use strict";
  const R=window.HKEdoCards,U=window.HKTableUI,$=id=>document.getElementById(id),key="hk-poker-table-v1";
  let table=U.read(key,R.restorePoker)||R.createPoker(),timer=null;
  const stage={idle:"準備",preflop:"プリフロップ",flop:"フロップ",turn:"ターン",river:"リバー",done:"ハンド終了"};
  function render() {
    $("handNumber").textContent="HAND "+table.hand;
    $("pokerStage").textContent=stage[table.stage];
    const active=!["idle","done"].includes(table.stage),pot=table.players.reduce((s,p)=>s+p.invested,0);
    $("potAmount").textContent=pot.toLocaleString();
    $("communityCards").innerHTML=Array.from({length:5},(_,i)=>U.card(table.board[i])).join("");
    const hero=table.players[0],best=table.stage==="done"?R.evaluate([...hero.cards,...table.board]).cards:[];
    $("playerCards").innerHTML=hero.cards.length?hero.cards.map(c=>U.card(c,{best:best.includes(c)&&!hero.folded})).join(""):U.card()+U.card();
    $("heroChips").textContent=hero.chips.toLocaleString();
    $("heroBet").textContent=hero.bet?"このラウンドのベット "+hero.bet:"";
    $("heroStatus").textContent=hero.folded&&table.stage!=="idle"?"フォールド済み":hero.allin&&active?"オールイン":table.turn===0?"あなたの番":hero.action||"";
    $("heroSeat").classList.toggle("seat-active",table.turn===0);
    $("handStrength").textContent=hero.folded&&table.stage!=="idle"?"このハンドから降りました":hero.cards.length?R.evaluate([...hero.cards,...table.board]).name:"自分の2枚と、場の5枚で勝負。";
    $("opponents").replaceChildren(...table.players.slice(1).map((p,n)=>{
      const i=n+1,el=document.createElement("section");el.className="opponent-seat"+(table.turn===i?" seat-active":"")+(p.folded&&table.stage!=="idle"?" seat-folded":"");
      const name=document.createElement("h2");name.textContent=p.name;
      const badge=document.createElement("span");badge.className="seat-marker";badge.textContent=(table.dealer===i?"D ":"")+(table.sb===i?"SB ":"")+(table.bb===i?"BB":"");
      const chips=document.createElement("div");chips.className="seat-chips";chips.textContent=p.chips.toLocaleString()+" チップ";
      const cards=document.createElement("div");cards.className="seat-cards";cards.innerHTML=p.cards.length?p.cards.map(c=>U.card(c,{hidden:active||p.folded})).join(""):U.card()+U.card();
      const status=document.createElement("p");status.className="seat-action";status.textContent=p.folded&&table.stage!=="idle"?"フォールド":p.allin&&active?"オールイン":p.action||"待機中";
      el.append(badge,name,chips,cards,status);return el;
    }));
    $("heroMarker").textContent=(table.dealer===0?"D ":"")+(table.sb===0?"SB ":"")+(table.bb===0?"BB":"");
    const o=R.pokerOptions(table,0);
    $("foldButton").disabled=!o;$("callButton").disabled=!o;
    $("callButton").textContent=o?(o.check?"チェック":"コール · "+o.call):"チェック / コール";
    $("raiseButton").disabled=!o?.canRaise;$("allinButton").disabled=!o?.canRaise;
    $("raiseAmount").disabled=$("raiseRange").disabled=!o?.canRaise;
    if(o?.canRaise){const min=Math.min(o.min,o.max);for(const id of ["raiseAmount","raiseRange"]){$(id).min=min;$(id).max=o.max;$(id).value=min;}$("raiseCost").textContent="合計 "+min+" に上げる（追加 "+(min-hero.bet)+"）";}
    else $("raiseCost").textContent=o?"上乗せできる相手、またはチップがありません。":"あなたの番になると操作できます。";
    $("nextHand").hidden=active;$("nextHand").disabled=table.players.filter(p=>p.chips>0).length<2;
    $("nextHand").textContent=table.stage==="idle"?"カードを配る":"次のハンドへ";
    $("pokerMessage").textContent=table.stage==="idle"?"CPU3人と、1000チップから勝負。":active?(table.turn===0?"あなたの番です。じっくり考えて選ぼう。":table.players[table.turn].name+"が考えています…"):"";
    if(table.stage==="done"){
      const totals=new Map();table.awards.filter(a=>!a.refund).forEach(a=>totals.set(a.seat,(totals.get(a.seat)||0)+a.amount));
      $("pokerMessage").textContent=[...totals].map(([i,n])=>table.players[i].name+"が "+n+" チップ獲得").join(" ／ ");
    }
    $("pokerMessage").classList.toggle("result-win",table.stage==="done"&&table.awards.some(a=>a.seat===0&&!a.refund));
    $("actionLog").replaceChildren(...table.log.slice().reverse().map(text=>{const li=document.createElement("li");li.textContent=text;return li;}));
    $("sidePotInfo").textContent=table.stage==="done"&&table.awards.length>1?table.awards.map(a=>table.players[a.seat].name+"："+a.amount+(a.refund?"（未成立ベットを返却）":a.hand?" · "+a.hand:"")).join(" ／ "):"";
    if(hero.chips===0&&!active)$("pokerMessage").textContent+=" あなたのチップがなくなりました。「新しい卓」で再開できます。";
  }
  function schedule() {
    clearTimeout(timer);timer=null;
    if(document.hidden||table.turn<1||table.stage==="done")return;
    timer=setTimeout(()=>{timer=null;const move=R.botPoker(R.publicPoker(table,table.turn));if(move&&R.pokerAction(table,move.action,move.total)){U.save(key,table);render();schedule();}},850);
  }
  function act(action,total){if(R.pokerAction(table,action,total,0)){U.save(key,table);render();schedule();}}
  $("foldButton").onclick=()=>act("fold");
  $("callButton").onclick=()=>act(R.pokerOptions(table,0)?.check?"check":"call");
  $("raiseButton").onclick=()=>act("raise",Number($("raiseAmount").value));
  $("allinButton").onclick=()=>act("raise",R.pokerOptions(table,0)?.max);
  for(const id of ["raiseRange","raiseAmount"])$(id).oninput=()=>{const other=id==="raiseRange"?"raiseAmount":"raiseRange";$(other).value=$(id).value;$("raiseCost").textContent="合計 "+$(id).value+" に上げる（追加 "+(Number($(id).value)-table.players[0].bet)+"）";};
  $("nextHand").onclick=()=>{if(R.startPoker(table)){U.save(key,table);render();schedule();}};
  $("newTable").onclick=()=>{$("resetDialog").showModal();};
  $("confirmReset").onclick=()=>{clearTimeout(timer);table=R.createPoker();U.save(key,table);$("resetDialog").close();render();};
  $("cancelReset").onclick=()=>$("resetDialog").close();
  document.addEventListener("visibilitychange",schedule);
  render();schedule();
})();
