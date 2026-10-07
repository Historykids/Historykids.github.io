(function () {
  "use strict";
  const suit = {S:"♠",H:"♥",D:"♦",C:"♣"};
  const suitName = {S:"スペード",H:"ハート",D:"ダイヤ",C:"クラブ"};
  function card(c, {hidden=false, best=false}={}) {
    if(hidden || !c) return '<span class="playing-card card-back" role="img" aria-label="伏せ札"><span aria-hidden="true">歴</span></span>';
    const rank=c[0]==="T"?"10":c[0];
    return '<span class="playing-card '+(/[HD]/.test(c[1])?'card-red ':'')+(best?'card-best':'')+'" role="img" aria-label="'+suitName[c[1]]+'の'+rank+'"><span class="card-corner" aria-hidden="true">'+rank+'<small>'+suit[c[1]]+'</small></span><span class="card-pip" aria-hidden="true">'+suit[c[1]]+'</span><span class="card-bottom" aria-hidden="true">'+rank+'</span></span>';
  }
  function save(key,state) {try{localStorage.setItem(key,JSON.stringify(state));return true;}catch(e){document.getElementById("storageNote").hidden=false;return false;}}
  function read(key,restore) {try{return restore(localStorage.getItem(key));}catch(e){return null;}}
  window.HKTableUI={card,save,read};
})();
