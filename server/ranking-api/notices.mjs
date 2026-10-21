export const noticeRoutes=new Set(['/wealth/notices','/wealth/admin/notices','/wealth/admin/personal-notices','/wealth/admin/recipients','/wealth/admin/notice-history','/wealth/admin/notice-edit','/wealth/admin/notice-delete']);
const fail=(error,status=400)=>{throw Object.assign(Error(error),{status});};
const fields='title,body,createdAt,revision,updatedAt';
export class WealthNotices{
 constructor(storage,admin){
  this.sql=storage.sql;this.admin=admin;
  this.sql.exec('CREATE TABLE IF NOT EXISTS operation_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL)');
  // Personal content never enters the broadcast table, including during migrations.
  this.sql.exec('CREATE TABLE IF NOT EXISTS operation_personal_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,recipient TEXT NOT NULL,recipientName TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS personal_notice_recipient ON operation_personal_notices(recipient,createdAt DESC)');
  for(const table of ['operation_notices','operation_personal_notices']){
   const columns=this.sql.exec('PRAGMA table_info('+table+')').toArray();
   if(!columns.some(c=>c.name==='revision'))this.sql.exec('ALTER TABLE '+table+' ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
   if(!columns.some(c=>c.name==='updatedAt'))this.sql.exec('ALTER TABLE '+table+' ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0');
  }
  // Immutable receipts outlive edits/deletions: a delayed original send cannot resurrect a notice.
  this.sql.exec('CREATE TABLE IF NOT EXISTS operation_notice_receipts(requestId TEXT PRIMARY KEY,payload TEXT NOT NULL,result TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS operation_notice_schema(version INTEGER PRIMARY KEY)');
  if(!this.sql.exec('SELECT version FROM operation_notice_schema WHERE version=1').toArray().length)this.admin.atomic(()=>{
   this.sql.exec("INSERT OR IGNORE INTO operation_notice_receipts(requestId,payload,result) SELECT requestId,json_object('action','publish','title',title,'body',body,'recipient',''),json_object('id',id,'audience','all','recipientName','') FROM operation_notices");
   this.sql.exec("INSERT OR IGNORE INTO operation_notice_receipts(requestId,payload,result) SELECT requestId,json_object('action','publish','title',title,'body',body,'recipient',recipient),json_object('id',-id,'audience','personal','recipientName',recipientName) FROM operation_personal_notices");
   this.sql.exec('INSERT INTO operation_notice_schema(version) VALUES(1)');
  });
 }
 list(owner=''){
  return{notices:this.sql.exec("SELECT id,"+fields+",'all' AS audience FROM operation_notices UNION ALL SELECT -id AS id,"+fields+",'personal' AS audience FROM operation_personal_notices WHERE recipient=? ORDER BY createdAt DESC,id DESC LIMIT 100",owner||'').toArray()};
 }
 history(offset=0){
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000000)fail('notice-input');
  const total=this.sql.exec('SELECT (SELECT COUNT(*) FROM operation_notices)+(SELECT COUNT(*) FROM operation_personal_notices) AS total').toArray()[0].total;
  const notices=this.sql.exec("SELECT id,"+fields+",'all' AS audience,'' AS recipient,'' AS recipientName FROM operation_notices UNION ALL SELECT -id AS id,"+fields+",'personal' AS audience,recipient,recipientName FROM operation_personal_notices ORDER BY createdAt DESC,id DESC LIMIT 50 OFFSET ?",offset).toArray();
  return{notices,total,offset,nextOffset:offset+notices.length<total?offset+notices.length:null};
 }
 content(data){
  const title=typeof data.title==='string'?data.title.normalize('NFKC').trim():'',body=typeof data.body==='string'?data.body.trim():'';
  if(!title||Array.from(title).length>80||!body||Array.from(body).length>2000)fail('notice-input');
  return{title,body};
 }
 receipt(requestId,payload,work){
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(requestId))fail('notice-input');
  return this.admin.atomic(()=>{
   const old=this.sql.exec('SELECT payload,result FROM operation_notice_receipts WHERE requestId=?',requestId).toArray()[0];
   if(old){if(old.payload!==JSON.stringify(payload))fail('notice-changed',409);return JSON.parse(old.result);}
   const result=work();
   this.sql.exec('INSERT INTO operation_notice_receipts(requestId,payload,result) VALUES(?,?,?)',requestId,JSON.stringify(payload),JSON.stringify(result));
   return result;
  });
 }
 change(path,data){
  const action=path==='/wealth/admin/notice-edit'?'edit':'delete',id=data.id,expectedRevision=data.expectedRevision;
  if(!Number.isSafeInteger(id)||id===0||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)fail('notice-input');
  if(data.recipient!==undefined||data.audience!==undefined)fail('notice-recipient');
  const content=action==='edit'?this.content(data):{};
  const changed=this.receipt(data.requestId,{action,id,expectedRevision,...content},()=>{
   const table=id>0?'operation_notices':'operation_personal_notices',row=this.sql.exec('SELECT requestId,title,body,revision'+(id<0?',recipient,recipientName':'')+' FROM '+table+' WHERE id=?',Math.abs(id)).toArray()[0];
   if(!row)fail('notice-gone',404);
   if(row.revision!==expectedRevision)fail('notice-conflict',409);
   this.sql.exec('INSERT OR IGNORE INTO operation_notice_receipts(requestId,payload,result) VALUES(?,?,?)',row.requestId,JSON.stringify({action:'publish',title:row.title,body:row.body,recipient:row.recipient||''}),JSON.stringify({id,audience:id<0?'personal':'all',recipientName:row.recipientName||''}));
   if(action==='delete')this.sql.exec('DELETE FROM '+table+' WHERE id=?',Math.abs(id));
   else this.sql.exec('UPDATE '+table+' SET title=?,body=?,revision=revision+1,updatedAt=? WHERE id=?',content.title,content.body,Date.now(),Math.abs(id));
   return{id,revision:expectedRevision+1,deleted:action==='delete'};
  });
  return Response.json({...this.list(data.owner),changed});
 }
 fetch(path,data){
  try{
   if(path==='/wealth/notices')return Response.json(this.list(data.owner));
   if(!this.admin.isAdmin(data.owner))fail('admin-required',403);
   if(path==='/wealth/admin/recipients')return Response.json({recipients:this.sql.exec('SELECT id,name,rebirths FROM wealth_scores_v2 ORDER BY name,id LIMIT 1000').toArray()});
   if(path==='/wealth/admin/notice-history')return Response.json(this.history(data.offset));
   if(path==='/wealth/admin/notice-edit'||path==='/wealth/admin/notice-delete')return this.change(path,data);
   const {title,body}=this.content(data),recipient=data.recipient===undefined?'':data.recipient;
   if(typeof recipient!=='string'||recipient!==''&&!/^[a-f0-9]{64}$/.test(recipient))fail('notice-recipient');
   if(path==='/wealth/admin/personal-notices'&&!recipient||path==='/wealth/admin/notices'&&recipient)fail('notice-recipient');
   const sent=this.receipt(data.requestId,{action:'publish',title,body,recipient},()=>{
    let recipientName='';
    if(recipient){const row=this.sql.exec('SELECT name FROM wealth_scores_v2 WHERE id=?',recipient).toArray()[0];if(!row)fail('notice-recipient',404);recipientName=row.name;}
    // Pre-receipt clients may have inserted a row since migration (e.g. rollback/redeploy).
    const legacy=this.sql.exec("SELECT id,title,body,'' AS recipient,'' AS recipientName FROM operation_notices WHERE requestId=? UNION ALL SELECT -id AS id,title,body,recipient,recipientName FROM operation_personal_notices WHERE requestId=?",data.requestId,data.requestId).toArray()[0];
    if(legacy){if(legacy.title!==title||legacy.body!==body||legacy.recipient!==recipient)fail('notice-changed',409);return{id:legacy.id,audience:recipient?'personal':'all',recipientName:legacy.recipientName};}
    if(recipient)this.sql.exec('INSERT INTO operation_personal_notices(requestId,recipient,recipientName,title,body,createdAt) VALUES(?,?,?,?,?,?)',data.requestId,recipient,recipientName,title,body,Date.now());
    else this.sql.exec('INSERT INTO operation_notices(requestId,title,body,createdAt) VALUES(?,?,?,?)',data.requestId,title,body,Date.now());
    const id=this.sql.exec('SELECT id FROM '+(recipient?'operation_personal_notices':'operation_notices')+' WHERE requestId=?',data.requestId).toArray()[0].id;
    return{id:recipient?-id:id,audience:recipient?'personal':'all',recipientName};
   });
   return Response.json({...this.list(data.owner),sent});
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
