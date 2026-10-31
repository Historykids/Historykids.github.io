/* Shared game rules. All mutations and battle snapshots are verified on the server. */
(function(root){
 'use strict';
 const R=root.HKSengokuKuniMap,G=root.HKSengokuWorldRules,SCALE=10000,MAX_MEMBERS=5,MAX_DEPUTIES=3;
 const units=Object.freeze({infantry:{name:'兵士',mark:'兵'}});
 const terrainNames={plain:'平野',mountain:'山岳',forest:'森林',coast:'海岸'},weatherNames={sunny:'晴れ',rain:'雨',fog:'霧'};
 const mountain=new Set(['kai','shinano','hida','mutsu','country_npl','country_btn','country_che','afghanistan']);
 const forest=new Set(['echigo','dewa','ezo','country_fin','country_swe','country_cog']);
 const major=new Set(['russia','qing','united_states','india','oceania','canada','brazil','britain','france','central_europe','italy','joseon','la_plata','new_spain','arabia','ottoman','indonesia','south_africa']);
 const hash=s=>[...s].reduce((n,c)=>(n*31+c.codePointAt(0))>>>0,7);
 const terrain=id=>mountain.has(id)?'mountain':forest.has(id)?'forest':R.region(id)?.overseas?'coast':'plain';
 const weather=(id,now)=>['sunny','rain','fog'][hash((R.region(id)?.rankingRegion||id)+Math.floor((now+32400000)/86400000))%3];
 const week=now=>{const d=new Date(now+32400000),day=(d.getUTCDay()+6)%7;return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day)-32400000;};
 const count=(whole,fraction=0)=>Number(whole||0)+Number(fraction||0)/SCALE;
 const troopCount=s=>count(s.soldiers,s.attackFraction),guardCount=r=>count(r.garrison,r.garrisonFraction);
 const overseasRecovery=(r,now)=>!!r&&!r.owner&&!!R.region(r.id)?.overseas&&!major.has(r.id)&&!r.battle&&(r.protectedUntil||0)<=now;
 const canRecover=(r,now)=>G.canSpawn(r,now)||overseasRecovery(r,now);
 function snapshot(s,region,now,alliance={}){return{allianceAttack:Math.max(0,Math.min(10,alliance.attack||0)),allianceDefense:Math.max(0,Math.min(10,alliance.defense||0)),attackUnit:units[s.attackUnit]?s.attackUnit:'infantry',defenseUnit:units[region.defenseUnit]?region.defenseUnit:'infantry',castleWall:Math.min(5,region.castleEffects?.wall||0),castleMoat:Math.min(5,region.castleEffects?.moat||0),castleLevel:Math.max(0,Math.min(10,region.castleLevel||0)),terrain:terrain(region.id),weather:weather(region.id,now)};}
 function modifiers(t){
  let attack=10000,defense=10000,notes=[];
  if(t.terrain==='mountain'){defense=Math.floor(defense*120/100);notes.push('山岳：守備＋20%');}
  if(t.terrain==='forest'){defense=Math.floor(defense*110/100);notes.push('森林：守備＋10%');}
  if(t.castleLevel){defense=Math.floor(defense*(100+t.castleLevel*10)/100);notes.push('城Lv.'+t.castleLevel+'：守備＋'+t.castleLevel*10+'%');}
  if(t.castleWall){defense=Math.floor(defense*(100+t.castleWall*5)/100);notes.push('城壁：守備＋'+t.castleWall*5+'%');}
  if(t.castleMoat){defense=Math.ceil(defense*100/(100-t.castleMoat*3));notes.push('堀：被害−'+t.castleMoat*3+'%');}
  if(t.allianceAttack){attack=Math.floor(attack*(100+t.allianceAttack)/100);notes.push('同盟：攻撃＋'+t.allianceAttack+'%');}
  if(t.allianceDefense){defense=Math.floor(defense*(100+t.allianceDefense)/100);notes.push('同盟：守備＋'+t.allianceDefense+'%');}
  return{attack,defense,notes};
 }
 function damage(force,t){if(!t)return G.damage({force});const m=modifiers(t),a=BigInt(force)*BigInt(m.attack),b=10n*BigInt(m.defense);return Number((a+b-1n)/b);}
 const allianceBuffs=Object.freeze({attack:{name:'攻撃の結束',unit:'%',step:2,max:5,description:'合戦の攻撃補正'},defense:{name:'防衛の結束',unit:'%',step:2,max:5,description:'同盟員の領地の守備補正'},recruit:{name:'共同募兵',unit:'人',step:2,max:5,description:'兵士クイズの正解ごとの追加兵士'},experience:{name:'武将の学び',unit:'経験値',step:1,max:5,description:'武将育成クイズの正解ごとの追加経験値'}});
 const buffCosts=Object.freeze([50,100,150,200,250]);
 function combatBuffs(view,region){const owner=view?.world?.players.find(p=>p.id===region.owner),defender=view?.world?.alliances.find(a=>a.id===owner?.allianceId);return{attack:view?.strategy?.alliance?.buffs?.effects.attack||0,defense:defender?.buffs?.effects.defense||0};}
 const messages=Object.freeze({attack:'この領土を攻めよう！',help:'援軍お願い！',defend:'守備兵を増やそう！',thanks:'ありがとう！',congrats:'おめでとう！'});
 const honorNames=Object.freeze({hundred:'天下の同盟',joint:'不敗の軍団',japan:'日本統一同盟',world:'世界征服同盟',upset:'下克上同盟'});
 root.HKSengokuTactics=Object.freeze({version:'strategy-alliance-20261031-v1',SCALE,MAX_MEMBERS,MAX_DEPUTIES,allianceBuffs,buffCosts,combatBuffs,units,terrainNames,weatherNames,major,terrain,weather,week,count,troopCount,guardCount,canRecover,overseasRecovery,snapshot,modifiers,damage,messages,honorNames});
 if(typeof module!=='undefined')module.exports=root.HKSengokuTactics;
})(typeof window!=='undefined'?window:globalThis);
