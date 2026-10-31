import '../../assets/ui/sengoku-kuni-map.js';
import '../../assets/ui/sengoku-world-rules.js';
import '../../assets/ui/sengoku-ranking-rules.js';
import {SengokuChat} from './sengoku-chat.mjs';
import {SengokuAlliances,allianceFields} from './sengoku-alliances.mjs';
import {historyQuestions} from './sengoku-questions.mjs';
import {SengokuExpansion,expansionFields,expansionRoutes} from './sengoku-expansion.mjs';
const Legacy=globalThis.HKSengokuRules,R=globalThis.HKSengokuKuniMap,G=globalThis.HKSengokuWorldRules,W=globalThis.HKWealthRules,S=globalThis.HKSengokuRankingRules;
const ANTARCTICA_GARRISON=50000,antarcticaVersion='antarctica-50000-20261029-v1',OVERSEAS_NEUTRAL_GARRISON=5000,overseasGarrisonVersion='overseas-neutral-5000-20261029-v1',neutralGarrison=id=>R.region(id)?.continent==='antarctica'?ANTARCTICA_GARRISON:R.region(id)?.overseas?OVERSEAS_NEUTRAL_GARRISON:0;
const manualCooldownId='account-attack-cooldown-20261031-01';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const fields={...allianceFields,...expansionFields,join:['region','worldId'],switch:['region','worldId'],quiz:['mode','role','region','castleEffect'],begin:['target','regionRevision'],answer:['battleId','index','choice'],next:['battleId','index'],retreat:['battleId'],claim:['generalId'],commander:['generalId'],formation:['generalIds'],respawn:['region'],title:['titleId'],leave:[],profile:['name']};
export const worldRoutes=new Set(['/wealth/sengoku/worlds','/wealth/sengoku/world','/wealth/sengoku/world/action','/wealth/sengoku/world/ranking','/wealth/sengoku/world/alliances','/wealth/sengoku/chat','/wealth/sengoku/chat/send',...expansionRoutes]);
export class SengokuWorlds{
 constructor(storage,accounts,admin,campaign,isBanned){
  this.storage=storage;this.sql=storage.sql;this.accounts=accounts;this.admin=admin;this.campaign=campaign;this.isBanned=isBanned;this.now=()=>Date.now();
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_worlds(id INTEGER PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL,updatedAt INTEGER NOT NULL,summary TEXT NOT NULL,recruiting INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_world_open ON sengoku_worlds(recruiting,id)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_members(owner TEXT PRIMARY KEY,worldId INTEGER NOT NULL,playerId TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_receipts(owner TEXT NOT NULL,requestId TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(owner,requestId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_force_scores(owner TEXT PRIMARY KEY,playerId TEXT NOT NULL,worldId INTEGER NOT NULL,name TEXT NOT NULL,force INTEGER NOT NULL,soldiers INTEGER NOT NULL,generals INTEGER NOT NULL,level INTEGER NOT NULL,territories INTEGER NOT NULL,wins INTEGER NOT NULL,achievedAt INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_force_order ON sengoku_force_scores(force DESC,territories DESC,wins DESC,achievedAt,owner)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_rule_versions(worldId INTEGER PRIMARY KEY,version INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_rewards(owner TEXT NOT NULL,reward TEXT NOT NULL,PRIMARY KEY(owner,reward))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_migrations(id TEXT PRIMARY KEY,at INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_archives(migration TEXT NOT NULL,worldId INTEGER NOT NULL,state TEXT NOT NULL,PRIMARY KEY(migration,worldId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_force_scores(owner TEXT NOT NULL,playerId TEXT NOT NULL,worldId INTEGER NOT NULL,name TEXT NOT NULL,force INTEGER NOT NULL,soldiers INTEGER NOT NULL,generals INTEGER NOT NULL,level INTEGER NOT NULL,territories INTEGER NOT NULL,wins INTEGER NOT NULL,achievedAt INTEGER NOT NULL,PRIMARY KEY(owner,worldId))');
  this.sql.exec("CREATE TABLE IF NOT EXISTS sengoku_attack_penalties(owner TEXT PRIMARY KEY,until INTEGER NOT NULL,reason TEXT NOT NULL)");
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_manual_cooldowns(id TEXT PRIMARY KEY,owner TEXT,status TEXT NOT NULL,appliedAt INTEGER NOT NULL,until INTEGER)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_power_scores(owner TEXT NOT NULL,worldId INTEGER NOT NULL,playerId TEXT NOT NULL,name TEXT NOT NULL,score INTEGER NOT NULL,metrics TEXT NOT NULL,achievedAt INTEGER NOT NULL,PRIMARY KEY(owner,worldId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_titles(owner TEXT NOT NULL,titleId TEXT NOT NULL,earnedAt INTEGER NOT NULL,worldId INTEGER NOT NULL,PRIMARY KEY(owner,titleId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_title_choices(owner TEXT PRIMARY KEY,titleId TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_guest_profiles(owner TEXT PRIMARY KEY,name TEXT NOT NULL,nameKey TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL)');
  this.alliances=new SengokuAlliances(this);this.chat=new SengokuChat(this);this.expansion=new SengokuExpansion(this);this.isBanned=owner=>isBanned(owner)||this.expansion.banned(owner);
 }
 atomic(fn){return this.storage.transactionSync(fn);}
 upgradeWorld(w){
  w.rulesVersion=2;
  for(const region of w.regions)delete region.battle;
  for(const p of w.players){
   const old=p.s,done=old.pending?.answers?.filter(a=>a.correct)||[],state=G.initial(old.capital||p.home,old.startedAt||this.now());
   p.legacyEconomy={army:old.army,resources:old.resources,fortLevel:old.fortLevel,guard:p.guard};
   for(const key of ['ownedRegions','bestTerritories','defeatedRegions','battlesWon','battlesLost','unifications','claimedRewards'])if(old[key]!==undefined)state[key]=old[key];
   state.soldiers=Math.min(G.MAX_SOLDIERS,Legacy.troops(old.army||{})+done.length*G.SOLDIERS_PER_CORRECT);state.totalCorrect=(old.totalCorrect||0)+done.length;
   state.learnedCards=[...new Set([...(old.learnedCards||[]),...done.map(a=>a.id)])];state.generals=(old.generals||[]).filter(g=>G.generals[g.id]).map(g=>({id:g.id,level:Math.min(G.MAX_LEVEL,Math.max(1,g.level)),experience:Math.min(g.level*10-1,Math.floor((g.experience||0)/10))}));state.activeGeneral=state.generals.some(g=>g.id===old.activeGeneral)?old.activeGeneral:state.generals[0]?.id||null;
   if(old.pending)state.lastResult={id:old.pending.id,outcome:'updated',mode:old.pending.mode,target:old.pending.target,correct:done.length,added:done.length*G.SOLDIERS_PER_CORRECT,review:old.pending.answers,at:this.now()};
   p.s=state;p.incoming=null;delete p.guard;delete p.guardQuiz;p.revision++;this.rank(w,p);
  }
 }
 migrateBatch(){
  const ids=this.sql.exec('SELECT w.id FROM sengoku_worlds w LEFT JOIN sengoku_world_rule_versions v ON w.id=v.worldId WHERE v.worldId IS NULL OR v.version<4 ORDER BY w.id LIMIT 8').toArray();
  if(ids.length)this.atomic(()=>{for(const row of ids)this.read(row.id);});
 }
 rank(w,p){
  if(p.retired){this.sql.exec('DELETE FROM sengoku_world_force_scores WHERE owner=? AND worldId=? AND playerId=?',p.owner,w.id,p.id);this.sql.exec('DELETE FROM sengoku_power_scores WHERE owner=? AND worldId=? AND playerId=?',p.owner,w.id,p.id);return;}
  const force=G.attack(p.s),territories=p.s.ownedRegions.length,wins=p.s.battlesWon,old=this.sql.exec('SELECT force,territories,wins,achievedAt,playerId FROM sengoku_world_force_scores WHERE owner=? AND worldId=?',p.owner,w.id).toArray()[0];
  const at=old&&old.playerId===p.id&&old.force===force&&old.territories===territories&&old.wins===wins?old.achievedAt:this.now();
  this.sql.exec('INSERT INTO sengoku_world_force_scores(owner,playerId,worldId,name,force,soldiers,generals,level,territories,wins,achievedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,worldId) DO UPDATE SET playerId=excluded.playerId,worldId=excluded.worldId,name=excluded.name,force=excluded.force,soldiers=excluded.soldiers,generals=excluded.generals,level=excluded.level,territories=excluded.territories,wins=excluded.wins,achievedAt=excluded.achievedAt',p.owner,p.id,w.id,p.name,force,p.s.soldiers,p.s.generals.length,G.active(p.s)?.level||0,territories,wins,at);
  const profile=S.profile(w,p),metrics=JSON.stringify(profile),score=S.score(profile).score,prior=this.sql.exec('SELECT * FROM sengoku_power_scores WHERE owner=? AND worldId=?',p.owner,w.id).toArray()[0],achievedAt=prior&&prior.playerId===p.id&&prior.metrics===metrics?prior.achievedAt:this.now();
  this.sql.exec('INSERT INTO sengoku_power_scores(owner,worldId,playerId,name,score,metrics,achievedAt) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,worldId) DO UPDATE SET playerId=excluded.playerId,name=excluded.name,score=excluded.score,metrics=excluded.metrics,achievedAt=excluded.achievedAt',p.owner,w.id,p.id,p.name,score,metrics,achievedAt);
 }
 ranking(owner,worldId,region='all'){
  if(worldId!==undefined&&(!Number.isSafeInteger(worldId)||worldId<1))fail('world-input');if(!S.zone(region))fail('world-ranking-region');
  const rows=this.sql.exec('SELECT * FROM sengoku_power_scores'+(worldId?' WHERE worldId=?':''),...(worldId?[worldId]:[])).toArray().filter(r=>!this.isBanned(r.owner)&&!W.blockedName(r.name,this.admin.words())).map(r=>({...r,...S.score(JSON.parse(r.metrics),region)})).filter(r=>region==='all'||r.territories>0);
  rows.sort((a,b)=>b.score-a.score||a.achievedAt-b.achievedAt||a.playerId.localeCompare(b.playerId));
  const active=this.member(owner);let previous=-1,rank=0;const entries=rows.map((r,i)=>{if(r.score!==previous)rank=i+1;previous=r.score;const {score,breakdown,force,soldiers,generals,generalLevels,level,knowledge,wins,territories,garrison,conquests}=r;return{id:r.playerId,worldId:r.worldId,name:r.name,title:this.equippedTitle(r.owner),score,breakdown,force,soldiers,generals,generalLevels,level,knowledge,wins,territories,garrison,conquests,rank,own:r.owner===owner&&(!worldId?r.worldId===active?.worldId:true)};});
  return{protocol:'sengoku-force-v2',scoring:S.version,maximum:S.maximum,weights:S.weights,region,regionName:S.zone(region).name,territoryCount:S.zone(region).regions.length,entries:entries.slice(0,100),own:entries.find(r=>r.own)||null,total:entries.length,worldId:worldId||null,migrating:false,at:this.now()};
 }
 ensureRankings(){const migration='multi-general-ranking-20261029-v1';if(this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',migration).toArray().length)return;this.atomic(()=>{this.sql.exec('DELETE FROM sengoku_power_scores WHERE worldId>?',G.WORLD_COUNT);for(let id=1;id<=3;id++){const w=this.read(id);for(const p of w.players){if(!Array.isArray(p.s.deployedGenerals)){p.s.deployedGenerals=G.deployed(p.s).map(g=>g.id);p.revision++;}this.rank(w,p);}this.save(w);}this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',migration,this.now());});}
 member(owner){return this.sql.exec('SELECT worldId,playerId FROM sengoku_world_members WHERE owner=?',owner).toArray()[0];}
 row(id){return this.sql.exec('SELECT state FROM sengoku_worlds WHERE id=?',id).toArray()[0];}
 upgradeFourQuizzes(w){
  w.garrisonVersion=0;
  if(w.rulesVersion!==2)this.upgradeWorld(w);
  for(const region of w.regions){delete region.battle;region.garrison=region.owner?0:(R.region(region.id)?R:Legacy).enemy({unifications:0},region.id).army;}
  for(const p of w.players){
   const s=p.s,q=s.pending;s.version=3;s.correctByMode={general:s.totalCorrect||0,soldiers:0,level:0,battle:0};s.attackCooldownUntil=0;
   if(q){s.lastResult={id:q.id,outcome:'updated',mode:q.mode==='battle'?'battle':'soldiers',target:q.target,correct:q.answers.filter(a=>a.correct).length,added:q.answers.reduce((n,a)=>n+(a.added||0),0),garrisonAdded:q.answers.reduce((n,a)=>n+(a.garrisonAdded||0),0),review:q.answers,at:this.now()};s.pending=null;}
   p.incoming=null;p.revision++;this.rank(w,p);
  }
  w.rulesVersion=3;
 }
 initializeGarrisons(w){
  for(const r of w.regions)if(r.owner){const p=w.players.find(p=>p.id===r.owner);r.garrison=p?.s.soldiers||0;r.initialGarrisonRemaining=0;r.revision++;}
  for(const p of w.players){const q=p.s.pending;if(q?.mode==='battle')q.defenderSoldiers=w.regions.find(r=>r.id===q.target)?.garrison||0;p.revision++;}w.garrisonVersion=1;
 }
 reinforce(w,p,amount,target){const r=w.regions.find(r=>r.id===target&&r.owner===p.id);if(!r||amount<=0)return 0;return this.expansion.reinforce(r,amount+(p.s.recruitMicros?0:(r.castleEffects?.barracks||0)*5));}
 upgradeMap(w){
  if(['kyukoku-v1','world-18c-v1','world-modern-v1'].includes(w.mapVersion))return false;
  const old=w.regions,lookup=id=>old.find(r=>r.id===id),convert=id=>R.region(id)?id:R.legacyRegion(id);
  // Keep the complete original geography and interrupted battles for recovery.
  w.legacyPrefectureMap=structuredClone({regions:old,players:w.players.map(p=>({id:p.id,home:p.home,ownedRegions:[...p.s.ownedRegions],pending:p.s.pending})),migratedAt:this.now()});
  w.regions=R.regions.map(meta=>{const primary=lookup(meta.legacyPrefecture),prior=(primary?.owner?primary:null)||meta.legacyPrefectures.map(lookup).find(r=>r?.owner)||meta.legacyPrefectures.map(lookup).find(Boolean),owner=prior?.owner||null;return{id:meta.id,owner,revision:(prior?.revision||0)+1,protectedUntil:prior?.protectedUntil||0,garrison:owner?0:R.enemy({unifications:0},meta.id).army};});
  // Split each old garrison among its successor lands, without duplicating troops.
  for(const r of old.filter(r=>r.owner)){const targets=w.regions.filter(n=>n.owner===r.owner&&R.region(n.id).legacyPrefectures.includes(r.id)),p=w.players.find(p=>p.id===r.owner),total=Math.max(0,r.garrison||0);if(!targets.length){if(p)p.migrationGuardReserve=(p.migrationGuardReserve||0)+total;continue;}for(let i=0;i<targets.length;i++)targets[i].garrison=Math.min(G.MAX_SOLDIERS,targets[i].garrison+Math.floor(total/targets.length)+(i<total%targets.length?1:0));}
  for(const p of w.players){const state=p.s,q=state.pending,history=[...(state.heldRegions||[]),...state.ownedRegions,...state.defeatedRegions];if(state.homeEstablished!==false&&state.bestTerritories>0)history.push(p.home);p.home=convert(p.home);state.capital=convert(state.capital)||p.home;state.heldRegions=[...new Set(history.map(convert).filter(Boolean))];state.defeatedRegions=[...new Set(state.defeatedRegions.map(convert).filter(Boolean))];
   if(q?.mode==='battle'){state.lastResult={id:q.id,outcome:'updated',mode:q.mode,target:convert(q.target),correct:q.answers.filter(a=>a.correct).length,review:q.answers,at:this.now()};state.pending=null;}else if(q){q.role=q.mode==='soldiers'?'attack':null;q.reinforceRegion=null;}
   if(state.lastResult?.target)state.lastResult.target=convert(state.lastResult.target);if(p.lastDefense?.region)p.lastDefense.region=convert(p.lastDefense.region);p.incoming=null;state.version=4;this.sync(w,p);state.heldRegions=[...new Set([...state.heldRegions,...state.ownedRegions])];p.revision++;this.rank(w,p);
  }
  if(w.winner){w.lastWinner=w.winner;w.winner=null;w.status='open';}w.mapVersion='kyukoku-v1';w.armyVersion=2;this.event(w,'旧国70地域の地図に移行しました。攻撃兵・武将・学習記録は引き継がれています。');return true;
 }
 read(id){const row=this.row(id);if(!row)return null;const w=JSON.parse(row.state);let changed=false;if(w.rulesVersion!==3){this.upgradeFourQuizzes(w);changed=true;}if(w.garrisonVersion!==1){this.initializeGarrisons(w);changed=true;}if(this.upgradeMap(w))changed=true;if(this.alliances.init(w))changed=true;if(this.expansion.init(w))changed=true;if(changed)this.save(w);return w;}
 ensureLegacyWorlds(){this.atomic(()=>{
  const migration='three-worlds-defense-zero-20261025',done=this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',migration).toArray()[0];
  if(done){for(let id=1;id<=3;id++)if(!this.row(id))this.create(id);return;}
  const rows=this.sql.exec('SELECT id,state FROM sengoku_worlds ORDER BY id').toArray();for(const row of rows)this.sql.exec('INSERT OR IGNORE INTO sengoku_world_archives(migration,worldId,state) VALUES(?,?,?)',migration,row.id,row.state);
  for(let id=1;id<=3;id++)if(!this.row(id))this.create(id);
  const worlds=this.sql.exec('SELECT id FROM sengoku_worlds ORDER BY id').toArray().map(row=>this.read(row.id));
  for(const w of worlds)for(const p of w.players){if(p.s.pending?.mode==='battle')this.cancel(w,p,'updated');p.incoming=null;}
  for(const source of worlds.filter(w=>w.id>3)){
   const target=worlds.find(w=>w.id===(source.id-1)%3+1),moved=[];
   for(const p of source.players.filter(p=>!p.retired)){
    const member=this.member(p.owner);if(member?.worldId!==source.id||member.playerId!==p.id)continue;
    const duplicate=target.players.find(q=>q.owner===p.owner);if(duplicate&&!duplicate.retired)fail('world-migration-conflict',503);if(duplicate)target.players=target.players.filter(q=>q.id!==duplicate.id);
    const previous=[...p.s.ownedRegions],overlaps=[];p.s.heldRegions=[...new Set([...(p.s.heldRegions||[]),...previous])];
    for(const region of source.regions.filter(r=>r.owner===p.id)){const destination=target.regions.find(r=>r.id===region.id);if(!destination.owner){destination.owner=p.id;destination.protectedUntil=region.protectedUntil;destination.revision++;}else overlaps.push(region.id);}
    p.worldTransfer={from:source.id,to:target.id,overlaps,at:this.now()};target.players.push(p);moved.push(p);this.sql.exec('UPDATE sengoku_world_members SET worldId=? WHERE owner=? AND playerId=?',target.id,p.owner,p.id);
   }
   const ids=new Set(moved.map(p=>p.id));for(const group of source.alliances.filter(a=>moved.some(p=>p.allianceId===a.id))){if(target.alliances.some(a=>a.name.toLocaleLowerCase('ja-JP')===group.name.toLocaleLowerCase('ja-JP'))){const base=group.name;let n=0;do{const suffix='・旧'+source.id+(n?'・'+n:'');group.name=[...base].slice(0,16-[...suffix].length).join('')+suffix;n++;}while(target.alliances.some(a=>a.name.toLocaleLowerCase('ja-JP')===group.name.toLocaleLowerCase('ja-JP')));}target.alliances.push(group);}
   target.allianceInvites.push(...source.allianceInvites.filter(i=>ids.has(i.fromId)&&ids.has(i.targetId)));target.allianceApplications??=[];target.allianceApplications.push(...(source.allianceApplications||[]).filter(i=>ids.has(i.playerId)&&target.alliances.some(a=>a.id===i.allianceId)));
   this.event(target,'ワールド'+source.id+'の軍勢がワールド'+target.id+'に合流しました。');
  }
  this.sql.exec('DELETE FROM sengoku_alliance_members');this.sql.exec('DELETE FROM sengoku_alliance_groups');
  for(const w of worlds.filter(w=>w.id<=3)){
   const live=new Set(w.players.filter(p=>!p.retired).map(p=>p.id));for(const region of w.regions){if(region.owner&&!live.has(region.owner)){region.owner=null;region.protectedUntil=0;}region.garrison=region.owner?0:neutralGarrison(region.id);region.initialGarrisonRemaining=0;region.revision++;delete region.battle;}
   for(const p of w.players){p.defenseResetAt=this.now();p.migrationGuardReserve=0;p.revision++;p.s.version=5;this.sync(w,p);if(['defense','castle'].includes(p.s.pending?.role)&&!p.s.ownedRegions.includes(p.s.pending.reinforceRegion))this.cancel(w,p,'territory-lost');this.rank(w,p);}
   w.defenseResetVersion=migration;w.defenseResetAt=this.now();this.alliances.init(w);this.alliances.sync(w);this.event(w,'更新により全領地の守備兵を一度だけ0人にしました。攻撃兵・武将・学習記録は保持しています。');this.save(w);
  }
  if(this.sql.exec('SELECT worldId FROM sengoku_world_members WHERE worldId>?',3).toArray().length)fail('world-migration-conflict',503);
  this.sql.exec('DELETE FROM sengoku_worlds WHERE id>?',3);this.sql.exec('DELETE FROM sengoku_world_rule_versions WHERE worldId>?',3);this.sql.exec('DELETE FROM sengoku_force_scores WHERE worldId>?',3);this.sql.exec('DELETE FROM sengoku_world_force_scores WHERE worldId>?',3);
  this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',migration,this.now());
 });}

 penalty(owner){return this.sql.exec('SELECT until,reason FROM sengoku_attack_penalties WHERE owner=?',owner).toArray()[0]||{until:0,reason:''};}
 attackWait(p,reason='attack'){const prior=this.penalty(p.owner),next=this.now()+G.ATTACK_COOLDOWN,until=Math.max(prior.until,next),savedReason=prior.until>next?prior.reason:reason;this.sql.exec('INSERT INTO sengoku_attack_penalties(owner,until,reason) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET until=excluded.until,reason=excluded.reason',p.owner,until,savedReason);p.s.battleCooldownUntil=until;if(reason==='wrong')p.s.failedAttackCooldownUntil=until;}
 ensureWorlds(){this.ensureLegacyWorlds();this.atomic(()=>{
  const migration='quarter-force-neutral-half-20261025';if(this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',migration).toArray().length)return;
  for(let id=1;id<=3;id++){
   const row=this.row(id);this.sql.exec('INSERT OR IGNORE INTO sengoku_world_archives(migration,worldId,state) VALUES(?,?,?)',migration,id,row.state);const w=this.read(id);
   for(const p of w.players){if(p.s.pending?.mode==='battle')this.cancel(w,p,'updated');p.incoming=null;}
   const owners=[...new Set(w.regions.map(r=>r.owner).filter(Boolean))];
   for(const owner of owners){const p=w.players.find(p=>p.id===owner),lands=w.regions.filter(r=>r.owner===owner).sort((a,b)=>Number(a.id===p?.home)-Number(b.id===p?.home)||a.id.localeCompare(b.id)),released=lands.slice(0,Math.ceil(lands.length/2));
    if(p){p.s.heldRegions=[...new Set([...(p.s.heldRegions||[]),...lands.map(r=>r.id)])];p.territoryReset={at:this.now(),regions:released.map(r=>r.id)};}
    for(const r of released){r.owner=null;r.garrison=neutralGarrison(r.id);r.initialGarrisonRemaining=0;r.protectedUntil=0;r.revision++;delete r.battle;}
   }
   for(const p of w.players){this.sync(w,p);p.s.version=6;p.s.battleCooldownUntil||=0;p.s.failedAttackCooldownUntil||=0;p.s.attackCooldownUntil=Math.min(p.s.attackCooldownUntil||0,this.now()+G.CAPTURE_COOLDOWN);if(['defense','castle'].includes(p.s.pending?.role)&&!p.s.ownedRegions.includes(p.s.pending.reinforceRegion))this.cancel(w,p,'territory-lost');if(!p.s.ownedRegions.includes(p.s.capital))p.s.capital=p.s.ownedRegions[0]||p.home;p.revision++;this.rank(w,p);}
   if(w.winner){w.lastWinner=w.winner;w.winner=null;w.status='open';}
   w.territoryResetVersion=migration;this.event(w,'領地調整により、各勢力の領地の半分（切り上げ）を一度だけ中立へ戻しました。兵士・武将・学習記録は保持しています。');this.alliances.sync(w);this.save(w);
  }
  this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',migration,this.now());
 });}
 ensureGlobalWorlds(){this.atomic(()=>{
  const migration='global-map-neutral-20261028';if(this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',migration).toArray().length)return;
  for(let id=1;id<=3;id++){
   const row=this.row(id);this.sql.exec('INSERT OR IGNORE INTO sengoku_world_archives(migration,worldId,state) VALUES(?,?,?)',migration,id,row.state);const w=this.read(id),known=new Set(w.regions.map(r=>r.id));
   for(const meta of R.overseasRegions)if(!known.has(meta.id))w.regions.push({id:meta.id,owner:null,revision:0,protectedUntil:0,garrison:neutralGarrison(meta.id)});
   w.mapVersion='world-18c-v1';if(w.winner&&w.regions.some(r=>r.owner!==w.winner.id)){w.lastWinner=w.winner;w.winner=null;w.status='open';}
   for(const p of w.players)this.rank(w,p);this.alliances.sync(w);this.event(w,'世界マップへ拡張しました。日本の旧国と記録は引き継ぎ、海外40地域は中立から始まります。');this.save(w);
  }
  this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',migration,this.now());
 });}

 ensureOverseasGarrisons(){
  if(this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',overseasGarrisonVersion).toArray().length)return;
  this.atomic(()=>{
   for(let id=1;id<=3;id++){
    const w=this.read(id);this.sql.exec('INSERT OR IGNORE INTO sengoku_world_archives(migration,worldId,state) VALUES(?,?,?)',overseasGarrisonVersion,id,JSON.stringify(w));
    for(const region of w.regions){
     if(region.owner||!R.region(region.id)?.overseas||region.garrison===neutralGarrison(region.id))continue;
     region.garrison=neutralGarrison(region.id);region.revision++;
     const attacker=region.battle&&w.players.find(p=>p.s.pending?.id===region.battle.id&&p.s.pending.mode==='battle'&&p.s.pending.target===region.id&&!p.s.pending.defenderId);
     if(attacker){attacker.s.pending.defenderSoldiers=region.garrison;attacker.revision++;}
    }
    w.overseasGarrisonVersion=overseasGarrisonVersion;this.save(w);
   }
   this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',overseasGarrisonVersion,this.now());
  });
 }
 ensureModernWorlds(){
  const migration='modern-borders-20261029-v1';if(this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',migration).toArray().length)return;
  this.atomic(()=>{
   for(let id=1;id<=3;id++){
    const w=this.read(id);this.sql.exec('INSERT OR IGNORE INTO sengoku_world_archives(migration,worldId,state) VALUES(?,?,?)',migration,id,JSON.stringify(w));
    const known=new Set(w.regions.map(r=>r.id));for(const meta of R.regions)if(!known.has(meta.id))w.regions.push({id:meta.id,owner:null,revision:0,protectedUntil:0,garrison:neutralGarrison(meta.id)});
    for(const r of w.regions)if((w.protectionMs||3600000)<G.PROTECTION&&r.protectedUntil>this.now()){r.protectedUntil+=G.PROTECTION-(w.protectionMs||3600000);r.revision++;}
    w.protectionMs=G.PROTECTION;w.mapVersion=R.mapVersion;w.modernMapVersion=migration;w.modernAssignments=R.modernData.legacyAssignments;
    for(const p of w.players){this.sync(w,p);this.rank(w,p);}
    if(w.winner&&w.regions.some(r=>r.owner!==w.winner.id)){w.lastWinner=w.winner;w.winner=null;w.status='open';}
    this.event(w,'海外を現在の国・地域に更新。既存の海外領地は近い国へ、領地数と守備兵を引き継ぎました。占領後の保護は2時間です。');this.alliances.sync(w);this.save(w);
   }
   this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',migration,this.now());
  });
 }
 ensureAntarctica(){
  if(this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',antarcticaVersion).toArray().length)return;
  this.atomic(()=>{
   for(let id=1;id<=3;id++){
    const w=this.read(id);this.sql.exec('INSERT OR IGNORE INTO sengoku_world_archives(migration,worldId,state) VALUES(?,?,?)',antarcticaVersion,id,JSON.stringify(w));
    for(const r of w.regions.filter(r=>!r.owner&&R.region(r.id)?.continent==='antarctica'&&r.garrison!==ANTARCTICA_GARRISON)){
     r.garrison=ANTARCTICA_GARRISON;r.revision++;
     const attacker=r.battle&&w.players.find(p=>p.s.pending?.id===r.battle.id&&p.s.pending.mode==='battle'&&p.s.pending.target===r.id&&!p.s.pending.defenderId);
     if(attacker){attacker.s.pending.defenderSoldiers=r.garrison;attacker.revision++;}
    }
    for(const p of w.players)this.awardTitles(w,p);
    w.antarcticaVersion=antarcticaVersion;this.save(w);
   }
   this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',antarcticaVersion,this.now());
  });
 }
 ensureFiveWorlds(){this.atomic(()=>{for(let id=4;id<=G.WORLD_COUNT;id++)if(!this.row(id))this.create(id);if(!this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?','five-worlds-name-first-20261030-v1').toArray().length)this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)','five-worlds-name-first-20261030-v1',this.now());});}
 ensureGarrisonRanking(){
  const migration='initial-garrison-ranking-20261031-v1';if(this.sql.exec('SELECT at FROM sengoku_world_migrations WHERE id=?',migration).toArray().length)return;
  this.atomic(()=>{
   for(let id=1;id<=G.WORLD_COUNT;id++){
    const w=this.read(id);this.sql.exec('INSERT OR IGNORE INTO sengoku_world_archives(migration,worldId,state) VALUES(?,?,?)',migration,id,JSON.stringify(w));
    // Older saves did not separate the initial allotment. Keep actual troops intact.
    for(const r of w.regions)if(!Number.isSafeInteger(r.initialGarrisonRemaining))r.initialGarrisonRemaining=r.owner?Math.min(G.INITIAL_GARRISON,Math.max(0,r.garrison||0)):0;
    for(const p of w.players)this.rank(w,p);this.save(w);
   }
   this.sql.exec('INSERT INTO sengoku_world_migrations(id,at) VALUES(?,?)',migration,this.now());
  });
 }
 ensureManualCooldown(){
  if(this.sql.exec('SELECT id FROM sengoku_manual_cooldowns WHERE id=?',manualCooldownId).toArray().length)return;
  this.atomic(()=>{
   const matches=this.sql.exec('SELECT owner FROM player_accounts WHERE username=? UNION SELECT owner FROM sengoku_guest_profiles WHERE nameKey=?','appy0127','appy0127').toArray(),appliedAt=this.now();
   if(matches.length!==1){this.sql.exec('INSERT INTO sengoku_manual_cooldowns(id,owner,status,appliedAt,until) VALUES(?,NULL,?,?,NULL)',manualCooldownId,matches.length?'ambiguous':'not-found',appliedAt);return;}
   const owner=matches[0].owner,date=new Date(appliedAt);date.setUTCFullYear(date.getUTCFullYear()+4);const until=date.getTime();
   this.sql.exec('INSERT INTO sengoku_attack_penalties(owner,until,reason) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET until=excluded.until,reason=excluded.reason',owner,until,'manual');
   for(let id=1;id<=G.WORLD_COUNT;id++){
    const w=this.read(id),players=w.players.filter(p=>p.owner===owner);if(!players.length)continue;
    for(const p of players){if(p.s.pending?.mode==='battle')this.cancel(w,p,'restricted');p.s.battleCooldownUntil=until;p.revision++;}this.save(w);
   }
   this.sql.exec('INSERT INTO sengoku_manual_cooldowns(id,owner,status,appliedAt,until) VALUES(?,?,?,?,?)',manualCooldownId,owner,'applied',appliedAt,until);
  });
 }
 manualCooldownStatus(){const row=this.sql.exec('SELECT status,appliedAt,until FROM sengoku_manual_cooldowns WHERE id=?',manualCooldownId).toArray()[0];return{version:'account-cooldown-20261031-v1',status:row?.status||'pending',appliedAt:row?.appliedAt||null,until:row?.until||null,years:4};}
 profile(owner){return this.accounts.row(owner)||this.sql.exec('SELECT owner,name FROM sengoku_guest_profiles WHERE owner=?',owner).toArray()[0];}
 registerGuest(owner,data){
  const name=typeof data.name==='string'?data.name.normalize('NFKC').trim():'',key=name.toLocaleLowerCase('ja-JP');
  if(!name||[...name].length>24||!/^[-_\p{L}\p{N} ]+$/u.test(name))fail('world-name');
  if(W.blockedName(name,this.admin.words()))fail('nickname-blocked');
  const current=this.profile(owner);if(current){if(current.name!==name)fail('world-name-fixed',409);return;}
  if(this.accounts.byName(key)||this.sql.exec('SELECT owner FROM sengoku_guest_profiles WHERE nameKey=?',key).toArray().length)fail('world-name-used',409);
  this.sql.exec('INSERT INTO sengoku_guest_profiles(owner,name,nameKey,createdAt) VALUES(?,?,?,?)',owner,name,key,this.now());
 }
 honors(owner){return this.sql.exec('SELECT titleId,earnedAt,worldId FROM sengoku_titles WHERE owner=?',owner).toArray().filter(t=>S.title(t.titleId)).map(t=>({...t,name:S.title(t.titleId).name}));}
 equippedTitle(owner){const choice=this.sql.exec('SELECT titleId FROM sengoku_title_choices WHERE owner=?',owner).toArray()[0];if(!choice)return null;const t=this.honors(owner).find(t=>t.titleId===choice.titleId);return t?{id:t.titleId,name:t.name}:null;}
 awardTitles(w,p){for(const id of S.earned(p.s))this.sql.exec('INSERT OR IGNORE INTO sengoku_titles(owner,titleId,earnedAt,worldId) VALUES(?,?,?,?)',p.owner,id,this.now(),w.id);}
 renameAccount(account,name){
  for(const row of this.sql.exec('SELECT id,state FROM sengoku_worlds ORDER BY id').toArray()){
   const w=JSON.parse(row.state);let changed=false;
   for(const p of w.players.filter(p=>p.owner===account.owner)){p.name=name;p.revision++;changed=true;if(w.winner?.id===p.id)w.winner.name=name;}
   if(changed){w.revision++;w.updatedAt=this.now();this.sql.exec('UPDATE sengoku_worlds SET state=?,revision=?,updatedAt=? WHERE id=?',JSON.stringify(w),w.revision,w.updatedAt,w.id);}
  }
  for(const table of ['sengoku_force_scores','sengoku_world_force_scores','sengoku_power_scores','sengoku_scores'])this.sql.exec('UPDATE '+table+' SET name=? WHERE owner=?',name,account.owner);
 }

 settleSpawn(w,p,region,recovery=false){
  if(!(recovery?globalThis.HKSengokuTactics.canRecover(region,this.now()):G.canSpawn(region,this.now())))fail('world-spawn-unavailable',409);
  const defender=w.players.find(d=>d.id===region.owner&&d.id!==p.id);
  region.owner=p.id;region.castleWork=0;region.garrison=G.INITIAL_GARRISON;region.initialGarrisonRemaining=G.INITIAL_GARRISON;region.garrisonFraction=0;region.revision++;region.protectedUntil=this.now()+G.PROTECTION;
  p.s.heldRegions=[...new Set([...(p.s.heldRegions||[]),region.id])];p.s.capital=region.id;if(region.id===p.home)p.s.homeEstablished=true;this.sync(w,p);
  if(defender){if(['defense','castle'].includes(defender.s.pending?.role)&&defender.s.pending.reinforceRegion===region.id)this.cancel(w,defender,'territory-lost');this.sync(w,defender);if(defender.s.capital===region.id)defender.s.capital=defender.s.ownedRegions[0]||defender.home;defender.lastDefense={attacker:p.name,region:region.id,won:false,damage:0,remaining:0,captured:true,eliminated:!defender.s.ownedRegions.length,at:this.now()};defender.revision++;this.rank(w,defender);}
  if(w.winner&&w.winner.id!==p.id){w.lastWinner=w.winner;w.winner=null;w.status='open';}
 }
 switchWorld(owner,data){
  if(!Number.isSafeInteger(data.worldId)||data.worldId<1||data.worldId>G.WORLD_COUNT||!R.region(data.region))fail('world-input');
  const member=this.member(owner);if(!member)fail('world-not-joined',409);if(data.activeWorldId!==member.worldId)fail('world-active-changed',409);const source=this.read(member.worldId);this.tick(source);const p=source.players.find(p=>p.id===member.playerId);
  if(data.revision!==p.revision)fail('world-conflict',409);if(p.s.pending)fail('world-pending',409);if(p.incoming)fail('world-incoming',409);if(source.id===data.worldId)return;
  const target=this.read(data.worldId);this.tick(target);const next=target.players.find(p=>p.owner===owner&&!p.retired);p.revision++;this.save(source);
  if(next){next.name=this.profile(owner).name;next.revision++;this.sql.exec('UPDATE sengoku_world_members SET worldId=?,playerId=? WHERE owner=?',target.id,next.id,owner);this.rank(target,next);this.save(target);}
  else{this.sql.exec('DELETE FROM sengoku_world_members WHERE owner=?',owner);this.join(owner,{...data,revision:0});}
 }

 summary(w){const available=w.regions.filter(r=>G.canSpawn(r,this.now())).map(r=>r.id);return{id:w.id,players:w.players.length,capacity:G.LIMIT,status:w.status,joinable:this.recruitable(w)&&available.length>0,startingRegions:available,available,winner:w.winner,createdAt:w.createdAt};}
 save(w){this.sql.exec('INSERT OR REPLACE INTO sengoku_world_rule_versions(worldId,version) VALUES(?,4)',w.id);w.revision++;w.updatedAt=this.now();this.sql.exec('INSERT INTO sengoku_worlds(id,state,revision,updatedAt,summary,recruiting) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,revision=excluded.revision,updatedAt=excluded.updatedAt,summary=excluded.summary,recruiting=excluded.recruiting',w.id,JSON.stringify(w),w.revision,w.updatedAt,JSON.stringify(this.summary(w)),Number(this.recruitable(w)));}
 latest(){const row=this.sql.exec('SELECT state FROM sengoku_worlds ORDER BY id DESC LIMIT 1').toArray()[0];return row?JSON.parse(row.state):null;}
 create(id){if(!Number.isSafeInteger(id)||id<1||id>G.WORLD_COUNT||this.row(id))fail('world-input');const w={id,protectionMs:G.PROTECTION,mapVersion:R.mapVersion,armyVersion:2,rulesVersion:3,garrisonVersion:1,revision:0,createdAt:this.now(),updatedAt:this.now(),status:'open',players:[],regions:R.regions.map(r=>({id:r.id,owner:null,revision:0,protectedUntil:0,garrison:neutralGarrison(r.id),initialGarrisonRemaining:0})),events:[],winner:null,alliances:[],allianceInvites:[]};this.save(w);return w;}
 recruitable(w){return w.id<=G.WORLD_COUNT;}
 event(w,text,kind='event'){const entry={id:crypto.randomUUID(),text,at:this.now()};w.events.unshift(entry);w.events=w.events.slice(0,30);this.expansion?.event(w,entry,kind);}
 sync(w,p){p.s.ownedRegions=w.regions.filter(r=>r.owner===p.id).map(r=>r.id);p.s.bestTerritories=Math.max(p.s.bestTerritories,p.s.ownedRegions.length);this.awardTitles(w,p);}
 rewards(owner){return this.sql.exec('SELECT reward FROM sengoku_world_rewards WHERE owner=?',owner).toArray().map(r=>r.reward);}
 pending(q){if(!q)return null;return{id:q.id,mode:q.mode,role:q.role||null,castleEffect:q.castleEffect||null,reinforceRegion:q.reinforceRegion||null,target:q.target,index:q.index,phase:q.phase,correct:q.answers.filter(a=>a.correct).length,deadline:q.deadline,allianceEffects:q.allianceEffects||null,allianceBonus:q.allianceBonus||0,soldiers:q.attackSnapshot.soldiers,force:q.attackSnapshot.force,damage:q.damage??G.damage(q.attackSnapshot),tactics:q.tactics||null,defenderName:q.defenderName,enemySoldiers:q.defenderSoldiers,question:q.phase==='question'?this.campaign.question(q):null,feedback:q.phase==='review'?q.answers.at(-1):null};}
 publicWorld(w){
  const visibleName=p=>this.isBanned(p.owner)||W.blockedName(p.name,this.admin.words())?'参加者':p.name;
  return{id:w.id,mapVersion:w.mapVersion,territoryCount:R.regions.length,armyModel:'split-attack-defense-v2',revision:w.revision,createdAt:w.createdAt,updatedAt:w.updatedAt,status:w.status,capacity:G.LIMIT,joinable:this.recruitable(w),winner:w.winner,regions:w.regions.map(r=>({...r})),alliances:this.alliances.publicGroups(w),players:w.players.map(p=>({id:p.id,allianceId:p.allianceId||null,canJoinAlliance:this.alliances.eligible(p),inBattle:!!p.incoming||p.s.pending?.mode==='battle',name:visibleName(p),title:this.equippedTitle(p.owner),home:p.home,territories:p.s.ownedRegions.length,best:p.s.bestTerritories,force:G.attack(p.s),soldiers:p.s.soldiers,generals:p.s.generals.length,wins:p.s.battlesWon,retired:!!p.retired,level:G.active(p.s)?.level||0,generalId:G.active(p.s)?.id||null,deployedGenerals:G.deployed(p.s).map(g=>({id:g.id,level:g.level})),incoming:p.incoming?{region:p.incoming.region,deadline:p.incoming.deadline}:null})),events:w.events};
 }
 view(owner,requested){
  const member=this.member(owner),id=requested||member?.worldId,w=id?this.read(id):null,p=w&&member?.worldId===w.id?w.players.find(p=>p.id===member.playerId):null;
  const account=this.profile(owner);let own=null;
  if(p){const penalty=this.penalty(owner),s={...p.s,battleCooldownUntil:Math.max(p.s.battleCooldownUntil||0,penalty.until),failedAttackCooldownUntil:Math.max(p.s.failedAttackCooldownUntil||0,penalty.reason==='wrong'?penalty.until:0),manualAttackCooldownUntil:penalty.reason==='manual'?penalty.until:0,pending:this.pending(p.s.pending)};own={...this.alliances.own(w,p),id:p.id,name:p.name,title:this.equippedTitle(owner),titles:this.honors(owner),home:p.home,revision:p.revision,defenseResetAt:p.defenseResetAt||null,worldTransfer:p.worldTransfer||null,territoryReset:p.territoryReset||null,state:s,force:G.attack(p.s),generalCredits:G.available(p.s),buffs:G.buffs(p.s),incoming:p.incoming?{...p.incoming}:null,lastDefense:p.lastDefense||null};}
  return{protocol:'sengoku-world-v6',account:{signedIn:!!this.accounts.row(owner),name:account?.name||null,guest:!!account&&!this.accounts.row(owner)},world:w?this.publicWorld(w):null,own,activeWorldId:member?.worldId||null,rewards:this.rewards(owner),strategy:w?this.expansion.view(w,p,owner):null,permissions:{admin:this.admin.isAdmin(owner)},at:this.now()};
 }
 list(owner){
  const member=this.member(owner),ids=Array.from({length:G.WORLD_COUNT},(_,i)=>i+1);
  return{protocol:'sengoku-world-v6',allianceBuffsVersion:'alliance-buffs-20261101-v1',socialVersion:'social-20261101-v1',castleSystem:{version:'castle-quiz-20261101-v1',buildCorrect:10,effectCorrect:10,maxEffectLevel:5},capacity:null,worldCount:G.WORLD_COUNT,mapVersion:R.mapVersion,clientRules:7,modernMapVersion:'modern-borders-20261029-v1',titlesVersion:'unification-antarctica-v2',titleCatalog:S.titles.map(t=>({id:t.id,name:t.name,regions:t.regions.length})),antarcticaInitialGarrison:ANTARCTICA_GARRISON,antarcticaVersion,defenseSoldiersPerCorrect:G.DEFENSE_PER_CORRECT,attackSoldiersPerCorrect:G.SOLDIERS_PER_CORRECT,territoryCount:R.regions.length,japanTerritoryCount:R.japanRegions.length,overseasTerritoryCount:R.overseasRegions.length,overseasInitialState:'neutral-5000',overseasInitialGarrison:OVERSEAS_NEUTRAL_GARRISON,overseasGarrisonVersion,mapExpansionVersion:'global-map-neutral-20261028',armyModel:'split-attack-defense-v2',garrisonReinforcement:'selected-land-quiz',initialOwnedGarrison:G.INITIAL_GARRISON,initialGarrisonCountsForRanking:false,rankingVersion:S.version,manualAttackCooldown:this.manualCooldownStatus(),strategyVersion:globalThis.HKSengokuTactics.version,personalRecruitment:this.expansion.personalStatus(),alliances:{protocol:'sengoku-alliance-v1',maxMembers:5,bonusPerAlly:2,maxSoldierBonus:8},startingProvince:'zero-garrison-unprotected',respawnProvince:'zero-garrison-unprotected',startingRegionScope:'worldwide',respawnRegionScope:'worldwide',worldCreation:'fixed-five',worldsVersion:'five-worlds-name-first-20261030-v1',guestEntry:'name-first-v1',defenseResetVersion:'three-worlds-defense-zero-20261025',allianceFeatures:'command-center-v2',combat:'five-correct-tenth-force',damageDivisor:10,wrongAnswerCooldownMs:G.WRONG_COOLDOWN,territoryResetVersion:'quarter-force-neutral-half-20261025',worldSwitch:'preserve-world-progress',captureCooldownMs:G.CAPTURE_COOLDOWN,attackCooldownMs:G.ATTACK_COOLDOWN,protectionMs:G.PROTECTION,startingProtectionMs:G.PROTECTION,respawnProtectionMs:G.PROTECTION,reclaimCooldownMs:G.ATTACK_COOLDOWN,reclaimProtectionMs:G.PROTECTION,reclaimIgnoresProtection:false,quizModes:Object.keys(G.modes),quiz:{eras:[...new Set(historyQuestions.map(q=>q.era))],questions:historyQuestions.length},activeWorldId:member?.worldId||null,account:{signedIn:!!this.accounts.row(owner),name:this.profile(owner)?.name||null},worlds:ids.map(id=>{const w=this.read(id),p=w.players.find(p=>p.owner===owner&&!p.retired);return{...this.summary(w),own:p?{name:p.name,home:p.home,territories:p.s.ownedRegions.length,soldiers:p.s.soldiers,generals:p.s.generals.length,pending:!!p.s.pending,incoming:!!p.incoming}:null};})};
 }
 tick(w){
  let changed=this.alliances.expire(w)||false;changed=this.expansion.expire(w)||changed;
  for(const p of w.players){const q=p.s.pending;if(q&&q.deadline<=this.now()){this.cancel(w,p,'timeout');p.revision++;changed=true;}}
  if(changed)this.save(w);
 }
 cancel(w,p,outcome='retreat'){
  const q=p.s.pending;if(!q)return;if(q.mode==='battle'&&['retreat','timeout'].includes(outcome))this.attackWait(p);
  p.s.lastResult={id:q.id,outcome,mode:q.mode,role:q.role||null,castleEffect:q.castleEffect||null,reinforceRegion:q.reinforceRegion||null,target:q.target,correct:q.answers.filter(a=>a.correct).length,added:q.answers.reduce((n,a)=>n+(a.added||0),0),garrisonAdded:q.answers.reduce((n,a)=>n+(a.garrisonAdded||0),0),review:q.answers,at:this.now()};
  const region=w.regions.find(r=>r.id===q.target);if(region?.battle?.id===q.id)delete region.battle;
  const defender=w.players.find(d=>d.id===q.defenderId);if(defender?.incoming?.id===q.id){defender.incoming=null;defender.revision++;}
  p.s.pending=null;
 }

 finish(w,p,incorrect=false){
  const q=p.s.pending,state=p.s,correct=q.answers.filter(a=>a.correct).length,combat=q.mode==='battle';let captured=false,homeReclaimed=false,damage=0,remaining=0,beforeSoldiers=0;
  if(combat){
   const region=w.regions.find(r=>r.id===q.target);if(region.owner!==q.defenderId||region.battle?.id!==q.id)fail('world-changed',409);
   if(this.alliances.friendly(w,p,region.owner))fail('alliance-friendly',409);this.attackWait(p,incorrect?'wrong':'attack');const defender=w.players.find(d=>d.id===q.defenderId);beforeSoldiers=globalThis.HKSengokuTactics.guardCount(region);remaining=beforeSoldiers;
   if(!incorrect&&correct===5){const hit=this.expansion.hit(region,q.damage??G.damage(q.attackSnapshot));damage=hit.damage;remaining=hit.remaining;if(damage)region.revision++;captured=remaining===0;}
   if(captured){
    const landless=!state.ownedRegions.length;homeReclaimed=!!q.reclaim;if(!q.reclaim)state.attackCooldownUntil=this.now()+G.CAPTURE_COOLDOWN;region.owner=p.id;region.castleWork=0;region.garrison=G.INITIAL_GARRISON;region.initialGarrisonRemaining=G.INITIAL_GARRISON;region.garrisonFraction=0;region.revision++;region.protectedUntil=this.now()+G.PROTECTION;state.battlesWon++;state.defeatedRegions=[...new Set([...state.defeatedRegions,q.target])];state.heldRegions=[...new Set([...state.heldRegions,q.target])];this.sync(w,p);if(q.target===p.home)state.homeEstablished=true;if(landless)state.capital=q.target;
    this.expansion.captured(w,p,q,q.defenderId);
    if(defender){if(['defense','castle'].includes(defender.s.pending?.role)&&defender.s.pending.reinforceRegion===q.target)this.cancel(w,defender,'territory-lost');this.sync(w,defender);defender.s.battlesLost++;if(defender.s.capital===q.target)defender.s.capital=defender.s.ownedRegions[0]||defender.home;}
    if(w.winner&&w.winner.id!==p.id){w.lastWinner=w.winner;w.winner=null;w.status='open';}
    this.event(w,p.name+'が'+R.region(q.target).name+'を占領'+(defender?'（'+defender.name+'の領土）':'（守備隊）'));
    if(state.ownedRegions.length>=25&&!state.claimedRewards.includes('golden-banner'))state.claimedRewards.push('golden-banner');
   }else{state.battlesLost++;this.event(w,p.name+'が'+R.region(q.target).name+'を攻撃：'+damage+'人減・残り'+remaining+'人');}
   delete region.battle;
   if(defender){defender.incoming=null;defender.lastDefense={attacker:p.name,region:q.target,won:!captured,damage,remaining,captured,eliminated:!defender.s.ownedRegions.length,at:this.now()};defender.revision++;this.rank(w,defender);}
  }
  state.lastResult={id:q.id,mode:q.mode,role:q.role||null,castleEffect:q.castleEffect||null,reinforceRegion:q.reinforceRegion||null,outcome:combat?incorrect?'incorrect':captured?'captured':'hit':'complete',target:q.target,correct,force:q.attackSnapshot.force,damage,remaining,beforeSoldiers,homeReclaimed,added:q.answers.reduce((n,a)=>n+(a.added||0),0),garrisonAdded:q.answers.reduce((n,a)=>n+(a.garrisonAdded||0),0),experience:q.answers.reduce((n,a)=>n+(a.experience||0),0),generalProgress:q.answers.reduce((n,a)=>n+(a.generalProgress||0),0),cooldownUntil:Math.max(state.attackCooldownUntil||0,state.battleCooldownUntil||0),failedCooldownUntil:state.failedAttackCooldownUntil||0,review:q.answers,at:this.now()};state.pending=null;
  if(captured&&R.japanRegions.every(r=>state.ownedRegions.includes(r.id))&&!state.claimedRewards.includes('unification-castle')){state.claimedRewards.push('unification-castle');this.sql.exec('INSERT OR IGNORE INTO sengoku_world_rewards(owner,reward) VALUES(?,?)',p.owner,'unification-castle');}
  if(captured&&state.ownedRegions.length===R.regions.length){w.status='finished';w.winner={id:p.id,name:p.name,at:this.now()};state.unifications++;if(!state.claimedRewards.includes('unification-castle'))state.claimedRewards.push('unification-castle');this.sql.exec('INSERT OR IGNORE INTO sengoku_world_rewards(owner,reward) VALUES(?,?)',p.owner,'unification-castle');this.event(w,p.name+'が天下統一を達成！ 故郷の奪還戦は継続できます。');}
 }

 join(owner,data){
  if(this.member(owner))fail('world-already-joined',409);if(data.revision!==0||!R.region(data.region)||!(data.worldId==='auto'||Number.isSafeInteger(data.worldId)&&data.worldId>0))fail('world-input');
  const possible=w=>{if(!w||!this.recruitable(w))return false;this.tick(w);return w.players.some(p=>p.owner===owner&&!p.retired)||G.canSpawn(w.regions.find(r=>r.id===data.region),this.now());};
  let w;if(data.worldId!=='auto'){w=this.read(data.worldId);if(!possible(w))fail('world-spawn-unavailable',409);}else{const candidates=Array.from({length:G.WORLD_COUNT},(_,i)=>this.read(i+1)).filter(possible);candidates.sort((a,b)=>a.players.length-b.players.length||a.id-b.id);w=candidates[0];if(!w)fail('world-spawn-unavailable',409);}
  const resumed=w.players.find(p=>p.owner===owner&&!p.retired);if(resumed){resumed.name=this.profile(owner).name;resumed.revision++;this.sql.exec('INSERT INTO sengoku_world_members(owner,worldId,playerId) VALUES(?,?,?)',owner,w.id,resumed.id);this.rank(w,resumed);this.save(w);return;}
  const region=w.regions.find(r=>r.id===data.region),previous=w.players.find(p=>p.owner===owner&&p.retired),s=previous?.s||G.initial(data.region,this.now()),account=this.profile(owner),p=previous||{id:crypto.randomUUID(),owner,name:account.name,home:data.region,s,revision:1,incoming:null,joinedAt:this.now()};
  if(previous){p.retired=false;p.name=account.name;p.revision++;}else w.players.push(p);
  this.settleSpawn(w,p,region);this.sql.exec('INSERT INTO sengoku_world_members(owner,worldId,playerId) VALUES(?,?,?)',owner,w.id,p.id);this.event(w,p.name+'が'+R.region(data.region).name+'で旗を掲げた');this.rank(w,p);this.save(w);
 }

 apply(w,p,data){
  const s=p.s,type=data.type;if(data.revision!==p.revision)fail('world-conflict',409);
  if(s.pending&&!['answer','next','retreat','title','notification_read'].includes(type))fail('world-pending',409);
  if(p.incoming&&(['begin','commander','formation','claim','leave','respawn'].includes(type)||Object.hasOwn(allianceFields,type)))fail('world-incoming',409);
  if(this.expansion.apply(w,p,data)){p.revision++;this.rank(w,p);this.save(w);return;}
  if(Object.hasOwn(allianceFields,type)){this.alliances.apply(w,p,data);if(p.allianceId)this.expansion.honors(w,p.allianceId);p.revision++;this.save(w);return;}
  if(type==='quiz'||type==='begin'){
   this.expansion.access(p.owner,type==='quiz'?'learn':'play');p.s.recruitMicros=this.expansion.control(p.owner).recruitMicros;
   if(type==='quiz'&&(!['general','soldiers','level'].includes(data.mode)||data.mode==='level'&&!G.active(s)))fail('world-quiz-mode');
   if(type==='quiz'&&data.mode==='level'&&G.active(s).level>=G.MAX_LEVEL)fail('world-general-max');
   const role=type==='quiz'&&data.mode==='soldiers'?(data.role||'attack'):null;if(type==='quiz'&&(role&&!['attack','defense','castle'].includes(role)||data.mode!=='soldiers'&&(data.role!==undefined||data.region!==undefined)||role==='attack'&&data.region!==undefined))fail('world-quiz-mode');if(['defense','castle'].includes(role)&&!w.regions.some(r=>r.id===data.region&&r.owner===p.id))fail('world-defense-land',409);
   if(data.castleEffect!==undefined&&role!=='castle')fail('world-quiz-mode');if(role==='castle'){const r=w.regions.find(r=>r.id===data.region);if(r.battle||!['build','wall','moat','barracks'].includes(data.castleEffect)||data.castleEffect==='build'&&r.castleLevel||data.castleEffect!=='build'&&(!r.castleLevel||(r.castleEffects?.[data.castleEffect]||0)>=5))fail('sengoku-castle');if(!r.castleQuizVersion){r.castleWork=0;r.castleQuizVersion=1;}}
   let target=null,defenderId=null,defenderName='守備隊',defenderSoldiers=0;
   if(type==='begin'){
    const penalty=this.penalty(p.owner);if(Math.max(s.battleCooldownUntil||0,penalty.until)>this.now())fail(penalty.reason==='manual'?'world-manual-cooldown':penalty.reason==='wrong'?'world-wrong-cooldown':'world-attack-cooldown',409);
    if(s.attackCooldownUntil>this.now()&&!G.reclaim(s,data.target))fail('world-cooldown',409);
    if(s.soldiers<1)fail('world-soldiers');const region=w.regions.find(r=>r.id===data.target);if(region&&this.alliances.friendly(w,p,region.owner))fail('alliance-friendly',409);if(!region||!G.reachable(s,region.id,p.home,this.alliances.frontier(w,p)))fail('world-route');if(region.revision!==data.regionRevision)fail('world-changed',409);if(region.protectedUntil>this.now())fail('world-protected',409);if(region.battle)fail('world-busy',409);this.expansion.validateAttack(w,p,region);
    const defender=w.players.find(a=>a.id===region.owner);if(defender&&(defender.incoming||defender.s.pending?.mode==='battle'))fail('world-busy',409);
    target=region.id;if(defender){defenderId=defender.id;defenderName=defender.name;defenderSoldiers=globalThis.HKSengokuTactics.guardCount(region);}else defenderSoldiers=globalThis.HKSengokuTactics.guardCount(region);
   }
   const q={id:crypto.randomUUID(),mode:type==='quiz'?data.mode:'battle',role,castleEffect:role==='castle'?data.castleEffect:null,reinforceRegion:['defense','castle'].includes(role)?data.region:null,reclaim:type==='begin'&&G.reclaim(s,target),allianceEffects:this.expansion.buffs(w,this.alliances.group(w,p)).effects,allianceBonus:type==='quiz'&&data.mode==='soldiers'?this.alliances.bonus(w,p):0,target,attackSnapshot:G.snapshot(s),index:0,phase:'question',questions:this.campaign.deck(historyQuestions),answers:[],deadline:this.now()+G.BATTLE_TIME,defenderId,defenderName,defenderSoldiers};s.pending=q;
   if(target){const region=w.regions.find(r=>r.id===target);this.expansion.begin(w,p,q,region);region.battle={id:q.id,attacker:p.id,deadline:q.deadline};const defender=w.players.find(d=>d.id===defenderId);if(defender){defender.incoming={id:q.id,attacker:p.name,region:target,deadline:q.deadline};defender.revision++;}for(const r of w.regions.filter(r=>r.owner===p.id))r.protectedUntil=Math.min(r.protectedUntil,this.now());}
  }else if(['answer','next','retreat'].includes(type)){
   const q=s.pending;if(!q||q.id!==data.battleId)fail('world-battle',409);
   if(type==='retreat')this.cancel(w,p);
   else{if(q.index!==data.index)fail('world-conflict',409);if(type==='next'){if(q.phase!=='review')fail('world-conflict',409);q.index++;q.phase='question';}
    else{if(q.phase!=='question')fail('world-conflict',409);if(!Number.isSafeInteger(data.choice)||data.choice<0||data.choice>3)fail('world-input');const item=q.questions[q.index],question=item.snapshot,chosen=item.order[data.choice];this.expansion.access(p.owner,q.mode==='battle'?'play':'learn');this.expansion.learn(w,p,q,chosen===question.answer);const earned=chosen===question.answer&&q.role!=='castle'?G.rewardCorrect(s,question.id,q.mode,q.allianceBonus||0,q.role,q.allianceEffects||{}):{added:0,experience:0,generalProgress:0,levels:[]};const garrisonAdded=q.role==='defense'?this.reinforce(w,p,earned.recruitment||0,q.reinforceRegion):0;q.answers.push({garrisonAdded,added:earned.added,allianceAdded:earned.allianceAdded||0,experience:earned.experience,generalProgress:earned.generalProgress,levels:earned.levels,id:question.id,prompt:question.prompt,correct:chosen===question.answer,chosen:question.choices[chosen],correctText:question.choices[question.answer],explanation:question.explanation,source:question.source});if(q.mode==='battle'&&chosen!==question.answer)this.finish(w,p,true);else if(q.index===4)this.finish(w,p);else q.phase='review';}}
  }else if(type==='claim'){
   if(typeof data.generalId!=='string'||!Object.hasOwn(G.generals,data.generalId))fail('world-general');const meta=G.generals[data.generalId];if(G.available(s)<1)fail('world-general-credit');const current=s.generals.find(g=>g.id===data.generalId);
   if(current)fail('world-general-owned');else s.generals.push({id:data.generalId,level:1,experience:0});s.generalClaims++;s.deployedGenerals=[...new Set([...G.deployed(s).map(g=>g.id),data.generalId])];s.activeGeneral||=data.generalId;
   this.event(w,p.name+'が'+meta.name+'を'+'獲得'+'した');
  }else if(type==='commander'){
   if(!s.generals.some(g=>g.id===data.generalId))fail('world-general');s.activeGeneral=data.generalId;
  }else if(type==='formation'){
   if(!Array.isArray(data.generalIds)||data.generalIds.length>Object.keys(G.generals).length||new Set(data.generalIds).size!==data.generalIds.length||data.generalIds.some(id=>typeof id!=='string'||!s.generals.some(g=>g.id===id)))fail('world-general');s.deployedGenerals=[...data.generalIds];
  }else if(type==='respawn'){
   const region=w.regions.find(r=>r.id===data.region);if(s.ownedRegions.length||!globalThis.HKSengokuTactics.canRecover(region,this.now()))fail('world-respawn');this.settleSpawn(w,p,region,true);this.event(w,p.name+'が'+R.region(region.id).name+'で再起した');
  }else if(type==='title'){
   if(typeof data.titleId!=='string'||data.titleId&&!this.honors(p.owner).some(t=>t.titleId===data.titleId))fail('world-title');this.sql.exec('INSERT INTO sengoku_title_choices(owner,titleId) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET titleId=excluded.titleId',p.owner,data.titleId);
  }else if(type==='leave'){
   this.alliances.detach(w,p);
   if(w.winner?.id===p.id){w.lastWinner=w.winner;w.winner=null;w.status='open';}for(const region of w.regions.filter(r=>r.owner===p.id)){region.owner=null;region.garrison=neutralGarrison(region.id);region.initialGarrisonRemaining=0;region.revision++;region.protectedUntil=0;delete region.battle;}p.retired=true;this.sync(w,p);this.sql.exec('DELETE FROM sengoku_world_members WHERE owner=?',p.owner);this.event(w,p.name+'がワールドを離れた');
  }else fail('world-input');p.revision++;this.rank(w,p);this.save(w);
 }
 mutate(owner,data){
  if(!owner)fail('identity-required',401);this.expansion.access(owner);if(!this.profile(owner)&&data.type!=='profile')fail('world-account',401);if(this.isBanned(owner))fail('banned',403);if(this.profile(owner)&&W.blockedName(this.profile(owner).name,this.admin.words()))fail('nickname-blocked');
  if(data.rules!==7)fail('world-client-update',409);
  if(!Object.hasOwn(fields,data.type)||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||!Number.isSafeInteger(data.revision)||data.revision<0)fail('world-input');
  const allowed=['owner','rules','type','requestId','revision','activeWorldId',...fields[data.type]];if(Object.keys(data).some(k=>!allowed.includes(k)))fail('world-input');
  const payload=JSON.stringify(Object.fromEntries(['rules','type','revision','activeWorldId',...fields[data.type]].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])));let replayed=false;
  this.atomic(()=>{
   const old=this.sql.exec('SELECT payload FROM sengoku_world_receipts WHERE owner=? AND requestId=?',owner,data.requestId).toArray()[0];if(old){if(old.payload!==payload)fail('world-request',409);replayed=true;return;}
   if(data.type==='profile')this.registerGuest(owner,data);
   else if(data.type==='join')this.join(owner,data);
   else if(data.type==='switch')this.switchWorld(owner,data);
   else{const member=this.member(owner);if(!member)fail('world-not-joined',409);if(data.activeWorldId!==member.worldId)fail('world-active-changed',409);const w=this.read(member.worldId);this.tick(w);const p=w.players.find(p=>p.id===member.playerId);this.apply(w,p,data);}
   this.sql.exec('INSERT INTO sengoku_world_receipts(owner,requestId,payload) VALUES(?,?,?)',owner,data.requestId,payload);
  });return{...this.view(owner),replayed};
 }
 fetch(path,data){
  try{
   if(path==='/wealth/sengoku/chat')return Response.json(this.chat.view(data.owner));
   if(path==='/wealth/sengoku/chat/send')return Response.json(this.chat.send(data.owner,data));
   this.ensureWorlds();this.ensureGlobalWorlds();this.migrateBatch();this.ensureRankings();this.ensureOverseasGarrisons();this.ensureModernWorlds();this.ensureAntarctica();this.ensureFiveWorlds();this.ensureGarrisonRanking();this.ensureManualCooldown();this.expansion.ensure();
   if(path==='/wealth/sengoku/world/admin')return Response.json(this.expansion.adminBoard(data.owner));
   if(path==='/wealth/sengoku/world/admin/action')return Response.json(this.expansion.adminAction(data.owner,data));
   if(path==='/wealth/sengoku/world/timeline')return Response.json(this.expansion.timeline(data.worldId===undefined?this.member(data.owner)?.worldId||1:data.worldId,data.before));
   if(path==='/wealth/sengoku/world/alliances')return Response.json(this.alliances.ranking(data.owner,data.worldId));
   if(path==='/wealth/sengoku/world/ranking')return Response.json(this.ranking(data.owner,data.worldId,data.region));
   if(path==='/wealth/sengoku/worlds')return Response.json(this.list(data.owner));
   if(path==='/wealth/sengoku/world'){
    if(data.worldId!==undefined&&(!Number.isSafeInteger(data.worldId)||data.worldId<1))fail('world-input');const id=data.worldId||this.member(data.owner)?.worldId;if(id){this.atomic(()=>{const w=this.read(id);if(!w)fail('world-not-found',404);this.tick(w);});}return Response.json(this.view(data.owner,data.worldId));
   }
   return Response.json(this.mutate(data.owner,data));
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
