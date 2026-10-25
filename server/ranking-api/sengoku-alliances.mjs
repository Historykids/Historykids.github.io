const G=globalThis.HKSengokuWorldRules,W=globalThis.HKWealthRules;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const allianceFields={alliance_create:['name'],alliance_rename:['name'],alliance_invite:['playerId'],alliance_respond:['inviteId','accept'],alliance_cancel:['inviteId'],alliance_leave:[],alliance_kick:['playerId'],alliance_lead:['playerId']};
export class SengokuAlliances{
 constructor(game){this.game=game;this.sql=game.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_alliance_groups(id TEXT PRIMARY KEY,worldId INTEGER NOT NULL,name TEXT NOT NULL,leaderId TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_alliance_members(playerId TEXT PRIMARY KEY,allianceId TEXT NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_alliance_member_group ON sengoku_alliance_members(allianceId)');
 }
 now(){return this.game.now();}
 eligible(p){return p&&!p.retired&&!this.game.isBanned(p.owner)&&!W.blockedName(p.name,this.game.admin.words());}
 visible(p){return this.eligible(p)?p.name:'参加者';}
 group(w,p){return p?.allianceId?w.alliances.find(a=>a.id===p.allianceId)||null:null;}
 members(w,a){return a?w.players.filter(p=>!p.retired&&p.allianceId===a.id):[];}
 validMembers(w,a){return this.members(w,a).filter(p=>this.eligible(p));}
 init(w){let changed=false;if(!Array.isArray(w.alliances)){w.alliances=[];changed=true;}if(!Array.isArray(w.allianceInvites)){w.allianceInvites=[];changed=true;}
  for(const a of [...w.alliances]){const members=this.members(w,a),active=members.filter(p=>this.eligible(p));if(!members.length){w.alliances=w.alliances.filter(g=>g.id!==a.id);changed=true;}else if(active.length&&!active.some(p=>p.id===a.leaderId)){a.leaderId=active[0].id;a.updatedAt=this.now();this.touch(w,members);changed=true;}}
  if(changed)this.sync(w);return changed;
 }
 touch(w,players,actor){for(const p of players)if(p&&p.id!==actor?.id)p.revision++;}
 busy(players){if(players.some(p=>p&&(p.incoming||p.s.pending?.mode==='battle')))fail('alliance-battle',409);}
 name(w,value,except){if(typeof value!=='string')fail('alliance-name');const name=value.normalize('NFKC').trim().replace(/\s+/gu,' ');if([...name].length<2||[...name].length>16||! /^[\p{L}\p{N} _・ー]+$/u.test(name)||W.blockedName(name,this.game.admin.words()))fail('alliance-name');if(w.alliances.some(a=>a.id!==except&&a.name.toLocaleLowerCase('ja-JP')===name.toLocaleLowerCase('ja-JP')))fail('alliance-name-used');return name;}
 ready(p){if((p.allianceReadyAt||0)>this.now())fail('alliance-wait',409);}
 bonus(w,p){const a=this.group(w,p);return a&&this.eligible(p)?Math.max(0,this.validMembers(w,a).length-1)*2:0;}
 frontier(w,p){const ids=new Set(this.validMembers(w,this.group(w,p)).map(m=>m.id));return w.regions.filter(r=>ids.has(r.owner)).map(r=>r.id);}
 friendly(w,p,owner){const target=w.players.find(m=>m.id===owner);return !!(p.allianceId&&target?.allianceId===p.allianceId&&!target.retired);}
 publicGroups(w){return w.alliances.map(a=>({id:a.id,name:W.blockedName(a.name,this.game.admin.words())?'同盟':a.name,leaderId:a.leaderId,members:this.members(w,a).map(p=>p.id)}));}
 own(w,p){const a=this.group(w,p),members=this.members(w,a);return{alliance:a?{id:a.id,name:W.blockedName(a.name,this.game.admin.words())?'同盟':a.name,leaderId:a.leaderId,members:members.map(m=>({id:m.id,name:this.visible(m),active:this.eligible(m),force:G.attack(m.s),soldiers:m.s.soldiers,territories:m.s.ownedRegions.length,inBattle:!!m.incoming||m.s.pending?.mode==='battle'})),bonus:this.bonus(w,p),frontier:this.frontier(w,p)}:null,allianceReadyAt:p.allianceReadyAt||0,
   allianceInvites:w.allianceInvites.filter(i=>i.targetId===p.id&&i.expiresAt>this.now()).map(i=>{const group=w.alliances.find(a=>a.id===i.allianceId);return group?{id:i.id,allianceId:group.id,name:W.blockedName(group.name,this.game.admin.words())?'同盟':group.name,leader:this.visible(w.players.find(m=>m.id===group.leaderId)),members:this.members(w,group).length,expiresAt:i.expiresAt}:null;}).filter(Boolean),
   allianceSent:a?.leaderId===p.id?w.allianceInvites.filter(i=>i.allianceId===a.id&&i.expiresAt>this.now()).map(i=>({id:i.id,playerId:i.targetId,name:this.visible(w.players.find(m=>m.id===i.targetId)),expiresAt:i.expiresAt})):[]};
 }
 sync(w){this.sql.exec('DELETE FROM sengoku_alliance_members WHERE allianceId IN(SELECT id FROM sengoku_alliance_groups WHERE worldId=?)',w.id);this.sql.exec('DELETE FROM sengoku_alliance_groups WHERE worldId=?',w.id);
  for(const a of w.alliances){this.sql.exec('INSERT INTO sengoku_alliance_groups(id,worldId,name,leaderId,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',a.id,w.id,a.name,a.leaderId,a.createdAt,a.updatedAt);for(const p of this.members(w,a))this.sql.exec('INSERT INTO sengoku_alliance_members(playerId,allianceId) VALUES(?,?)',p.id,a.id);}
 }
 expire(w){const old=w.allianceInvites.filter(i=>i.expiresAt<=this.now());if(!old.length)return false;const ids=new Set(old.flatMap(i=>[i.targetId,i.fromId]));this.touch(w,w.players.filter(p=>ids.has(p.id)));w.allianceInvites=w.allianceInvites.filter(i=>i.expiresAt>this.now());return true;}
 detach(w,p){const a=this.group(w,p);if(!a){const removed=w.allianceInvites.filter(i=>i.targetId===p.id||i.fromId===p.id);w.allianceInvites=w.allianceInvites.filter(i=>i.targetId!==p.id&&i.fromId!==p.id);this.touch(w,w.players.filter(m=>removed.some(i=>i.fromId===m.id||i.targetId===m.id)),p);return;}const members=this.members(w,a);this.busy(members);p.allianceId=null;p.allianceReadyAt=this.now()+300000;w.allianceInvites=w.allianceInvites.filter(i=>i.targetId!==p.id&&i.fromId!==p.id);const rest=this.members(w,a);
  if(!rest.length){w.alliances=w.alliances.filter(g=>g.id!==a.id);w.allianceInvites=w.allianceInvites.filter(i=>i.allianceId!==a.id);}else{if(a.leaderId===p.id)a.leaderId=(rest.find(m=>this.eligible(m))||rest[0]).id;a.updatedAt=this.now();}
  this.touch(w,members,p);this.sync(w);
 }
 apply(w,p,data){let a=this.group(w,p);const type=data.type;
  if(type==='alliance_create'){
   if(a)fail('alliance-joined');this.ready(p);this.busy([p]);a={id:crypto.randomUUID(),name:this.name(w,data.name),leaderId:p.id,createdAt:this.now(),updatedAt:this.now()};w.alliances.push(a);p.allianceId=a.id;w.allianceInvites=w.allianceInvites.filter(i=>i.targetId!==p.id);this.game.event(w,p.name+'が同盟「'+a.name+'」を旗揚げした');
  }else if(type==='alliance_respond'){
   const i=w.allianceInvites.find(i=>i.id===data.inviteId&&i.targetId===p.id&&i.expiresAt>this.now());if(!i||typeof data.accept!=='boolean')fail('alliance-invite-gone',409);const group=w.alliances.find(g=>g.id===i.allianceId);if(!group)fail('alliance-invite-gone',409);
   if(data.accept){if(a)fail('alliance-joined');this.ready(p);const members=this.members(w,group);this.busy([...members,p]);if(members.length>=5)fail('alliance-full',409);p.allianceId=group.id;group.updatedAt=this.now();this.touch(w,members,p);w.allianceInvites=w.allianceInvites.filter(inv=>inv.targetId!==p.id);this.game.event(w,p.name+'が同盟「'+group.name+'」に参加した');}else w.allianceInvites=w.allianceInvites.filter(inv=>inv.id!==i.id);
   const leader=w.players.find(m=>m.id===group.leaderId);if(!data.accept)this.touch(w,[leader],p);
  }else{
   if(!a)fail('alliance-none');const members=this.members(w,a);
   if(type==='alliance_leave'){this.detach(w,p);this.game.event(w,p.name+'が同盟を離れた');return;}
   if(a.leaderId!==p.id)fail('alliance-leader',403);
   if(type==='alliance_invite'){
    const target=w.players.find(m=>m.id===data.playerId);if(!this.eligible(target)||target.id===p.id||target.allianceId)fail('alliance-target');if(members.length>=5)fail('alliance-full',409);if(w.allianceInvites.some(i=>i.allianceId===a.id&&i.targetId===target.id&&i.expiresAt>this.now()))fail('alliance-invited');
    w.allianceInvites.push({id:crypto.randomUUID(),allianceId:a.id,fromId:p.id,targetId:target.id,createdAt:this.now(),expiresAt:this.now()+86400000});this.touch(w,[target],p);
   }else if(type==='alliance_cancel'){
    const i=w.allianceInvites.find(i=>i.id===data.inviteId&&i.allianceId===a.id);if(!i)fail('alliance-invite-gone',409);w.allianceInvites=w.allianceInvites.filter(inv=>inv.id!==i.id);this.touch(w,[w.players.find(m=>m.id===i.targetId)],p);
   }else if(type==='alliance_rename'){this.busy(members);a.name=this.name(w,data.name,a.id);a.updatedAt=this.now();this.touch(w,members,p);
   }else if(type==='alliance_kick'||type==='alliance_lead'){
    const target=members.find(m=>m.id===data.playerId&&m.id!==p.id);if(!target)fail('alliance-target');this.busy(members);
    if(type==='alliance_kick'){if(target.s.pending)fail('alliance-battle',409);this.detach(w,target);target.revision++;this.game.event(w,this.visible(target)+'が同盟を離れた');}else{if(!this.eligible(target))fail('alliance-target');a.leaderId=target.id;a.updatedAt=this.now();this.touch(w,members,p);this.game.event(w,this.visible(target)+'が同盟の盟主になった');}
   }else fail('world-input');
  }
  this.sync(w);
 }
 ranking(owner,worldId){if(worldId!==undefined&&(!Number.isSafeInteger(worldId)||worldId<1))fail('world-input');
  const rows=this.sql.exec('SELECT g.*,m.playerId,s.owner,s.name AS playerName,s.force,s.soldiers,s.territories,s.wins,s.generals,s.achievedAt FROM sengoku_alliance_groups g JOIN sengoku_alliance_members m ON m.allianceId=g.id JOIN sengoku_force_scores s ON s.playerId=m.playerId AND s.worldId=g.worldId'+(worldId?' WHERE g.worldId=?':''),...(worldId?[worldId]:[])).toArray(),groups=new Map();
  for(const r of rows){if(this.game.isBanned(r.owner)||W.blockedName(r.playerName,this.game.admin.words())||W.blockedName(r.name,this.game.admin.words()))continue;let a=groups.get(r.id);if(!a){a={id:r.id,worldId:r.worldId,name:r.name,leaderId:r.leaderId,force:0,soldiers:0,territories:0,wins:0,members:[],own:false,achievedAt:r.updatedAt};groups.set(r.id,a);}a.force+=r.force;a.soldiers+=r.soldiers;a.territories+=r.territories;a.wins+=r.wins;a.achievedAt=Math.max(a.achievedAt,r.achievedAt);a.own||=r.owner===owner;a.members.push({id:r.playerId,name:r.playerName,force:r.force,territories:r.territories});}
  const entries=[...groups.values()].sort((a,b)=>b.force-a.force||b.territories-a.territories||b.wins-a.wins||a.achievedAt-b.achievedAt||a.id.localeCompare(b.id));let rank=0,prev='';for(let n=0;n<entries.length;n++){const a=entries[n],key=a.force+':'+a.territories+':'+a.wins;if(key!==prev)rank=n+1;prev=key;a.rank=rank;a.leader=a.members.find(m=>m.id===a.leaderId)?.name||a.members[0].name;delete a.leaderId;delete a.achievedAt;}
  return{protocol:'sengoku-alliance-v1',entries:entries.slice(0,100),own:entries.find(a=>a.own)||null,total:entries.length,worldId:worldId||null,activeWorldId:this.game.member(owner)?.worldId||null,maxMembers:5,at:this.now()};
 }
}
