/* Four independent quiz purposes; combat damage is committed by the server. */
(function(root){
 'use strict';
 const LIMIT=null,WORLD_COUNT=5,INITIAL_GARRISON=2000,PROTECTION=7200000,BATTLE_TIME=300000,CAPTURE_COOLDOWN=300000,ATTACK_COOLDOWN=300000,WRONG_COOLDOWN=300000,SOLDIERS_PER_CORRECT=20,DEFENSE_PER_CORRECT=50,GENERAL_INTERVAL=50,MAX_LEVEL=100,MAX_SOLDIERS=1000000000000;
 const canSpawn=(region,now)=>!!region&&region.garrison===0&&!(region.garrisonFraction||0)&&(region.protectedUntil||0)<=now&&!region.battle;
 const modes={general:{title:'武将獲得クイズ',reward:'正解50問ごとに武将1人'},soldiers:{title:'兵士獲得クイズ',reward:'正解1問で攻撃兵20人・守備兵50人＋武将の効果'},level:{title:'武将育成クイズ',reward:'選んだ武将だけに経験値'},battle:{title:'合戦クイズ',reward:'5問連続正解で10分の1の攻撃・攻撃後は5分待ち'}};
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
 const deployed=s=>{const ids=Array.isArray(s.deployedGenerals)?s.deployedGenerals:[s.activeGeneral];return s.generals.filter(g=>ids.includes(g.id));};
 function buffs(s){return deployed(s).reduce((total,g)=>{const m=generals[g.id];for(const key of ['attack','recruit','experience'])total[key]+=(m?.[key]||0)*g.level;return total;},{attack:0,recruit:0,experience:0});}
 const attack=s=>Number(BigInt(s.soldiers)*BigInt(100+buffs(s).attack)/100n);
 const snapshot=s=>({soldiers:s.soldiers,force:attack(s)});
 const damage=q=>Number((BigInt(q.force)+9n)/10n);
 const available=s=>Math.max(0,Math.floor(s.correctByMode.general/GENERAL_INTERVAL)-(s.generalClaims||0));
 function reachable(s,target,home,frontier=[]){return root.HKSengokuKuniMap.reachable({...s,ownedRegions:[...new Set([...s.ownedRegions,...frontier])]},target)||!s.ownedRegions.length&&(target===home||reclaim(s,target));}
 const reclaim=(s,target)=>(s.heldRegions||[]).includes(target);
 const homeReclaim=(s,target,home)=>target===home&&reclaim(s,target);
 function rewardCorrect(s,id,mode,allianceBonus=0,role='attack',allianceEffects={}){
  s.totalCorrect++;s.correctByMode[mode]++;s.learnedCards=[...new Set([...s.learnedCards,id])];
  let added=0,experience=0,allianceAdded=0,recruitment=0;const levels=[];
  if(mode==='soldiers'&&Number.isSafeInteger(s.recruitMicros)&&s.recruitMicros>0){
   recruitment=s.recruitMicros/10000;
   if(role!=='defense'){const total=BigInt(s.soldiers)*10000n+BigInt(s.attackFraction||0),cap=BigInt(MAX_SOLDIERS)*10000n,wanted=BigInt(s.recruitMicros),delta=wanted>cap-total?cap-total:wanted,next=total+delta;s.soldiers=Number(next/10000n);s.attackFraction=Number(next%10000n);added=Number(delta)/10000;}
  }else if(mode==='soldiers'){const free=MAX_SOLDIERS-s.soldiers,base=(role==='defense'?DEFENSE_PER_CORRECT:SOLDIERS_PER_CORRECT)+buffs(s).recruit;recruitment=base+allianceBonus+(allianceEffects.recruit||0);added=role==='defense'?0:Math.min(free,recruitment);allianceAdded=role==='defense'?0:added-Math.min(free,base);s.soldiers+=added;if(s.soldiers>=MAX_SOLDIERS)s.attackFraction=0;}
  if(mode==='level'){const g=active(s);if(g&&g.level<MAX_LEVEL){experience=1+buffs(s).experience+(allianceEffects.experience||0);g.experience+=experience;while(g.level<MAX_LEVEL&&g.experience>=g.level*10){g.experience-=g.level*10;g.level++;levels.push(g.level);}if(g.level===MAX_LEVEL)g.experience=0;}}
  return{added,allianceAdded,recruitment,experience,levels,generalProgress:mode==='general'?1:0};
 }
 function initial(region,now){return{version:6,attackUnit:'infantry',attackFraction:0,heldRegions:[region],homeEstablished:true,soldiers:0,generals:[],activeGeneral:null,generalClaims:0,totalCorrect:0,correctByMode:{general:0,soldiers:0,level:0,battle:0},attackCooldownUntil:0,battleCooldownUntil:0,failedAttackCooldownUntil:0,learnedCards:[],claimedRewards:[],ownedRegions:[region],capital:region,bestTerritories:1,defeatedRegions:[],battlesWon:0,battlesLost:0,unifications:0,port:true,pending:null,lastResult:null,startedAt:now};}
 const api={canSpawn,LIMIT,WORLD_COUNT,INITIAL_GARRISON,PROTECTION,BATTLE_TIME,CAPTURE_COOLDOWN,ATTACK_COOLDOWN,WRONG_COOLDOWN,SOLDIERS_PER_CORRECT,DEFENSE_PER_CORRECT,GENERAL_INTERVAL,MAX_LEVEL,MAX_SOLDIERS,modes,generals,active,deployed,buffs,attack,snapshot,damage,available,reachable,reclaim,homeReclaim,rewardCorrect,initial};
 root.HKSengokuWorldRules=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
