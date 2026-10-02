(function(){
  "use strict";
  const L=window.HKLeaderboard,$=id=>document.getElementById(id);
  let entries=[],own=null,ownKnown=false,uid="",revision=0,loading=false,cached=false,updatedAt=0,submitting=false;
  function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;}
  function timestamp(ms){return ms?new Date(ms).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—";}
  function status(message,kind=""){$("rankStatus").textContent=message;$("rankStatus").className="rank-status "+kind;}
  function renderPersonal(){
    const best=L.localBest(),position=L.ownRank(entries,own);
    $("personalTime").textContent=best?L.seconds(best.ms):"—";$("personalUnit").hidden=!best;
    $("myRank").textContent=own?position?position+"位":"100位圏外":"—";
    $("myPublished").textContent=own?own.name+" · "+L.seconds(own.ms)+"秒":ownKnown?"まだランキングに登録していません":loading?"登録状態を確認中…":"接続すると登録状態を確認できます";
    $("personalEmpty").hidden=!!best;$("rankRegister").hidden=!best||(own&&own.ms<=best.ms);
    $("registrationState").textContent=!best?"10問全問正解で、タイムを登録できます。":own&&own.ms<=best.ms?"登録済みの自己ベストを残しています。":own?"自己ベスト更新！新しいタイムを登録できます。":"ニックネームを入力して、自己ベストを登録しよう。";
    $("myRowBtn").disabled=!own;$("registerBtn").disabled=loading||submitting;
  }
  function render(){
    const search=$("rankSearch").value.normalize("NFKC").trim().toLocaleLowerCase("ja-JP"),filtered=entries.filter(r=>r.name.normalize("NFKC").toLocaleLowerCase("ja-JP").includes(search));
    $("clearSearch").hidden=!search;$("shownCount").textContent=search?filtered.length+"人が見つかりました":entries.length+"人の記録を表示";$("rankList").replaceChildren();
    for(const r of filtered){
      const tr=document.createElement("tr");if(r.id===uid){tr.className="my-score";tr.id="myScore";}
      const position=text("td",r.rank,"position"),name=document.createElement("td"),time=document.createElement("td");position.setAttribute("aria-label",r.rank+"位");
      name.append(text("span",r.name,"player-name"));if(r.id===uid)name.append(text("span","あなた","you-label"));time.append(text("b",L.seconds(r.ms)),text("span"," 秒","time-unit"));
      tr.append(position,name,time,text("td",timestamp(r.timestamp),"registered-date"));$("rankList").append(tr);
    }
    $("rankEmpty").hidden=!!filtered.length;$("rankTable").hidden=!filtered.length;
    $("emptyTitle").textContent=search?"そのニックネームは見つかりませんでした":loading?"みんなの記録を読み込んでいます":cached?"保存された記録はありません":"最初の記録を登録しよう！";
    $("emptyText").textContent=search?"表示している上位100人の中から探しています。別の名前で試してみよう。":loading?"自己ベストは上のカードで確認できます。":cached?"接続を確認して「順位を更新」を押してください。":"10問全問正解して、ニックネームで参加しよう。";
    $("podium").replaceChildren();$("podium").hidden=!entries.length||!!search;
    for(const r of entries.slice(0,3)){const card=document.createElement("article");card.className="podium-card place-"+Math.min(r.rank,3);card.append(text("span",r.rank+"位","podium-place"),text("h3",r.name),text("p",L.seconds(r.ms)+" 秒","podium-time"));if(r.id===uid)card.append(text("span","あなた","you-label"));$("podium").append(card);}
    $("rankFreshness").textContent=updatedAt?(cached?"保存済みの順位 · ":"更新 ")+timestamp(updatedAt):loading?"接続中…":"接続を待っています";renderPersonal();
  }
  async function load(){
    const rev=++revision;loading=true;$("reload").disabled=true;$("reload").textContent="更新中…";$("rankBoard").setAttribute("aria-busy","true");status("");render();
    try{const result=await L.load();if(rev!==revision)return;entries=result.entries;own=result.own;ownKnown=result.ownKnown;uid=result.uid||"";updatedAt=result.at;cached=false;L.saveCache(entries,updatedAt);status(result.ownKnown?"":"みんなの順位を表示しています。自分の登録状態は接続を確認して再読み込みしてください。",result.ownKnown?"":"error");}
    catch(error){if(rev!==revision)return;cached=true;ownKnown=false;status(L.errorText(error)+(entries.length?" 表示中の順位は保存済みの記録です。":""),"error");}
    finally{if(rev===revision){loading=false;$("reload").disabled=false;$("reload").textContent="順位を更新";$("rankBoard").setAttribute("aria-busy","false");render();}}
  }
  $("rankSearch").oninput=render;$("clearSearch").onclick=()=>{$("rankSearch").value="";render();$("rankSearch").focus();};$("reload").onclick=load;
  $("myRowBtn").onclick=()=>{$("rankSearch").value="";render();const row=$("myScore");if(row)row.scrollIntoView({behavior:"smooth",block:"center"});else{status("あなたの登録は "+L.seconds(own.ms)+"秒です。表示は先頭100件までです。同じタイムの人も同じ順位になります。");$("personalCard").scrollIntoView({behavior:"smooth",block:"center"});}};
  $("rankNickname").value=L.savedName();$("rankNickname").oninput=()=>$("rankNickname").setCustomValidity("");
  $("rankRegister").onsubmit=async event=>{
    event.preventDefault();const best=L.localBest(),name=L.nickname($("rankNickname").value);if(submitting||loading||!best)return;
    if(!name){$("rankNickname").setCustomValidity("ニックネームを入力してね。");$("rankNickname").reportValidity();return;}
    $("rankNickname").value=name;submitting=true;$("registrationMessage").textContent="自己ベストを登録しています…";renderPersonal();
    try{const result=await L.submit(name,best.ms);own=result.entry;uid=own.id;ownKnown=true;$("registrationMessage").textContent=result.updated?own.name+"で登録しました！ "+L.seconds(own.ms)+"秒":"登録済みの "+L.seconds(own.ms)+"秒を残しました。";$("registrationMessage").className="registration-message success";await load();}
    catch(error){$("registrationMessage").textContent=L.errorText(error);$("registrationMessage").className="registration-message error";}
    finally{submitting=false;renderPersonal();}
  };
  window.addEventListener("storage",event=>{if(event.key===L.bestKey)renderPersonal();});const cache=L.readCache();if(cache){entries=cache.entries;updatedAt=cache.at;cached=true;}load();
})();
