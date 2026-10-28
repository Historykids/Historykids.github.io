/* Public, bounded scoring rules. The server supplies every underlying metric. */
(function(root){
 'use strict';
 const R=root.HKSengokuKuniMap,G=root.HKSengokuWorldRules;
 const groups=[
  ['japan','日本',R.japanRegions.map(r=>r.id)],
  ['east_asia','東アジア',['russia','qing','joseon']],
  ['southeast_asia','東南アジア',['burma','siam','vietnam','indonesia','philippines']],
  ['central_south_asia','中央・南アジア',['kazakh','bukhara','kokand','afghanistan','india','bengal']],
  ['europe','ヨーロッパ',['britain','france','iberia','scandinavia','central_europe','italy','iceland']],
  ['middle_east_africa','中東・アフリカ',['ottoman','persia','arabia','north_africa','south_africa','madagascar']],
  ['north_america','北アメリカ',['canada','united_states','louisiana','new_spain','caribbean','greenland']],
  ['south_america','南アメリカ',['new_granada','peru','la_plata','brazil']],
  ['oceania','オセアニア',['oceania','new_zealand','pacific']]
 ];
 const zones=Object.freeze([['all','全世界',R.regions.map(r=>r.id)],...groups].map(([id,name,regions])=>Object.freeze({id,name,regions:Object.freeze(regions)})));
 const zone=id=>zones.find(z=>z.id===id),weights=Object.freeze({territory:6000,attack:1000,defense:1000,generals:1000,learning:700,conquest:300});
 const clean=n=>Number.isSafeInteger(n)&&n>0?n:0;
 const maximumForce=G.MAX_SOLDIERS*(1+Object.values(G.generals).reduce((n,g)=>n+(g.attack||0)*G.MAX_LEVEL,0)/100);
 const logarithmic=(n,cap,points)=>Math.min(points,Math.floor(points*Math.log1p(clean(n))/Math.log1p(cap)));
 function profile(world,player){const s=player.s;return{force:G.attack(s),soldiers:s.soldiers,generals:s.generals.length,generalLevels:s.generals.reduce((n,g)=>n+g.level,0),level:G.active(s)?.level||0,knowledge:new Set(s.learnedCards||[]).size,wins:s.battlesWon||0,lands:world.regions.filter(r=>r.owner===player.id).map(r=>({id:r.id,garrison:clean(r.garrison)})),conquered:[...new Set(s.defeatedRegions||[])]};}
 function score(p,id='all'){
  const area=zone(id);if(!area)return null;
  const ids=new Set(area.regions),lands=p.lands.filter(r=>ids.has(r.id)),territories=lands.length,garrison=lands.reduce((n,r)=>n+clean(r.garrison),0),conquests=new Set(p.conquered.filter(r=>ids.has(r))).size;
  const breakdown={territory:Math.floor(weights.territory*territories/area.regions.length),attack:logarithmic(p.force,maximumForce,weights.attack),defense:logarithmic(garrison,G.MAX_SOLDIERS*area.regions.length,weights.defense),generals:Math.min(weights.generals,Math.floor(weights.generals*clean(p.generalLevels)/(Object.keys(G.generals).length*G.MAX_LEVEL))),learning:Math.min(weights.learning,clean(p.knowledge)*5),conquest:Math.floor(weights.conquest*conquests/area.regions.length)};
  return{score:Object.values(breakdown).reduce((n,v)=>n+v,0),breakdown,force:p.force,soldiers:p.soldiers,generals:p.generals,generalLevels:p.generalLevels,level:p.level,knowledge:p.knowledge,wins:p.wins,territories,garrison,conquests};
 }
 const api=Object.freeze({version:'balanced-v1',zones,zone,weights,maximum:10000,profile,score});root.HKSengokuRankingRules=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
