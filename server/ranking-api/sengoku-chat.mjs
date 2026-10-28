import '../../assets/ui/sengoku-chat-rules.js';
const C=globalThis.HKSengokuChatRules,fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export class SengokuChat{
 constructor(worlds){this.w=worlds;this.sql=worlds.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_chat_messages(id TEXT PRIMARY KEY,owner TEXT NOT NULL,emojis TEXT NOT NULL,worldId INTEGER,at INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_chat_order ON sengoku_chat_messages(at DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_chat_receipts(owner TEXT NOT NULL,requestId TEXT NOT NULL,payload TEXT NOT NULL,messageId TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(owner,requestId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_chat_limits(owner TEXT PRIMARY KEY,lastAt INTEGER NOT NULL,windowAt INTEGER NOT NULL,count INTEGER NOT NULL)');
 }
 eligible(owner){const a=this.w.accounts.row(owner);return !!a&&!this.w.isBanned(owner)&&!globalThis.HKWealthRules.blockedName(a.name,this.w.admin.words());}
 until(owner){const r=this.sql.exec('SELECT * FROM sengoku_chat_limits WHERE owner=?',owner).toArray()[0];return r?Math.max(r.lastAt+C.COOLDOWN,r.count>=C.MAX_PER_WINDOW?r.windowAt+C.WINDOW:0):0;}
 view(owner){
  const rows=this.sql.exec('SELECT c.*,a.name FROM sengoku_chat_messages c JOIN player_accounts a ON a.owner=c.owner ORDER BY c.at DESC,c.rowid DESC LIMIT 200').toArray(),messages=[];
  for(const r of rows){if(r.at<this.w.now()-604800000)continue;if(this.w.isBanned(r.owner)||globalThis.HKWealthRules.blockedName(r.name,this.w.admin.words()))continue;let emojis;try{emojis=JSON.parse(r.emojis);}catch{continue;}if(!C.valid(emojis))continue;messages.push({id:r.id,name:r.name,emojis,worldId:r.worldId,at:r.at,own:r.owner===owner});if(messages.length===60)break;}
  return{protocol:'sengoku-emoji-chat-v1',messages:messages.reverse(),canSend:this.eligible(owner),cooldownUntil:this.until(owner),maxEmojis:C.MAX_EMOJIS,at:this.w.now()};
 }
 send(owner,data){
  if(!this.w.accounts.row(owner))fail('world-account',401);if(this.w.isBanned(owner))fail('banned',403);if(!this.eligible(owner))fail('nickname-blocked',403);
  if(Object.keys(data).some(k=>!['owner','requestId','emojis'].includes(k))||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||!C.valid(data.emojis))fail('chat-emoji-only');
  const payload=JSON.stringify(data.emojis);let replayed=false,messageId;
  this.w.atomic(()=>{
   const prior=this.sql.exec('SELECT * FROM sengoku_chat_receipts WHERE owner=? AND requestId=?',owner,data.requestId).toArray()[0];
   if(prior){if(prior.payload!==payload)fail('chat-request',409);replayed=true;messageId=prior.messageId;return;}
   const now=this.w.now();if(this.until(owner)>now)fail('chat-cooldown',429);
   const old=this.sql.exec('SELECT * FROM sengoku_chat_limits WHERE owner=?',owner).toArray()[0],same=old&&old.windowAt+C.WINDOW>now;
   messageId=crypto.randomUUID();this.sql.exec('INSERT INTO sengoku_chat_messages(id,owner,emojis,worldId,at) VALUES(?,?,?,?,?)',messageId,owner,payload,this.w.member(owner)?.worldId||null,now);
   this.sql.exec('INSERT INTO sengoku_chat_limits(owner,lastAt,windowAt,count) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET lastAt=excluded.lastAt,windowAt=excluded.windowAt,count=excluded.count',owner,now,same?old.windowAt:now,same?old.count+1:1);
   this.sql.exec('INSERT INTO sengoku_chat_receipts(owner,requestId,payload,messageId,at) VALUES(?,?,?,?,?)',owner,data.requestId,payload,messageId,now);
   this.sql.exec('DELETE FROM sengoku_chat_messages WHERE id NOT IN (SELECT id FROM sengoku_chat_messages ORDER BY at DESC,rowid DESC LIMIT 200) OR at<?',now-604800000);
   this.sql.exec('DELETE FROM sengoku_chat_receipts WHERE at<?',now-604800000);
  });return{...this.view(owner),messageId,replayed};
 }
}
