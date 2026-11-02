import {provisioningHash,authVersion,transferHash} from './admin-step-up.mjs';
import {recoveryHash,recoverAdminPassword} from './admin-password-recovery.mjs';
// PIN verifier for Sengoku administrative operations. No PIN or verifier is exposed in public assets.
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=value=>Uint8Array.from(value.match(/../g)||[],byte=>parseInt(byte,16));
async function hashPin(pin,salt,iterations=100000){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromHex(salt),iterations,hash:'SHA-256'},key,256);
 return hex(new Uint8Array(bits));
}
function equalHex(a,b){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export class SengokuAdminPin{
 constructor(sql,admin){
  this.sql=sql;this.admin=admin;this.provisioningHash=provisioningHash;this.transferHash=transferHash;this.recoveryHash=recoveryHash;
  sql.exec('CREATE TABLE IF NOT EXISTS sengoku_admin_pin(singleton INTEGER PRIMARY KEY CHECK(singleton=1),salt TEXT NOT NULL,hash TEXT NOT NULL,failures INTEGER NOT NULL DEFAULT 0,lockedUntil INTEGER NOT NULL DEFAULT 0,createdAt INTEGER NOT NULL)');
  if(!sql.exec('PRAGMA table_info(sengoku_admin_pin)').toArray().some(c=>c.name==='iterations'))sql.exec('ALTER TABLE sengoku_admin_pin ADD COLUMN iterations INTEGER NOT NULL DEFAULT 180000');
 }
 requireOwner(owner){if(!this.admin.isAdmin(owner))fail('admin-required',403);}
 row(){return this.sql.exec('SELECT salt,hash,failures,lockedUntil,iterations FROM sengoku_admin_pin WHERE singleton=1').toArray()[0];}
 status(owner){this.requireOwner(owner);const row=this.row();return{admin:true,configured:!!row,requiresUpgrade:!!row&&row.iterations>100000,authVersion};}
 async setup(owner,data){
  this.requireOwner(owner);
  if(this.row()?.iterations<=100000)fail('admin-pin-configured',409);
  if(!/^\d{4,8}$/.test(data.pin||''))fail('admin-pin-format');
  // Setup requires the original administrator bootstrap secret, not just a claimed account.
  if(!await this.admin.verify(data.bootstrapCode))fail('admin-bootstrap-invalid',403);
  if(this.row()?.iterations<=100000)fail('admin-pin-configured',409);
  const salt=hex(crypto.getRandomValues(new Uint8Array(24)));
  const hash=await hashPin(data.pin,salt);
  this.admin.atomic(()=>{if(this.row()?.iterations<=100000)fail('admin-pin-configured',409);this.sql.exec('INSERT INTO sengoku_admin_pin(singleton,salt,hash,createdAt,iterations) VALUES(1,?,?,?,100000) ON CONFLICT(singleton) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,createdAt=excluded.createdAt,iterations=100000,failures=0,lockedUntil=0',salt,hash,Date.now());});
  return this.status(owner);
 }
 async provision(data){
  const token=typeof data.capability==='string'?data.capability:'';
  const actual=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
  if(data.operation==='sironagasu7777-login-reset-20261102-v1'){if(!equalHex(actual,this.recoveryHash))fail('admin-required',403);return recoverAdminPassword(this.sql,this.admin,data);}
  if(data.operation==='transfer-sironagasu7777-v1'){
   if(!equalHex(actual,this.transferHash))fail('admin-required',403);
   this.sql.exec('CREATE TABLE IF NOT EXISTS admin_security_changes(id TEXT PRIMARY KEY,createdAt INTEGER NOT NULL)');
   const done=()=>this.sql.exec('SELECT id FROM admin_security_changes WHERE id=?',data.operation).toArray().length;
   if(done())return{transferred:true,passwordChanged:true,replayed:true};
   const account=name=>this.sql.exec('SELECT owner,rankOwner FROM player_accounts WHERE username=?',name).toArray()[0];
   const source=account('sironagasu'),target=account('sironagasu7777');
   if(!source||!target)fail('admin-transfer-account-missing',409);
   if(![source.owner,source.rankOwner].includes(this.admin.owner()))fail('admin-transfer-owner-conflict',409);
   if(typeof data.pin!=='string'||!/^\d{4,8}$/.test(data.pin))fail('admin-pin-format');
   const salt=hex(crypto.getRandomValues(new Uint8Array(24))),hash=await hashPin(data.pin,salt);
   this.admin.atomic(()=>{
    if(done())return;
    if(![source.owner,source.rankOwner].includes(this.admin.owner()))fail('admin-transfer-owner-conflict',409);
    this.sql.exec('UPDATE wealth_admin_owner SET owner=? WHERE singleton=1',target.owner);
    this.sql.exec('INSERT INTO sengoku_admin_pin(singleton,salt,hash,createdAt,iterations) VALUES(1,?,?,?,100000) ON CONFLICT(singleton) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,createdAt=excluded.createdAt,iterations=100000,failures=0,lockedUntil=0',salt,hash,Date.now());
    this.sql.exec('INSERT INTO admin_security_changes(id,createdAt) VALUES(?,?)',data.operation,Date.now());
   });
   return{transferred:true,passwordChanged:true};
  }
  if(!equalHex(actual,this.provisioningHash))fail('admin-required',403);
  const existing=this.row();if(existing)return{configured:true,keptExisting:true,requiresUpgrade:existing.iterations>100000,authVersion};
  if(typeof data.pin!=='string'||!/^\d{4,8}$/.test(data.pin))fail('admin-pin-format');
  const salt=hex(crypto.getRandomValues(new Uint8Array(24))),hash=await hashPin(data.pin,salt);
  this.sql.exec('INSERT OR IGNORE INTO sengoku_admin_pin(singleton,salt,hash,createdAt,iterations) VALUES(1,?,?,?,100000)',salt,hash,Date.now());
  return{configured:true,keptExisting:this.row().salt!==salt,authVersion};
 }
 async verify(owner,pin){
  this.requireOwner(owner);
  const row=this.row();if(!row)fail('admin-pin-setup-required',403);
  if(row.lockedUntil>Date.now())fail('admin-pin-locked',429);
  if(typeof pin!=='string'||!/^\d{4,8}$/.test(pin))fail('admin-pin-required',403);
  if(row.iterations>100000)fail('admin-pin-upgrade-required',403);
  const failures=this.admin.atomic(()=>{const current=this.row();if(current.lockedUntil>Date.now())fail('admin-pin-locked',429);const count=current.failures+1,lockedUntil=count>=5?Date.now()+30*60*1000:0;this.sql.exec('UPDATE sengoku_admin_pin SET failures=?,lockedUntil=? WHERE singleton=1',count>=5?0:count,lockedUntil);return count;});
  const actual=await hashPin(pin,row.salt,row.iterations);
  if(!equalHex(actual,row.hash))fail(failures>=5?'admin-pin-locked':'admin-pin-invalid',403);
  this.sql.exec('UPDATE sengoku_admin_pin SET failures=0,lockedUntil=0 WHERE singleton=1');
 }
}
