import '../../assets/ui/sengoku-rules.js';
import {sengokuQuestions} from './sengoku-questions.mjs';
const R=globalThis.HKSengokuRules,C=globalThis.HKCore,W=globalThis.HKWealthRules;
const questions=new Map(sengokuQuestions.map(q=>[q.id,q]));
export const sengokuRoutes=new Set(['/wealth/sengoku','/wealth/sengoku/board','/wealth/sengoku/action']);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const cap=n=>Math.min(1000000000,n),object=n=>n&&typeof n==='object'&&!Array.isArray(n);
const fields={start:['factionId'],recruit:['unit','count'],commander:['generalId'],upgrade:['generalId'],fortify:[],port:[],begin:['mode','target','formation','tactic'],answer:['battleId','index','choice'],next:['battleId','index'],retreat:['battleId'],campaign:['factionId'],publish:[]};
export class SengokuCampaign{
 constructor(storage,admin,accounts,isBanned){
  this.storage=storage;this.sql=storage.sql;this.admin=admin;this.accounts=accounts;this.isBanned=isBanned;this.now=()=>Date.now();
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_campaigns(owner TEXT PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL,updatedAt INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_receipts(owner TEXT NOT NULL,requestId TEXT NOT NULL,payload TEXT NOT NULL,effect TEXT NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(owner,requestId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_scores(owner TEXT PRIMARY KEY,name TEXT NOT NULL,territories INTEGER NOT NULL,defeated INTEGER NOT NULL,merit INTEGER NOT NULL,wins INTEGER NOT NULL,unifications INTEGER NOT NULL,fastestMs INTEGER,achievedAt INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_score_order ON sengoku_scores(territories DESC,defeated DESC,merit DESC,achievedAt,owner)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_weeks(owner TEXT NOT NULL,week TEXT NOT NULL,merit INTEGER NOT NULL,achievedAt INTEGER NOT NULL,PRIMARY KEY(owner,week))');
 }
 atomic(work){return this.storage.transactionSync?this.storage.transactionSync(work):work();}
 row(owner){return this.sql.exec('SELECT state,revision,updatedAt FROM sengoku_campaigns WHERE owner=?',owner).toArray()[0];}
 account(owner){const a=this.accounts.row(owner);return{signedIn:!!a,name:a?.name||null};}
 question(p){
  const item=p.questions[p.index],q=item.snapshot||questions.get(item.id);
  return{id:q.id,prompt:q.prompt,choices:item.order.map(i=>q.choices[i]),...(q.eraTitle?{eraTitle:q.eraTitle}:{})};
 }
 view(owner){
  const row=this.row(owner);if(!row)return{owner,state:null,revision:0,account:this.account(owner),protocol:'sengoku-v1'};
  const s=JSON.parse(row.state),p=s.pending;
  if(p)s.pending={id:p.id,mode:p.mode,target:p.target,formation:p.formation,tactic:p.tactic,cost:p.cost,index:p.index,phase:p.phase,correct:p.answers.filter(a=>a.correct).length,question:p.phase==='question'?this.question(p):null,feedback:p.phase==='review'?p.answers.at(-1):null};
  return{owner,state:s,revision:row.revision,updatedAt:row.updatedAt,account:this.account(owner),protocol:'sengoku-v1'};
 }
 shuffle(list){const a=[...list];for(let i=a.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
 deck(bank=sengokuQuestions){return this.shuffle(bank).slice(0,5).map(q=>({id:q.id,snapshot:{...q,choices:[...q.choices]},order:this.shuffle([0,1,2,3])}));}
 earn(s,owner,amount,now){
  s.resources.militaryMerit=cap(s.resources.militaryMerit+amount);s.totalMerit=cap(s.totalMerit+amount);
  const week=C.weekKey(new Date(now));s.week=s.week.key===week?s.week:{key:week,merit:0};s.week.merit=cap(s.week.merit+amount);
  this.sql.exec('INSERT INTO sengoku_weeks(owner,week,merit,achievedAt) VALUES(?,?,?,?) ON CONFLICT(owner,week) DO UPDATE SET merit=excluded.merit,achievedAt=CASE WHEN sengoku_weeks.merit=excluded.merit THEN sengoku_weeks.achievedAt ELSE excluded.achievedAt END',owner,week,s.week.merit,now);
 }
 rank(s,owner,now){
  if(!s.published)return;
  const name=this.accounts.row(owner)?.name;if(!name||this.isBanned(owner)||W.blockedName(name,this.admin.words()))return;
  const old=this.sql.exec('SELECT territories,defeated,merit,achievedAt FROM sengoku_scores WHERE owner=?',owner).toArray()[0],defeated=s.defeatedRegions.length;
  const achievedAt=old&&old.territories===s.bestTerritories&&old.defeated===defeated&&old.merit===s.totalMerit?old.achievedAt:now;
  this.sql.exec('INSERT INTO sengoku_scores(owner,name,territories,defeated,merit,wins,unifications,fastestMs,achievedAt) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,territories=excluded.territories,defeated=excluded.defeated,merit=excluded.merit,wins=excluded.wins,unifications=excluded.unifications,fastestMs=excluded.fastestMs,achievedAt=excluded.achievedAt',owner,name,s.bestTerritories,defeated,s.totalMerit,s.battlesWon,s.unifications,s.fastestMs,achievedAt);
 }
 board(owner,period='alltime'){
  if(!['alltime','weekly'].includes(period))fail('sengoku-input');
  const week=C.weekKey(new Date(this.now())),words=this.admin.words(),weekly=period==='weekly';
  const rows=this.sql.exec(weekly?'SELECT s.*,w.merit AS weekMerit,w.achievedAt AS weekAt FROM sengoku_scores s JOIN sengoku_weeks w ON s.owner=w.owner WHERE w.week=?':'SELECT * FROM sengoku_scores',...(weekly?[week]:[])).toArray().filter(row=>!this.isBanned(row.owner)&&!W.blockedName(row.name,words));
  rows.sort((a,b)=>weekly?b.weekMerit-a.weekMerit||a.weekAt-b.weekAt||a.owner.localeCompare(b.owner):b.territories-a.territories||b.defeated-a.defeated||b.merit-a.merit||a.achievedAt-b.achievedAt||a.owner.localeCompare(b.owner));
  const entries=rows.map((r,i)=>({id:r.owner,name:r.name,territories:r.territories,defeated:r.defeated,merit:r.merit,wins:r.wins,unifications:r.unifications,fastestMs:r.fastestMs,weekMerit:r.weekMerit||0,rank:i+1,achievedAt:r.achievedAt}));
  return{entries:entries.slice(0,100),own:entries.find(r=>r.id===owner)||null,total:entries.length,period,week,at:this.now()};
 }
 finish(s,owner,now){
  const p=s.pending,correct=p.answers.filter(a=>a.correct).length,train=p.mode==='training',foe=train?null:R.enemy(s,p.target),attack=train?0:R.power(s,p.formation,p.tactic,correct,p.target),won=!train&&attack>=foe.army;
  let merit=correct*10+(won?foe.reward:0),food=0,added=0;const unlocked=[];
  if(train){food=25+correct*25;added=Math.min(correct*20,Math.max(0,R.capacity(s)-R.troops(s.army)));s.army.infantry+=added;}
  else if(won){
   s.ownedRegions.push(p.target);s.bestTerritories=Math.max(s.bestTerritories,s.ownedRegions.length);s.defeatedRegions=[...new Set([...s.defeatedRegions,p.target])];s.battlesWon++;
   food=75+foe.tier*25;const day=C.dayKey(new Date(now));if(s.lastDailyWin!==day){food+=100;s.lastDailyWin=day;}
   for(const [id,g]of Object.entries(R.generals))if(!s.generals.some(a=>a.id===id)&&(g.region&&s.ownedRegions.includes(g.region)||g.milestone&&s.ownedRegions.length>=g.milestone)){s.generals.push({id,level:1,experience:0});unlocked.push(id);}
   if(s.ownedRegions.length>=25&&!s.claimedRewards.includes('golden-banner')){s.claimedRewards.push('golden-banner');unlocked.push('golden-banner');}
   if(s.ownedRegions.length===47){s.unifications++;s.fastestMs=Math.min(s.fastestMs??Infinity,Math.max(1,now-s.startedAt));if(!s.claimedRewards.includes('unification-castle')){s.claimedRewards.push('unification-castle');unlocked.push('unification-castle');}}
  }else{s.battlesLost++;food=Math.floor(p.cost*.75);}
  s.resources.food=cap(s.resources.food+food);this.earn(s,owner,merit,now);s.totalCorrect=cap(s.totalCorrect+correct);
  s.learnedCards=[...new Set([...s.learnedCards,...p.answers.filter(a=>a.correct).map(a=>a.id)])];
  const g=R.active(s);g.experience+=correct*10+(won?20:0);while(g.level<20&&g.experience>=g.level*100){g.experience-=g.level*100;g.level++;}if(g.level===20)g.experience=0;
  s.lastResult={id:p.id,mode:p.mode,outcome:train?'training':won?'victory':'defeat',target:p.target,correct,attack,defense:foe?.army||0,merit,food,spentFood:p.cost,added,unlocked,review:p.answers,at:now};s.pending=null;
 }
 apply(s,data,owner,now){
  const type=data.type;
  if(s.pending&&!['answer','next','retreat','publish'].includes(type))fail('sengoku-pending',409);
  if(type==='recruit'){
   if(!R.keys.includes(data.unit)||!Number.isSafeInteger(data.count)||data.count<50||data.count>1000||data.count%50)fail('sengoku-input');
   if(R.troops(s.army)+data.count>R.capacity(s))fail('sengoku-capacity');const cost=Math.ceil(data.count*R.units[data.unit].cost/100);if(s.resources.food<cost)fail('sengoku-food');s.resources.food-=cost;s.army[data.unit]+=data.count;
  }else if(type==='commander'){
   if(!s.generals.some(g=>g.id===data.generalId))fail('sengoku-general');s.activeGeneral=data.generalId;
  }else if(type==='upgrade'){
   const g=s.generals.find(g=>g.id===data.generalId);if(!g||g.level>=20)fail('sengoku-general');const cost=g.level*80;if(s.resources.militaryMerit<cost)fail('sengoku-merit');s.resources.militaryMerit-=cost;g.level++;g.experience=0;
  }else if(type==='fortify'){
   if(s.fortLevel>=10)fail('sengoku-max');const merit=s.fortLevel*120,food=s.fortLevel*50;if(s.resources.militaryMerit<merit)fail('sengoku-merit');if(s.resources.food<food)fail('sengoku-food');s.resources.militaryMerit-=merit;s.resources.food-=food;s.fortLevel++;
  }else if(type==='port'){
   if(s.port||s.ownedRegions.length<3||s.fortLevel<2)fail('sengoku-port');if(s.resources.militaryMerit<150)fail('sengoku-merit');if(s.resources.food<100)fail('sengoku-food');s.resources.militaryMerit-=150;s.resources.food-=100;s.port=true;
  }else if(type==='begin'){
   if(!['training','battle'].includes(data.mode))fail('sengoku-input');
   let target=null,a=R.formation(s),tactic='balanced',cost=0;
   if(data.mode==='battle'){
    if(!R.region(data.target))fail('sengoku-region');if(!R.reachable(s,data.target))fail('sengoku-route');if(!Object.hasOwn(R.tactics,data.tactic))fail('sengoku-input');if(!R.validFormation(s,data.formation))fail('sengoku-formation');
    target=data.target;a=data.formation;tactic=data.tactic;cost=R.foodCost(s,a,tactic);if(s.resources.food<cost)fail('sengoku-food');s.resources.food-=cost;
   }
   s.pending={id:crypto.randomUUID(),mode:data.mode,target,formation:a,tactic,cost,index:0,phase:'question',questions:this.deck(),answers:[],startedAt:now};
  }else if(type==='answer'||type==='next'||type==='retreat'){
   const p=s.pending;if(!p||p.id!==data.battleId)fail('sengoku-battle',409);
   if(type==='retreat'){
    const refund=Math.floor(p.cost*.75);s.resources.food=cap(s.resources.food+refund);s.lastResult={id:p.id,mode:p.mode,outcome:'retreat',target:p.target,correct:p.answers.filter(a=>a.correct).length,merit:0,food:refund,spentFood:p.cost,added:0,unlocked:[],review:p.answers,at:now};s.pending=null;
   }else{
    if(data.index!==p.index)fail('sengoku-conflict',409);
    if(type==='next'){if(p.phase!=='review')fail('sengoku-phase',409);p.index++;p.phase='question';}
    else{
     if(p.phase!=='question')fail('sengoku-phase',409);if(!Number.isSafeInteger(data.choice)||data.choice<0||data.choice>3)fail('sengoku-input');
     const item=p.questions[p.index],q=item.snapshot||questions.get(item.id),selected=item.order[data.choice];p.answers.push({id:q.id,prompt:q.prompt,correct:selected===q.answer,chosen:q.choices[selected],correctText:q.choices[q.answer],explanation:q.explanation,source:q.source});
     if(p.index===4)this.finish(s,owner,now);else p.phase='review';
    }
   }
  }else if(type==='campaign'){
   const f=R.faction(data.factionId);if(!f)fail('sengoku-input');if(s.ownedRegions.length!==47)fail('sengoku-unfinished');s.factionId=f.id;s.capital=f.capital;s.ownedRegions=[f.capital];s.activeGeneral=f.general;s.startedAt=now;s.lastResult=null;
  }else if(type==='publish'){
   const a=this.accounts.row(owner);if(!a)fail('sengoku-account',401);if(W.blockedName(a.name,this.admin.words()))fail('nickname-blocked');s.published=true;
  }else fail('sengoku-input');
 }
 mutate(data){
  const owner=data.owner,type=data.type;
  if(!Object.hasOwn(fields,type)||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||!Number.isSafeInteger(data.revision)||data.revision<0)fail('sengoku-input');
  const allowed=['owner','type','requestId','revision',...fields[type]];if(Object.keys(data).some(k=>!allowed.includes(k)))fail('sengoku-input');
  const payload=JSON.stringify(Object.fromEntries(['type','revision',...fields[type]].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])));
  let replayed=false;
  this.atomic(()=>{
   const receipt=this.sql.exec('SELECT payload FROM sengoku_receipts WHERE owner=? AND requestId=?',owner,data.requestId).toArray()[0];
   if(receipt){if(receipt.payload!==payload)fail('sengoku-request',409);replayed=true;return;}
   const row=this.row(owner);if(data.revision!==(row?.revision||0))fail('sengoku-conflict',409);const now=this.now();let s;
   if(type==='start'){if(row)fail('sengoku-started',409);if(!R.faction(data.factionId))fail('sengoku-input');s=R.initial(data.factionId,now);}
   else{if(!row)fail('sengoku-not-started',409);s=JSON.parse(row.state);this.apply(s,data,owner,now);}
   this.rank(s,owner,now);
   this.sql.exec('INSERT INTO sengoku_campaigns(owner,state,revision,updatedAt) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET state=excluded.state,revision=excluded.revision,updatedAt=excluded.updatedAt',owner,JSON.stringify(s),(row?.revision||0)+1,now);
   this.sql.exec('INSERT INTO sengoku_receipts(owner,requestId,payload,effect,createdAt) VALUES(?,?,?,?,?)',owner,data.requestId,payload,'{}',now);
  });
  return{...this.view(owner),replayed};
 }
 fetch(path,data){
  try{
   if(path==='/wealth/sengoku/board')return Response.json(this.board(data.owner,data.period));
   if(!/^[a-f0-9]{64}$/.test(data.owner||''))fail('identity-required',401);if(this.isBanned(data.owner))fail('banned',403);
   if(path==='/wealth/sengoku')return Response.json(this.view(data.owner));
   return Response.json(this.mutate(data));
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
