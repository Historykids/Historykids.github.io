import '../../assets/ui/sengoku-tactics.js';
const T=globalThis.HKSengokuTactics,G=globalThis.HKSengokuWorldRules,R=globalThis.HKSengokuKuniMap;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);
export const expansionFields={buff_upgrade:['kind'],castle_upgrade:['region'],attack_unit:['unit'],defense_unit:['region','unit'],support_create:['region'],support_cancel:['supportId'],alliance_post:['message','region'],alliance_dissolve:[],treaty_offer:['targetId','kind','giveRegion','receiveRegion','scope','durationHours','note'],notification_read:['notificationId'],treaty_respond:['offerId','accept'],treaty_cancel:['offerId']};
export const expansionRoutes=new Set(['/wealth/sengoku/world/timeline','/wealth/sengoku/world/admin','/wealth/sengoku/world/admin/action']);
export class SengokuExpansion{
 constructor(game){
  this.g=game;this.sql=game.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_notifications(id TEXT PRIMARY KEY,owner TEXT NOT NULL,worldId INTEGER NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,region TEXT,at INTEGER NOT NULL,readAt INTEGER NOT NULL DEFAULT 0)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_notifications_owner ON sengoku_notifications(owner,at DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_alliance_buffs(allianceId TEXT NOT NULL,kind TEXT NOT NULL,level INTEGER NOT NULL DEFAULT 0,spent INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(allianceId,kind))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_user_controls(owner TEXT PRIMARY KEY,banned INTEGER NOT NULL DEFAULT 0,accessUntil INTEGER NOT NULL DEFAULT 0,learningUntil INTEGER NOT NULL DEFAULT 0,chatUntil INTEGER NOT NULL DEFAULT 0,recruitMicros INTEGER,revision INTEGER NOT NULL DEFAULT 0)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_admin_receipts(actor TEXT NOT NULL,requestId TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(actor,requestId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_admin_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,target TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,at INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_expansion_ops(id TEXT PRIMARY KEY,status TEXT NOT NULL,owner TEXT,at INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_chronicle(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,worldId INTEGER NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,at INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_chronicle_world ON sengoku_chronicle(worldId,seq DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_alliance_activity(allianceId TEXT NOT NULL,eventKey TEXT NOT NULL,worldId INTEGER NOT NULL,playerId TEXT NOT NULL,at INTEGER NOT NULL,correct INTEGER NOT NULL DEFAULT 0,captures INTEGER NOT NULL DEFAULT 0,jointWins INTEGER NOT NULL DEFAULT 0,contribution INTEGER NOT NULL DEFAULT 0,upsetRegion TEXT,PRIMARY KEY(allianceId,eventKey))');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_alliance_activity_time ON sengoku_alliance_activity(allianceId,at)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_alliance_honors(allianceId TEXT NOT NULL,titleId TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(allianceId,titleId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_alliance_missions(allianceId TEXT NOT NULL,week INTEGER NOT NULL,missionId TEXT NOT NULL,points INTEGER NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(allianceId,week,missionId))');
 }
 now(){return this.g.now();}
 notify(w,players,kind,text,region=null){for(const owner of new Set(players.filter(p=>p&&!p.retired).map(p=>p.owner))){this.sql.exec('INSERT INTO sengoku_notifications(id,owner,worldId,kind,text,region,at) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),owner,w.id,kind,text,region,this.now());this.sql.exec('DELETE FROM sengoku_notifications WHERE owner=? AND id NOT IN (SELECT id FROM sengoku_notifications WHERE owner=? ORDER BY at DESC,rowid DESC LIMIT 100)',owner,owner);}}
 notifications(owner){if(!owner)return [];return this.sql.exec('SELECT id,worldId,kind,text,region,at,readAt FROM sengoku_notifications WHERE owner=? ORDER BY at DESC,rowid DESC LIMIT 100',owner).toArray();}
 buffs(w,a){const levels=Object.fromEntries(Object.keys(T.allianceBuffs).map(k=>[k,0]));if(!a)return{levels,effects:{attack:0,defense:0,recruit:0,experience:0},earned:0,spent:0,available:0};const rows=this.sql.exec('SELECT kind,level,spent FROM sengoku_alliance_buffs WHERE allianceId=?',a.id).toArray(),earned=this.sql.exec('SELECT COALESCE(SUM(points),0) points FROM sengoku_alliance_missions WHERE allianceId=?',a.id).toArray()[0].points;for(const row of rows)if(T.allianceBuffs[row.kind])levels[row.kind]=Math.max(0,Math.min(T.allianceBuffs[row.kind].max,row.level));const spent=rows.reduce((n,r)=>n+r.spent,0),effects=Object.fromEntries(Object.entries(levels).map(([kind,level])=>[kind,level*T.allianceBuffs[kind].step]));return{levels,effects,earned,spent,available:Math.max(0,earned-spent)};}
 control(owner){return this.sql.exec('SELECT * FROM sengoku_user_controls WHERE owner=?',owner).toArray()[0]||{banned:0,accessUntil:0,learningUntil:0,chatUntil:0,recruitMicros:null,revision:0};}
 banned(owner){return !!this.control(owner).banned;}
 access(owner,kind='play'){
  const c=this.control(owner),now=this.now();if(c.banned)fail('sengoku-access-banned',403);if(c.accessUntil>now)fail('sengoku-access-limited',403);
  if(kind==='learn'&&c.learningUntil>now)fail('sengoku-learning-limited',403);if(kind==='chat'&&c.chatUntil>now)fail('sengoku-chat-limited',403);
 }
 init(w){
  if(w.expansionVersion===1)return false;
  w.supportRequests??=[];w.diplomacy??=[];w.alliancePosts??=[];w.firstConquests??=[...new Set([...w.regions.filter(r=>r.owner).map(r=>r.id),...w.players.flatMap(p=>p.s.defeatedRegions||[])])];
  for(const r of w.regions){r.castleLevel??=0;r.castleWork??=0;r.defenseUnit??='infantry';r.garrisonFraction??=0;}
  for(const p of w.players){p.s.attackUnit??='infantry';p.s.attackFraction??=0;}
  for(const e of [...(w.events||[])].reverse())this.sql.exec('INSERT OR IGNORE INTO sengoku_chronicle(id,worldId,kind,text,at) VALUES(?,?,?,?,?)',e.id,w.id,'legacy',e.text,e.at);
  w.expansionVersion=1;return true;
 }
 ensure(){
  const id='appy-recruitment-reset-20261031-v1';if(this.sql.exec('SELECT id FROM sengoku_expansion_ops WHERE id=?',id).toArray().length)return;
  this.g.atomic(()=>{
   const prior=this.sql.exec('SELECT owner FROM sengoku_manual_cooldowns WHERE id=? AND status=? AND owner IS NOT NULL','account-attack-cooldown-20261031-01','applied').toArray()[0];
   const rows=prior?[prior]:this.sql.exec('SELECT owner FROM player_accounts WHERE username=? UNION SELECT owner FROM sengoku_guest_profiles WHERE nameKey=?','appy0127','appy0127').toArray();
   if(rows.length!==1){this.sql.exec('INSERT INTO sengoku_expansion_ops(id,status,owner,at) VALUES(?,?,NULL,?)',id,rows.length?'ambiguous':'not-found',this.now());return;}
   const owner=rows[0].owner;this.sql.exec('INSERT INTO sengoku_user_controls(owner,recruitMicros,revision) VALUES(?,1,1) ON CONFLICT(owner) DO UPDATE SET recruitMicros=1,revision=revision+1',owner);
   for(let n=1;n<=G.WORLD_COUNT;n++){const w=this.g.read(n);let changed=false;for(const p of w.players.filter(p=>p.owner===owner)){if(p.s.pending?.mode==='battle')this.g.cancel(w,p,'restricted');p.s.soldiers=0;p.s.attackFraction=0;p.s.recruitMicros=1;p.revision++;this.g.rank(w,p);changed=true;}if(changed)this.g.save(w);}
   this.sql.exec('INSERT INTO sengoku_expansion_ops(id,status,owner,at) VALUES(?,?,?,?)',id,'applied',owner,this.now());
  });
 }
 personalStatus(){const r=this.sql.exec('SELECT status FROM sengoku_expansion_ops WHERE id=?','appy-recruitment-reset-20261031-v1').toArray()[0];return{status:r?.status||'pending',rewardMicros:1,scale:T.SCALE};}
 event(w,e,kind='event'){this.sql.exec('INSERT OR IGNORE INTO sengoku_chronicle(id,worldId,kind,text,at) VALUES(?,?,?,?,?)',e.id,w.id,kind,e.text,e.at);}
 timeline(worldId,before){
  if(!Number.isSafeInteger(worldId)||worldId<1||worldId>G.WORLD_COUNT||before!==undefined&&(!Number.isSafeInteger(before)||before<1))fail('world-input');
  const rows=this.sql.exec('SELECT seq,id,kind,text,at FROM sengoku_chronicle WHERE worldId=?'+(before?' AND seq<?':'')+' ORDER BY seq DESC LIMIT 51',worldId,...(before?[before]:[])).toArray(),entries=rows.slice(0,50);
  return{worldId,entries,next:rows.length>50?entries.at(-1).seq:null};
 }
 learn(w,p,q,correct){
  p.s.recruitMicros=this.control(p.owner).recruitMicros;
  if(!correct)return;if(q.role==='castle'){const r=w.regions.find(r=>r.id===q.reinforceRegion&&r.owner===p.id);if(!r||r.battle)fail('sengoku-castle');r.castleTraining??={};r.castleEffects??={};const kind=q.castleEffect;if(kind==='build'&&!r.castleLevel){r.castleWork=(r.castleWork||0)+1;if(r.castleWork>=10){r.castleWork-=10;r.castleLevel=1;this.g.event(w,p.name+'が'+R.region(r.id).name+'に城を建設した。','castle');this.notify(w,[p],'castle',R.region(r.id).name+'の城が完成しました。基本守備＋10%。',r.id);}}else if(['wall','moat','barracks'].includes(kind)&&r.castleLevel&&(r.castleEffects[kind]||0)<5){r.castleTraining[kind]=(r.castleTraining[kind]||0)+1;if(r.castleTraining[kind]>=10){r.castleTraining[kind]-=10;r.castleEffects[kind]=(r.castleEffects[kind]||0)+1;this.notify(w,[p],'castle',R.region(r.id).name+'の'+({wall:'城壁',moat:'堀',barracks:'兵舎'}[kind])+'をLv.'+r.castleEffects[kind]+'に強化しました。',r.id);}}r.revision++;}
  if(p.allianceId){this.activity(w,p.allianceId,q.id+':answer:'+q.index,p.id,{correct:1});this.honors(w,p.allianceId);}
 }
 reinforce(r,amount){
  const micros=Math.max(0,Math.round(amount*T.SCALE)),free=(BigInt(G.MAX_SOLDIERS-r.garrison)*BigInt(T.SCALE))-BigInt(r.garrisonFraction||0),added=BigInt(micros)>free?free:BigInt(micros);
  if(added<=0n)return 0;const total=BigInt(r.garrison)*BigInt(T.SCALE)+BigInt(r.garrisonFraction||0)+added;r.garrison=Number(total/BigInt(T.SCALE));r.garrisonFraction=Number(total%BigInt(T.SCALE));r.revision++;return Number(added)/T.SCALE;
 }
 hit(r,amount){
  const total=BigInt(r.garrison)*BigInt(T.SCALE)+BigInt(r.garrisonFraction||0),wanted=BigInt(amount)*BigInt(T.SCALE),removed=wanted>total?total:wanted,left=total-removed;
  r.garrison=Number(left/BigInt(T.SCALE));r.garrisonFraction=Number(left%BigInt(T.SCALE));r.initialGarrisonRemaining=Math.max(0,(r.initialGarrisonRemaining||0)-Number(removed)/T.SCALE);return{damage:Number(removed)/T.SCALE,remaining:Number(left)/T.SCALE};
 }
 validateAttack(w,p,region){
  this.access(p.owner);if(this.truce(w,p,region.owner))fail('sengoku-treaty-active',409);
 }
 begin(w,p,q,region){
  const attackerGroup=this.g.alliances.group(w,p),defenderPlayer=w.players.find(d=>d.id===region.owner),defenderGroup=defenderPlayer&&this.g.alliances.group(w,defenderPlayer);q.tactics=T.snapshot(p.s,region,this.now(),{attack:this.buffs(w,attackerGroup).effects.attack,defense:this.buffs(w,defenderGroup).effects.defense});q.damage=T.damage(q.attackSnapshot.force,q.tactics);const a=this.g.alliances.group(w,p),defender=w.players.find(d=>d.id===region.owner),enemy=defender?.allianceId;
  if(defender)this.notify(w,[defender],'battle',p.name+'が'+R.region(region.id).name+'に攻撃を開始しました。',region.id);q.enemyAlliance=enemy||null;const enemyGroup=w.alliances.find(x=>x.id===enemy);q.upset=!!(a&&enemyGroup&&this.stats(w,enemyGroup).score>this.stats(w,a).score);
  const support=(w.supportRequests||[]).find(s=>s.allianceId===p.allianceId&&s.region===region.id&&!s.closedAt&&s.expiresAt>this.now());
  if(support){support.participants=[...new Set([...(support.participants||[]),p.id])];q.supportId=support.id;this.activity(w,p.allianceId,q.id+':support',p.id,{contribution:1});this.honors(w,p.allianceId);}
 }
 captured(w,p,q,oldOwner){
  this.notify(w,[p,w.players.find(m=>m.id===oldOwner)],'conquest',p.name+'が'+R.region(q.target).name+'を占領しました。',q.target);const r=w.regions.find(r=>r.id===q.target);r.garrisonFraction=0;r.castleWork=0;
  const support=(w.supportRequests||[]).find(s=>s.id===q.supportId),joint=!!support&&new Set(support.participants||[]).size>=2;
  if(p.allianceId){this.activity(w,p.allianceId,q.id+':capture',p.id,{captures:oldOwner?1:0,jointWins:joint?1:0,upsetRegion:q.upset?q.target:null});
   if(joint)for(const playerId of support.participants)this.activity(w,p.allianceId,q.id+':reward:'+playerId,playerId,{contribution:10});this.honors(w,p.allianceId);}
  for(const s of w.supportRequests||[])if(s.region===q.target&&!s.closedAt){s.closedAt=this.now();s.capturedBy=p.id;}
  if(!w.firstConquests.includes(q.target)){w.firstConquests.push(q.target);if(q.target==='country_ata')this.g.event(w,p.name+'がこの世界で初めて南極を占領した。','milestone');}
  const zone=R.region(q.target).rankingRegion,regionIds=R.regions.filter(r=>r.rankingRegion===zone).map(r=>r.id);p.s.regionHonors??=[];if(regionIds.every(id=>p.s.ownedRegions.includes(id))&&!p.s.regionHonors.includes(zone)){p.s.regionHonors.push(zone);this.g.event(w,p.name+'が'+(globalThis.HKSengokuRankingRules.zone(zone)?.name||zone)+'を統一した。','milestone');}
 }
 activity(w,id,key,playerId,values={}){if(!id)return;this.sql.exec('INSERT OR IGNORE INTO sengoku_alliance_activity(allianceId,eventKey,worldId,playerId,at,correct,captures,jointWins,contribution,upsetRegion) VALUES(?,?,?,?,?,?,?,?,?,?)',id,key,w.id,playerId,this.now(),values.correct||0,values.captures||0,values.jointWins||0,values.contribution||0,values.upsetRegion||null);}
 stats(w,a){
  const week=T.week(this.now()),events=this.sql.exec('SELECT * FROM sengoku_alliance_activity WHERE allianceId=?',a.id).toArray(),current=events.filter(e=>e.at>=week),sum=(list,key)=>list.reduce((n,e)=>n+e[key],0),members=this.g.alliances.validMembers(w,a),ids=new Set(members.map(m=>m.id)),lands=w.regions.filter(r=>ids.has(r.owner)),correct=sum(current,'correct'),captures=sum(current,'captures'),jointWins=sum(current,'jointWins'),participants=new Set(current.filter(e=>e.contribution===1).map(e=>e.playerId)).size;
  const territoryPoints=lands.length*100,activityPoints=captures*50+jointWins*50+Math.floor(correct/10)*10; // Joint enemy victories total 100; neutral joint victories total 100 below.
  const neutralJoint=current.filter(e=>e.jointWins&&!e.captures).length*50;
  const missions=[{id:'quiz',name:'同盟全員でクイズ500問正解',value:correct,goal:500,points:100},{id:'conquest',name:'敵の領土を5か所占領',value:captures,goal:5,points:150},{id:'support',name:'同盟員3人が共同攻撃に参加',value:participants,goal:3,points:50}];
  const titlePoints=this.sql.exec('SELECT COALESCE(SUM(points),0) points FROM sengoku_alliance_missions WHERE allianceId=?',a.id).toArray()[0].points;
  return{buffs:this.buffs(w,a),weekStart:week,weekEnd:week+604800000,territories:lands.length,territoryPoints,activityPoints:activityPoints+neutralJoint,score:territoryPoints+activityPoints+neutralJoint,correct,captures,jointWins,participants,missions:missions.map(m=>({...m,complete:m.value>=m.goal})),titlePoints,honors:this.sql.exec('SELECT titleId,at FROM sengoku_alliance_honors WHERE allianceId=?',a.id).toArray().map(h=>({...h,name:T.honorNames[h.titleId]})),allJointWins:sum(events,'jointWins'),upsets:new Set(events.map(e=>e.upsetRegion).filter(Boolean)).size,lands,members};
 }
 honors(w,id){
  const a=w.alliances.find(a=>a.id===id);if(!a)return;let s=this.stats(w,a),owned=new Set(s.lands.map(r=>r.id));
  for(const m of s.missions)if(m.complete)this.sql.exec('INSERT OR IGNORE INTO sengoku_alliance_missions(allianceId,week,missionId,points,at) VALUES(?,?,?,?,?)',a.id,s.weekStart,m.id,m.points,this.now());
  for(const [titleId,condition]of [['hundred',s.territories>=100],['joint',s.allJointWins>=10],['japan',R.japanRegions.every(r=>owned.has(r.id))],['world',R.regions.every(r=>owned.has(r.id))],['upset',s.upsets>=10]])if(condition)this.sql.exec('INSERT OR IGNORE INTO sengoku_alliance_honors(allianceId,titleId,at) VALUES(?,?,?)',a.id,titleId,this.now());
 }
 ranking(owner,worldId){
  if(worldId!==undefined&&(!Number.isSafeInteger(worldId)||worldId<1||worldId>G.WORLD_COUNT))fail('world-input');return this.g.atomic(()=>{
   const entries=[];for(let id=1;id<=G.WORLD_COUNT;id++){if(worldId&&id!==worldId)continue;const w=this.g.read(id);for(const a of w.alliances){if(globalThis.HKWealthRules.blockedName(a.name,this.g.admin.words()))continue;this.honors(w,a.id);const s=this.stats(w,a);if(!s.members.length)continue;entries.push({id:a.id,name:a.name,worldId:id,leader:this.g.alliances.visible(w.players.find(p=>p.id===a.leaderId)),force:s.members.reduce((n,p)=>n+G.attack(p.s),0),soldiers:s.members.reduce((n,p)=>n+p.s.soldiers,0),wins:s.members.reduce((n,p)=>n+p.s.battlesWon,0),members:s.members.map(p=>({id:p.id,name:p.name,force:G.attack(p.s),territories:p.s.ownedRegions.length})),territories:s.territories,territoryPoints:s.territoryPoints,activityPoints:s.activityPoints,score:s.score,weekStart:s.weekStart,weekEnd:s.weekEnd,titlePoints:s.titlePoints,honors:s.honors,own:s.members.some(p=>p.owner===owner)&&(!worldId?id===this.g.member(owner)?.worldId:true)});}}
   entries.sort((a,b)=>b.score-a.score||b.territories-a.territories||a.id.localeCompare(b.id));let rank=0,prior=null;entries.forEach((a,i)=>{if(a.score!==prior)rank=i+1;a.rank=rank;prior=a.score;});return{protocol:'sengoku-alliance-v1',scoring:'weekly-activity-v2',territoryCount:R.regions.length,entries:entries.slice(0,100),own:entries.find(a=>a.own)||null,total:entries.length,worldId:worldId||null,activeWorldId:this.g.member(owner)?.worldId||null,maxMembers:T.MAX_MEMBERS,at:this.now()};
  });
 }
 side(w,p){return p?.allianceId?{kind:'alliance',id:p.allianceId}:{kind:'player',id:p?.id};}
 inSide(w,p,side){return !!p&&(side.kind==='alliance'?p.allianceId===side.id:p.id===side.id);}
 truce(w,p,owner){const d=w.players.find(m=>m.id===owner);if(!d)return false;return(w.diplomacy||[]).some(t=>t.status==='active'&&t.until>this.now()&&(((this.inSide(w,p,t.from)||(t.fromPlayers||[]).includes(p.id))&&(this.inSide(w,d,t.to)||(t.toPlayers||[]).includes(d.id)))||((this.inSide(w,p,t.to)||(t.toPlayers||[]).includes(p.id))&&(this.inSide(w,d,t.from)||(t.fromPlayers||[]).includes(d.id)))));}
 canRepresent(w,p){const a=this.g.alliances.group(w,p);return !a||a.leaderId===p.id;}
 apply(w,p,data){
  if(!Object.hasOwn(expansionFields,data.type))return false;this.access(p.owner);const type=data.type,a=this.g.alliances.group(w,p),r=w.regions.find(r=>r.id===data.region),locked=!!p.s.pending||!!p.incoming;
  if(type==='notification_read'){if(data.notificationId!=='all'&&!this.notifications(p.owner).some(n=>n.id===data.notificationId))fail('sengoku-notification');if(data.notificationId==='all')this.sql.exec('UPDATE sengoku_notifications SET readAt=? WHERE owner=? AND readAt=0',this.now(),p.owner);else this.sql.exec('UPDATE sengoku_notifications SET readAt=? WHERE owner=? AND id=? AND readAt=0',this.now(),p.owner,data.notificationId);return true;}
  if(locked)fail('world-pending',409);
  if(type==='buff_upgrade'){if(!a||!this.g.alliances.permissions(w,a,p).command)fail('alliance-command',403);if(typeof data.kind!=='string'||!Object.hasOwn(T.allianceBuffs,data.kind))fail('sengoku-buff');const meta=T.allianceBuffs[data.kind];this.honors(w,a.id);const current=this.buffs(w,a),level=current.levels[data.kind],cost=T.buffCosts[level];if(level>=meta.max)fail('sengoku-buff-max');if(current.available<cost)fail('sengoku-buff-points');this.sql.exec('INSERT INTO sengoku_alliance_buffs(allianceId,kind,level,spent) VALUES(?,?,1,?) ON CONFLICT(allianceId,kind) DO UPDATE SET level=level+1,spent=spent+excluded.spent',a.id,data.kind,cost);this.notify(w,this.g.alliances.members(w,a),'alliance','同盟バフ「'+meta.name+'」をLv.'+(level+1)+'に強化しました。');}
  else if(type==='attack_unit'){if(!T.units[data.unit])fail('sengoku-unit');p.s.attackUnit=data.unit;}
  else if(type==='defense_unit'){if(!r||r.owner!==p.id||r.battle||!T.units[data.unit])fail('sengoku-unit');r.defenseUnit=data.unit;r.revision++;}
  else if(type==='castle_upgrade'){
   if(!r||r.owner!==p.id||r.battle)fail('sengoku-castle');if((r.castleLevel||0)>=10)fail('sengoku-castle-max');const cost=10;if((r.castleWork||0)<cost)fail('sengoku-castle-work');r.castleWork-=cost;r.castleLevel=(r.castleLevel||0)+1;r.revision++;this.g.event(w,p.name+'が'+R.region(r.id).name+'の城をLv.'+r.castleLevel+'に強化した。','castle');
  }else if(type==='support_create'){
   if(!a||!this.g.alliances.permissions(w,a,p).command)fail('alliance-command',403);if(!r||r.owner===p.id||this.g.alliances.friendly(w,p,r.owner)||!G.reachable(p.s,r.id,p.home,this.g.alliances.frontier(w,p)))fail('world-route');this.validateAttack(w,p,r);if(r.protectedUntil>this.now())fail('world-protected',409);
   const active=w.supportRequests.filter(s=>!s.closedAt&&s.expiresAt>this.now());if(active.some(s=>s.allianceId===a.id&&s.region===r.id))fail('sengoku-support-exists',409);if(active.filter(s=>s.playerId===p.id).length>=3)fail('sengoku-support-limit');
   this.notify(w,this.g.alliances.members(w,a).filter(m=>m.id!==p.id),'support',p.name+'から'+R.region(r.id).name+'への援軍要請が届きました。期限30分。',r.id);w.supportRequests.push({id:crypto.randomUUID(),allianceId:a.id,playerId:p.id,by:p.name,region:r.id,createdAt:this.now(),expiresAt:this.now()+1800000,participants:[]});
  }else if(type==='support_cancel'){
   const support=w.supportRequests.find(s=>s.id===data.supportId&&s.allianceId===a?.id);if(!support||support.playerId!==p.id&&!this.g.alliances.permissions(w,a,p).command)fail('sengoku-support');support.closedAt=this.now();
  }else if(type==='alliance_post'){
   if(!a||!Object.hasOwn(T.messages,data.message)||data.region!==undefined&&!R.region(data.region))fail('sengoku-message');const recent=w.alliancePosts.findLast(m=>m.playerId===p.id);if(recent&&recent.at+10000>this.now())fail('sengoku-message-wait',429);
   w.alliancePosts.push({id:crypto.randomUUID(),allianceId:a.id,playerId:p.id,name:p.name,message:data.message,region:data.region||null,at:this.now()});w.alliancePosts=w.alliancePosts.slice(-200);this.notify(w,this.g.alliances.members(w,a).filter(m=>m.id!==p.id),'chat',p.name+'：'+T.messages[data.message],data.region||null);
  }else if(type==='alliance_dissolve'){
   if(!a||a.leaderId!==p.id)fail('alliance-leader',403);const members=this.g.alliances.members(w,a);this.g.alliances.busy(members);if(members.some(m=>m.s.pending))fail('alliance-battle',409);for(const m of members){m.allianceId=null;m.allianceReadyAt=this.now()+300000;if(m.id!==p.id)m.revision++;}w.alliances=w.alliances.filter(g=>g.id!==a.id);w.allianceInvites=w.allianceInvites.filter(i=>i.allianceId!==a.id);w.allianceApplications=w.allianceApplications.filter(i=>i.allianceId!==a.id);for(const s of w.supportRequests.filter(s=>s.allianceId===a.id))s.closedAt=this.now();this.g.alliances.sync(w);this.g.event(w,'同盟「'+a.name+'」が解散した。','alliance');
  }else if(type==='treaty_offer'){
   const target=w.players.find(m=>m.id===data.targetId&&!m.retired),scope=data.scope||(p.allianceId&&target?.allianceId?'alliance':'player');if(!target||target.id===p.id||this.g.isBanned(target.owner)||this.g.alliances.friendly(w,p,target.id)||!['alliance','player'].includes(scope)||scope==='alliance'&&(!p.allianceId||!target.allianceId||!this.canRepresent(w,p)||!this.canRepresent(w,target))||data.scope===undefined&&(!this.canRepresent(w,p)||!this.canRepresent(w,target)))fail('sengoku-diplomacy-target');if(!['ceasefire','pact','exchange'].includes(data.kind))fail('sengoku-diplomacy');
   const durationHours=data.durationHours??(data.kind==='pact'?72:24);if(data.kind!=='exchange'&&!(data.kind==='pact'?[24,48,72]:[6,12,24]).includes(durationHours))fail('sengoku-diplomacy');const proposalNote=this.g.alliances.text(data.note||'',120);
   if(w.diplomacy.filter(t=>t.fromPlayer===p.id&&t.status==='offered'&&t.expiresAt>this.now()).length>=3)fail('sengoku-diplomacy-limit');
   if(data.kind==='exchange'){const give=w.regions.find(r=>r.id===data.giveRegion&&r.owner===p.id),receive=w.regions.find(r=>r.id===data.receiveRegion&&r.owner===target.id);if(!give||!receive||give.battle||receive.battle||give.protectedUntil>this.now()||receive.protectedUntil>this.now())fail('sengoku-exchange');}
   w.diplomacy.push({id:crypto.randomUUID(),scope,durationHours:data.kind==='exchange'?null:durationHours,note:proposalNote,kind:data.kind,status:'offered',from:data.scope===undefined?this.side(w,p):scope==='player'?{kind:'player',id:p.id}:this.side(w,p),to:data.scope===undefined?this.side(w,target):scope==='player'?{kind:'player',id:target.id}:this.side(w,target),fromPlayer:p.id,toPlayer:target.id,fromName:scope==='alliance'?a.name:p.name,toName:scope==='alliance'?this.g.alliances.group(w,target).name:target.name,giveRegion:data.kind==='exchange'?data.giveRegion:null,receiveRegion:data.kind==='exchange'?data.receiveRegion:null,createdAt:this.now(),expiresAt:this.now()+86400000});this.notify(w,[target],'diplomacy',p.name+'から'+(scope==='alliance'?'同盟':'個人')+'への'+({ceasefire:'停戦',pact:'不可侵',exchange:'領土交換'}[data.kind])+'提案が届きました。24時間以内に返答できます。');
  }else if(type==='treaty_cancel'){
   const offer=w.diplomacy.find(t=>t.id===data.offerId&&t.fromPlayer===p.id&&t.status==='offered');if(!offer)fail('sengoku-diplomacy');offer.status='withdrawn';this.notify(w,[w.players.find(m=>m.id===offer.toPlayer)],'diplomacy',offer.fromName+'が外交提案を取り下げました。');
  }else if(type==='treaty_respond'){
   const offer=w.diplomacy.find(t=>t.id===data.offerId&&t.toPlayer===p.id&&t.status==='offered'&&t.expiresAt>this.now()),from=offer&&w.players.find(m=>m.id===offer.fromPlayer&&!m.retired);if(!offer||typeof data.accept!=='boolean'||!from||offer.to.kind==='alliance'&&!this.canRepresent(w,p)||offer.from.kind==='alliance'&&!this.canRepresent(w,from)||!this.inSide(w,p,offer.to)||!this.inSide(w,from,offer.from))fail('sengoku-diplomacy');
   if(!data.accept){offer.status='rejected';this.notify(w,[from],'diplomacy',offer.toName+'が外交提案を断りました。');return true;}const involved=w.players.filter(m=>this.inSide(w,m,offer.from)||this.inSide(w,m,offer.to));this.g.alliances.busy(involved);if(from.s.pending||from.incoming)fail('alliance-battle',409);
   if(offer.kind==='exchange'){
    const give=w.regions.find(r=>r.id===offer.giveRegion&&r.owner===from.id),receive=w.regions.find(r=>r.id===offer.receiveRegion&&r.owner===p.id);if(!give||!receive||give.battle||receive.battle||give.protectedUntil>this.now()||receive.protectedUntil>this.now()||(give.lastTradeAt||0)+86400000>this.now()||(receive.lastTradeAt||0)+86400000>this.now())fail('sengoku-exchange');
    for(const [land,next]of [[give,p],[receive,from]]){land.owner=next.id;land.protectedUntil=this.now()+G.PROTECTION;land.lastTradeAt=this.now();land.revision++;next.s.heldRegions=[...new Set([...next.s.heldRegions,land.id])];}
    for(const m of [from,p]){this.g.sync(w,m);if(!m.s.ownedRegions.includes(m.s.capital))m.s.capital=m.s.ownedRegions[0]||m.home;this.g.rank(w,m);}from.revision++;offer.status='completed';this.g.event(w,from.name+'と'+p.name+'が'+R.region(give.id).name+'と'+R.region(receive.id).name+'を交換した。','diplomacy');
   }else{offer.fromPlayers=w.players.filter(m=>this.inSide(w,m,offer.from)).map(m=>m.id);offer.toPlayers=w.players.filter(m=>this.inSide(w,m,offer.to)).map(m=>m.id);offer.status='active';offer.until=this.now()+(offer.durationHours??(offer.kind==='pact'?72:24))*3600000;this.g.event(w,offer.fromName+'と'+offer.toName+'が'+((offer.durationHours??(offer.kind==='pact'?72:24))+'時間の'+(offer.kind==='pact'?'不可侵条約':'停戦協定'))+'を結んだ。','diplomacy');}
   this.notify(w,involved,'diplomacy',offer.fromName+'と'+offer.toName+'の'+({exchange:'領土交換が成立しました。',pact:'不可侵条約が成立しました。',ceasefire:'停戦協定が成立しました。'}[offer.kind]));
   if(from.allianceId)this.honors(w,from.allianceId);if(p.allianceId)this.honors(w,p.allianceId);
  }
  return true;
 }
 expire(w){
  let changed=false;for(const t of w.diplomacy||[]){if(t.status==='active'&&t.until<=this.now()){t.status='expired';this.notify(w,w.players.filter(p=>this.inSide(w,p,t.from)||this.inSide(w,p,t.to)),'diplomacy',t.fromName+'と'+t.toName+'の協定が満了しました。');this.g.event(w,t.fromName+'と'+t.toName+'の協定が満了した。','diplomacy');changed=true;}if(t.status==='offered'&&t.expiresAt<=this.now()){t.status='expired';changed=true;}}
  if((w.supportRequests||[]).length>300){w.supportRequests=w.supportRequests.filter(s=>s.expiresAt+86400000>this.now());changed=true;}
  if((w.diplomacy||[]).length>300){w.diplomacy=w.diplomacy.filter(t=>t.status==='active'||t.expiresAt+604800000>this.now());changed=true;}return changed;
 }
 view(w,p,owner){
  const a=p&&this.g.alliances.group(w,p),alliance=a?this.stats(w,a):null,controls=this.control(owner);
  if(alliance){delete alliance.lands;delete alliance.members;alliance.posts=w.alliancePosts.filter(m=>m.allianceId===a.id).slice(-50);alliance.contribution=this.sql.exec('SELECT COALESCE(SUM(contribution),0) points FROM sengoku_alliance_activity WHERE allianceId=? AND playerId=?',a.id,p.id).toArray()[0].points;}
  return{version:T.version,allianceBuffsVersion:'alliance-buffs-20261101-v1',socialVersion:'social-20261101-v1',notifications:this.notifications(owner),admin:this.g.admin.isAdmin(owner),controls:{banned:!!controls.banned,accessUntil:controls.accessUntil,learningUntil:controls.learningUntil,chatUntil:controls.chatUntil,recruitMicros:controls.recruitMicros},attackFraction:p?.s.attackFraction||0,supportRequests:w.supportRequests.filter(s=>s.allianceId===a?.id&&!s.closedAt&&s.expiresAt>this.now()),publicSupports:w.supportRequests.filter(s=>s.allianceId===a?.id&&!s.closedAt&&s.expiresAt>this.now()).map(s=>({region:s.region,allianceId:s.allianceId})),diplomacy:w.diplomacy.filter(t=>p&&(this.inSide(w,p,t.from)||this.inSide(w,p,t.to)||(t.fromPlayers||[]).includes(p.id)||(t.toPlayers||[]).includes(p.id))).slice(-80),alliance,timeline:this.timeline(w.id).entries};
 }
 adminBoard(owner){
  if(!this.g.admin.isAdmin(owner))fail('admin-required',403);const map=new Map();for(let id=1;id<=G.WORLD_COUNT;id++){const w=this.g.read(id);for(const p of w.players){let item=map.get(p.owner);if(!item){item={targetId:p.id,name:this.g.profile(p.owner)?.name||p.name,worlds:[],control:this.control(p.owner),attackUntil:this.g.penalty(p.owner).until};delete item.control.owner;map.set(p.owner,item);}item.worlds.push({id,soldiers:T.troopCount(p.s),territories:p.s.ownedRegions.length,retired:!!p.retired});}}
  return{admin:true,entries:[...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja-JP')),audit:this.sql.exec('SELECT d.kind,d.value,d.at,COALESCE(a.name,g.name,\'参加者\') name FROM sengoku_admin_audit d LEFT JOIN player_accounts a ON a.owner=d.target LEFT JOIN sengoku_guest_profiles g ON g.owner=d.target ORDER BY d.id DESC LIMIT 30').toArray()};
 }
 adminAction(owner,data){
  if(!this.g.admin.isAdmin(owner))fail('admin-required',403);const allowed=['owner','requestId','targetId','kind','value','expectedRevision'];if(Object.keys(data).some(k=>!allowed.includes(k))||!safeId(data.targetId)||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision<0)fail('admin-input');
  const kinds=['ban','access','learning','chat','attack','recruit','reset_attack'];if(!kinds.includes(data.kind)||!Number.isSafeInteger(data.value)||data.value<0||data.kind==='ban'&&data.value>1||data.kind==='recruit'&&data.value>G.MAX_SOLDIERS*T.SCALE||['access','learning','chat','attack'].includes(data.kind)&&data.value>this.now()+10*366*86400000)fail('admin-input');
  const payload=JSON.stringify({targetId:data.targetId,kind:data.kind,value:data.value,expectedRevision:data.expectedRevision});let replayed=false;
  this.g.atomic(()=>{
   const receipt=this.sql.exec('SELECT payload FROM sengoku_admin_receipts WHERE actor=? AND requestId=?',owner,data.requestId).toArray()[0];if(receipt){if(receipt.payload!==payload)fail('world-request',409);replayed=true;return;}
   let target=null;for(let id=1;id<=G.WORLD_COUNT;id++){const p=this.g.read(id).players.find(p=>p.id===data.targetId);if(p){target=p.owner;break;}}if(!target)fail('record-gone',404);const c=this.control(target);if(c.revision!==data.expectedRevision)fail('admin-changed',409);
   const column={ban:'banned',access:'accessUntil',learning:'learningUntil',chat:'chatUntil',recruit:'recruitMicros'}[data.kind];this.sql.exec('INSERT OR IGNORE INTO sengoku_user_controls(owner) VALUES(?)',target);if(column)this.sql.exec('UPDATE sengoku_user_controls SET '+column+'=?,revision=revision+1 WHERE owner=?',data.kind==='recruit'&&data.value===0?null:data.value,target);else this.sql.exec('UPDATE sengoku_user_controls SET revision=revision+1 WHERE owner=?',target);
   if(data.kind==='attack')this.sql.exec('INSERT INTO sengoku_attack_penalties(owner,until,reason) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET until=excluded.until,reason=excluded.reason',target,data.value,'manual');
   for(let id=1;id<=G.WORLD_COUNT;id++){const w=this.g.read(id);let changed=false;for(const p of w.players.filter(p=>p.owner===target)){
    if((data.kind==='ban'&&data.value||data.kind==='access'&&data.value>this.now())&&p.s.pending||(data.kind==='reset_attack'||data.kind==='attack'&&data.value>this.now())&&p.s.pending?.mode==='battle')this.g.cancel(w,p,'restricted');
    if(data.kind==='reset_attack'){p.s.soldiers=0;p.s.attackFraction=0;}if(data.kind==='attack'){p.s.battleCooldownUntil=data.value;p.s.attackCooldownUntil=Math.min(p.s.attackCooldownUntil||0,data.value);p.s.failedAttackCooldownUntil=0;}if(data.kind==='recruit')p.s.recruitMicros=data.value||null;p.revision++;this.g.rank(w,p);changed=true;
   }if(changed)this.g.save(w);}
   this.sql.exec('INSERT INTO sengoku_admin_audit(actor,target,kind,value,at) VALUES(?,?,?,?,?)',owner,target,data.kind,String(data.value),this.now());this.sql.exec('INSERT INTO sengoku_admin_receipts(actor,requestId,payload) VALUES(?,?,?)',owner,data.requestId,payload);
  });return{...this.adminBoard(owner),replayed};
 }
}
