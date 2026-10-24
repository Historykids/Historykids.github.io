import '../../assets/ui/sengoku-world-rules.js';
const R=globalThis.HKSengokuRules,G=globalThis.HKSengokuWorldRules,W=globalThis.HKWealthRules;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const fields={join:['region','factionId','worldId'],train:[],begin:['target','regionRevision','formation','tactic'],answer:['battleId','index','choice'],next:['battleId','index'],retreat:['battleId'],guard:['formation','tactic'],recruit:['unit','count'],upgrade:['generalId'],commander:['generalId'],fortify:[],respawn:['region'],leave:[]};
export const worldRoutes=new Set(['/wealth/sengoku/worlds','/wealth/sengoku/world','/wealth/sengoku/world/action']);
export class SengokuWorlds{
 constructor(storage,accounts,admin,campaign,isBanned){
  this.storage=storage;this.sql=storage.sql;this.accounts=accounts;this.admin=admin;this.campaign=campaign;this.isBanned=isBanned;this.now=()=>Date.now();
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_worlds(id INTEGER PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL,updatedAt INTEGER NOT NULL,summary TEXT NOT NULL,recruiting INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_world_open ON sengoku_worlds(recruiting,id)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_members(owner TEXT PRIMARY KEY,worldId INTEGER NOT NULL,playerId TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_receipts(owner TEXT NOT NULL,requestId TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(owner,requestId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_world_rewards(owner TEXT NOT NULL,reward TEXT NOT NULL,PRIMARY KEY(owner,reward))');
 }
 atomic(fn){return this.storage.transactionSync(fn);}
 member(owner){return this.sql.exec('SELECT worldId,playerId FROM sengoku_world_members WHERE owner=?',owner).toArray()[0];}
 row(id){return this.sql.exec('SELECT state FROM sengoku_worlds WHERE id=?',id).toArray()[0];}
 read(id){const row=this.row(id);return row?JSON.parse(row.state):null;}
 summary(w){return{id:w.id,players:w.players.length,capacity:G.LIMIT,status:w.status,joinable:this.recruitable(w),available:w.regions.filter(r=>!r.owner&&!r.battle).map(r=>r.id),winner:w.winner,createdAt:w.createdAt};}
 save(w){w.revision++;w.updatedAt=this.now();this.sql.exec('INSERT INTO sengoku_worlds(id,state,revision,updatedAt,summary,recruiting) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,revision=excluded.revision,updatedAt=excluded.updatedAt,summary=excluded.summary,recruiting=excluded.recruiting',w.id,JSON.stringify(w),w.revision,w.updatedAt,JSON.stringify(this.summary(w)),Number(this.recruitable(w)));}
 create(){const id=(this.sql.exec('SELECT MAX(id) AS n FROM sengoku_worlds').toArray()[0].n||0)+1,w={id,revision:0,createdAt:this.now(),updatedAt:this.now(),status:'open',players:[],regions:R.regions.map(r=>({id:r.id,owner:null,revision:0,protectedUntil:0})),events:[],winner:null};this.save(w);return w;}
 recruitable(w){return w.status==='open'&&w.players.length<G.LIMIT&&w.regions.some(r=>!r.owner&&!r.battle);}
 event(w,text){w.events.unshift({id:crypto.randomUUID(),text,at:this.now()});w.events=w.events.slice(0,30);}
 sync(w,p){p.s.ownedRegions=w.regions.filter(r=>r.owner===p.id).map(r=>r.id);p.s.bestTerritories=Math.max(p.s.bestTerritories,p.s.ownedRegions.length);}
 rewards(owner){return this.sql.exec('SELECT reward FROM sengoku_world_rewards WHERE owner=?',owner).toArray().map(r=>r.reward);}
 pending(q){if(!q)return null;return{id:q.id,mode:q.mode,target:q.target,index:q.index,phase:q.phase,correct:q.answers.filter(a=>a.correct).length,deadline:q.deadline,formation:q.formation,tactic:q.tactic,cost:q.cost,defenderName:q.defenderName,defense:q.defense,question:q.phase==='question'?this.campaign.question(q):null,feedback:q.phase==='review'?q.answers.at(-1):null};}
 publicWorld(w){
  const visibleName=p=>this.isBanned(p.owner)||W.blockedName(p.name,this.admin.words())?'参加者':p.name;
  return{id:w.id,revision:w.revision,createdAt:w.createdAt,updatedAt:w.updatedAt,status:w.status,capacity:G.LIMIT,joinable:this.recruitable(w),winner:w.winner,regions:w.regions.map(r=>({...r})),players:w.players.map(p=>({id:p.id,name:visibleName(p),home:p.home,territories:p.s.ownedRegions.length,best:p.s.bestTerritories,merit:p.s.totalMerit,wins:p.s.battlesWon,retired:!!p.retired,level:R.active(p.s).level,generalId:R.active(p.s).id,fortLevel:p.s.fortLevel,factionId:p.s.factionId,defense:G.guard(p),incoming:p.incoming?{region:p.incoming.region,deadline:p.incoming.deadline}:null})),events:w.events};
 }
 view(owner,requested){
  const member=this.member(owner),id=requested||member?.worldId,w=id?this.read(id):null,p=w&&member?.worldId===w.id?w.players.find(p=>p.id===member.playerId):null;
  const account=this.accounts.row(owner);let own=null;
  if(p){const s={...p.s,pending:this.pending(p.s.pending)};own={id:p.id,name:p.name,home:p.home,revision:p.revision,state:s,defense:G.guard(p),incoming:p.incoming?{...p.incoming}:null,lastDefense:p.lastDefense||null};}
  return{protocol:'sengoku-world-v1',account:{signedIn:!!account,name:account?.name||null},world:w?this.publicWorld(w):null,own,activeWorldId:member?.worldId||null,rewards:this.rewards(owner),at:this.now()};
 }
 list(owner){
  const rows=this.sql.exec('SELECT summary FROM sengoku_worlds ORDER BY id DESC LIMIT 60').toArray(),member=this.member(owner);
  return{protocol:'sengoku-world-v1',capacity:G.LIMIT,activeWorldId:member?.worldId||null,worlds:rows.map(row=>JSON.parse(row.summary))};
 }
 tick(w){
  let changed=false;
  for(const p of w.players){const q=p.s.pending;if(q&&q.deadline<=this.now()){this.cancel(w,p,'timeout');p.revision++;changed=true;}}
  if(changed)this.save(w);
 }
 cancel(w,p,outcome='retreat'){
  const q=p.s.pending;if(!q)return;
  const refund=q.mode==='battle'?Math.floor(q.cost*.75):0;p.s.resources.food=Math.min(1e9,p.s.resources.food+refund);
  p.s.lastResult={id:q.id,outcome,mode:q.mode,target:q.target,correct:q.answers.filter(a=>a.correct).length,merit:0,food:refund,cost:q.cost,review:q.answers,at:this.now()};
  const region=w.regions.find(r=>r.id===q.target);if(region?.battle?.id===q.id)delete region.battle;
  const defender=w.players.find(d=>d.id===q.defenderId);if(defender?.incoming?.id===q.id){defender.incoming=null;defender.revision++;}
  p.s.pending=null;
 }
 grow(p,amount,correct,won){
  const s=p.s;s.resources.militaryMerit=Math.min(1e9,s.resources.militaryMerit+amount);s.totalMerit=Math.min(1e9,s.totalMerit+amount);s.totalCorrect=Math.min(1e9,s.totalCorrect+correct);
  const g=R.active(s);g.experience+=correct*10+(won?20:0);while(g.level<20&&g.experience>=g.level*100){g.experience-=g.level*100;g.level++;}
 }
 finish(w,p){
  const q=p.s.pending,s=p.s,correct=q.answers.filter(a=>a.correct).length,training=q.mode==='training';let won=false,attack=0,merit=correct*10,food=0,added=0;
  if(training){food=25+correct*25;added=Math.min(correct*20,Math.max(0,R.capacity(s)-R.troops(s.army)));s.army.infantry+=added;p.guardQuiz=correct;}
  else{
   const region=w.regions.find(r=>r.id===q.target);if(region.owner!==q.defenderId||region.battle?.id!==q.id)fail('world-changed',409);
   attack=G.power(s,q.formation,q.tactic,correct,q.enemyFormation);won=attack>q.defense;
   const defender=w.players.find(d=>d.id===q.defenderId);
   if(won){region.owner=p.id;region.revision++;region.protectedUntil=this.now()+30000;s.battlesWon++;s.defeatedRegions=[...new Set([...s.defeatedRegions,q.target])];merit+=R.region(q.target).tier>=4?300:100;food=150;
    this.sync(w,p);if(defender){this.sync(w,defender);defender.s.battlesLost++;}
    this.event(w,p.name+'が'+R.region(q.target).name+'を攻略'+(defender?'（'+defender.name+'の領土）':'（守備隊）'));
    for(const [id,g]of Object.entries(R.generals))if(!s.generals.some(a=>a.id===id)&&(g.region&&s.ownedRegions.includes(g.region)||g.milestone&&s.ownedRegions.length>=g.milestone))s.generals.push({id,level:1,experience:0});
    if(s.ownedRegions.length>=25&&!s.claimedRewards.includes('golden-banner'))s.claimedRewards.push('golden-banner');
   }else{s.battlesLost++;food=Math.floor(q.cost*.75);this.event(w,p.name+'の'+R.region(q.target).name+'への進軍を守備隊が退けた');}
   delete region.battle;if(defender){defender.incoming=null;defender.lastDefense={attacker:p.name,region:q.target,won:!won,at:this.now()};defender.revision++;}
  }
  s.resources.food=Math.min(1e9,s.resources.food+food);this.grow(p,merit,correct,won);s.learnedCards=[...new Set([...s.learnedCards,...q.answers.filter(a=>a.correct).map(a=>a.id)])];
  s.lastResult={id:q.id,mode:q.mode,outcome:training?'training':won?'victory':'defeat',target:q.target,correct,attack,defense:q.defense||0,merit,food,cost:q.cost,added,review:q.answers,at:this.now()};s.pending=null;
  if(won&&s.ownedRegions.length===47){w.status='finished';w.winner={id:p.id,name:p.name,at:this.now()};s.unifications++;if(!s.claimedRewards.includes('unification-castle'))s.claimedRewards.push('unification-castle');this.sql.exec('INSERT OR IGNORE INTO sengoku_world_rewards(owner,reward) VALUES(?,?)',p.owner,'unification-castle');this.event(w,p.name+'が天下統一を達成！');for(const other of w.players)if(other.s.pending){this.cancel(w,other,'world-finished');other.revision++;}}
 }
 join(owner,data){
  if(this.member(owner))fail('world-already-joined',409);if(data.revision!==0||!R.region(data.region)||!R.faction(data.factionId)||!(data.worldId==='auto'||Number.isSafeInteger(data.worldId)&&data.worldId>0))fail('world-input');
  const possible=w=>w&&this.recruitable(w)&&!w.players.some(p=>p.owner===owner)&&w.regions.some(r=>r.id===data.region&&!r.owner&&!r.battle);
  let w=data.worldId==='auto'?null:this.read(data.worldId);if(!possible(w))w=null;
  if(!w){const rows=this.sql.exec('SELECT id,summary FROM sengoku_worlds WHERE recruiting=1 ORDER BY id LIMIT 1000').toArray().filter(r=>JSON.parse(r.summary).available.includes(data.region));for(const row of rows.slice(0,50)){const candidate=this.read(row.id);if(possible(candidate)){w=candidate;break;}}}w||=this.create();
  const s=R.initial(data.factionId,this.now());s.capital=data.region;s.ownedRegions=[data.region];s.port=true;
  const account=this.accounts.row(owner),p={id:crypto.randomUUID(),owner,name:account.name,home:data.region,s,revision:1,guard:null,guardQuiz:0,incoming:null,joinedAt:this.now()};w.players.push(p);
  const region=w.regions.find(r=>r.id===data.region);region.owner=p.id;region.revision++;region.protectedUntil=this.now()+G.PROTECTION;
  this.sql.exec('INSERT INTO sengoku_world_members(owner,worldId,playerId) VALUES(?,?,?)',owner,w.id,p.id);this.event(w,p.name+'が'+R.region(data.region).name+'で旗を掲げた');this.save(w);
  if(!this.recruitable(w)&&!this.sql.exec('SELECT id FROM sengoku_worlds WHERE recruiting=1 AND id<>? LIMIT 1',w.id).toArray().length)this.create();
 }
 apply(w,p,data){
  const s=p.s,type=data.type;if(data.revision!==p.revision)fail('world-conflict',409);
  if(w.status==='finished'&&type!=='leave')fail('world-finished',409);
  if(s.pending&&!['answer','next','retreat'].includes(type))fail('world-pending',409);
  if(p.incoming&&['begin','guard','commander','leave','respawn'].includes(type))fail('world-incoming',409);
  if(type==='train'||type==='begin'){
   if(type==='begin'&&!s.ownedRegions.length)fail('world-eliminated');let target=null,formation=R.formation(s),tactic='balanced',cost=0,defenderId=null,defenderName='守備隊',enemyFormation=null,defense=0;
   if(type==='begin'){
    const region=w.regions.find(r=>r.id===data.target);if(!region||!R.reachable(s,region.id))fail('world-route');if(region.revision!==data.regionRevision)fail('world-changed',409);if(region.protectedUntil>this.now())fail('world-protected',409);if(region.battle)fail('world-busy',409);
    if(!R.validFormation(s,data.formation)||!Object.hasOwn(R.tactics,data.tactic))fail('world-formation');
    const defender=w.players.find(a=>a.id===region.owner);if(defender&&(defender.incoming||defender.s.pending?.mode==='battle'))fail('world-busy',409);
    target=region.id;formation=data.formation;tactic=data.tactic;cost=R.foodCost(s,formation,tactic);if(s.resources.food<cost)fail('sengoku-food');s.resources.food-=cost;
    if(defender){const guard=G.guard(defender);defenderId=defender.id;defenderName=defender.name;enemyFormation=guard.formation;defense=G.power(defender.s,guard.formation,guard.tactic,guard.correct,formation);}
    else{const foe=R.enemy(s,region.id);enemyFormation=Object.fromEntries(R.keys.map(k=>[k,k===foe.unit?foe.army:0]));defense=foe.army;}
   }
   const q={id:crypto.randomUUID(),mode:type==='train'?'training':'battle',target,formation,tactic,cost,index:0,phase:'question',questions:this.campaign.deck(),answers:[],deadline:this.now()+G.BATTLE_TIME,defenderId,defenderName,enemyFormation,defense};s.pending=q;
   if(target){const region=w.regions.find(r=>r.id===target);region.battle={id:q.id,attacker:p.id,deadline:q.deadline};const defender=w.players.find(d=>d.id===defenderId);if(defender){defender.incoming={id:q.id,attacker:p.name,region:target,deadline:q.deadline};defender.revision++;}for(const r of w.regions.filter(r=>r.owner===p.id))r.protectedUntil=Math.min(r.protectedUntil,this.now());}
  }else if(['answer','next','retreat'].includes(type)){
   const q=s.pending;if(!q||q.id!==data.battleId)fail('world-battle',409);
   if(type==='retreat')this.cancel(w,p);
   else{if(q.index!==data.index)fail('world-conflict',409);if(type==='next'){if(q.phase!=='review')fail('world-conflict',409);q.index++;q.phase='question';}
    else{if(q.phase!=='question')fail('world-conflict',409);if(!Number.isSafeInteger(data.choice)||data.choice<0||data.choice>3)fail('world-input');const item=q.questions[q.index],question=item.snapshot,chosen=item.order[data.choice];q.answers.push({id:question.id,prompt:question.prompt,correct:chosen===question.answer,chosen:question.choices[chosen],correctText:question.choices[question.answer],explanation:question.explanation,source:question.source});if(q.index===4)this.finish(w,p);else q.phase='review';}}
  }else if(type==='guard'){
   if(!R.validFormation(s,data.formation)||!Object.hasOwn(R.tactics,data.tactic))fail('world-formation');p.guard={formation:data.formation,tactic:data.tactic};
  }else if(type==='recruit'){
   if(!R.keys.includes(data.unit)||!Number.isSafeInteger(data.count)||data.count<50||data.count>1000||data.count%50)fail('world-input');if(R.troops(s.army)+data.count>R.capacity(s))fail('sengoku-capacity');const cost=Math.ceil(data.count*R.units[data.unit].cost/100);if(s.resources.food<cost)fail('sengoku-food');s.resources.food-=cost;s.army[data.unit]+=data.count;
  }else if(type==='fortify'){
   if(s.fortLevel>=10)fail('sengoku-max');const merit=s.fortLevel*120,food=s.fortLevel*50;if(s.resources.militaryMerit<merit)fail('sengoku-merit');if(s.resources.food<food)fail('sengoku-food');s.resources.militaryMerit-=merit;s.resources.food-=food;s.fortLevel++;
  }else if(type==='commander'){
   if(!s.generals.some(g=>g.id===data.generalId))fail('sengoku-general');s.activeGeneral=data.generalId;
  }else if(type==='upgrade'){
   const g=s.generals.find(g=>g.id===data.generalId);if(!g||g.level>=20)fail('sengoku-general');if(s.resources.militaryMerit<g.level*80)fail('sengoku-merit');s.resources.militaryMerit-=g.level*80;g.level++;g.experience=0;
  }else if(type==='respawn'){
   const region=w.regions.find(r=>r.id===data.region);if(s.ownedRegions.length||!region||region.owner||region.battle)fail('world-respawn');region.owner=p.id;region.revision++;region.protectedUntil=this.now()+G.PROTECTION;s.capital=region.id;this.sync(w,p);this.event(w,p.name+'が'+R.region(region.id).name+'で再起した');
  }else if(type==='leave'){
   if(w.status!=='finished')for(const region of w.regions.filter(r=>r.owner===p.id)){region.owner=null;region.revision++;region.protectedUntil=0;delete region.battle;}p.retired=true;this.sync(w,p);this.sql.exec('DELETE FROM sengoku_world_members WHERE owner=?',p.owner);this.event(w,p.name+'がワールドを離れた');
  }else fail('world-input');p.revision++;this.save(w);
 }
 mutate(owner,data){
  if(!this.accounts.row(owner))fail('world-account',401);if(this.isBanned(owner))fail('banned',403);if(W.blockedName(this.accounts.row(owner).name,this.admin.words()))fail('nickname-blocked');
  if(!Object.hasOwn(fields,data.type)||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||!Number.isSafeInteger(data.revision)||data.revision<0)fail('world-input');
  const allowed=['owner','type','requestId','revision',...fields[data.type]];if(Object.keys(data).some(k=>!allowed.includes(k)))fail('world-input');
  const payload=JSON.stringify(Object.fromEntries(['type','revision',...fields[data.type]].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])));let replayed=false;
  this.atomic(()=>{
   const old=this.sql.exec('SELECT payload FROM sengoku_world_receipts WHERE owner=? AND requestId=?',owner,data.requestId).toArray()[0];if(old){if(old.payload!==payload)fail('world-request',409);replayed=true;return;}
   if(data.type==='join')this.join(owner,data);
   else{const member=this.member(owner);if(!member)fail('world-not-joined',409);const w=this.read(member.worldId);this.tick(w);const p=w.players.find(p=>p.id===member.playerId);this.apply(w,p,data);}
   this.sql.exec('INSERT INTO sengoku_world_receipts(owner,requestId,payload) VALUES(?,?,?)',owner,data.requestId,payload);
  });return{...this.view(owner),replayed};
 }
 fetch(path,data){
  try{
   if(path==='/wealth/sengoku/worlds')return Response.json(this.list(data.owner));
   if(path==='/wealth/sengoku/world'){
    if(data.worldId!==undefined&&(!Number.isSafeInteger(data.worldId)||data.worldId<1))fail('world-input');const id=data.worldId||this.member(data.owner)?.worldId;if(id){this.atomic(()=>{const w=this.read(id);if(!w)fail('world-not-found',404);this.tick(w);});}return Response.json(this.view(data.owner,data.worldId));
   }
   return Response.json(this.mutate(data.owner,data));
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
