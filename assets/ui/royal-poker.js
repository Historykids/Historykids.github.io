(function(root){
 'use strict';
 const C=root.HKEdoCards||(typeof require==='function'?require('./table-rules.js'):null);
 const R=root.HKCasinoRules||(typeof require==='function'?require('./casino-rules.js'):null);
 const paytable=[['ロイヤルフラッシュ',250],['ストレートフラッシュ',50],['フォーカード',25],['フルハウス',9],['フラッシュ',6],['ストレート',4],['スリーカード',3],['ツーペア',2],['J以上のワンペア',1]];
 function validDeal(data){
  if(!data||data.version!==1||data.phase!=='draw'||!Array.isArray(data.hand)||data.hand.length!==5||!Array.isArray(data.deck)||data.deck.length!==47)return false;
  const cards=[...data.hand,...data.deck];return new Set(cards).size===52&&cards.every(c=>typeof c==='string'&&/^[2-9TJQKA][SHDC]$/.test(c));
 }
 function deal(){
  const cards=Array.from('SHDC').flatMap(s=>Array.from('23456789TJQKA',r=>r+s));
  for(let i=cards.length-1;i>0;i--){const j=R.randomIndex(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
  return {version:1,phase:'draw',hand:cards.slice(0,5),deck:cards.slice(5)};
 }
 function evaluate(hand){
  if(!Array.isArray(hand)||hand.length!==5||new Set(hand).size!==5||hand.some(c=>typeof c!=='string'||!/^[2-9TJQKA][SHDC]$/.test(c)))throw Error('invalid-poker');
  const result=C.evaluate(hand),category=result.rank[0],royal=category===8&&result.rank[1]===14;
  const multiplier=royal?250:category===8?50:category===7?25:category===6?9:category===5?6:category===4?4:category===3?3:category===2?2:category===1&&result.rank[1]>=11?1:0;
  return {rank:result.rank,handName:royal?'ロイヤルフラッシュ':category===1&&multiplier?'J以上のワンペア':result.name,multiplier};
 }
 function draw(data,holds){
  if(!validDeal(data))throw Error('invalid-poker');
  if(!Array.isArray(holds)||holds.length>5||new Set(holds).size!==holds.length||holds.some(i=>!Number.isInteger(i)||i<0||i>4))throw Error('invalid-holds');
  let index=0;const hand=data.hand.map((card,i)=>holds.includes(i)?card:data.deck[index++]);
  const result=evaluate(hand);
  return {version:1,phase:'done',originalHand:[...data.hand],hand,holds:[...holds].sort((a,b)=>a-b),...result,title:result.multiplier?result.handName+'！':'今回は配当なし。'};
 }
 const api=Object.freeze({paytable,validDeal,deal,evaluate,draw});root.HKRoyalPoker=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
