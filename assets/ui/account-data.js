/* The explicit cloud-save format never includes passwords, login tokens or admin drafts. */
(function(root){
 'use strict';
 const eras=['jomon','yayoi','kofun','asuka','nara','heian','kamakura','muromachi','sengoku','edo','meiji','taisho','showa','heisei','world_ancient','world_medieval','world_early_modern','world_modern','world_contemporary'];
 const snakeKey='hk_neon_snake_v1';
 const keys=[snakeKey,'hk_wallet_v2','money_v1','city_v1','hk_town_layout_v2','hk_residents_v1','hk_wrong_v2','hk_ruby_v2','hk_era_v2','hk_wealth_name_v1','hk_buzzer_nickname','hk_best_v4_alltime_ALL_allera_ALL_sprint_choice','hk_buzzer_verified_best_v1','hk_buzzer_published_v1','hk_poker_reservation_v1','hk_poker_room_v1','hk_holdem_action_v1',...eras.map(e=>'cards_'+e+'_complete_v1')];
 function readSnake(raw){
  if(typeof raw!=='string')return null;
  try{const save=JSON.parse(raw);return save?.version===1&&Number.isFinite(save.xp)&&save.xp>=0?save:null;}catch{return null;}
 }
 const counter=n=>Number.isFinite(n)&&n>=0?n:0;
 function snakeProgress(save){
  const costumes=Array.isArray(save.owned)?new Set(save.owned.filter(id=>typeof id==='string')).size:0;
  return [save.xp,...['best','totalKills','totalFood','firsts','totalSeconds','games'].map(k=>counter(save[k])),costumes,counter(save.coins),counter(save.updatedAt)];
 }
 // Keep the entire winning save so balances and claimed rewards stay consistent.
 function preferSnake(saved,candidate){
  if(saved===candidate)return readSnake(saved)?saved:null;
  const original=readSnake(saved),incoming=readSnake(candidate);
  if(!incoming)return original?saved:null;
  if(!original)return candidate;
  const current=snakeProgress(original),next=snakeProgress(incoming);
  for(let i=0;i<current.length;i++)if(next[i]!==current[i])return next[i]>current[i]?candidate:saved;
  return saved;
 }
 const api=Object.freeze({version:1,keys:Object.freeze(keys),maxBytes:1048576,snakeKey,readSnake,preferSnake});root.HKAccountData=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
