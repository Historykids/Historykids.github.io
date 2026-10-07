(function () {
  "use strict";
  const R=window.HKEdoCards,U=window.HKTableUI,$=id=>document.getElementById(id),key="hk-blackjack-table-v1";
  let table=U.read(key,R.restoreBlackjack)||R.createBlackjack(),timer=null;
  function totalText(cards){const v=R.blackjackValue(cards);return (v.soft?"ソフト ":"")+v.total;}
  function render(){
    const hidden=table.stage==="player",busy=["player","dealer"].includes(table.stage);
    $("bankAmount").textContent=table.bank.toLocaleString();$("roundNumber").textContent="ROUND "+table.round;
    $("dealerCards").innerHTML=table.dealer.length?table.dealer.map((c,i)=>U.card(c,{hidden:hidden&&i===1})).join(""):U.card()+U.card();
    $("dealerTotal").textContent=table.dealer.length?(hidden?"公開札 "+R.blackjackValue([table.dealer[0]]).total:totalText(table.dealer)):"—";
    $("blackjackHands").replaceChildren(...table.hands.map((h,i)=>{const el=document.createElement("section");el.className="blackjack-hand"+(table.stage==="player"&&table.active===i?" seat-active":"");
      const label=document.createElement("h2");label.textContent=(table.hands.length>1?"手札 "+(i+1):"あなた")+" · "+totalText(h.cards);
      const cards=document.createElement("div");cards.className="hand-cards";cards.innerHTML=h.cards.map(c=>U.card(c)).join("");
      const bet=document.createElement("p");bet.className="hand-bet";bet.textContent="ベット "+h.bet+" チップ";
      const result=document.createElement("p");result.className="hand-result";result.textContent=table.stage==="done"?h.result+" · 戻るチップ "+h.returned:h.done?(R.blackjackValue(h.cards).total>21?"バースト":"スタンド"):"";
      el.append(label,cards,bet,result);return el;
    }));
    $("blackjackPlaceholder").hidden=table.hands.length>0;
    $("blackjackMessage").textContent=table.message;$("blackjackMessage").classList.toggle("result-win",table.stage==="done"&&table.history[0]?.net>0);
    const o=R.blackjackOptions(table);
    for(const action of ["hit","stand","double","split"])$(action+"Button").disabled=!o?.[action];
    $("doubleButton").textContent="ダブル"+(o?.double?" · +"+table.hands[table.active].bet:"");
    $("splitButton").textContent="スプリット"+(o?.split?" · +"+table.hands[table.active].bet:"");
    $("betControls").hidden=busy;$("dealButton").disabled=table.bank<10;$("dealButton").textContent=table.stage==="idle"?"カードを配る":"もう一度配る";
    if(table.bank<10&&!busy)$("blackjackMessage").textContent+=" チップが足りません。「新しい卓」で再開できます。";
    $("blackjackHistory").replaceChildren(...table.history.map(h=>{const li=document.createElement("li");li.textContent="#"+h.round+" · ベット "+h.stake+" → 戻る "+h.returned+"（"+(h.net>0?"+":"")+h.net+"）";return li;}));
  }
  function schedule(){clearTimeout(timer);timer=null;if(document.hidden||table.stage!=="dealer")return;timer=setTimeout(()=>{timer=null;R.dealerBlackjack(table);U.save(key,table);render();schedule();},650);}
  for(const action of ["hit","stand","double","split"])$(action+"Button").onclick=()=>{if(R.blackjackAction(table,action)){U.save(key,table);render();schedule();}};
  $("dealButton").onclick=()=>{if(!R.startBlackjack(table,Number($("betAmount").value))){$("blackjackMessage").textContent="10〜500チップを、10刻みで選んでね。持ちチップ以内でベットできます。";return;}U.save(key,table);render();schedule();};
  for(const b of document.querySelectorAll("[data-bet]"))b.onclick=()=>{$("betAmount").value=b.dataset.bet;};
  $("newTable").onclick=()=>$("resetDialog").showModal();
  $("confirmReset").onclick=()=>{clearTimeout(timer);table=R.createBlackjack();U.save(key,table);$("resetDialog").close();render();};
  $("cancelReset").onclick=()=>$("resetDialog").close();
  document.addEventListener("visibilitychange",schedule);render();schedule();
})();
