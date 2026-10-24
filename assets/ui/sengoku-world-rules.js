/* Shared deterministic rules for the 47-player worlds. */
(function(root){
 'use strict';const R=root.HKSengokuRules;
 const LIMIT=47,PROTECTION=120000,BATTLE_TIME=300000;
 function dominant(a){return R.keys.reduce((best,k)=>(a[k]||0)*R.units[k].attack>(a[best]||0)*R.units[best].attack?k:best,'infantry');}
 function power(s,a,tactic,correct,foe){
  const g=R.active(s),ability=R.generals[g.id],enemy=typeof foe==='string'?foe:dominant(foe);let total=0;
  for(const k of R.keys){const u=R.units[k],match=u.strong===enemy?120:u.weak===enemy?85:100,bonus=100+(ability.unit===k?ability.bonus:0);total+=a[k]*u.attack*match*bonus;}
  return Math.floor(Math.floor(total/1000000)*(100+(g.level-1)*3+(ability.all||0))*(100+(s.fortLevel-1)*2)*R.tactics[tactic].power*(100+correct*10)/100000000);
 }
 function guard(p){
  let remaining=R.capacity(p.s);const desired=p.guard?.formation||R.formation(p.s),formation={};
  for(const k of R.keys){formation[k]=Math.min(desired[k]||0,p.s.army[k],remaining);remaining-=formation[k];}
  return{formation,tactic:p.guard?.tactic||'balanced',correct:p.guardQuiz||0};
 }
 const api={LIMIT,PROTECTION,BATTLE_TIME,power,dominant,guard};root.HKSengokuWorldRules=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
