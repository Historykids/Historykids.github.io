export const noticeRoutes=new Set(['/wealth/notices','/wealth/admin/notices']);
export class WealthNotices{
 constructor(storage,admin){this.sql=storage.sql;this.admin=admin;this.sql.exec('CREATE TABLE IF NOT EXISTS operation_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL)');}
 list(){return{notices:this.sql.exec('SELECT id,title,body,createdAt FROM operation_notices ORDER BY id DESC LIMIT 100').toArray()};}
 fetch(path,data){
  if(path==='/wealth/notices')return Response.json(this.list());
  if(!this.admin.isAdmin(data.owner))return Response.json({error:'admin-required'},{status:403});
  const title=typeof data.title==='string'?data.title.normalize('NFKC').trim():'',body=typeof data.body==='string'?data.body.trim():'';
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId||'')||!title||Array.from(title).length>80||!body||Array.from(body).length>2000)return Response.json({error:'notice-input'},{status:400});
  const old=this.sql.exec('SELECT title,body FROM operation_notices WHERE requestId=?',data.requestId).toArray()[0];
  if(old&&(old.title!==title||old.body!==body))return Response.json({error:'notice-changed'},{status:409});
  this.sql.exec('INSERT OR IGNORE INTO operation_notices(requestId,title,body,createdAt) VALUES(?,?,?,?)',data.requestId,title,body,Date.now());
  return Response.json(this.list());
 }
}
