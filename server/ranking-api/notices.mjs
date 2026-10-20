export const noticeRoutes=new Set(['/wealth/notices','/wealth/admin/notices','/wealth/admin/personal-notices','/wealth/admin/recipients']);
export class WealthNotices{
 constructor(storage,admin){
  this.sql=storage.sql;this.admin=admin;
  this.sql.exec('CREATE TABLE IF NOT EXISTS operation_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL)');
  // Older clients and Worker versions only query the broadcast table.
  this.sql.exec('CREATE TABLE IF NOT EXISTS operation_personal_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,recipient TEXT NOT NULL,recipientName TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS personal_notice_recipient ON operation_personal_notices(recipient,createdAt DESC)');
 }
 list(owner=''){
  return{notices:this.sql.exec("SELECT id,title,body,createdAt,'all' AS audience FROM operation_notices UNION ALL SELECT -id AS id,title,body,createdAt,'personal' AS audience FROM operation_personal_notices WHERE recipient=? ORDER BY createdAt DESC,id DESC LIMIT 100",owner||'').toArray()};
 }
 fetch(path,data){
  if(path==='/wealth/notices')return Response.json(this.list(data.owner));
  if(!this.admin.isAdmin(data.owner))return Response.json({error:'admin-required'},{status:403});
  if(path==='/wealth/admin/recipients')return Response.json({recipients:this.sql.exec('SELECT id,name,rebirths FROM wealth_scores_v2 ORDER BY name,id LIMIT 1000').toArray()});
  const title=typeof data.title==='string'?data.title.normalize('NFKC').trim():'',body=typeof data.body==='string'?data.body.trim():'',recipient=data.recipient===undefined?'':data.recipient;
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId||'')||!title||Array.from(title).length>80||!body||Array.from(body).length>2000)return Response.json({error:'notice-input'},{status:400});
  if(typeof recipient!=='string'||recipient!==''&&!/^[a-f0-9]{64}$/.test(recipient))return Response.json({error:'notice-recipient'},{status:400});
  if(path==='/wealth/admin/personal-notices'&&!recipient||path==='/wealth/admin/notices'&&recipient)return Response.json({error:'notice-recipient'},{status:400});
  const old=this.sql.exec("SELECT title,body,'' AS recipient,'' AS recipientName FROM operation_notices WHERE requestId=? UNION ALL SELECT title,body,recipient,recipientName FROM operation_personal_notices WHERE requestId=?",data.requestId,data.requestId).toArray()[0];
  if(old&&(old.title!==title||old.body!==body||old.recipient!==recipient))return Response.json({error:'notice-changed'},{status:409});
  let recipientName=old?.recipientName||'';
  if(!old&&recipient){const row=this.sql.exec('SELECT name FROM wealth_scores_v2 WHERE id=?',recipient).toArray()[0];if(!row)return Response.json({error:'notice-recipient'},{status:404});recipientName=row.name;}
  if(!old){
   if(recipient)this.sql.exec('INSERT INTO operation_personal_notices(requestId,recipient,recipientName,title,body,createdAt) VALUES(?,?,?,?,?,?)',data.requestId,recipient,recipientName,title,body,Date.now());
   else this.sql.exec('INSERT INTO operation_notices(requestId,title,body,createdAt) VALUES(?,?,?,?)',data.requestId,title,body,Date.now());
  }
  return Response.json({...this.list(data.owner),sent:{audience:recipient?'personal':'all',recipientName}});
 }
}
