// PIN verifier for Sengoku administrative operations. No PIN or verifier is exposed in public assets.
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=value=>Uint8Array.from(value.match(/../g)||[],byte=>parseInt(byte,16));
async function hashPin(pin,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromHex(salt),iterations:180000,hash:'SHA-256'},key,256);
 return hex(new Uint8Array(bits));
}
function equalHex(a,b){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export class SengokuAdminPin{
 constructor(sql,admin){
  this.sql=sql;this.admin=admin;
  sql.exec('CREATE TABLE IF NOT EXISTS sengoku_admin_pin(singleton INTEGER PRIMARY KEY CHECK(singleton=1),salt TEXT NOT NULL,hash TEXT NOT NULL,failures INTEGER NOT NULL DEFAULT 0,lockedUntil INTEGER NOT NULL DEFAULT 0,createdAt INTEGER NOT NULL)');
 }
 requireOwner(owner){if(!this.admin.isAdmin(owner))fail('admin-required',403);}
 row(){return this.sql.exec('SELECT salt,hash,failures,lockedUntil FROM sengoku_admin_pin WHERE singleton=1').toArray()[0];}
 status(owner){this.requireOwner(owner);return{admin:true,configured:!!this.row()};}
 async setup(owner,data){
  this.requireOwner(owner);
  if(this.row())fail('admin-pin-configured',409);
  if(!/^\\d{4,8}$/.test(data.pin||''))fail('admin-pin-format');
  // Setup requires the original administrator bootstrap secret, not just a claimed account.
  if(!await this.admin.verify(data.bootstrapCode))fail('admin-bootstrap-invalid',403);
  if(this.row())fail('admin-pin-configured',409);
  const salt=hex(crypto.getRandomValues(new Uint8Array(24)));
  const hash=await hashPin(data.pin,salt);
  this.sql.exec('INSERT OR IGNORE INTO sengoku_admin_pin(singleton,salt,hash,createdAt) VALUES(1,?,?,?)',salt,hash,Date.now());
  return this.status(owner);
 }
 async verify(owner,pin){
  this.requireOwner(owner);
  const row=this.row();if(!row)fail('admin-pin-setup-required',403);
  if(row.lockedUntil>Date.now())fail('admin-pin-locked',429);
  if(typeof pin!=='string'||!/^\\d{4,8}$/.test(pin))fail('admin-pin-required',403);
  const actual=await hashPin(pin,row.salt);
  if(!equalHex(actual,row.hash)){
   const failures=row.failures+1,lockedUntil=failures>=5?Date.now()+30*60*1000:0;
   this.sql.exec('UPDATE sengoku_admin_pin SET failures=?,lockedUntil=? WHERE singleton=1',failures>=5?0:failures,lockedUntil);
   fail(failures>=5?'admin-pin-locked':'admin-pin-invalid',403);
  }
  if(row.failures||row.lockedUntil)this.sql.exec('UPDATE sengoku_admin_pin SET failures=0,lockedUntil=0 WHERE singleton=1');
 }
}
