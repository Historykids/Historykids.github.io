/* The explicit cloud-save format never includes passwords, login tokens or admin drafts. */
(function(root){
 'use strict';
 const eras=['jomon','yayoi','kofun','asuka','nara','heian','kamakura','muromachi','sengoku','edo','meiji','taisho','showa','heisei','world_ancient','world_medieval','world_early_modern','world_modern','world_contemporary'];
 const keys=['hk_wallet_v2','money_v1','city_v1','hk_town_layout_v2','hk_residents_v1','hk_wrong_v2','hk_ruby_v2','hk_era_v2','hk_wealth_name_v1','hk_buzzer_nickname','hk_best_v4_alltime_ALL_allera_ALL_sprint_choice','hk_buzzer_verified_best_v1','hk_buzzer_published_v1','hk_poker_reservation_v1','hk_poker_room_v1','hk_holdem_action_v1',...eras.map(e=>'cards_'+e+'_complete_v1')];
 const api=Object.freeze({version:1,keys:Object.freeze(keys),maxBytes:1048576});root.HKAccountData=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
