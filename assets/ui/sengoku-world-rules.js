/* One troop type. Only server-verified correct answers create soldiers. */
(function(root){
 'use strict';
 const LIMIT=47,PROTECTION=120000,BATTLE_TIME=300000,SOLDIERS_PER_CORRECT=20,GENERAL_INTERVAL=50,MAX_LEVEL=100,MAX_SOLDIERS=1000000000000;
 const generals={
  nobunaga:{name:'織田信長',mark:'織',attack:4,description:'レベルごとに兵士の攻撃力＋4%'},
  shingen:{name:'武田信玄',mark:'武',attack:3,defense:1,description:'レベルごとに攻撃力＋3%・守備力＋1%'},
  kenshin:{name:'上杉謙信',mark:'毘',defense:5,description:'レベルごとに兵士の守備力＋5%'},
  ieyasu:{name:'徳川家康',mark:'徳',attack:1,defense:3,description:'レベルごとに攻撃力＋1%・守備力＋3%'},
  masamune:{name:'伊達政宗',mark:'伊',attack:2,defense:2,description:'レベルごとに攻撃力・守備力＋2%'},
  yukimura:{name:'真田幸村',mark:'六',quiz:1,attack:1,description:'レベルごとに攻撃力＋1%・合戦の正解1問の戦力補正＋1%'},
  motonari:{name:'毛利元就',mark:'毛',quiz:1,defense:1,description:'レベルごとに守備力＋1%・合戦の正解1問の戦力補正＋1%'},
  yoshihiro:{name:'島津義弘',mark:'島',attack:3,defense:1,description:'レベルごとに攻撃力＋3%・守備力＋1%'},
  hideyoshi:{name:'豊臣秀吉',mark:'豊',recruit:1,description:'レベルごとに正解でもらえる兵士＋1人'}
 };
 const active=s=>s.generals.find(g=>g.id===s.activeGeneral)||null;
 function buffs(s){const g=active(s),meta=g?generals[g.id]:null;return{attack:(meta?.attack||0)*(g?.level||0),defense:(meta?.defense||0)*(g?.level||0),quiz:(meta?.quiz||0)*(g?.level||0),recruit:(meta?.recruit||0)*(g?.level||0)};}
 function power(soldiers,bonus,quiz=0){return Number(BigInt(soldiers)*BigInt(100+bonus)*BigInt(100+quiz)/10000n);}
 const attack=s=>power(s.soldiers,buffs(s).attack),defense=s=>power(s.soldiers,buffs(s).defense);
 function battlePower(snapshot,correct){return power(snapshot.soldiers,snapshot.attack,correct*(10+snapshot.quiz));}
 const snapshot=s=>({soldiers:s.soldiers,attack:buffs(s).attack,quiz:buffs(s).quiz});
 const available=s=>Math.max(0,Math.floor(s.totalCorrect/GENERAL_INTERVAL)-(s.generalClaims||0));
 const recruitGain=s=>Math.min(MAX_SOLDIERS-s.soldiers,SOLDIERS_PER_CORRECT+buffs(s).recruit);
 function rewardCorrect(s,id){const added=recruitGain(s);s.soldiers+=added;s.totalCorrect++;s.learnedCards=[...new Set([...s.learnedCards,id])];const g=active(s),levels=[];
  if(g&&g.level<MAX_LEVEL){g.experience++;while(g.level<MAX_LEVEL&&g.experience>=g.level*10){g.experience-=g.level*10;g.level++;levels.push(g.level);}if(g.level===MAX_LEVEL)g.experience=0;}
  return{added,levels};
 }
 function initial(region,now){return{version:2,soldiers:0,generals:[],activeGeneral:null,generalClaims:0,totalCorrect:0,learnedCards:[],claimedRewards:[],ownedRegions:[region],capital:region,bestTerritories:1,defeatedRegions:[],battlesWon:0,battlesLost:0,unifications:0,port:true,pending:null,lastResult:null,startedAt:now};}
 const api={LIMIT,PROTECTION,BATTLE_TIME,SOLDIERS_PER_CORRECT,GENERAL_INTERVAL,MAX_LEVEL,MAX_SOLDIERS,generals,active,buffs,power,attack,defense,battlePower,snapshot,available,recruitGain,rewardCorrect,initial};
 root.HKSengokuWorldRules=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
