(function(root){
 'use strict';
 const M=root.HKAmounts||(typeof require==='function'?require('./amounts.js'):null);
 const pockets=Object.freeze([{label:'OUT',weight:25,units:0},{label:'入賞 壱',weight:12,units:1},{label:'入賞 弐',weight:10,units:2},{label:'START',weight:6,units:2},{label:'入賞 弐',weight:10,units:2},{label:'入賞 壱',weight:12,units:1},{label:'OUT',weight:25,units:0}]);
 function index(length){const max=Math.floor(4294967296/length)*length,a=new Uint32Array(1);do{root.crypto.getRandomValues(a);}while(a[0]>=max);return a[0]%length;}
 function resolve(balls){
  if(!Array.isArray(balls)||balls.length!==10)throw Error('invalid-pachinko');
  let units=0,starts=0,jackpots=0,seven=0,maxMultiplier=0;
  for(const ball of balls){
   if(!ball||!Number.isInteger(ball.pocket)||ball.pocket<0||ball.pocket>6)throw Error('invalid-pachinko');
   let paid=pockets[ball.pocket].units;
   if(ball.pocket===3){
    starts++;const d=ball.digits;if(!Array.isArray(d)||d.length!==3||d.some(n=>!Number.isInteger(n)||n<0||n>9))throw Error('invalid-pachinko');
    if(d.every(n=>n===d[0])){const multiplier=d[0]===7?200:50;jackpots++;if(d[0]===7)seven++;maxMultiplier=Math.max(maxMultiplier,multiplier);paid=multiplier*10;}
   }else if(ball.digits!==null)throw Error('invalid-pachinko');
   units+=paid;
  }
  const title=seven?'777！黄金の大当たり！':jackpots?'大当たり '+jackpots+'回！':'10球の入賞結果が確定。';
  return{version:1,balls:balls.map(b=>({pocket:b.pocket,digits:b.digits?[...b.digits]:null})),units,starts,jackpots,seven,maxMultiplier,title};
 }
 function draw(random=index){
  return resolve(Array.from({length:10},()=>{const value=random(100);if(!Number.isInteger(value)||value<0||value>=100)throw Error('invalid-pachinko');let sum=0,pocket=pockets.findIndex(p=>(sum+=p.weight)>value),digits=null;if(pocket===3){const n=random(1000);if(!Number.isInteger(n)||n<0||n>=1000)throw Error('invalid-pachinko');digits=[Math.floor(n/100),Math.floor(n/10)%10,n%10];}return{pocket,digits};}));
 }
 function valid(data){try{if(data?.version!==1)return false;const result=resolve(data.balls);return['units','starts','jackpots','seven','maxMultiplier','title'].every(k=>result[k]===data[k]);}catch{return false;}}
 function payout(stake,data){if(!M.valid(stake)||M.cmp(stake,1)<0||!valid(data))throw Error('invalid-pachinko');return M.pack(BigInt(M.full(stake))*BigInt(data.units)/10n);}
 const api=Object.freeze({pockets,resolve,draw,valid,payout});root.HKPachinkoRules=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
