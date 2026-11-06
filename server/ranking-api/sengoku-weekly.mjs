const G=globalThis.HKSengokuWorldRules,DAY=86400000,WEEK=7*DAY,JST=9*3600000;
export function weekStart(at){const d=new Date(at+JST);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-(d.getUTCDay()+6)%7)-JST;}
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const order=(a,b)=>b.wins-a.wins||(BigInt(a.damageExact)===BigInt(b.damageExact)?0:BigInt(a.damageExact)>BigInt(b.damageExact)?-1:1)||a.achievedAt-b.achievedAt||a.id.localeCompare(b.id);
const addDamage=(entry,damage)=>{entry.damageExact=(BigInt(entry.damageExact)+BigInt(damage)).toString();entry.damage=Number(BigInt(entry.damageExact)>BigInt(Number.MAX_SAFE_INTEGER)?BigInt(Number.MAX_SAFE_INTEGER):BigInt(entry.damageExact));};
export class SengokuWeekly{
 constructor(game){this.g=game;this.sql=game.sql;this.enabled=true;
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_weekly_meta(id INTEGER PRIMARY KEY,startedAt INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_weekly_battles(id TEXT PRIMARY KEY,week INTEGER NOT NULL,worldId INTEGER NOT NULL,owner TEXT NOT NULL,playerId TEXT NOT NULL,name TEXT NOT NULL,allianceId TEXT,allianceName TEXT,wins INTEGER NOT NULL,damage INTEGER NOT NULL,at INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_weekly_battle_order ON sengoku_weekly_battles(worldId,week,at)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_weekly_settlements(worldId INTEGER NOT NULL,week INTEGER NOT NULL,result TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(worldId,week))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_weekly_rewards(worldId INTEGER NOT NULL,week INTEGER NOT NULL,owner TEXT NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,rank INTEGER NOT NULL,claimedAt INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(worldId,week,owner,kind))');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_weekly_reward_owner ON sengoku_weekly_rewards(owner,worldId,claimedAt)');
 }
 ensure(){if(this.enabled)this.sql.exec('INSERT OR IGNORE INTO sengoku_weekly_meta(id,startedAt) VALUES(1,?)',this.g.now());}
 eligible(p){return p&&!p.retired&&!this.g.isBanned(p.owner)&&!globalThis.HKWealthRules.blockedName(this.g.profile(p.owner)?.name||p.name,this.g.admin.words());}
 record(w,p,q,captured,damage){if(!this.enabled)return;this.ensure();this.sql.exec('INSERT OR IGNORE INTO sengoku_weekly_battles(id,week,worldId,owner,playerId,name,wins,damage,at) VALUES(?,?,?,?,?,?,?,?,?)',q.id,weekStart(this.g.now()),w.id,p.owner,p.id,p.name,captured?1:0,Math.max(0,Math.floor(damage)),this.g.now());}
 scores(w,week){const players=new Map();for(const r of this.sql.exec('SELECT * FROM sengoku_weekly_battles WHERE worldId=? AND week=? ORDER BY at,id',w.id,week).toArray()){
   const p=w.players.find(p=>p.owner===r.owner&&!p.retired);if(!this.eligible(p))continue;
   let entry=players.get(r.owner);if(!entry){entry={id:p.id,owner:r.owner,name:this.g.profile(r.owner)?.name||p.name,wins:0,damage:0,damageExact:'0',battles:0,achievedAt:0};players.set(r.owner,entry);}entry.wins+=r.wins;addDamage(entry,r.damage);entry.battles++;if(r.wins)entry.achievedAt=Math.max(entry.achievedAt,r.at);
  }return [...players.values()].sort(order).map((r,i)=>({...r,rank:i+1}));}
 settleDue(){if(!this.enabled)return;this.ensure();const cutoff=weekStart(this.g.now());const due=this.sql.exec('SELECT DISTINCT b.worldId,b.week FROM sengoku_weekly_battles b LEFT JOIN sengoku_weekly_settlements s ON s.worldId=b.worldId AND s.week=b.week WHERE b.week<? AND s.worldId IS NULL ORDER BY b.week,b.worldId',cutoff).toArray();
  for(const row of due)this.g.atomic(()=>{if(this.sql.exec('SELECT 1 ok FROM sengoku_weekly_settlements WHERE worldId=? AND week=?',row.worldId,row.week).toArray().length)return;const w=this.g.read(row.worldId);if(!w)return;const scores=this.scores(w,row.week),winner=scores.find(p=>p.wins>0);
   if(winner)this.sql.exec('INSERT OR IGNORE INTO sengoku_weekly_rewards(worldId,week,owner,kind,amount,rank) VALUES(?,?,?,?,?,?)',w.id,row.week,winner.owner,'takauji',1,1);
   const result={players:scores.slice(0,100).map(({owner,...r})=>r)};
   this.sql.exec('INSERT INTO sengoku_weekly_settlements(worldId,week,result,at) VALUES(?,?,?,?)',w.id,row.week,JSON.stringify(result),this.g.now());
   let changed=false;for(const p of w.players)if(!p.retired&&this.apply(w,p))changed=true;if(changed)this.g.save(w);
  });
 }
 apply(w,p){if(!this.enabled||!this.eligible(p))return false;const rewards=this.sql.exec('SELECT * FROM sengoku_weekly_rewards WHERE owner=? AND worldId=? AND claimedAt=0 ORDER BY week,kind',p.owner,w.id).toArray();if(!rewards.length)return false;
  for(const r of rewards){let text;if(r.kind==='takauji'){let general=p.s.generals.find(g=>g.id==='takauji');if(!general){general={id:'takauji',level:1,experience:0};p.s.generals.push(general);text='週間バトルランキング個人1位！ 限定武将「足利尊氏」を獲得しました。武将・称号から起用できます。';}else{general.experience+=50;while(general.level<G.MAX_LEVEL&&general.experience>=general.level*10){general.experience-=general.level*10;general.level++;}if(general.level>=G.MAX_LEVEL)general.experience=0;text='週間バトルランキング個人1位！ 足利尊氏の育成経験値50を獲得しました（最大Lv.100）。';}}
   // Honor alliance rewards already settled before the division was retired.
   else{p.s.soldiers=Math.min(G.MAX_SOLDIERS,p.s.soldiers+r.amount);if(p.s.soldiers>=G.MAX_SOLDIERS)p.s.attackFraction=0;text='週間バトルランキング同盟'+r.rank+'位！ 攻撃兵'+r.amount.toLocaleString('ja-JP')+'人を獲得しました。';}
   this.sql.exec('UPDATE sengoku_weekly_rewards SET claimedAt=? WHERE worldId=? AND week=? AND owner=? AND kind=? AND claimedAt=0',this.g.now(),w.id,r.week,p.owner,r.kind);this.g.expansion.notify(w,[p],'weekly',text);
  }p.revision++;this.g.rank(w,p);return true;
 }
 view(owner,id){if(!this.enabled)fail('world-input');if(!Number.isSafeInteger(id)||id<1||id>G.WORLD_COUNT)fail('world-input');const w=this.g.read(id);if(!w)fail('world-not-found',404);const week=weekStart(this.g.now()),scores=this.scores(w,week),publicRows=rows=>rows.slice(0,100).map(({owner:person,...r})=>({...r,own:person===owner}));
  const ownPlayer=scores.find(r=>r.owner===owner),previous=this.sql.exec('SELECT week,result,at FROM sengoku_weekly_settlements WHERE worldId=? ORDER BY week DESC LIMIT 1',id).toArray()[0];
  // Empty alliance lists keep previously opened clients able to display the individual board.
  const history=previous?{weekStart:previous.week,players:JSON.parse(previous.result).players,alliances:[],settledAt:previous.at}:null;
  const received=this.sql.exec("SELECT week,kind,amount,rank,claimedAt FROM sengoku_weekly_rewards WHERE owner=? AND worldId=? AND kind='takauji' ORDER BY week DESC LIMIT 12",owner||'',id).toArray();
  return{protocol:'sengoku-weekly-battle-v1',worldId:id,weekStart:week,weekEnd:week+WEEK,trackingSince:this.sql.exec('SELECT startedAt FROM sengoku_weekly_meta WHERE id=1').toArray()[0]?.startedAt||this.g.now(),scoring:'captured-wins-damage-first-v1',players:publicRows(scores),alliances:[],own:ownPlayer?publicRows([ownPlayer])[0]:null,ownAlliance:null,rewards:{individual:{rank:1,generalId:'takauji',duplicateExperience:50}},history,received,at:this.g.now()};
 }
}
