/* Stable presentation colors, based only on public world/alliance/player IDs. */
(function(){
 'use strict';
 const neutral='#969d83',cache=new Map();
 function hash(text){let n=2166136261;for(const c of String(text)){n^=c.codePointAt(0);n=Math.imul(n,16777619);}n^=n>>>16;n=Math.imul(n,0x85ebca6b);n^=n>>>13;n=Math.imul(n,0xc2b2ae35);return (n^(n>>>16))>>>0;}
 function rgb(h,s,l){s/=100;l/=100;const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};return '#'+f(0)+f(8)+f(4);}
 function color(key,light=63){const id=key+':'+light;if(!cache.has(id)){const n=hash(key);cache.set(id,rgb(n%360,58+(n>>>12)%14,light));}return cache.get(id);}
 function factions(world){const groups=new Map((world?.alliances||[]).map(a=>[a.id,a.name]));return new Map((world?.players||[]).map(p=>{const key=(p.allianceId?'alliance:':'player:')+(world?.id||0)+':'+(p.allianceId||p.id);return[p.id,{key,color:color(key),name:p.allianceId?'同盟：'+(groups.get(p.allianceId)||p.allianceName||'所属同盟'):'無所属：'+p.name}];}));}
 function hiddenSummary(text){return /直近の防衛[：:]|全領土を失いました|領土を失っています|このアカウントの正解1問の兵士報酬/.test(String(text||''));}
 const api=Object.freeze({neutral,color,factions,hiddenSummary,nameColor:(worldId,name)=>color('speaker:'+(worldId||0)+':'+name,80)});if(typeof window!=='undefined')window.HKSengokuColors=api;if(typeof module!=='undefined')module.exports=api;
})();
