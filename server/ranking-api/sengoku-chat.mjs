import '../../assets/ui/sengoku-chat-rules.js';
const C=globalThis.HKSengokuChatRules,fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export class SengokuChat{
 constructor(worlds){this.w=worlds;this.sql=worlds.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_chat_messages(id TEXT PRIMARY KEY,owner TEXT NOT NULL,emojis TEXT NOT NULL,worldId INTEGER,channelWorldId INTEGER,at INTEGER NOT NULL)');
  if(!this.sql.exec('PRAGMA table_info(sengoku_chat_messages)').toArray().some(c=>c.name==='channelWorldId'))this.sql.exec('ALTER TABLE sengoku_chat_messages ADD COLUMN channelWorldId INTEGER');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_chat_channel_order ON sengoku_chat_messages(channelWorldId,at DESC)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS sengoku_chat_order ON sengoku_chat_messages(at DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_chat_receipts(owner TEXT NOT NULL,requestId TEXT NOT NULL,payload TEXT NOT NULL,messageId TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(owner,requestId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sengoku_chat_limits(owner TEXT PRIMARY KEY,lastAt INTEGER NOT NULL,windowAt INTEGER NOT NULL,count INTEGER NOT NULL)');
 }
 eligible(owner){const c=this.w.expansion?.control(owner);if(c&&(c.banned||c.accessUntil>this.w.now()||c.chatUntil>this.w.now()))return false;const a=this.w.profile(owner);return !!a&&!this.w.isBanned(owner)&&!globalThis.HKWealthRules.blockedName(a.name,this.w.admin.words());}
 until(owner){const r=this.sql.exec('SELECT * FROM sengoku_chat_limits WHERE owner=?',owner).toArray()[0];return r?Math.max(r.lastAt+C.COOLDOWN,r.count>=C.MAX_PER_WINDOW?r.windowAt+C.WINDOW:0):0;}
 channel(value){if(value===undefined||value===null)return null;if(!Number.isSafeInteger(value)||value<1||value>globalThis.HKSengokuWorldRules.WORLD_COUNT)fail('chat-channel');return value;}
 view(owner,channelWorldId=null){
  channelWorldId=this.channel(channelWorldId);const activeWorldId=this.w.member(owner)?.worldId||null;
  const rows=this.sql.exec('SELECT c.*,COALESCE(a.name,g.name) name FROM sengoku_chat_messages c LEFT JOIN player_accounts a ON a.owner=c.owner LEFT JOIN sengoku_guest_profiles g ON g.owner=c.owner WHERE c.channelWorldId IS ? ORDER BY c.at DESC,c.rowid DESC LIMIT 200',channelWorldId).toArray(),messages=[];
  for(const r of rows){if(!r.name)continue;if(r.at<this.w.now()-604800000)continue;if(this.w.isBanned(r.owner)||globalThis.HKWealthRules.blockedName(r.name,this.w.admin.words()))continue;let emojis;try{emojis=JSON.parse(r.emojis);}catch{continue;}if(!C.valid(emojis))continue;messages.push({id:r.id,name:r.name,title:this.w.equippedTitle(r.owner),emojis,worldId:r.worldId,at:r.at,own:r.owner===owner});if(messages.length===60)break;}
  return{protocol:'sengoku-emoji-chat-v1',scopesVersion:C.CHANNEL_VERSION,presetsVersion:C.PRESET_VERSION,presetCount:C.presets.length,worldCount:globalThis.HKSengokuWorldRules.WORLD_COUNT,channelWorldId,activeWorldId,hasProfile:!!this.w.profile(owner),messages:messages.reverse(),canSend:this.eligible(owner)&&(!channelWorldId||channelWorldId===activeWorldId),cooldownUntil:this.until(owner),maxEmojis:C.MAX_EMOJIS,at:this.w.now()};
 }
 send(owner,data){
  this.w.expansion?.access(owner,'chat');
  if(!this.w.profile(owner))fail('world-account',401);if(this.w.isBanned(owner))fail('banned',403);if(!this.eligible(owner))fail('nickname-blocked',403);
  if(Object.keys(data).some(k=>!['owner','requestId','emojis','channelWorldId'].includes(k))||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||!C.valid(data.emojis))fail('chat-emoji-only');
  const channelWorldId=this.channel(data.channelWorldId),emojis=JSON.stringify(data.emojis),payload=channelWorldId?JSON.stringify({emojis:data.emojis,channelWorldId}):emojis;let replayed=false,messageId;
  this.w.atomic(()=>{
   const prior=this.sql.exec('SELECT * FROM sengoku_chat_receipts WHERE owner=? AND requestId=?',owner,data.requestId).toArray()[0];
   if(prior){if(prior.payload!==payload)fail('chat-request',409);replayed=true;messageId=prior.messageId;return;}
   if(channelWorldId!==null&&this.w.member(owner)?.worldId!==channelWorldId)fail('chat-world-membership',403);
   const now=this.w.now();if(this.until(owner)>now)fail('chat-cooldown',429);
   const old=this.sql.exec('SELECT * FROM sengoku_chat_limits WHERE owner=?',owner).toArray()[0],same=old&&old.windowAt+C.WINDOW>now;
   messageId=crypto.randomUUID();this.sql.exec('INSERT INTO sengoku_chat_messages(id,owner,emojis,worldId,channelWorldId,at) VALUES(?,?,?,?,?,?)',messageId,owner,emojis,this.w.member(owner)?.worldId||null,channelWorldId,now);
   this.sql.exec('INSERT INTO sengoku_chat_limits(owner,lastAt,windowAt,count) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET lastAt=excluded.lastAt,windowAt=excluded.windowAt,count=excluded.count',owner,now,same?old.windowAt:now,same?old.count+1:1);
   this.sql.exec('INSERT INTO sengoku_chat_receipts(owner,requestId,payload,messageId,at) VALUES(?,?,?,?,?)',owner,data.requestId,payload,messageId,now);
   this.sql.exec('DELETE FROM sengoku_chat_messages WHERE at<? OR (channelWorldId IS ? AND id NOT IN (SELECT id FROM sengoku_chat_messages WHERE channelWorldId IS ? ORDER BY at DESC,rowid DESC LIMIT 200))',now-604800000,channelWorldId,channelWorldId);
   this.sql.exec('DELETE FROM sengoku_chat_receipts WHERE at<?',now-604800000);
  });return{...this.view(owner,channelWorldId),messageId,replayed};
 }
}
