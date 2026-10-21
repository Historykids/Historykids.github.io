const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),{harness}=require('./holdem-harness.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),flush=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,3));};
let checks=0;const opened=[];const test=async(name,work)=>{await work();checks++;console.log('PASS',name);};
function page(h,i=0,{visible=true,map=null}={}){
 const store=map||new Map([['hk_wealth_identity_v1',h.tokens[i]]]),w=new JSDOM(read('index.html'),{url:'https://historykids.github.io/',runScripts:'outside-only',pretendToBeVisual:true}).window;opened.push(w);
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});w.fetch=(...args)=>h.fetch(...args);w.HKRankingConfig={endpoint:'https://api.example/ranking'};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const $=id=>w.document.getElementById(id);$('view-notifications').hidden=!visible;w.eval(read('assets/ui/community.js'));w.HKAdmin={session:()=>w.HKCommunity.request('/wealth/admin/session',undefined,false)};w.eval(read('assets/ui/notices.js'));
 return{w,$,map:store,click:(action,id)=>$('noticeHistoryList').querySelector('[data-notice-action="'+action+'"][data-notice-id="'+id+'"]').click(),submit:()=> $('noticeUpdateForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),close:()=>w.close()};
}
async function setup(){const h=await harness();h.db.prepare('INSERT INTO wealth_admin_owner(singleton,owner,createdAt) VALUES(1,?,?)').run(h.owner(0),1);await h.register(1);await h.register(2);return h;}
async function send(h,personal=false){return(await h.req('/wealth/admin/'+(personal?'personal-notices':'notices'),{requestId:crypto.randomUUID(),title:personal?'個人の件名':'全員の件名',body:personal?'秘密の本文':'全体本文',...(personal?{recipient:h.owner(1)}:{})})).body.sent.id;}
(async()=>{
 await test('administrator history lists both delivery types safely; visitors cannot see management or trigger its actions',async()=>{
  const h=await setup();const id=await send(h,true),all=await send(h);const p=page(h);await flush();assert(!p.$('noticeManage').hidden);assert.equal(p.$('noticeHistoryList').querySelectorAll('article').length,2);assert(p.$('noticeHistoryList').textContent.includes(h.owner(1).slice(0,8)));assert(!p.$('noticeList').textContent.includes('秘密の本文'));
  const visitor=page(h,2);await flush();assert(visitor.$('noticeManage').hidden);assert.equal(visitor.$('noticeHistoryList').children.length,0);visitor.$('noticeDeleteCommit').click();visitor.submit();await flush();assert.equal((await h.req('/wealth/admin/notice-history')).body.total,2);p.close();visitor.close();h.close();
 });
 await test('personal edits retain their target, render plain text, disable double submits and retry a lost response exactly once',async()=>{
  const h=await setup(),id=await send(h,true),p=page(h);await flush();p.click('edit',id);assert(!p.$('noticeManager').hidden);assert.equal(p.$('noticeUpdateTitle').value,'個人の件名');assert(p.$('noticeManagerTarget').textContent.includes(h.owner(1).slice(0,8)));
  p.$('noticeUpdateTitle').value='修正版';p.$('noticeUpdateBody').value='<img src=x onerror=alert(1)>\n改行';h.lose('/wealth/admin/notice-edit');p.submit();p.submit();await flush();assert(!p.$('noticeManager').hidden);assert.equal(h.calls.filter(c=>c.path==='/wealth/admin/notice-edit').length,1);
  p.submit();await flush();assert(p.$('noticeManager').hidden);assert(p.$('noticeManageStatus').textContent.includes('編集しました'));assert.equal(p.$('noticeHistoryList').querySelectorAll('img').length,0);assert(p.$('noticeHistoryList').textContent.includes('編集済み'));
  const n=(await h.req('/wealth/notices',undefined,1)).body.notices[0];assert.equal(n.revision,2);assert.equal(n.body,'<img src=x onerror=alert(1)>\n改行');assert(!(await h.req('/wealth/notices',undefined,2)).body.notices.some(n=>n.id===id));
  const requests=h.calls.filter(c=>c.path==='/wealth/admin/notice-edit').map(c=>c.body);assert.equal(requests[0].requestId,requests[1].requestId);assert(!('recipient' in requests[0]));p.close();h.close();
 });
 await test('deletion requires confirmation, can be cancelled and a lost response retries without reappearing',async()=>{
  const h=await setup(),id=await send(h),p=page(h);await flush();p.click('delete',id);assert(!p.$('noticeDeleteConfirm').hidden);assert(p.$('noticeUpdateForm').hidden);p.$('noticeDeleteCancel').click();assert(p.$('noticeManager').hidden);assert.equal(h.calls.filter(c=>c.path==='/wealth/admin/notice-delete').length,0);
  p.click('delete',id);h.lose('/wealth/admin/notice-delete');p.$('noticeDeleteCommit').click();p.$('noticeDeleteCommit').click();await flush();assert(!p.$('noticeDeleteConfirm').hidden);p.$('noticeDeleteCommit').click();await flush();assert(p.$('noticeManager').hidden);assert(p.$('noticeManageStatus').textContent.includes('削除しました'));assert(p.$('noticeHistoryEmpty').hidden===false);assert.equal(p.$('noticeList').children.length,0);assert.equal((await h.req('/wealth/notices',undefined,1)).body.notices.length,0);p.close();h.close();
 });
 await test('concurrent edits show a clear conflict, retain typed text and require choosing the updated record',async()=>{
  const h=await setup(),id=await send(h),p=page(h);await flush();p.click('edit',id);p.$('noticeUpdateBody').value='この画面の変更';await h.req('/wealth/admin/notice-edit',{requestId:crypto.randomUUID(),id,expectedRevision:1,title:'別画面',body:'別画面の変更'});p.submit();await flush();assert(p.$('noticeManageStatus').textContent.includes('別の画面'));assert.equal(p.$('noticeUpdateBody').value,'この画面の変更');assert.equal((await h.req('/wealth/notices')).body.notices[0].body,'別画面の変更');p.$('noticeUpdateCancel').click();p.$('noticeHistoryRefresh').click();await flush();p.click('edit',id);assert.equal(p.$('noticeUpdateBody').value,'別画面の変更');p.close();h.close();
 });
 await test('account changes erase private editor/history content and ignore an older in-flight administrator response',async()=>{
  const h=await setup(),id=await send(h,true),p=page(h);await flush();p.click('edit',id);let release;const gate=new Promise(r=>release=r),original=h.fetch;h.fetch=async(url,opt)=>{const r=await original(url,opt);if(new URL(url).pathname==='/wealth/admin/notice-history')await gate;return r;};p.$('noticeHistoryRefresh').click();await flush();p.map.set('hk_wealth_identity_v1',h.tokens[2]);p.w.dispatchEvent(new p.w.StorageEvent('storage',{key:'hk_wealth_identity_v1'}));release();await flush();assert(p.$('noticeManage').hidden);assert(p.$('noticeManager').hidden);assert.equal(p.$('noticeUpdateBody').value,'');assert(!p.w.document.body.textContent.includes('秘密の本文'));assert(!p.w.document.body.textContent.includes(h.owner(1).slice(0,8)));p.$('noticeDeleteCommit').click();p.submit();await flush();assert.equal((await h.req('/wealth/admin/notice-history')).body.total,1);p.close();h.close();
 });
 await test('an edited notification becomes unread again and a recipient refresh removes a deleted notification',async()=>{
  const h=await setup(),id=await send(h),p=page(h,1);await flush();const key='hk_notice_seen_v3_'+h.tokens[1].slice(0,12);assert.deepEqual(JSON.parse(p.map.get(key)),[String(id)]);
  p.$('view-notifications').hidden=true;await h.req('/wealth/admin/notice-edit',{requestId:crypto.randomUUID(),id,expectedRevision:1,title:'更新版',body:'変更本文'});p.$('noticeRefresh').click();await flush();assert(!p.$('noticeUnread').hidden);assert.equal(p.$('noticeUnread').textContent,'1');assert(p.$('noticeList').textContent.includes('編集済み'));
  p.$('view-notifications').hidden=false;p.w.dispatchEvent(new p.w.CustomEvent('hk-view-change',{detail:'notifications'}));await flush();assert(p.$('noticeUnread').hidden);assert(JSON.parse(p.map.get(key)).includes(id+':2'));
  await h.req('/wealth/admin/notice-delete',{requestId:crypto.randomUUID(),id,expectedRevision:2});p.$('noticeRefresh').click();await flush();assert.equal(p.$('noticeList').children.length,0);assert(!p.$('noticeEmpty').hidden);p.close();h.close();
 });
 await test('older sent notices can be loaded and invalid or cancelled edits do not reach the server',async()=>{
  const h=await setup();for(let i=0;i<55;i++)h.db.prepare('INSERT INTO operation_notices(requestId,title,body,createdAt) VALUES(?,?,?,?)').run(crypto.randomUUID(),'通知'+i,'本文',i);
  const p=page(h);await flush();assert.equal(p.$('noticeHistoryList').children.length,50);assert(!p.$('noticeHistoryMore').hidden);p.$('noticeHistoryMore').click();await flush();assert.equal(p.$('noticeHistoryList').children.length,55);assert(p.$('noticeHistoryMore').hidden);p.click('edit',1);p.$('noticeUpdateBody').value='a'.repeat(2001);p.submit();await flush();assert(p.$('noticeManageStatus').textContent.includes('2,000'));assert.equal(h.calls.filter(c=>c.path==='/wealth/admin/notice-edit').length,0);p.$('noticeUpdateCancel').click();assert.equal((await h.req('/wealth/notices')).body.notices.find(n=>n.id===1).body,'本文');p.close();h.close();
 });
 await test('an older feed response cannot restore deleted content after a successful management action',async()=>{
  const h=await setup(),id=await send(h),p=page(h);await flush();let release;const gate=new Promise(r=>release=r),original=h.fetch;
  h.fetch=async(url,opt)=>{const r=await original(url,opt);if(new URL(url).pathname==='/wealth/notices')await gate;return r;};
  p.$('noticeRefresh').click();await flush();p.click('delete',id);p.$('noticeDeleteCommit').click();await flush();assert.equal(p.$('noticeList').children.length,0);release();await flush();assert.equal(p.$('noticeList').children.length,0);p.close();h.close();
 });
 console.log(checks+' notification management UI checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>opened.forEach(w=>w.close()));
