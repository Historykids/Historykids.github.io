import {scrypt,timingSafeEqual} from 'node:crypto';
import '../../assets/ui/account-data.js';
import '../../assets/ui/amounts.js';
const D=globalThis.HKAccountData,M=globalThis.HKAmounts;
const routes=['register','login','session','logout','password','rename','save','load','capabilities'];
export const accountRoutes=new Set(routes.map(p=>'/wealth/account/'+p));
const validToken=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
const hex=a=>Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const fail=(error,status=400)=>{throw Object.assign(Error(error),{status});};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function username(value){
 if(typeof value!=='string')return null;
 const name=value.normalize('NFKC').trim();
 return /^[\p{L}\p{N}_-]{3,24}$/u.test(name)?{name,key:name.toLocaleLowerCase('ja-JP')}:null;
}
function password(value){return typeof value==='string'&&Array.from(value).length>=8&&Array.from(value).length<=128&&new TextEncoder().encode(value).length<=512;}
// OWASP's scrypt alternative: N=2^15, r=8, p=3 (32 MiB). Runs only on the server.
let hashing=Promise.resolve(),queued=0;
export function hashPassword(value,salt){
 if(queued>=4)return Promise.reject(Object.assign(Error('account-try-later'),{status:429}));queued++;
 const result=hashing.then(()=>new Promise((yes,no)=>scrypt(value,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?no(error):yes(key.toString('hex')))));
 hashing=result.catch(()=>{});return result.finally(()=>{queued--;});
}
const equal=(a,b)=>a.length===b.length&&timingSafeEqual(new TextEncoder().encode(a),new TextEncoder().encode(b));
export function progress(value){
 if(!object(value)||value.version!==1||!object(value.values)||Object.keys(value.values).some(k=>!D.keys.includes(k)))fail('account-save-invalid');
 const values={};
 for(const key of D.keys){const v=value.values[key]??null;if(v!==null&&typeof v!=='string')fail('account-save-invalid');values[key]=v;}
 if(new TextEncoder().encode(JSON.stringify(values)).length>D.maxBytes)fail('account-save-large',413);
 let wallet,city,residents;
 try{
  wallet=JSON.parse(values.hk_wallet_v2);city=JSON.parse(values.city_v1||'[]');residents=JSON.parse(values.hk_residents_v1||'[]');
  if(!object(wallet)||wallet.version!==2||!M.valid(wallet.balance)||!M.rebirth.valid(wallet.rebirths??0)||!Array.isArray(wallet.history)||wallet.history.length>8)throw Error();
  if(wallet.redeemedCodes&&(!Array.isArray(wallet.redeemedCodes)||wallet.redeemedCodes.length>100||wallet.redeemedCodes.some(c=>typeof c!=='string'||!/^\d{1,16}$/.test(c))))throw Error();
  if(wallet.pending&&(!object(wallet.pending)||typeof wallet.pending.id!=='string'||!M.valid(wallet.pending.stake)))throw Error();
  if(!Array.isArray(city)||city.length>21600||!Array.isArray(residents)||residents.length>100)throw Error();
  for(const list of [city,residents])if(list.some(b=>!object(b)||typeof b.id!=='string'||!Number.isInteger(b.x)||!Number.isInteger(b.y)||b.x<0||b.x>=60||b.y<0||b.y>=360)||new Set(list.map(b=>b.id)).size!==list.length)throw Error();
  for(const key of D.keys.filter(k=>k.startsWith('cards_')||k==='hk_wrong_v2')){const v=JSON.parse(values[key]||'{}');if(!object(v)||Object.keys(v).length>10000||Object.values(v).some(x=>typeof x!=='boolean'))throw Error();}
 }catch{fail('account-save-invalid');}
 return{version:1,values};
}
export class Accounts{
 constructor(storage){
  this.storage=storage;this.sql=storage.sql;this.now=()=>Date.now();
  this.sql.exec('CREATE TABLE IF NOT EXISTS player_accounts(username TEXT PRIMARY KEY,name TEXT NOT NULL,owner TEXT NOT NULL UNIQUE,rankOwner TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,passwordHash TEXT NOT NULL,passwordVersion INTEGER NOT NULL DEFAULT 1,progress TEXT NOT NULL,revision INTEGER NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS player_sessions(tokenHash TEXT PRIMARY KEY,owner TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS player_sessions_owner ON player_sessions(owner,expiresAt)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS player_name_changes(owner TEXT NOT NULL,requestId TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(owner,requestId))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS player_login_attempts(username TEXT PRIMARY KEY,attempts INTEGER NOT NULL,resetAt INTEGER NOT NULL)');
 }
 row(owner){return this.sql.exec('SELECT * FROM player_accounts WHERE owner=?',owner).toArray()[0];}
 byName(key){return this.sql.exec('SELECT * FROM player_accounts WHERE username=?',key).toArray()[0];}
 bound(hash){return this.sql.exec('SELECT owner FROM player_accounts WHERE owner=? OR rankOwner=?',hash,hash).toArray()[0];}
 resolve(hash,ranking=false){
  if(!hash)return '';
  const session=this.sql.exec('SELECT owner,expiresAt FROM player_sessions WHERE tokenHash=?',hash).toArray()[0];
  if(session){if(session.expiresAt<=this.now())fail('account-session-expired',401);const account=this.row(session.owner);if(!account)fail('account-session-expired',401);return ranking?account.rankOwner:account.owner;}
  if(this.bound(hash))fail('account-session-expired',401);
  return hash;
 }
 authenticated(hash){const s=this.sql.exec('SELECT owner,expiresAt FROM player_sessions WHERE tokenHash=?',hash).toArray()[0];if(!s||s.expiresAt<=this.now())fail('account-session-expired',401);const a=this.row(s.owner);if(!a)fail('account-session-expired',401);return{account:a,session:s};}
 public(a){return{username:a.name,owner:a.owner,revision:a.revision,updatedAt:a.updatedAt};}
 async newSession(a){
  const token=random(),tokenHash=await digest(token),now=this.now(),expiresAt=now+30*86400000;
  const fresh=this.row(a.owner);if(fresh?.passwordVersion!==a.passwordVersion)fail('account-session-expired',401);a=fresh;
  this.sql.exec('UPDATE player_sessions SET expiresAt=0 WHERE owner=? AND tokenHash IN (SELECT tokenHash FROM player_sessions WHERE owner=? AND expiresAt>? ORDER BY createdAt DESC LIMIT -1 OFFSET 9)',a.owner,a.owner,now);
  this.sql.exec('INSERT INTO player_sessions(tokenHash,owner,expiresAt,createdAt) VALUES(?,?,?,?)',tokenHash,a.owner,expiresAt,now);
  return{...this.public(a),token,expiresAt,progress:JSON.parse(a.progress)};
 }
 budget(key){
  const now=this.now();this.sql.exec('DELETE FROM player_login_attempts WHERE resetAt<=?',now);
  const old=this.sql.exec('SELECT attempts,resetAt FROM player_login_attempts WHERE username=?',key).toArray()[0];
  if(old?.attempts>=5)fail('account-try-later',429);
  this.sql.exec('INSERT INTO player_login_attempts(username,attempts,resetAt) VALUES(?,1,?) ON CONFLICT(username) DO UPDATE SET attempts=attempts+1',key,now+60000);
 }
 async verify(a,value){const hash=await hashPassword(value,a?.salt||'0'.repeat(64));return !!a&&equal(hash,a.passwordHash);}
 async fetch(path,data){
  try{
   const action=path.slice(path.lastIndexOf('/')+1),hash=data.owner||'';
   if(action==='capabilities')return Response.json({passwordLogin:true,emailRequired:false,cloudSave:1,rename:true});
   if(action==='register'||action==='login'){
    const name=username(data.username);if(!name||!password(data.password))fail(action==='login'?'account-credentials':'account-input',action==='login'?401:400);
    this.budget(name.key);
    if(action==='login'){
     const a=this.byName(name.key);if(!await this.verify(a,data.password)||this.byName(name.key)?.passwordVersion!==a.passwordVersion)fail('account-credentials',401);
     this.sql.exec('DELETE FROM player_login_attempts WHERE username=?',name.key);return Response.json(await this.newSession(this.byName(name.key)));
    }
    if(!validToken(hash))fail('identity-required',401);
    let old=this.byName(name.key);
    if(old){if(old.owner!==hash||!await this.verify(old,data.password))fail('account-name-taken',409);return Response.json(await this.newSession(old));}
    if(this.bound(hash)||this.sql.exec('SELECT owner FROM player_sessions WHERE tokenHash=?',hash).toArray().length)fail('account-already-linked',409);
    const save=progress(data.progress),rankOwner=validToken(data.rankingToken)?await digest(data.rankingToken):hash;
    if(rankOwner!==hash&&(this.bound(rankOwner)||this.sql.exec('SELECT owner FROM player_sessions WHERE tokenHash=?',rankOwner).toArray().length))fail('account-already-linked',409);
    const salt=random(),passwordHash=await hashPassword(data.password,salt),now=this.now();
    // Password derivation yields; recheck ownership and uniqueness before the atomic insert.
    const work=()=>{
     if(this.byName(name.key))fail('account-name-taken',409);if(this.bound(hash)||this.bound(rankOwner))fail('account-already-linked',409);
     this.sql.exec('INSERT INTO player_accounts(username,name,owner,rankOwner,salt,passwordHash,progress,revision,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,1,?,?)',name.key,name.name,hash,rankOwner,salt,passwordHash,JSON.stringify(save),now,now);
    };
    if(this.storage.transactionSync)this.storage.transactionSync(work);else work();
    this.sql.exec('DELETE FROM player_login_attempts WHERE username=?',name.key);return Response.json(await this.newSession(this.row(hash)));
   }
   const {account:a,session}=this.authenticated(hash);
   if(action==='session')return Response.json({...this.public(a),expiresAt:session.expiresAt});
   if(action==='load')return Response.json({...this.public(a),progress:JSON.parse(a.progress)});
   if(action==='logout'){this.sql.exec('UPDATE player_sessions SET expiresAt=0 WHERE tokenHash=?',hash);return Response.json({loggedOut:true});}
   if(action==='rename'){
    const name=username(data.username);if(!name||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId)||Object.keys(data).some(k=>!['owner','username','password','requestId'].includes(k)))fail('account-input');
    const prior=this.sql.exec('SELECT name FROM player_name_changes WHERE owner=? AND requestId=?',a.owner,data.requestId).toArray()[0];
    if(prior){if(prior.name!==name.name)fail('account-name-conflict',409);return Response.json({...this.public(this.row(a.owner)),renamed:true,replayed:true});}
    this.budget(a.username);if(!password(data.password)||!await this.verify(a,data.password))fail('account-credentials',401);
    const work=()=>{
     const fresh=this.authenticated(hash).account;if(fresh.passwordVersion!==a.passwordVersion||fresh.username!==a.username||fresh.name!==a.name)fail('account-name-conflict',409);
     this.validateRename?.(a,name.name);const taken=this.byName(name.key);if(taken&&taken.owner!==a.owner)fail('account-name-taken',409);
     this.sql.exec('UPDATE player_accounts SET username=?,name=?,updatedAt=? WHERE owner=?',name.key,name.name,Math.max(this.now(),fresh.updatedAt+1),a.owner);
     this.onRename?.(a,name.name);this.sql.exec('INSERT INTO player_name_changes(owner,requestId,name) VALUES(?,?,?)',a.owner,data.requestId,name.name);
    };
    if(this.storage.transactionSync)this.storage.transactionSync(work);else work();
    this.sql.exec('DELETE FROM player_login_attempts WHERE username=?',a.username);return Response.json({...this.public(this.row(a.owner)),renamed:true});
   }
   if(action==='password'){
    this.budget(a.username);if(!password(data.newPassword))fail('account-password');if(typeof data.password!=='string'||!password(data.password)||!await this.verify(a,data.password))fail('account-credentials',401);
    const salt=random(),passwordHash=await hashPassword(data.newPassword,salt);
    if(this.row(a.owner)?.passwordVersion!==a.passwordVersion)fail('account-session-expired',401);
    const work=()=>{this.sql.exec('UPDATE player_accounts SET salt=?,passwordHash=?,passwordVersion=passwordVersion+1 WHERE owner=?',salt,passwordHash,a.owner);this.sql.exec('UPDATE player_sessions SET expiresAt=0 WHERE owner=?',a.owner);};
    if(this.storage.transactionSync)this.storage.transactionSync(work);else work();
    this.sql.exec('DELETE FROM player_login_attempts WHERE username=?',a.username);return Response.json(await this.newSession(this.row(a.owner)));
   }
   if(action==='save'){
    const save=progress(data.progress),old=JSON.parse(a.progress),wallet=JSON.parse(save.values.hk_wallet_v2),oldWallet=JSON.parse(old.values.hk_wallet_v2);
    wallet.redeemedCodes=[...new Set([...(wallet.redeemedCodes||[]),...(oldWallet.redeemedCodes||[])])];save.values.hk_wallet_v2=JSON.stringify(wallet);
    const serialized=JSON.stringify(save);
    if(serialized===a.progress)return Response.json({...this.public(a),saved:true});
    if(!Number.isSafeInteger(data.revision)||data.revision!==a.revision)fail('account-conflict',409);
    this.sql.exec('UPDATE player_accounts SET progress=?,revision=revision+1,updatedAt=? WHERE owner=? AND revision=?',serialized,this.now(),a.owner,a.revision);
    return Response.json({...this.public(this.row(a.owner)),saved:true});
   }
   fail('not-found',404);
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
