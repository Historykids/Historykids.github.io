/* Shared game rules. All mutations and battle snapshots are verified on the server. */
(function(root){
 'use strict';
 const R=root.HKSengokuKuniMap,G=root.HKSengokuWorldRules,SCALE=10000,MAX_MEMBERS=20,MAX_DEPUTIES=3;
 const units=Object.freeze({infantry:{name:'足軽',mark:'歩',beats:'gunners'},archers:{name:'弓兵',mark:'弓',beats:'infantry'},cavalry:{name:'騎馬兵',mark:'騎',beats:'archers'},gunners:{name:'鉄砲兵',mark:'銃',beats:'cavalry'}});
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
 function snapshot(s,region,now){return{attackUnit:units[s.attackUnit]?s.attackUnit:'infantry',defenseUnit:units[region.defenseUnit]?region.defenseUnit:'infantry',castleLevel:Math.max(0,Math.min(10,region.castleLevel||0)),terrain:terrain(region.id),weather:weather(region.id,now)};}
 function modifiers(t){
  let attack=10000,defense=10000,notes=[];
  if(units[t.attackUnit]?.beats===t.defenseUnit){attack=12500;notes.push('兵種相性：攻撃＋25%');}
  else if(units[t.defenseUnit]?.beats===t.attackUnit){attack=8000;notes.push('兵種相性：攻撃−20%');}
  if(t.terrain==='mountain'){defense=Math.floor(defense*120/100);notes.push('山岳：守備＋20%');}
  if(t.terrain==='forest'){defense=Math.floor(defense*110/100);notes.push('森林：守備＋10%');}
  if(t.attackUnit==='cavalry'&&t.terrain==='plain'){attack=Math.floor(attack*115/100);notes.push('平野の騎馬：攻撃＋15%');}
  if(t.weather==='rain'&&t.attackUnit==='gunners'){attack=Math.floor(attack*75/100);notes.push('雨の鉄砲：攻撃−25%');}
  if(t.weather==='rain'&&t.defenseUnit==='gunners'){defense=Math.floor(defense*75/100);notes.push('雨の鉄砲：守備−25%');}
  if(t.weather==='fog'&&t.attackUnit==='archers'){attack=Math.floor(attack*90/100);notes.push('霧の弓兵：攻撃−10%');}
  if(t.castleLevel){defense=Math.floor(defense*(100+t.castleLevel*10)/100);notes.push('城Lv.'+t.castleLevel+'：守備＋'+t.castleLevel*10+'%');}
  return{attack,defense,notes};
 }
 function damage(force,t){if(!t)return G.damage({force});const m=modifiers(t),a=BigInt(force)*BigInt(m.attack),b=10n*BigInt(m.defense);return Number((a+b-1n)/b);}
 const messages=Object.freeze({attack:'この領土を攻めよう！',help:'援軍お願い！',defend:'守備兵を増やそう！',thanks:'ありがとう！',congrats:'おめでとう！'});
 const honorNames=Object.freeze({hundred:'天下の同盟',joint:'不敗の軍団',japan:'日本統一同盟',world:'世界征服同盟',upset:'下克上同盟'});
 root.HKSengokuTactics=Object.freeze({version:'strategy-alliance-20261031-v1',SCALE,MAX_MEMBERS,MAX_DEPUTIES,units,terrainNames,weatherNames,major,terrain,weather,week,count,troopCount,guardCount,canRecover,overseasRecovery,snapshot,modifiers,damage,messages,honorNames});
 if(typeof module!=='undefined')module.exports=root.HKSengokuTactics;
})(typeof window!=='undefined'?window:globalThis);
