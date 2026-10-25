/* Four independent quiz purposes; combat damage is committed by the server. */
(function(root){
 'use strict';
 const LIMIT=47,PROTECTION=1800000,BATTLE_TIME=300000,CAPTURE_COOLDOWN=1800000,SOLDIERS_PER_CORRECT=20,GENERAL_INTERVAL=50,MAX_LEVEL=100,MAX_SOLDIERS=1000000000000;
 const modes={general:{title:'武将獲得クイズ',reward:'正解50問ごとに武将1人'},soldiers:{title:'兵士獲得クイズ',reward:'正解1問で兵士20人＋武将の効果'},level:{title:'武将育成クイズ',reward:'選んだ武将だけに経験値'},battle:{title:'合戦クイズ',reward:'5問連続正解で攻撃・不正解で即終了'}};
 const generals={
  nobunaga:{name:'織田信長',mark:'織',attack:4,description:'Lvごとに攻撃兵力＋4%'},
  shingen:{name:'武田信玄',mark:'武',attack:3,recruit:1,description:'Lvごとに攻撃兵力＋3%・兵士獲得クイズの兵士＋1人'},
  kenshin:{name:'上杉謙信',mark:'毘',recruit:5,description:'Lvごとに兵士獲得クイズの兵士＋5人'},
  ieyasu:{name:'徳川家康',mark:'徳',attack:1,recruit:3,description:'Lvごとに攻撃兵力＋1%・兵士獲得クイズの兵士＋3人'},
  masamune:{name:'伊達政宗',mark:'伊',attack:2,recruit:2,description:'Lvごとに攻撃兵力＋2%・兵士獲得クイズの兵士＋2人'},
  yukimura:{name:'真田幸村',mark:'六',attack:1,experience:1,description:'Lvごとに攻撃兵力＋1%・育成クイズの経験値＋1'},
  motonari:{name:'毛利元就',mark:'毛',recruit:1,experience:1,description:'Lvごとに兵士獲得クイズの兵士＋1人・育成クイズの経験値＋1'},
  yoshihiro:{name:'島津義弘',mark:'島',attack:3,recruit:1,description:'Lvごとに攻撃兵力＋3%・兵士獲得クイズの兵士＋1人'},
  hideyoshi:{name:'豊臣秀吉',mark:'豊',recruit:1,description:'Lvごとに兵士獲得クイズの兵士＋1人'}
 };
 const active=s=>s.generals.find(g=>g.id===s.activeGeneral)||null;
 function buffs(s){const g=active(s),m=g?generals[g.id]:null;return{attack:(m?.attack||0)*(g?.level||0),recruit:(m?.recruit||0)*(g?.level||0),experience:(m?.experience||0)*(g?.level||0)};}
 const attack=s=>Number(BigInt(s.soldiers)*BigInt(100+buffs(s).attack)/100n);
 const snapshot=s=>({soldiers:s.soldiers,force:attack(s)});
 const damage=q=>Number((BigInt(q.force)+1n)/2n);
 const available=s=>Math.max(0,Math.floor(s.correctByMode.general/GENERAL_INTERVAL)-(s.generalClaims||0));
 function reachable(s,target,home,frontier=[]){return root.HKSengokuRules.reachable({...s,ownedRegions:[...new Set([...s.ownedRegions,...frontier])]},target)||!s.ownedRegions.length&&target===home;}
 const homeReclaim=(s,target,home)=>!s.ownedRegions.length&&s.bestTerritories>0&&s.homeEstablished!==false&&target===home;
 function rewardCorrect(s,id,mode,allianceBonus=0){
  s.totalCorrect++;s.correctByMode[mode]++;s.learnedCards=[...new Set([...s.learnedCards,id])];
  let added=0,experience=0,allianceAdded=0;const levels=[];
  if(mode==='soldiers'){const free=MAX_SOLDIERS-s.soldiers,base=SOLDIERS_PER_CORRECT+buffs(s).recruit;added=Math.min(free,base+allianceBonus);allianceAdded=added-Math.min(free,base);s.soldiers+=added;}
  if(mode==='level'){const g=active(s);if(g&&g.level<MAX_LEVEL){experience=1+buffs(s).experience;g.experience+=experience;while(g.level<MAX_LEVEL&&g.experience>=g.level*10){g.experience-=g.level*10;g.level++;levels.push(g.level);}if(g.level===MAX_LEVEL)g.experience=0;}}
  return{added,allianceAdded,experience,levels,generalProgress:mode==='general'?1:0};
 }
 function initial(region,now){return{version:3,homeEstablished:true,soldiers:0,generals:[],activeGeneral:null,generalClaims:0,totalCorrect:0,correctByMode:{general:0,soldiers:0,level:0,battle:0},attackCooldownUntil:0,learnedCards:[],claimedRewards:[],ownedRegions:[region],capital:region,bestTerritories:1,defeatedRegions:[],battlesWon:0,battlesLost:0,unifications:0,port:true,pending:null,lastResult:null,startedAt:now};}
 const api={LIMIT,PROTECTION,BATTLE_TIME,CAPTURE_COOLDOWN,SOLDIERS_PER_CORRECT,GENERAL_INTERVAL,MAX_LEVEL,MAX_SOLDIERS,modes,generals,active,buffs,attack,snapshot,damage,available,reachable,homeReclaim,rewardCorrect,initial};
 root.HKSengokuWorldRules=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
