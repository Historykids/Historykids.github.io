(function(){
 'use strict';
 const W=window.HKWallet,M=window.HKAmounts,P=M.rebirth,$=id=>document.getElementById(id);
 if(!$('view-rebirth'))return;
 let confirming=null,busy=false,epoch=0;
 const money=n=>M.format(n)+'両';
 function message(text,error=false){$('rebirthMessage').textContent=text;$('rebirthMessage').classList.toggle('error',error);}
 function render(){
  const w=W.snapshot(),times=w.rebirths??0,limited=times>=P.max,next=Math.min(times+1,P.max),cost=P.cost(times),enough=M.cmp(w.balance,cost)>=0,blocked=w.pending||w.slotBonus?.remaining>0;
  $('rebirthCount').textContent=times.toLocaleString('ja-JP')+'回';
  $('rebirthFactor').textContent='×'+P.factor(times);$('rebirthNextFactor').textContent=limited?'—':'×'+P.factor(next);
  $('rebirthNextTitle').textContent=limited?'リボーン上限に到達':next.toLocaleString('ja-JP')+'回目のリボーン';
  $('rebirthCost').textContent=limited?'—':money(cost);$('rebirthCost').title=limited?'上限10,000回':M.full(cost)+'両';
  $('rebirthBalance').textContent=money(w.balance);$('rebirthBalance').title=M.full(w.balance)+'両';
  $('rebirthProgress').value=limited||enough?10000:Number(BigInt(M.full(w.balance))*10000n/BigInt(M.full(cost)));
  $('rebirthRemaining').textContent=limited?'リボーンは現在10,000回までです。':blocked?'カジノの勝負・無料スピンを終えるとリボーンできます。':enough?'準備が整いました。次の境地へ進めます。':'あと '+money(M.sub(cost,w.balance));
  $('rebirthStart').textContent=limited?'上限に到達':'リボーンする';
  $('rebirthStart').disabled=busy||limited||!!blocked||!enough||w.unavailable;
  $('rebirthCommit').disabled=busy||limited||!!blocked||!enough||w.unavailable;
  if(confirming!==null&&(confirming!==times||limited||blocked||!enough))confirming=null;
  $('rebirthConfirm').hidden=confirming===null;
  $('rebirthStart').hidden=confirming!==null;
  $('rebirthConfirmText').textContent=limited?'リボーンは現在10,000回までです。':money(w.balance)+' → 1万両。町・住民・学習記録を残して、配当は本来の'+P.factor(next)+'倍になります。この操作は取り消せません。';
  for(const [id,required,name] of [['silverUnlock',2,'銀のルーレット'],['goldUnlock',5,'金のスロット'],['kingUnlock',10,'王者のポーカー']]){
   const el=$(id),open=times>=required;el.textContent=open?'解放済み · カジノの選択バーから':'🔒 リボーン'+required+'回で解放';el.closest('.rebirth-unlock').classList.toggle('unlocked',open);el.closest('.rebirth-unlock').setAttribute('aria-label',name+' · '+(open?'解放済み':'リボーン'+required+'回で解放'));
  }
  $('rebirthRoadmap').innerHTML=limited?'<li><span>上限10,000回に到達しました。</span></li>':Array.from({length:Math.min(5,P.max-times)},(_,i)=>{const n=times+i;return '<li><span>'+(n+1).toLocaleString('ja-JP')+'回目</span><b>'+money(P.cost(n))+'</b><small>配当 ×'+P.factor(n+1)+'</small></li>';}).join('');
 }
 async function syncRanking(){
  const token=localStorage.getItem('hk_wealth_identity_v1'),endpoint=window.HKRankingConfig?.endpoint;
  if(!/^[a-f0-9]{64}$/.test(token||'')||!endpoint)return false;
  const api=async(path,body)=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{const response=await fetch(new URL(path,endpoint),{method:body?'POST':'GET',mode:'cors',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'ranking-unavailable');return data;}finally{clearTimeout(timer);}
  };
  const board=await api('/wealth');if(!board.own)return false;
  const snapshot=window.HKWealthRules.readLocal(localStorage,W.snapshot()).snapshot;
  const updated=await api('/wealth/register',{name:board.own.name,snapshot,expectedRevision:board.own.revision});
  try{localStorage.setItem('hk_wealth_cache_v1',JSON.stringify(updated));}catch{}
  return true;
 }
 $('rebirthStart').onclick=()=>{confirming=W.snapshot().rebirths??0;message('');render();};
 $('rebirthCancel').onclick=()=>{confirming=null;render();};
 $('rebirthCommit').onclick=()=>{
  if(busy||confirming===null)return;
  const expected=confirming,request=++epoch;busy=true;render();
  W.rebirth(expected,async result=>{
   confirming=null;render();message('リボーン完了！ '+result.rebirths+'回目の力で、配当は本来の'+P.factor(result.rebirths)+'倍。1万両から再出発！');
   $('view-rebirth').classList.remove('reborn');void $('view-rebirth').offsetWidth;$('view-rebirth').classList.add('reborn');
   try{if(await syncRanking()&&request===epoch)message('リボーン完了！ 配当は本来の'+P.factor(result.rebirths)+'倍。成金ランキングにも反映しました。');}
   catch{if(request===epoch)message('リボーンは保存済みです。成金ランキングの「最新の経済力に更新」で順位を反映してね。');}
   finally{busy=false;render();}
  },error=>{busy=false;confirming=null;render();message({'insufficient':'必要な両が足りません。','pending-round':'カジノの勝負を終えてから進めてね。','bonus-active':'無料スピンを終えてから進めてね。','rebirth-limit':'リボーンは現在10,000回までです。','rebirth-changed':'別の画面でリボーン済みです。最新の状態を確認してね。'}[error.message]||'保存できませんでした。記録は変更していません。',true);});
 };
 window.addEventListener('hk-wallet-change',render);
 window.addEventListener('focus',render);
 render();
})();
