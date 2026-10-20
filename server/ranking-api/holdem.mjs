import '../../assets/ui/amounts.js';
import C from '../../assets/ui/table-rules.js';
const M=globalThis.HKAmounts, n=BigInt;
export const RULES='holdem-v1';
const fail=(code,status=409)=>{throw Object.assign(Error(code),{status});};
const movable=p=>!p.folded&&!p.allin;
const next=(s,from,fn)=>{for(let k=1;k<=s.players.length;k++){const i=(from+k)%s.players.length;if(fn(s.players[i]))return i;}return -1;};
function log(s,text){s.log.push(text);s.log=s.log.slice(-24);}
export function empty(){return{rules:RULES,phase:'lobby',handId:null,stake:null,players:[],startAt:null,deadline:null,nextAt:null,deck:[],board:[],result:null,street:null,turn:-1,dealer:-1,buttonCounter:0,currentBet:'0',minRaise:'2',smallBlind:'1',bigBlind:'2',actionVersion:0,raiseEpoch:0,actions:[],log:[],settlements:[]};}
function pay(p,amount){
 const cost=n(amount)>n(p.stack)?n(p.stack):n(amount);
 p.stack=String(n(p.stack)-cost);p.bet=String(n(p.bet)+cost);p.invested=String(n(p.invested)+cost);p.allin=p.stack==='0';return cost;
}
export function options(s,seat=s.turn){
 const p=s.players[seat];if(s.phase!=='playing'||seat!==s.turn||!p||!movable(p))return null;
 const due=n(s.currentBet)-n(p.bet),max=n(p.bet)+n(p.stack),bb=n(s.bigBlind);
 const rights=p.acted!==s.raiseEpoch||n(s.currentBet)-n(p.faced)>=n(p.reopen);
 return{due:String(due),call:String(due<n(p.stack)?due:n(p.stack)),check:due===0n,min:String(n(s.currentBet)<bb?bb:n(s.currentBet)+n(s.minRaise)),max:String(max),canRaise:rights&&max>n(s.currentBet)&&s.players.some((q,i)=>i!==seat&&movable(q))};
}
export function settle(s,now){
 if(s.phase!=='playing')return;
 const live=s.players.filter(p=>!p.folded),reveal=live.length>1;
 const values=s.players.map(p=>p.folded?null:C.evaluate([...p.hand,...s.board]));
 const levels=[...new Set(s.players.map(p=>p.invested).filter(v=>n(v)>0n))].map(n).sort((a,b)=>a<b?-1:a>b?1:0);
 const won=s.players.map(()=>0n),refund=s.players.map(()=>0n),pots=[];let previous=0n;
 for(const level of levels){
  const contributors=s.players.map((p,i)=>n(p.invested)>=level?i:-1).filter(i=>i>=0);
  const amount=(level-previous)*n(contributors.length);previous=level;
  if(contributors.length===1){refund[contributors[0]]+=amount;continue;}
  const eligible=contributors.filter(i=>!s.players[i].folded);let winners=[];
  for(const i of eligible){
   const comparison=winners.length?C.compare(values[i].rank,values[winners[0]].rank):1;
   if(comparison>0)winners=[i];else if(!comparison)winners.push(i);
  }
  if(!winners.length)throw Error('No live side-pot contender');
  winners.sort((a,b)=>((a-s.dealer+s.players.length-1)%s.players.length)-((b-s.dealer+s.players.length-1)%s.players.length));
  winners.forEach((i,k)=>{won[i]+=amount/n(winners.length)+(n(k)<amount%n(winners.length)?1n:0n);});
  pots.push({amount:String(amount),winners:winners.map(i=>s.players[i].id)});
 }
 s.settlements=s.players.map((p,i)=>{
  const returned=n(p.stack)+refund[i],prize=M.full(M.rebirth.boost(String(won[i]),p.rebirths));
  return{id:p.id,returned:String(returned),prize,won:won[i]>0n,payout:String(returned+n(prize)),handName:p.folded?'フォールド':values[i].name};
 });
 s.result={pot:String(s.players.reduce((a,p)=>a+n(p.invested),0n)),winners:s.players.filter((p,i)=>won[i]>0n).map(p=>p.id),pots,reveal,message:reveal?'最強の5枚で決着。ポットを精算しました。':'フォールドにより勝負が決まりました。'};
 s.phase='showdown';s.turn=-1;s.nextAt=now+10000;s.deadline=null;s.deck=[];
}
function street(s){
 for(const p of s.players){p.bet='0';p.acted=-1;p.faced='0';p.reopen=s.bigBlind;}
 s.currentBet='0';s.minRaise=s.bigBlind;s.raiseEpoch=0;
 s.deck.shift();const count=s.street==='preflop'?3:1;
 s.board.push(...s.deck.splice(0,count));s.street=s.street==='preflop'?'flop':s.street==='flop'?'turn':'river';s.turn=s.dealer;
 log(s,({flop:'フロップ',turn:'ターン',river:'リバー'})[s.street]);
}
function advance(s,now){
 if(s.players.filter(p=>!p.folded).length===1){settle(s,now);return;}
 for(let guard=0;guard<5;guard++){
  const actors=s.players.filter(movable),need=p=>movable(p)&&(n(p.bet)<n(s.currentBet)||(actors.length>1&&p.acted!==s.raiseEpoch));
  const seat=next(s,s.turn,need);
  if(seat>=0){s.turn=seat;s.deadline=now+45000;return;}
  if(s.street==='river'){settle(s,now);return;}
  street(s);
 }
 throw Error('Invalid betting progression');
}
export function start(s,deck,now,handId){
 if(s.phase!=='lobby'||s.players.length<2||n(s.stake)<20n)fail('poker-buyin',400);
 s.phase='playing';s.street='preflop';s.handId=handId;s.board=[];s.deck=deck.slice();s.startAt=null;s.result=null;s.log=[];s.actions=[];s.actionVersion=0;s.raiseEpoch=0;s.settlements=[];
 s.smallBlind=String(n(s.stake)/100n||1n);s.bigBlind=String(n(s.smallBlind)*2n);s.currentBet=s.minRaise=s.bigBlind;
 s.dealer=(s.buttonCounter||0)%s.players.length;s.buttonCounter=(s.buttonCounter||0)+1;
 s.sb=s.players.length===2?s.dealer:next(s,s.dealer,()=>true);s.bb=next(s,s.sb,()=>true);
 for(const p of s.players)Object.assign(p,{hand:[],stack:s.stake,bet:'0',invested:'0',folded:false,allin:false,acted:-1,faced:'0',reopen:s.bigBlind,lastAction:''});
 for(let round=0;round<2;round++){let seat=s.dealer;for(let k=0;k<s.players.length;k++){seat=next(s,seat,()=>true);s.players[seat].hand.push(s.deck.shift());}}
 pay(s.players[s.sb],s.smallBlind);pay(s.players[s.bb],s.bigBlind);s.turn=s.bb;
 log(s,'ブラインド '+M.format(s.smallBlind)+' / '+M.format(s.bigBlind)+'両');advance(s,now);
}
export function action(s,id,type,total,now){
 const seat=s.players.findIndex(p=>p.id===id),o=options(s,seat);if(!o)fail('poker-turn');
 const p=s.players[seat];let text='';
 if(type==='allin'){if(n(o.max)>n(s.currentBet)){type='raise';total=o.max;}else type=o.check?'check':'call';}
 if(type==='fold'){p.folded=true;text='フォールド';}
 else if(type==='check'){if(!o.check)fail('poker-check');text='チェック';}
 else if(type==='call'){if(o.check)fail('poker-check');text='コール '+M.format(pay(p,o.call))+'両';}
 else if(type==='raise'){
  if(!M.valid(total))fail('poker-raise',400);const target=n(total),old=n(s.currentBet),bb=n(s.bigBlind);
  if(!o.canRaise||target<=old||target>n(o.max)||(target<n(o.min)&&target!==n(o.max)))fail('poker-raise',400);
  pay(p,target-n(p.bet));
  if(old<bb?target>=bb:target-old>=n(s.minRaise)){s.minRaise=String(old<bb?target:target-old);s.raiseEpoch++;}
  s.currentBet=String(target);text=(p.allin?'オールイン ':'レイズ ')+M.format(target)+'両';
 }else fail('poker-action',400);
 p.acted=s.raiseEpoch;p.faced=s.currentBet;p.reopen=s.minRaise;p.lastAction=text;s.actionVersion++;
 log(s,p.name+'：'+text);advance(s,now);
}
export function leave(s,id,now){action(s,id,'fold',undefined,now);}
export function tick(s,now){
 for(let i=0;i<64&&s.phase==='playing'&&now>=s.deadline;i++){
  const at=s.deadline,o=options(s);action(s,s.players[s.turn].id,o.check?'check':'fold',undefined,at);
 }
}
