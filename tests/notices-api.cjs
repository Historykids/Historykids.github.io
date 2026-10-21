const assert=require('node:assert/strict'),{harness}=require('./holdem-harness.cjs');
let checks=0;const test=async(name,work)=>{await work();checks++;console.log('PASS',name);};
(async()=>{
 const h=await harness(),req=h.req;h.db.prepare('INSERT INTO wealth_admin_owner(singleton,owner,createdAt) VALUES(1,?,?)').run(h.owner(0),h.now);
 const publish=(key,personal=false)=>req('/wealth/admin/'+(personal?'personal-notices':'notices'),{requestId:key,title:'元の件名',body:'元の本文',...(personal?{recipient:h.owner(1)}:{})});
 try{
 await h.register(1);await h.register(2);
 await test('history and all mutation routes reject anonymous callers and forged administrator identities',async()=>{
  for(const path of ['/wealth/admin/notice-history','/wealth/admin/notice-edit','/wealth/admin/notice-delete']){
   const r=await req(path,path.endsWith('history')?undefined:{requestId:crypto.randomUUID(),owner:h.owner(0),admin:true,id:1,expectedRevision:1,title:'偽の件名',body:'本文'},2);assert.equal(r.status,403);
   const anonymous=await h.fetch('https://api.example'+path,{method:path.endsWith('history')?'GET':'POST',headers:{'Content-Type':'application/json'},...(path.endsWith('history')?{}:{body:'{}'})});assert.equal(anonymous.status,401);
  }
 });
 let all,personal;
 await test('sent history contains both delivery types and recipient metadata is administrator-only',async()=>{
  all=(await publish('manage_public_00001')).body.sent.id;personal=(await publish('manage_personal_001',true)).body.sent.id;
  const list=(await req('/wealth/admin/notice-history')).body;assert.equal(list.total,2);assert.equal(list.notices.find(n=>n.id===personal).recipient,h.owner(1));assert.equal(list.notices.find(n=>n.id===all).revision,1);
  for(const i of [0,1,2]){const feed=(await req('/wealth/notices',undefined,i)).body;assert(!JSON.stringify(feed).includes('recipient'));assert.equal(feed.notices.some(n=>n.id===personal),i===1);}
 });
 let edit;
 await test('editing preserves identifiers, creation dates and personal delivery; retries survive restart',async()=>{
  const original=(await req('/wealth/notices',undefined,1)).body.notices.find(n=>n.id===personal);
  edit={requestId:'manage_edit_000001',id:personal,expectedRevision:1,title:'修正済み',body:'秘密の修正\n<img src=x>'};
  assert.equal((await req('/wealth/admin/notice-edit',edit)).status,200);h.restart();assert.equal((await req('/wealth/admin/notice-edit',edit)).status,200);
  const n=(await req('/wealth/notices',undefined,1)).body.notices.find(n=>n.id===personal);assert.equal(n.revision,2);assert.equal(n.createdAt,original.createdAt);assert(n.updatedAt>0);assert.equal(n.body,edit.body);
  for(const i of [0,2])assert(!(await req('/wealth/notices',undefined,i)).body.notices.some(n=>n.body===edit.body));
  assert.equal((await publish('manage_personal_001',true)).status,200);assert.equal((await req('/wealth/notices',undefined,1)).body.notices.find(n=>n.id===personal).body,edit.body);
 });
 await test('public edits reach all readers without resending and stale editors cannot overwrite new content',async()=>{
  const body={requestId:'manage_edit_all001',id:all,expectedRevision:1,title:'全体を修正',body:'新しい本文'};assert.equal((await req('/wealth/admin/notice-edit',body)).status,200);
  for(const i of [0,1,2])assert.equal((await req('/wealth/notices',undefined,i)).body.notices.find(n=>n.id===all).body,'新しい本文');
  assert.equal((await req('/wealth/admin/notice-edit',{...body,requestId:crypto.randomUUID(),body:'古い画面の編集'})).status,409);
  assert.equal((await req('/wealth/admin/notice-delete',{requestId:crypto.randomUUID(),id:all,expectedRevision:1})).status,409);
  assert.equal((await req('/wealth/admin/notice-edit',{...body,body:'同じIDで改変'})).status,409);
 });
 await test('deleting public and personal notices removes delivery and original publish retries never resurrect them',async()=>{
  for(const [id,key,isPersonal] of [[all,'manage_public_00001',false],[personal,'manage_personal_001',true]]){
   const body={requestId:crypto.randomUUID(),id,expectedRevision:2};assert.equal((await req('/wealth/admin/notice-delete',body)).status,200);h.restart();assert.equal((await req('/wealth/admin/notice-delete',body)).status,200);
   assert.equal((await publish(key,isPersonal)).status,200);for(const i of [0,1,2])assert(!(await req('/wealth/notices',undefined,i)).body.notices.some(n=>n.id===id));
   assert.equal((await req('/wealth/admin/notice-edit',{requestId:crypto.randomUUID(),id,expectedRevision:2,title:'復活',body:'本文'})).status,404);
  }
  assert.equal((await req('/wealth/admin/notice-history')).body.total,0);
  assert.equal((await req('/wealth/admin/notice-edit',edit)).status,200);assert.equal((await req('/wealth/admin/notice-history')).body.total,0);
 });
 await test('existing unversioned notices migrate without changing content and deletion retains legacy send receipts',async()=>{
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec("CREATE TABLE operation_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL);CREATE TABLE operation_personal_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,requestId TEXT NOT NULL UNIQUE,recipient TEXT NOT NULL,recipientName TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,createdAt INTEGER NOT NULL)");
  db.prepare('INSERT INTO operation_notices VALUES(1,?,?,?,?)').run('legacy_managed_0001','旧件名','旧本文',123);
  db.prepare('INSERT INTO operation_personal_notices VALUES(1,?,?,?,?,?,?)').run('legacy_managed_0002',h.owner(1),'旧登録者','旧個人件名','旧個人本文',124);
  const storage={sql:{exec(q,...a){const s=db.prepare(q);if(/^(SELECT|PRAGMA)/i.test(q))return{toArray:()=>s.all(...a)};s.run(...a);return{toArray:()=>[]};}}},admin={isAdmin:()=>true,atomic:fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const {WealthNotices}=await import('../server/ranking-api/notices.mjs');const n=new WealthNotices(storage,admin);
  assert.equal(n.list(h.owner(1)).notices.length,2);assert.equal(n.list('').notices[0].createdAt,123);
  assert.equal(n.fetch('/wealth/admin/notice-delete',{id:1,expectedRevision:1,requestId:'legacy_delete_0001'}).status,200);
  assert.equal(n.fetch('/wealth/admin/notices',{requestId:'legacy_managed_0001',title:'旧件名',body:'旧本文'}).status,200);assert.equal(n.list('').notices.length,0);
  const n2=new WealthNotices(storage,admin);assert.equal(n2.list(h.owner(1)).notices[0].body,'旧個人本文');db.close();
 });
 await test('failed receipt writes roll back edits and deletes together and retries apply exactly once',async()=>{
  const id=(await publish('manage_atomic_0001')).body.sent.id;
  for(const action of ['edit','delete']){
   const body={requestId:crypto.randomUUID(),id,expectedRevision:action==='edit'?1:2,...(action==='edit'?{title:'変更',body:'変更本文'}:{})};
   h.failSql('INSERT INTO operation_notice_receipts');assert.equal((await req('/wealth/admin/notice-'+action,body)).status,503);h.failSql('');
   assert.equal((await req('/wealth/notices')).body.notices.find(n=>n.id===id).revision,body.expectedRevision);assert.equal((await req('/wealth/admin/notice-'+action,body)).status,200);
  }
 });
 await test('malformed IDs, revisions, content and attempted delivery changes are rejected without changes',async()=>{
  const id=(await publish('manage_validate001')).body.sent.id,body={requestId:crypto.randomUUID(),id,expectedRevision:1,title:'件名',body:'本文'};
  for(const patch of [{id:0},{id:'1'},{id:1.5},{expectedRevision:0},{expectedRevision:'1'},{title:''},{body:'a'.repeat(2001)},{requestId:['array_request_0001']}])assert.equal((await req('/wealth/admin/notice-edit',{...body,...patch})).status,400);
  for(const patch of [{recipient:h.owner(2)},{audience:'personal'}])assert.equal((await req('/wealth/admin/notice-edit',{...body,...patch})).status,400);
  assert.equal((await req('/wealth/notices')).body.notices.find(n=>n.id===id).revision,1);
  assert.equal((await req('/wealth/admin/notice-history?offset=-1')).status,400);
 });
 await test('administrator history paginates beyond the public feed and old deliveries remain editable',async()=>{
  for(let i=0;i<105;i++)h.db.prepare('INSERT INTO operation_notices(requestId,title,body,createdAt) VALUES(?,?,?,?)').run('manage_page_'+String(i).padStart(16,'0'),'通知'+i,'本文',i);
  const first=(await req('/wealth/admin/notice-history')).body,second=(await req('/wealth/admin/notice-history?offset='+first.nextOffset)).body,third=(await req('/wealth/admin/notice-history?offset='+second.nextOffset)).body;
  assert.equal(first.notices.length,50);assert.equal(second.notices.length,50);assert.equal(third.nextOffset,null);assert.equal(new Set([...first.notices,...second.notices,...third.notices].map(n=>n.id)).size,106);
  const old=third.notices.at(-1);assert.equal((await req('/wealth/admin/notice-edit',{requestId:crypto.randomUUID(),id:old.id,expectedRevision:old.revision,title:'古い通知も編集',body:'修正'})).status,200);
 });
 await test('a password account retains its administrator notice rights while its bound guest token is rejected',async()=>{
  const progress={version:1,values:{hk_wallet_v2:JSON.stringify({version:2,balance:'10000',rebirths:0,pending:null,history:[]})}};
  const registered=await req('/wealth/account/register',{username:'notice_admin',password:'testing password 1234',progress});assert.equal(registered.status,200);
  const token=registered.body.token;
  const fetch=async(path,body)=>{const r=await h.fetch('https://api.example'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
  const history=await fetch('/wealth/admin/notice-history');assert.equal(history.status,200);const n=history.body.notices[0];
  assert.equal((await req('/wealth/admin/notice-history')).status,401);
  assert.equal((await fetch('/wealth/admin/notice-edit',{requestId:crypto.randomUUID(),id:n.id,expectedRevision:n.revision,title:'ログイン後の修正',body:'本文'})).status,200);
  assert.equal((await fetch('/wealth/admin/notice-delete',{requestId:crypto.randomUUID(),id:n.id,expectedRevision:n.revision+1})).status,200);
 });
 console.log(checks+' notification management API checks passed.');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
