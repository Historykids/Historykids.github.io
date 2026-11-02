import {hashPassword} from './accounts.mjs';
export const recoveryHash='8c74448dc609c69e40030a3e9ea22968175b572ecb8b9550bbcd8238398c168f';
export async function recoverAdminPassword(sql,admin,data){
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 const id='sironagasu7777-login-reset-20261102-v1';
 sql.exec('CREATE TABLE IF NOT EXISTS admin_security_changes(id TEXT PRIMARY KEY,createdAt INTEGER NOT NULL)');
 const done=()=>sql.exec('SELECT id FROM admin_security_changes WHERE id=?',id).toArray().length;
 if(done())return{passwordChanged:true,replayed:true};
 const account=sql.exec('SELECT owner FROM player_accounts WHERE username=?','sironagasu7777').toArray()[0];
 if(!account||!admin.isAdmin(account.owner))fail('admin-recovery-account',409);
 if(typeof data.password!=='string'||data.password.length<8||data.password.length>128)fail('account-password');
 const salt=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const hash=await hashPassword(data.password,salt);
 admin.atomic(()=>{if(done())return;const fresh=sql.exec('SELECT owner FROM player_accounts WHERE username=?','sironagasu7777').toArray()[0];if(fresh?.owner!==account.owner||!admin.isAdmin(account.owner))fail('admin-recovery-account',409);sql.exec('UPDATE player_accounts SET salt=?,passwordHash=?,passwordVersion=passwordVersion+1,updatedAt=? WHERE username=?',salt,hash,Date.now(),'sironagasu7777');sql.exec('UPDATE player_sessions SET expiresAt=0 WHERE owner=?',account.owner);sql.exec('INSERT INTO admin_security_changes(id,createdAt) VALUES(?,?)',id,Date.now());});
 return{passwordChanged:true};
}
