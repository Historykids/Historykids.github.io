import '../../assets/ui/sengoku-world-rules.js';
import {SengokuAlliances,allianceFields} from './sengoku-alliances.mjs';
import {historyQuestions} from './sengoku-questions.mjs';
const R=globalThis.HKSengokuRules,G=globalThis.HKSengokuWorldRules,W=globalThis.HKWealthRules;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const fields={...allianceFields,join:['region','worldId'],quiz:['mode'],begin:['target','regionRevision'],answer:['battleId','index','choice'],next:['battleId','index'],retreat:['battleId'],claim:['generalId'],commander:['generalId'],respawn:['region'],leave:[]};
export const worldRoutes=new Set(['/wealth/sengoku/worlds','/wealth/sengoku/world','/wealth/sengoku/world/action','/wealth/sengoku/world/ranking','/wealth/sengoku/world/alliances']);
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
  this.alliances=new SengokuAlliances(this);
 }
 atomic(fn){return this.storage.transactionSync(fn);}
 upgradeWorld(w){
  w.rulesVersion=2;
  for(const region of w.regions)delete region.battle;
  for(const p of w.players){
   const old=p.s,done=old.pending?.answers?.filter(a=>a.correct)||[],state=G.initial(old.capital||p.home,old.startedAt||this.now());
   p.legacyEconomy={army:old.army,resources:old.resources,fortLevel:old.fortLevel,guard:p.guard};
   for(const key of ['ownedRegions','bestTerritories','defeatedRegions','battlesWon','battlesLost','unifications','claimedRewards'])if(old[key]!==undefined)state[key]=old[key];
   state.soldiers=Math.min(G.MAX_SOLDIERS,R.troops(old.army||{})+done.length*G.SOLDIERS_PER_CORRECT);state.totalCorrect=(old.totalCorrect||0)+done.length;
   state.learnedCards=[...new Set([...(old.learnedCards||[]),...done.map(a=>a.id)])];state.generals=(old.generals||[]).filter(g=>G.generals[g.id]).map(g=>({id:g.id,level:Math.min(G.MAX_LEVEL,Math.max(1,g.level)),experience:Math.min(g.level*10-1,Math.floor((g.experience||0)/10))}));state.activeGeneral=state.generals.some(g=>g.id===old.activeGeneral)?old.activeGeneral:state.generals[0]?.id||null;
   if(old.pending)state.lastResult={id:old.pending.id,outcome:'updated',mode:old.pending.mode,target:old.pending.target,correct:done.length,added:done.length*G.SOLDIERS_PER_CORRECT,review:old.pending.answers,at:this.now()};
   p.s=state;p.incoming=null;delete p.guard;delete p.guardQuiz;p.revision++;this.rank(w,p);
  }
 }
 migrateBatch(){
  const ids=this.sql.exec('SELECT w.id FROM sengoku_worlds w LEFT JOIN sengoku_world_rule_versions v ON w.id=v.worldId WHERE v.worldId IS NULL OR v.version<3 ORDER BY w.id LIMIT 8').toArray();
  if(ids.length)this.atomic(()=>{for(const row of ids)this.read(row.id);});
 }
 rank(w,p){
  if(p.retired){this.sql.exec('DELETE FROM sengoku_force_scores WHERE owner=? AND playerId=?',p.owner,p.id);return;}
  const force=G.attack(p.s),territories=p.s.ownedRegions.length,wins=p.s.battlesWon,old=this.sql.exec('SELECT force,territories,wins,achievedAt,playerId FROM sengoku_force_scores WHERE owner=?',p.owner).toArray()[0];
  const at=old&&old.playerId===p.id&&old.force===force&&old.territories===territories&&old.wins===wins?old.achievedAt:this.now();
  this.sql.exec('INSERT INTO sengoku_force_scores(owner,playerId,worldId,name,force,soldiers,generals,level,territories,wins,achievedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET playerId=excluded.playerId,worldId=excluded.worldId,name=excluded.name,force=excluded.force,soldiers=excluded.soldiers,generals=excluded.generals,level=excluded.level,territories=excluded.territories,wins=excluded.wins,achievedAt=excluded.achievedAt',p.owner,p.id,w.id,p.name,force,p.s.soldiers,p.s.generals.length,G.active(p.s)?.level||0,territories,wins,at);
 }
 ranking(owner,worldId){
  if(worldId!==undefined&&(!Number.isSafeInteger(worldId)||worldId<1))fail('world-input');
  const rows=this.sql.exec('SELECT * FROM sengoku_force_scores'+(worldId?' WHERE worldId=?':''),...(worldId?[worldId]:[])).toArray().filter(r=>!this.isBanned(r.owner)&&!W.blockedName(r.name,this.admin.words()));
  rows.sort((a,b)=>b.force-a.force||b.territories-a.territories||b.wins-a.wins||a.achievedAt-b.achievedAt||a.playerId.localeCompare(b.playerId));
  let previous='',rank=0;const entries=rows.map((r,i)=>{const key=r.force+':'+r.territories+':'+r.wins;if(key!==previous)rank=i+1;previous=key;return{id:r.playerId,worldId:r.worldId,name:r.name,force:r.force,soldiers:r.soldiers,generals:r.generals,level:r.level,territories:r.territories,wins:r.wins,rank,own:r.owner===owner};});
  return{protocol:'sengoku-force-v1',entries:entries.slice(0,100),own:entries.find(r=>r.own)||null,total:entries.length,worldId:worldId||null,migrating:!!this.sql.exec('SELECT w.id FROM sengoku_worlds w LEFT JOIN sengoku_world_rule_versions v ON w.id=v.worldId WHERE v.worldId IS NULL OR v.version<3 LIMIT 1').toArray().length,at:this.now()};
 }
 member(owner){return this.sql.exec('SELECT worldId,playerId FROM sengoku_world_members WHERE owner=?',owner).toArray()[0];}
 row(id){return this.sql.exec('SELECT state FROM sengoku_worlds WHERE id=?',id).toArray()[0];}
 upgradeFourQuizzes(w){
  if(w.rulesVersion!==2)this.upgradeWorld(w);
  for(const region of w.regions){delete region.battle;region.garrison=region.owner?0:R.enemy({unifications:0},region.id).army;}
  for(const p of w.players){
   const s=p.s,q=s.pending;s.version=3;s.correctByMode={general:s.totalCorrect||0,soldiers:0,level:0,battle:0};s.attackCooldownUntil=0;
   if(q){s.lastResult={id:q.id,outcome:'updated',mode:q.mode==='battle'?'battle':'soldiers',target:q.target,correct:q.answers.filter(a=>a.correct).length,added:q.answers.reduce((n,a)=>n+(a.added||0),0),review:q.answers,at:this.now()};s.pending=null;}
   p.incoming=null;p.revision++;this.rank(w,p);
  }
  w.rulesVersion=3;
 }
 read(id){const row=this.row(id);if(!row)return null;const w=JSON.parse(row.state);if(w.rulesVersion!==3){this.upgradeFourQuizzes(w);this.save(w);}if(this.alliances.init(w))this.save(w);return w;}
 summary(w){return{id:w.id,players:w.players.length,capacity:G.LIMIT,status:w.status,joinable:this.recruitable(w),startingRegions:w.regions.filter(r=>r.owner||!r.battle).map(r=>r.id),available:w.regions.filter(r=>!r.owner&&!r.battle).map(r=>r.id),winner:w.winner,createdAt:w.createdAt};}
 save(w){this.sql.exec('INSERT OR REPLACE INTO sengoku_world_rule_versions(worldId,version) VALUES(?,3)',w.id);w.revision++;w.updatedAt=this.now();this.sql.exec('INSERT INTO sengoku_worlds(id,state,revision,updatedAt,summary,recruiting) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,revision=excluded.revision,updatedAt=excluded.updatedAt,summary=excluded.summary,recruiting=excluded.recruiting',w.id,JSON.stringify(w),w.revision,w.updatedAt,JSON.stringify(this.summary(w)),Number(this.recruitable(w)));}
 latest(){const row=this.sql.exec('SELECT state FROM sengoku_worlds ORDER BY id DESC LIMIT 1').toArray()[0];return row?JSON.parse(row.state):null;}
 create(){const last=this.latest();if(last&&last.players.length<G.LIMIT)fail('world-capacity-wait',409);const id=(last?.id||0)+1,w={id,rulesVersion:3,revision:0,createdAt:this.now(),updatedAt:this.now(),status:'open',players:[],regions:R.regions.map(r=>({id:r.id,owner:null,revision:0,protectedUntil:0,garrison:R.enemy({unifications:0},r.id).army})),events:[],winner:null,alliances:[],allianceInvites:[]};this.save(w);return w;}
 recruitable(w){return w.players.length<G.LIMIT;}
 event(w,text){w.events.unshift({id:crypto.randomUUID(),text,at:this.now()});w.events=w.events.slice(0,30);}
 sync(w,p){p.s.ownedRegions=w.regions.filter(r=>r.owner===p.id).map(r=>r.id);p.s.bestTerritories=Math.max(p.s.bestTerritories,p.s.ownedRegions.length);}
 rewards(owner){return this.sql.exec('SELECT reward FROM sengoku_world_rewards WHERE owner=?',owner).toArray().map(r=>r.reward);}
 pending(q){if(!q)return null;return{id:q.id,mode:q.mode,target:q.target,index:q.index,phase:q.phase,correct:q.answers.filter(a=>a.correct).length,deadline:q.deadline,allianceBonus:q.allianceBonus||0,soldiers:q.attackSnapshot.soldiers,force:q.attackSnapshot.force,damage:G.damage(q.attackSnapshot),defenderName:q.defenderName,enemySoldiers:q.defenderSoldiers,question:q.phase==='question'?this.campaign.question(q):null,feedback:q.phase==='review'?q.answers.at(-1):null};}
 publicWorld(w){
  const visibleName=p=>this.isBanned(p.owner)||W.blockedName(p.name,this.admin.words())?'参加者':p.name;
  return{id:w.id,revision:w.revision,createdAt:w.createdAt,updatedAt:w.updatedAt,status:w.status,capacity:G.LIMIT,joinable:this.recruitable(w),winner:w.winner,regions:w.regions.map(r=>({...r})),alliances:this.alliances.publicGroups(w),players:w.players.map(p=>({id:p.id,allianceId:p.allianceId||null,canJoinAlliance:this.alliances.eligible(p),inBattle:!!p.incoming||p.s.pending?.mode==='battle',name:visibleName(p),home:p.home,territories:p.s.ownedRegions.length,best:p.s.bestTerritories,force:G.attack(p.s),soldiers:p.s.soldiers,generals:p.s.generals.length,wins:p.s.battlesWon,retired:!!p.retired,level:G.active(p.s)?.level||0,generalId:G.active(p.s)?.id||null,incoming:p.incoming?{region:p.incoming.region,deadline:p.incoming.deadline}:null})),events:w.events};
 }
 view(owner,requested){
  const member=this.member(owner),id=requested||member?.worldId,w=id?this.read(id):null,p=w&&member?.worldId===w.id?w.players.find(p=>p.id===member.playerId):null;
  const account=this.accounts.row(owner);let own=null;
  if(p){const s={...p.s,pending:this.pending(p.s.pending)};own={...this.alliances.own(w,p),id:p.id,name:p.name,home:p.home,revision:p.revision,state:s,force:G.attack(p.s),generalCredits:G.available(p.s),buffs:G.buffs(p.s),incoming:p.incoming?{...p.incoming}:null,lastDefense:p.lastDefense||null};}
  return{protocol:'sengoku-world-v3',account:{signedIn:!!account,name:account?.name||null},world:w?this.publicWorld(w):null,own,activeWorldId:member?.worldId||null,rewards:this.rewards(owner),at:this.now()};
 }
 list(owner){
  const rows=this.sql.exec('SELECT summary FROM sengoku_worlds ORDER BY id DESC LIMIT 60').toArray(),member=this.member(owner);
  return{protocol:'sengoku-world-v3',capacity:G.LIMIT,alliances:{protocol:'sengoku-alliance-v1',maxMembers:5,bonusPerAlly:2,maxSoldierBonus:8},startingProvince:'any-owner',respawnProvince:'neutral-only',worldCreation:'capacity-only',combat:'five-correct-half-force',captureCooldownMs:G.CAPTURE_COOLDOWN,quizModes:Object.keys(G.modes),quiz:{eras:[...new Set(historyQuestions.map(q=>q.era))],questions:historyQuestions.length},activeWorldId:member?.worldId||null,worlds:rows.map(row=>{const summary=JSON.parse(row.summary);return{...summary,joinable:summary.players<G.LIMIT,startingRegions:summary.startingRegions||R.regions.map(r=>r.id)};})};
 }
 tick(w){
  let changed=this.alliances.expire(w);
  for(const p of w.players){const q=p.s.pending;if(q&&q.deadline<=this.now()){this.cancel(w,p,'timeout');p.revision++;changed=true;}}
  if(changed)this.save(w);
 }
 cancel(w,p,outcome='retreat'){
  const q=p.s.pending;if(!q)return;
  p.s.lastResult={id:q.id,outcome,mode:q.mode,target:q.target,correct:q.answers.filter(a=>a.correct).length,added:q.answers.reduce((n,a)=>n+(a.added||0),0),review:q.answers,at:this.now()};
  const region=w.regions.find(r=>r.id===q.target);if(region?.battle?.id===q.id)delete region.battle;
  const defender=w.players.find(d=>d.id===q.defenderId);if(defender?.incoming?.id===q.id){defender.incoming=null;defender.revision++;}
  p.s.pending=null;
 }

 finish(w,p,incorrect=false){
  const q=p.s.pending,state=p.s,correct=q.answers.filter(a=>a.correct).length,combat=q.mode==='battle';let captured=false,damage=0,remaining=0,beforeSoldiers=0;
  if(combat){
   const region=w.regions.find(r=>r.id===q.target);if(region.owner!==q.defenderId||region.battle?.id!==q.id)fail('world-changed',409);
   const defender=w.players.find(d=>d.id===q.defenderId);beforeSoldiers=defender?defender.s.soldiers:region.garrison;remaining=beforeSoldiers;
   if(!incorrect&&correct===5){damage=Math.min(beforeSoldiers,G.damage(q.attackSnapshot));remaining=beforeSoldiers-damage;if(defender)defender.s.soldiers=remaining;else region.garrison=remaining;captured=remaining===0;}
   if(captured){
    const reclaim=!state.ownedRegions.length;region.owner=p.id;region.garrison=0;region.revision++;region.protectedUntil=this.now()+(reclaim?G.PROTECTION:30000);state.battlesWon++;state.defeatedRegions=[...new Set([...state.defeatedRegions,q.target])];state.attackCooldownUntil=this.now()+G.CAPTURE_COOLDOWN;this.sync(w,p);if(reclaim)state.capital=q.target;
    if(defender){this.sync(w,defender);defender.s.battlesLost++;if(defender.s.capital===q.target)defender.s.capital=defender.s.ownedRegions[0]||defender.home;}
    if(w.winner&&w.winner.id!==p.id){w.lastWinner=w.winner;w.winner=null;w.status='open';}
    this.event(w,p.name+'が'+R.region(q.target).name+'を占領'+(defender?'（'+defender.name+'の領土）':'（守備隊）'));
    if(state.ownedRegions.length>=25&&!state.claimedRewards.includes('golden-banner'))state.claimedRewards.push('golden-banner');
   }else{state.battlesLost++;this.event(w,p.name+'が'+R.region(q.target).name+'を攻撃：'+damage+'人減・残り'+remaining+'人');}
   delete region.battle;
   if(defender){defender.incoming=null;defender.lastDefense={attacker:p.name,region:q.target,won:!captured,damage,remaining,captured,eliminated:!defender.s.ownedRegions.length,at:this.now()};defender.revision++;this.rank(w,defender);}
  }
  state.lastResult={id:q.id,mode:q.mode,outcome:combat?incorrect?'incorrect':captured?'captured':'hit':'complete',target:q.target,correct,force:q.attackSnapshot.force,damage,remaining,beforeSoldiers,added:q.answers.reduce((n,a)=>n+(a.added||0),0),experience:q.answers.reduce((n,a)=>n+(a.experience||0),0),generalProgress:q.answers.reduce((n,a)=>n+(a.generalProgress||0),0),cooldownUntil:state.attackCooldownUntil,review:q.answers,at:this.now()};state.pending=null;
  if(captured&&state.ownedRegions.length===47){w.status='finished';w.winner={id:p.id,name:p.name,at:this.now()};state.unifications++;if(!state.claimedRewards.includes('unification-castle'))state.claimedRewards.push('unification-castle');this.sql.exec('INSERT OR IGNORE INTO sengoku_world_rewards(owner,reward) VALUES(?,?)',p.owner,'unification-castle');this.event(w,p.name+'が天下統一を達成！ 故郷の奪還戦は継続できます。');}
 }

 join(owner,data){
  if(this.member(owner))fail('world-already-joined',409);if(data.revision!==0||!R.region(data.region)||!(data.worldId==='auto'||Number.isSafeInteger(data.worldId)&&data.worldId>0))fail('world-input');
  const possible=w=>w&&this.recruitable(w)&&!w.players.some(p=>p.owner===owner)&&w.regions.some(r=>r.id===data.region&&(r.owner||!r.battle));
  let w=data.worldId==='auto'?null:this.read(data.worldId);if(!possible(w))w=null;
  if(!w){const rows=this.sql.exec('SELECT id,summary FROM sengoku_worlds ORDER BY id').toArray().filter(r=>JSON.parse(r.summary).players<G.LIMIT);for(const row of rows){const candidate=this.read(row.id);if(possible(candidate)){w=candidate;break;}}}
  if(!w){const last=this.latest();if(last&&last.players.length<G.LIMIT)fail('world-region-unavailable',409);w=this.create();}
  const region=w.regions.find(r=>r.id===data.region),s=G.initial(data.region,this.now());if(region.owner){s.ownedRegions=[];s.bestTerritories=0;}
  const account=this.accounts.row(owner),p={id:crypto.randomUUID(),owner,name:account.name,home:data.region,s,revision:1,incoming:null,joinedAt:this.now()};w.players.push(p);
  if(!region.owner){region.owner=p.id;region.revision++;region.protectedUntil=this.now()+G.PROTECTION;}
  this.sql.exec('INSERT INTO sengoku_world_members(owner,worldId,playerId) VALUES(?,?,?)',owner,w.id,p.id);this.event(w,p.name+'が'+R.region(data.region).name+'で旗を掲げた');this.rank(w,p);this.save(w);
  if(w.players.length===G.LIMIT&&this.latest().id===w.id)this.create();
 }
 apply(w,p,data){
  const s=p.s,type=data.type;if(data.revision!==p.revision)fail('world-conflict',409);
  if(s.pending&&!['answer','next','retreat'].includes(type))fail('world-pending',409);
  if(p.incoming&&(['begin','commander','claim','leave','respawn'].includes(type)||Object.hasOwn(allianceFields,type)))fail('world-incoming',409);
  if(Object.hasOwn(allianceFields,type)){this.alliances.apply(w,p,data);p.revision++;this.save(w);return;}
  if(type==='quiz'||type==='begin'){
   if(type==='quiz'&&(!['general','soldiers','level'].includes(data.mode)||data.mode==='level'&&!G.active(s)))fail('world-quiz-mode');
   if(type==='quiz'&&data.mode==='level'&&G.active(s).level>=G.MAX_LEVEL)fail('world-general-max');
   let target=null,defenderId=null,defenderName='守備隊',defenderSoldiers=0;
   if(type==='begin'){
    if(s.attackCooldownUntil>this.now())fail('world-cooldown',409);
    if(s.soldiers<1)fail('world-soldiers');const region=w.regions.find(r=>r.id===data.target);if(region&&this.alliances.friendly(w,p,region.owner))fail('alliance-friendly',409);if(!region||!G.reachable(s,region.id,p.home,this.alliances.frontier(w,p)))fail('world-route');if(region.revision!==data.regionRevision)fail('world-changed',409);if(region.protectedUntil>this.now())fail('world-protected',409);if(region.battle)fail('world-busy',409);
    const defender=w.players.find(a=>a.id===region.owner);if(defender&&(defender.incoming||defender.s.pending?.mode==='battle'))fail('world-busy',409);
    target=region.id;if(defender){defenderId=defender.id;defenderName=defender.name;defenderSoldiers=defender.s.soldiers;}else defenderSoldiers=region.garrison;
   }
   const q={id:crypto.randomUUID(),mode:type==='quiz'?data.mode:'battle',allianceBonus:type==='quiz'&&data.mode==='soldiers'?this.alliances.bonus(w,p):0,target,attackSnapshot:G.snapshot(s),index:0,phase:'question',questions:this.campaign.deck(historyQuestions),answers:[],deadline:this.now()+G.BATTLE_TIME,defenderId,defenderName,defenderSoldiers};s.pending=q;
   if(target){const region=w.regions.find(r=>r.id===target);region.battle={id:q.id,attacker:p.id,deadline:q.deadline};const defender=w.players.find(d=>d.id===defenderId);if(defender){defender.incoming={id:q.id,attacker:p.name,region:target,deadline:q.deadline};defender.revision++;}for(const r of w.regions.filter(r=>r.owner===p.id))r.protectedUntil=Math.min(r.protectedUntil,this.now());}
  }else if(['answer','next','retreat'].includes(type)){
   const q=s.pending;if(!q||q.id!==data.battleId)fail('world-battle',409);
   if(type==='retreat')this.cancel(w,p);
   else{if(q.index!==data.index)fail('world-conflict',409);if(type==='next'){if(q.phase!=='review')fail('world-conflict',409);q.index++;q.phase='question';}
    else{if(q.phase!=='question')fail('world-conflict',409);if(!Number.isSafeInteger(data.choice)||data.choice<0||data.choice>3)fail('world-input');const item=q.questions[q.index],question=item.snapshot,chosen=item.order[data.choice];const earned=chosen===question.answer?G.rewardCorrect(s,question.id,q.mode,q.allianceBonus||0):{added:0,experience:0,generalProgress:0,levels:[]};q.answers.push({added:earned.added,allianceAdded:earned.allianceAdded||0,experience:earned.experience,generalProgress:earned.generalProgress,levels:earned.levels,id:question.id,prompt:question.prompt,correct:chosen===question.answer,chosen:question.choices[chosen],correctText:question.choices[question.answer],explanation:question.explanation,source:question.source});if(q.mode==='battle'&&chosen!==question.answer)this.finish(w,p,true);else if(q.index===4)this.finish(w,p);else q.phase='review';}}
  }else if(type==='claim'){
   if(typeof data.generalId!=='string'||!Object.hasOwn(G.generals,data.generalId))fail('world-general');const meta=G.generals[data.generalId];if(G.available(s)<1)fail('world-general-credit');const current=s.generals.find(g=>g.id===data.generalId);
   if(current)fail('world-general-owned');else s.generals.push({id:data.generalId,level:1,experience:0});s.generalClaims++;s.activeGeneral||=data.generalId;
   this.event(w,p.name+'が'+meta.name+'を'+'獲得'+'した');
  }else if(type==='commander'){
   if(!s.generals.some(g=>g.id===data.generalId))fail('world-general');s.activeGeneral=data.generalId;
  }else if(type==='respawn'){
   const region=w.regions.find(r=>r.id===data.region);if(s.ownedRegions.length||!region||region.owner||region.battle)fail('world-respawn');region.owner=p.id;region.garrison=0;region.revision++;region.protectedUntil=this.now()+G.PROTECTION;s.capital=region.id;this.sync(w,p);this.event(w,p.name+'が'+R.region(region.id).name+'で再起した');
  }else if(type==='leave'){
   this.alliances.detach(w,p);
   if(w.status!=='finished')for(const region of w.regions.filter(r=>r.owner===p.id)){region.owner=null;region.garrison=0;region.revision++;region.protectedUntil=0;delete region.battle;}p.retired=true;this.sync(w,p);this.sql.exec('DELETE FROM sengoku_world_members WHERE owner=?',p.owner);this.event(w,p.name+'がワールドを離れた');
  }else fail('world-input');p.revision++;this.rank(w,p);this.save(w);
 }
 mutate(owner,data){
  if(!this.accounts.row(owner))fail('world-account',401);if(this.isBanned(owner))fail('banned',403);if(W.blockedName(this.accounts.row(owner).name,this.admin.words()))fail('nickname-blocked');
  if(data.rules!==3)fail('world-client-update',409);
  if(!Object.hasOwn(fields,data.type)||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||!Number.isSafeInteger(data.revision)||data.revision<0)fail('world-input');
  const allowed=['owner','rules','type','requestId','revision',...fields[data.type]];if(Object.keys(data).some(k=>!allowed.includes(k)))fail('world-input');
  const payload=JSON.stringify(Object.fromEntries(['rules','type','revision',...fields[data.type]].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])));let replayed=false;
  this.atomic(()=>{
   const old=this.sql.exec('SELECT payload FROM sengoku_world_receipts WHERE owner=? AND requestId=?',owner,data.requestId).toArray()[0];if(old){if(old.payload!==payload)fail('world-request',409);replayed=true;return;}
   if(data.type==='join')this.join(owner,data);
   else{const member=this.member(owner);if(!member)fail('world-not-joined',409);const w=this.read(member.worldId);this.tick(w);const p=w.players.find(p=>p.id===member.playerId);this.apply(w,p,data);}
   this.sql.exec('INSERT INTO sengoku_world_receipts(owner,requestId,payload) VALUES(?,?,?)',owner,data.requestId,payload);
  });return{...this.view(owner),replayed};
 }
 fetch(path,data){
  try{
   this.migrateBatch();
   if(path==='/wealth/sengoku/world/alliances')return Response.json(this.alliances.ranking(data.owner,data.worldId));
   if(path==='/wealth/sengoku/world/ranking')return Response.json(this.ranking(data.owner,data.worldId));
   if(path==='/wealth/sengoku/worlds')return Response.json(this.list(data.owner));
   if(path==='/wealth/sengoku/world'){
    if(data.worldId!==undefined&&(!Number.isSafeInteger(data.worldId)||data.worldId<1))fail('world-input');const id=data.worldId||this.member(data.owner)?.worldId;if(id){this.atomic(()=>{const w=this.read(id);if(!w)fail('world-not-found',404);this.tick(w);});}return Response.json(this.view(data.owner,data.worldId));
   }
   return Response.json(this.mutate(data.owner,data));
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
