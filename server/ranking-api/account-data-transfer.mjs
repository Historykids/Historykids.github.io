// Authorized one-time move: retain the source data identity so every game reference
// (worlds, alliances, pending payouts, rankings and learning records) stays intact.
export const dataTransferVersion='sironagasu-data-transfer-20261102-v1';
const emptyProgress=()=>({version:1,values:{hk_wallet_v2:JSON.stringify({version:2,balance:'0',rebirths:0,pending:null,history:[],redeemedCodes:[]}),city_v1:'[]',hk_residents_v1:'[]'}});
export function transferAccountData(board){
 const sql=board.sql;
 sql.exec('CREATE TABLE IF NOT EXISTS account_data_transfers(id TEXT PRIMARY KEY,backup TEXT NOT NULL,at INTEGER NOT NULL)');
 if(sql.exec('SELECT id FROM account_data_transfers WHERE id=?',dataTransferVersion).toArray().length){const old=board.accounts.byName('sironagasu');if(old){const p=JSON.parse(old.progress);if(p.version===1&&p.values&&Object.keys(p.values).length===0)sql.exec('UPDATE player_accounts SET progress=?,revision=revision+1 WHERE username=?',JSON.stringify(emptyProgress()),old.username);}return true;}
 const source=board.accounts.byName('sironagasu'),target=board.accounts.byName('sironagasu7777');
 if(!source||!target||!board.admin.isAdmin(target.owner))return false;
 board.admin.atomic(()=>{
  if(sql.exec('SELECT id FROM account_data_transfers WHERE id=?',dataTransferVersion).toArray().length)return;
  const at=Date.now(),hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const backup={profiles:sql.exec('SELECT * FROM sengoku_guest_profiles WHERE owner=? OR owner=?',source.owner,target.owner).toArray(),source:{username:source.username,owner:source.owner,rankOwner:source.rankOwner,progress:source.progress,revision:source.revision},target:{username:target.username,owner:target.owner,rankOwner:target.rankOwner,progress:target.progress,revision:target.revision}};
  // Sessions must not silently follow an owner identifier to a different account.
  sql.exec('UPDATE player_sessions SET expiresAt=0 WHERE owner=? OR owner=?',source.owner,target.owner);
  for(const owner of [target.owner,target.rankOwner])if(![source.owner,source.rankOwner].includes(owner))sql.exec('INSERT OR IGNORE INTO retired_account_owners(owner) VALUES(?)',owner);
  sql.exec('UPDATE player_accounts SET owner=?,rankOwner=?,progress=?,revision=revision+1,updatedAt=? WHERE username=?',hex(),hex(),JSON.stringify(emptyProgress()),at,source.username);
  const progress=JSON.parse(source.progress);for(const key of ['hk_wealth_name_v1','hk_buzzer_nickname'])if(progress.values?.[key])progress.values[key]=target.name;
  sql.exec('UPDATE player_accounts SET owner=?,rankOwner=?,progress=?,revision=?,updatedAt=? WHERE username=?',source.owner,source.rankOwner,JSON.stringify(progress),Math.max(source.revision,target.revision)+1,at,target.username);
  sql.exec('UPDATE wealth_admin_owner SET owner=? WHERE singleton=1',source.owner);
  board.accounts.onRename(source,target.name);
  sql.exec('UPDATE sengoku_guest_profiles SET name=?,nameKey=? WHERE owner=?','移行前の記録','archive-'+target.owner,target.owner);
  sql.exec('UPDATE sengoku_guest_profiles SET name=?,nameKey=? WHERE owner=?',target.name,target.username,source.owner);
  sql.exec('UPDATE scores SET name=? WHERE id=?',target.name,source.rankOwner);
  if(sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tenka_s1_sengoku_worlds'").toArray().length){
   for(const row of sql.exec('SELECT id,state FROM tenka_s1_sengoku_worlds').toArray()){
    const world=JSON.parse(row.state);let changed=false;for(const p of world.players||[])if(p.owner===source.owner){p.name=target.name;p.revision++;changed=true;}
    if(changed){world.revision++;world.updatedAt=at;sql.exec('UPDATE tenka_s1_sengoku_worlds SET state=?,revision=?,updatedAt=? WHERE id=?',JSON.stringify(world),world.revision,at,row.id);}
   }
  }
  sql.exec('INSERT INTO account_data_transfers(id,backup,at) VALUES(?,?,?)',dataTransferVersion,JSON.stringify(backup),at);
 });
 return true;
}
