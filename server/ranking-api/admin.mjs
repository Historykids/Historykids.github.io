import {verifyAdminCode} from './admin-auth.mjs';
const routes=new Set(['/wealth/admin/session','/wealth/admin/claim','/wealth/admin/board','/wealth/admin/moderate','/wealth/admin/words']);
export const adminRoutes=routes;
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
export class WealthAdmin {
 constructor(storage,rules){
  this.storage=storage;this.sql=storage.sql;this.rules=rules;this.verify=verifyAdminCode;
  this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_admin_owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1),owner TEXT NOT NULL,createdAt INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_admin_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1),revision INTEGER NOT NULL)');
  this.sql.exec('INSERT OR IGNORE INTO wealth_admin_settings(singleton,revision) VALUES(1,0)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_blocked_words(term TEXT PRIMARY KEY)');
  if(!this.sql.exec('SELECT COUNT(*) AS total FROM wealth_schema_migrations WHERE version=4').toArray()[0].total){this.sql.exec('INSERT OR IGNORE INTO wealth_blocked_words(term) VALUES(?)','さとう');this.sql.exec('INSERT OR IGNORE INTO wealth_schema_migrations(version) VALUES(4)');}
 }
 owner(){return this.sql.exec('SELECT owner FROM wealth_admin_owner WHERE singleton=1').toArray()[0]?.owner||'';}
 isAdmin(owner){return /^[a-f0-9]{64}$/.test(owner||'')&&this.owner()===owner;}
 words(){return this.sql.exec('SELECT term FROM wealth_blocked_words ORDER BY term').toArray().map(row=>row.term);}
 revision(){return this.sql.exec('SELECT revision FROM wealth_admin_settings WHERE singleton=1').toArray()[0].revision;}
 atomic(work){return this.storage.transactionSync?this.storage.transactionSync(work):work();}
 snapshot(){
  const entries=this.sql.exec('SELECT s.id,s.name,s.balance,s.score,s.rebirths,s.revision,COALESCE(m.banned,0) AS banned,COALESCE(m.nameBlocked,0) AS nameBlocked FROM wealth_scores_v2 s LEFT JOIN wealth_moderation m ON m.id=s.id ORDER BY s.rebirths DESC,s.scoreKey DESC,s.id LIMIT 500').toArray().map(row=>({...row,banned:!!row.banned,nameBlocked:!!row.nameBlocked}));
  return {admin:true,entries,words:this.words(),revision:this.revision(),total:this.sql.exec('SELECT COUNT(*) AS total FROM wealth_scores_v2').toArray()[0].total};
 }
 checkRevision(value){if(!Number.isSafeInteger(value)||value!==this.revision())fail('admin-changed',409);}
 async fetch(path,data){
  try{
   const owner=data.owner||'';if(!/^[a-f0-9]{64}$/.test(owner))fail('identity-required',401);
   if(path==='/wealth/admin/session')return Response.json({admin:this.isAdmin(owner),claimed:!!this.owner()});
   if(path==='/wealth/admin/claim'){
    const previous=this.owner();if(previous&&previous!==owner)fail('admin-claimed',403);
    if(previous===owner)return Response.json({admin:true});
    if(!await this.verify(data.code))fail('admin-code-invalid',403);
    this.atomic(()=>this.sql.exec('INSERT OR IGNORE INTO wealth_admin_owner(singleton,owner,createdAt) VALUES(1,?,?)',owner,Date.now()));
    if(!this.isAdmin(owner))fail('admin-claimed',403);
    return Response.json({admin:true});
   }
   if(!this.isAdmin(owner))fail('admin-required',403);
   if(path==='/wealth/admin/board')return Response.json(this.snapshot());
   if(path==='/wealth/admin/moderate'){
    if(typeof data.id!=='string'||data.id.length>128||typeof data.banned!=='boolean')fail('admin-input');
    const row=this.sql.exec('SELECT id,name FROM wealth_scores_v2 WHERE id=?',data.id).toArray()[0];if(!row)fail('record-gone',404);
    const old=this.sql.exec('SELECT banned FROM wealth_moderation WHERE id=?',data.id).toArray()[0];
    if(!!old?.banned!==data.banned)this.atomic(()=>{this.checkRevision(data.expectedRevision);this.sql.exec('INSERT INTO wealth_moderation(id,banned,nameBlocked) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET banned=excluded.banned,nameBlocked=excluded.nameBlocked',row.id,Number(data.banned),Number(this.rules.blockedName(row.name,this.words())));this.sql.exec('UPDATE wealth_admin_settings SET revision=revision+1 WHERE singleton=1');});
    return Response.json(this.snapshot());
   }
   if(path==='/wealth/admin/words'){
    if(!Array.isArray(data.words)||data.words.length>100||data.words.some(w=>typeof w!=='string'||w.length>64))fail('admin-words');
    const words=[...new Set(data.words.map(w=>this.rules.moderationName(w)))].sort();if(words.some(w=>!w||Array.from(w).length>24))fail('admin-words');
    if(JSON.stringify(words)!==JSON.stringify(this.words()))this.atomic(()=>{
     this.checkRevision(data.expectedRevision);this.sql.exec('DELETE FROM wealth_blocked_words');for(const word of words)this.sql.exec('INSERT INTO wealth_blocked_words(term) VALUES(?)',word);
     for(const row of this.sql.exec('SELECT id,name FROM wealth_scores_v2').toArray())this.sql.exec('INSERT INTO wealth_moderation(id,banned,nameBlocked) VALUES(?,0,?) ON CONFLICT(id) DO UPDATE SET nameBlocked=excluded.nameBlocked',row.id,Number(this.rules.blockedName(row.name,words)));
     this.sql.exec('UPDATE wealth_admin_settings SET revision=revision+1 WHERE singleton=1');
    });
    return Response.json(this.snapshot());
   }
   fail('not-found',404);
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
