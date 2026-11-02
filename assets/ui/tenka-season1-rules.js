/* Season 1 uses bounded, server-verified progress from the five original worlds. */
(function(root){
 'use strict';const G=root.HKSengokuWorldRules;
 const version='tenka-season1-private-20261102-v1',MAX_MERIT=100,MAX_LEGACY_SOLDIERS=1000,MAX_LEGACY_TICKETS=3;
 const rarities=Object.freeze({SSR:Object.freeze({chance:10,experience:50,ids:Object.freeze(['nobunaga','shingen','ieyasu'])}),SR:Object.freeze({chance:30,experience:25,ids:Object.freeze(['kenshin','masamune','yukimura'])}),R:Object.freeze({chance:60,experience:10,ids:Object.freeze(['motonari','yoshihiro','hideyoshi'])})});
 const clean=n=>Number.isSafeInteger(n)&&n>0?n:0;
 function legacy(states){const cards=new Set(),lands=new Set(),levels=new Map();let force=0,worlds=0;for(const s of states){if(!s||typeof s!=='object')continue;worlds++;for(const id of s.learnedCards||[])if(typeof id==='string')cards.add(id);for(const id of s.defeatedRegions||[])if(typeof id==='string')lands.add(id);const generals=(s.generals||[]).filter(g=>g&&G.general(g.id));for(const g of generals)levels.set(g.id,Math.max(levels.get(g.id)||0,Math.min(G.MAX_LEVEL,clean(g.level))));force=Math.max(force,G.attack({...s,soldiers:Math.min(G.MAX_SOLDIERS,clean(s.soldiers)),generals}));}
  const generalLevels=[...levels.values()].reduce((n,v)=>n+v,0),merit=Math.min(MAX_MERIT,Math.floor(cards.size/5)+Math.floor(generalLevels/10)+Math.min(20,lands.size*2)+Math.min(20,Math.floor(Math.log10(1+force)*4)));
  return{worlds,uniqueCorrect:cards.size,conquests:lands.size,generalLevels,bestForce:force,merit,soldiers:Math.min(MAX_LEGACY_SOLDIERS,merit*10),tickets:Math.min(MAX_LEGACY_TICKETS,Math.floor(merit/30))};
 }
 const rarity=id=>Object.entries(rarities).find(([,r])=>r.ids.includes(id))?.[0]||'R';
 root.HKTenkaRules=Object.freeze({version,MAX_MERIT,MAX_LEGACY_SOLDIERS,MAX_LEGACY_TICKETS,rarities,legacy,rarity});if(typeof module!=='undefined')module.exports=root.HKTenkaRules;
})(typeof window!=='undefined'?window:globalThis);
