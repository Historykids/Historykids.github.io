(function(){
 'use strict';const R=window.HKSengokuKuniMap,ids=new Set(R.japanRegions.map(r=>r.id));
 window.HKSeason1Config={gacha:true,cachePrefix:'hk_tenka_season1_v1_'};
 window.HKSengokuKuniMap=Object.freeze({...R,regions:R.japanRegions,overseasRegions:Object.freeze([]),routes:Object.freeze(R.routes.filter(r=>r.ends.every(id=>ids.has(id)))),region:id=>ids.has(id)?R.region(id):undefined,reachable:(s,id)=>ids.has(id)&&R.reachable(s,id)});
})();
