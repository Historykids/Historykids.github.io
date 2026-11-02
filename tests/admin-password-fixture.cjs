const {pbkdf2Sync}=require('node:crypto');
const password='2468',salt='a1'.repeat(24);
async function configure(board){const pin=board.sengokuWorlds.expansion.adminPin;if(!pin.row())pin.sql.exec('INSERT INTO sengoku_admin_pin(singleton,salt,hash,createdAt,iterations) VALUES(1,?,?,1,100000)',salt,pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex'));}
module.exports={configure,password};
