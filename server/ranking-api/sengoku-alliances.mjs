const G=globalThis.HKSengokuWorldRules,W=globalThis.HKWealthRules;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const allianceFields={alliance_create:['name'],alliance_rename:['name'],alliance_invite:['playerId'],alliance_respond:['inviteId','accept'],alliance_cancel:['inviteId'],alliance_leave:[],alliance_kick:['playerId'],alliance_lead:['playerId'],alliance_role:['playerId','role'],alliance_notice:['text'],alliance_objective:['region','kind','note'],alliance_objective_clear:[],alliance_ready:['objectiveId','ready'],alliance_apply:['allianceId','note'],alliance_withdraw:['applicationId'],alliance_review:['applicationId','accept']};
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
 init(w){let changed=false;if(!Array.isArray(w.allianceApplications)){w.allianceApplications=[];changed=true;}if(!Array.isArray(w.alliances)){w.alliances=[];changed=true;}if(!Array.isArray(w.allianceInvites)){w.allianceInvites=[];changed=true;}
  for(const a of [...w.alliances]){if(a.officers){for(const id of Object.keys(a.officers))if(a.officers[id]==='commander'){a.officers[id]=Object.values(a.officers).filter(r=>r==='deputy').length<3?'deputy':'member';changed=true;}}if(!a.officers){a.officers={};changed=true;}if(!a.audit){a.audit=[];changed=true;}if(a.notice===undefined){a.notice='';changed=true;}for(const id of Object.keys(a.officers))if(!w.players.some(p=>p.id===id&&!p.retired&&p.allianceId===a.id)||id===a.leaderId){delete a.officers[id];changed=true;}const members=this.members(w,a),active=members.filter(p=>this.eligible(p));if(!members.length){w.alliances=w.alliances.filter(g=>g.id!==a.id);changed=true;}else if(active.length&&!active.some(p=>p.id===a.leaderId)){a.leaderId=active[0].id;if(a.officers)delete a.officers[a.leaderId];a.updatedAt=this.now();this.touch(w,members);changed=true;}}
  w.allianceApplications=w.allianceApplications.filter(i=>w.alliances.some(a=>a.id===i.allianceId));if(changed)this.sync(w);return changed;
 }
 touch(w,players,actor){for(const p of players)if(p&&p.id!==actor?.id)p.revision++;}
 busy(players){if(players.some(p=>p&&(p.incoming||p.s.pending?.mode==='battle')))fail('alliance-battle',409);}
 name(w,value,except){if(typeof value!=='string')fail('alliance-name');const name=value.normalize('NFKC').trim().replace(/\s+/gu,' ');if([...name].length<2||[...name].length>16||! /^[\p{L}\p{N} _・ー]+$/u.test(name)||W.blockedName(name,this.game.admin.words()))fail('alliance-name');if(w.alliances.some(a=>a.id!==except&&a.name.toLocaleLowerCase('ja-JP')===name.toLocaleLowerCase('ja-JP')))fail('alliance-name-used');return name;}
 ready(p){if((p.allianceReadyAt||0)>this.now())fail('alliance-wait',409);}
 bonus(w,p){const a=this.group(w,p);return a&&this.eligible(p)?Math.min(8,Math.max(0,this.validMembers(w,a).length-1)*2):0;}
 frontier(w,p){const ids=new Set(this.validMembers(w,this.group(w,p)).map(m=>m.id));return w.regions.filter(r=>ids.has(r.owner)).map(r=>r.id);}
 friendly(w,p,owner){const target=w.players.find(m=>m.id===owner);return !!(p.allianceId&&target?.allianceId===p.allianceId&&!target.retired);}
 publicGroups(w){return w.alliances.map(a=>({leader:this.visible(w.players.find(p=>p.id===a.leaderId)),force:this.validMembers(w,a).reduce((n,p)=>n+G.attack(p.s),0),territories:this.validMembers(w,a).reduce((n,p)=>n+p.s.ownedRegions.length,0),id:a.id,name:W.blockedName(a.name,this.game.admin.words())?'同盟':a.name,leaderId:a.leaderId,members:this.members(w,a).map(p=>p.id)}));}
 own(w,p){const a=this.group(w,p),members=this.members(w,a);return{alliance:a?{permissions:this.permissions(w,a,p),role:this.role(a,p),notice:a.notice||'',objective:a.objective?{...a.objective,ready:(a.objective.ready||[]).filter(id=>this.members(w,a).some(p=>p.id===id))}:null,audit:(a.audit||[]).slice(0,20),id:a.id,name:W.blockedName(a.name,this.game.admin.words())?'同盟':a.name,leaderId:a.leaderId,members:members.map(m=>({id:m.id,role:this.role(a,m),name:this.visible(m),active:this.eligible(m),force:G.attack(m.s),soldiers:m.s.soldiers,territories:m.s.ownedRegions.length,inBattle:!!m.incoming||m.s.pending?.mode==='battle'})),bonus:this.bonus(w,p),frontier:this.frontier(w,p)}:null,allianceReadyAt:p.allianceReadyAt||0,allianceApplications:a&&this.permissions(w,a,p).manage?w.allianceApplications.filter(i=>i.allianceId===a.id&&i.expiresAt>this.now()).map(i=>({...i,name:this.visible(w.players.find(p=>p.id===i.playerId))})):[],allianceRequests:w.allianceApplications.filter(i=>i.playerId===p.id&&i.expiresAt>this.now()).map(i=>({id:i.id,allianceId:i.allianceId,name:w.alliances.find(a=>a.id===i.allianceId)?.name||'同盟',expiresAt:i.expiresAt})),
   allianceInvites:w.allianceInvites.filter(i=>i.targetId===p.id&&i.expiresAt>this.now()).map(i=>{const group=w.alliances.find(a=>a.id===i.allianceId);return group?{id:i.id,allianceId:group.id,name:W.blockedName(group.name,this.game.admin.words())?'同盟':group.name,leader:this.visible(w.players.find(m=>m.id===group.leaderId)),members:this.members(w,group).length,expiresAt:i.expiresAt}:null;}).filter(Boolean),
   allianceSent:a&&this.permissions(w,a,p).manage?w.allianceInvites.filter(i=>i.allianceId===a.id&&i.expiresAt>this.now()).map(i=>({id:i.id,playerId:i.targetId,name:this.visible(w.players.find(m=>m.id===i.targetId)),expiresAt:i.expiresAt})):[]};
 }
 role(a,p){return a.leaderId===p.id?'leader':a.officers?.[p.id]||'member';}
 permissions(w,a,p){const role=this.role(a,p);return{leader:role==='leader',manage:['leader','deputy'].includes(role),command:['leader','deputy'].includes(role)};}
 text(value,max){if(typeof value!=='string')fail('alliance-text');const text=value.normalize('NFKC').trim();if([...text].length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)||W.blockedName(text,this.game.admin.words()))fail('alliance-text');return text;}
 log(w,a,text){a.audit??=[];a.audit.unshift({id:crypto.randomUUID(),text,at:this.now()});a.audit=a.audit.slice(0,20);a.updatedAt=this.now();this.touch(w,this.members(w,a));}
 command(w,p,data){let a=this.group(w,p),type=data.type;
  if(type==='alliance_apply'){
   if(a)fail('alliance-joined');this.ready(p);this.busy([p]);a=w.alliances.find(a=>a.id===data.allianceId);if(!a)fail('alliance-none');if(this.members(w,a).length>=20)fail('alliance-full');if(w.allianceApplications.some(i=>i.playerId===p.id&&i.allianceId===a.id))fail('alliance-applied');if(w.allianceApplications.filter(i=>i.playerId===p.id).length>=3)fail('alliance-application-limit');
   w.allianceApplications.push({id:crypto.randomUUID(),allianceId:a.id,playerId:p.id,note:this.text(data.note||'',100),createdAt:this.now(),expiresAt:this.now()+86400000});this.touch(w,this.members(w,a).filter(m=>this.permissions(w,a,m).manage),p);return;
  }
  if(type==='alliance_withdraw'){const i=w.allianceApplications.find(i=>i.id===data.applicationId&&i.playerId===p.id);if(!i)fail('alliance-application-gone',409);w.allianceApplications=w.allianceApplications.filter(v=>v.id!==i.id);a=w.alliances.find(a=>a.id===i.allianceId);if(a)this.touch(w,this.members(w,a),p);return;}
  if(!a)fail('alliance-none');const perms=this.permissions(w,a,p),members=this.members(w,a);
  if(type==='alliance_role'){
   if(!perms.leader)fail('alliance-leader',403);this.busy(members);const target=members.find(m=>m.id===data.playerId&&m.id!==p.id),role=data.role==='commander'?'deputy':data.role;if(!target||!['member','deputy'].includes(role))fail('alliance-role');a.officers??={};if(role==='deputy'&&Object.entries(a.officers).filter(([id,r])=>id!==target.id&&r==='deputy').length>=3)fail('alliance-deputy-limit');delete a.officers[target.id];if(role!=='member')a.officers[target.id]=role;this.log(w,a,p.name+'が'+target.name+'の役職を変更しました。');
  }else if(type==='alliance_notice'){
   if(!perms.command)fail('alliance-command',403);a.notice=this.text(data.text,500);this.log(w,a,p.name+'が同盟のお知らせを'+(a.notice?'更新':'削除')+'しました。');
  }else if(type==='alliance_objective'){
   if(!perms.command)fail('alliance-command',403);const region=w.regions.find(r=>r.id===data.region);if(!region||!['attack','defend','rally'].includes(data.kind))fail('alliance-objective');if(data.kind==='attack'&&this.friendly(w,p,region.owner))fail('alliance-friendly',409);if(data.kind==='defend'&&!this.friendly(w,p,region.owner))fail('alliance-objective');
   a.objective={id:crypto.randomUUID(),region:data.region,kind:data.kind,note:this.text(data.note||'',100),by:p.name,at:this.now(),expiresAt:this.now()+86400000,ready:[]};this.log(w,a,p.name+'が新しい作戦目標を設定しました。');
  }else if(type==='alliance_objective_clear'){
   if(!perms.command)fail('alliance-command',403);a.objective=null;this.log(w,a,p.name+'が作戦目標を解除しました。');
  }else if(type==='alliance_ready'){
   const o=a.objective;if(!o||o.id!==data.objectiveId||o.expiresAt<=this.now()||typeof data.ready!=='boolean')fail('alliance-objective-gone',409);o.ready=(o.ready||[]).filter(id=>id!==p.id);if(data.ready)o.ready.push(p.id);this.touch(w,members,p);
  }else if(type==='alliance_review'){
   if(!perms.manage)fail('alliance-leader',403);const i=w.allianceApplications.find(i=>i.id===data.applicationId&&i.allianceId===a.id&&i.expiresAt>this.now()),target=i&&w.players.find(p=>p.id===i.playerId);if(!i||typeof data.accept!=='boolean'||!this.eligible(target))fail('alliance-application-gone',409);
   if(data.accept){if(target.allianceId)fail('alliance-joined');this.ready(target);this.busy([...members,target]);if(target.s.pending)fail('alliance-battle',409);if(members.length>=20)fail('alliance-full',409);target.allianceId=a.id;w.allianceInvites=w.allianceInvites.filter(i=>i.targetId!==target.id);w.allianceApplications=w.allianceApplications.filter(i=>i.playerId!==target.id);this.log(w,a,target.name+'が加入申請の承認により参加しました。');this.touch(w,[target],p);
   }else{w.allianceApplications=w.allianceApplications.filter(v=>v.id!==i.id);this.touch(w,[target,...members],p);}
  }else fail('world-input');this.sync(w);
 }
 sync(w){this.sql.exec('DELETE FROM sengoku_alliance_members WHERE allianceId IN(SELECT id FROM sengoku_alliance_groups WHERE worldId=?)',w.id);this.sql.exec('DELETE FROM sengoku_alliance_groups WHERE worldId=?',w.id);
  for(const a of w.alliances){this.sql.exec('INSERT INTO sengoku_alliance_groups(id,worldId,name,leaderId,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',a.id,w.id,a.name,a.leaderId,a.createdAt,a.updatedAt);for(const p of this.members(w,a))this.sql.exec('INSERT INTO sengoku_alliance_members(playerId,allianceId) VALUES(?,?)',p.id,a.id);}
 }
 expire(w){let changed=false;for(const a of w.alliances)if(a.objective&&a.objective.expiresAt<=this.now()){a.objective=null;this.touch(w,this.members(w,a));changed=true;}const expired=(w.allianceApplications||[]).filter(i=>i.expiresAt<=this.now());if(expired.length){this.touch(w,w.players.filter(p=>expired.some(i=>i.playerId===p.id||p.allianceId===i.allianceId)));w.allianceApplications=w.allianceApplications.filter(i=>i.expiresAt>this.now());changed=true;}const old=w.allianceInvites.filter(i=>i.expiresAt<=this.now());if(!old.length)return changed;const ids=new Set(old.flatMap(i=>[i.targetId,i.fromId]));this.touch(w,w.players.filter(p=>ids.has(p.id)));w.allianceInvites=w.allianceInvites.filter(i=>i.expiresAt>this.now());return true;}
 detach(w,p){w.allianceApplications=(w.allianceApplications||[]).filter(i=>i.playerId!==p.id);const a=this.group(w,p);if(!a){const removed=w.allianceInvites.filter(i=>i.targetId===p.id||i.fromId===p.id);w.allianceInvites=w.allianceInvites.filter(i=>i.targetId!==p.id&&i.fromId!==p.id);this.touch(w,w.players.filter(m=>removed.some(i=>i.fromId===m.id||i.targetId===m.id)),p);return;}const members=this.members(w,a);this.busy(members);if(a.officers)delete a.officers[p.id];if(a.objective)a.objective.ready=(a.objective.ready||[]).filter(id=>id!==p.id);p.allianceId=null;p.allianceReadyAt=this.now()+300000;w.allianceInvites=w.allianceInvites.filter(i=>i.targetId!==p.id&&i.fromId!==p.id);const rest=this.members(w,a);
  if(!rest.length){w.allianceApplications=w.allianceApplications.filter(i=>i.allianceId!==a.id);w.alliances=w.alliances.filter(g=>g.id!==a.id);w.allianceInvites=w.allianceInvites.filter(i=>i.allianceId!==a.id);}else{if(a.leaderId===p.id)a.leaderId=(rest.find(m=>this.eligible(m))||rest[0]).id;if(a.officers)delete a.officers[a.leaderId];a.updatedAt=this.now();}
  this.touch(w,members,p);this.sync(w);
 }
 apply(w,p,data){if(['alliance_role','alliance_notice','alliance_objective','alliance_objective_clear','alliance_ready','alliance_apply','alliance_withdraw','alliance_review'].includes(data.type))return this.command(w,p,data);let a=this.group(w,p);const type=data.type;
  if(type==='alliance_create'){
   if(a)fail('alliance-joined');this.ready(p);this.busy([p]);a={id:crypto.randomUUID(),name:this.name(w,data.name),leaderId:p.id,createdAt:this.now(),updatedAt:this.now()};w.alliances.push(a);p.allianceId=a.id;w.allianceInvites=w.allianceInvites.filter(i=>i.targetId!==p.id);this.game.event(w,p.name+'が同盟「'+a.name+'」を旗揚げした');
  }else if(type==='alliance_respond'){
   const i=w.allianceInvites.find(i=>i.id===data.inviteId&&i.targetId===p.id&&i.expiresAt>this.now());if(!i||typeof data.accept!=='boolean')fail('alliance-invite-gone',409);const group=w.alliances.find(g=>g.id===i.allianceId);if(!group)fail('alliance-invite-gone',409);
   if(data.accept){if(a)fail('alliance-joined');this.ready(p);const members=this.members(w,group);this.busy([...members,p]);if(members.length>=20)fail('alliance-full',409);p.allianceId=group.id;w.allianceApplications=w.allianceApplications.filter(i=>i.playerId!==p.id);group.updatedAt=this.now();this.touch(w,members,p);w.allianceInvites=w.allianceInvites.filter(inv=>inv.targetId!==p.id);this.game.event(w,p.name+'が同盟「'+group.name+'」に参加した');}else w.allianceInvites=w.allianceInvites.filter(inv=>inv.id!==i.id);
   const leader=w.players.find(m=>m.id===group.leaderId);if(!data.accept)this.touch(w,[leader],p);
  }else{
   if(!a)fail('alliance-none');const members=this.members(w,a);
   if(type==='alliance_leave'){this.detach(w,p);this.game.event(w,p.name+'が同盟を離れた');return;}
   if(!this.permissions(w,a,p).manage)fail('alliance-leader',403);if(['alliance_rename','alliance_lead'].includes(type)&&a.leaderId!==p.id)fail('alliance-leader',403);
   if(type==='alliance_invite'){
    const target=w.players.find(m=>m.id===data.playerId);if(!this.eligible(target)||target.id===p.id||target.allianceId)fail('alliance-target');if(members.length>=20)fail('alliance-full',409);if(w.allianceInvites.some(i=>i.allianceId===a.id&&i.targetId===target.id&&i.expiresAt>this.now()))fail('alliance-invited');
    w.allianceInvites.push({id:crypto.randomUUID(),allianceId:a.id,fromId:p.id,targetId:target.id,createdAt:this.now(),expiresAt:this.now()+86400000});this.touch(w,[target],p);
   }else if(type==='alliance_cancel'){
    const i=w.allianceInvites.find(i=>i.id===data.inviteId&&i.allianceId===a.id);if(!i)fail('alliance-invite-gone',409);w.allianceInvites=w.allianceInvites.filter(inv=>inv.id!==i.id);this.touch(w,[w.players.find(m=>m.id===i.targetId)],p);
   }else if(type==='alliance_rename'){this.busy(members);a.name=this.name(w,data.name,a.id);a.updatedAt=this.now();this.touch(w,members,p);
   }else if(type==='alliance_kick'||type==='alliance_lead'){
    const target=members.find(m=>m.id===data.playerId&&m.id!==p.id);if(!target)fail('alliance-target');this.busy(members);
    if(type==='alliance_kick'){if(a.leaderId!==p.id&&this.role(a,target)!=='member')fail('alliance-leader',403);if(target.s.pending)fail('alliance-battle',409);this.detach(w,target);target.revision++;this.game.event(w,this.visible(target)+'が同盟を離れた');}else{if(!this.eligible(target))fail('alliance-target');a.leaderId=target.id;if(a.officers)delete a.officers[target.id];a.updatedAt=this.now();this.touch(w,members,p);this.game.event(w,this.visible(target)+'が同盟の盟主になった');}
   }else fail('world-input');
  }
  this.sync(w);
 }
 ranking(owner,worldId){return this.game.expansion.ranking(owner,worldId);}
}
