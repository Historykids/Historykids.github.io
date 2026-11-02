// Maintenance input is encrypted to a deployment-secret-derived X25519 key.
// Neither administrator passwords nor private capabilities belong in this repository.
const c=require('node:crypto'),fs=require('node:fs');
(async()=>{
 const secret=process.env.ADMIN_DEPLOYMENT_KEY;if(!secret)throw Error('Deployment secret unavailable');
 const raw=Buffer.from(c.hkdfSync('sha256',secret,'historykids-admin-maintenance-v1','x25519',32));
 const privateKey=c.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'),raw]),format:'der',type:'pkcs8'});
 const publicKey=c.createPublicKey(privateKey).export({format:'der',type:'spki'}).toString('base64');
 const file='.github/admin-maintenance/sealed.json';
 if(!fs.existsSync(file)){console.log('ADMIN_MAINTENANCE_PUBLIC_KEY='+publicKey);return;}
 const packet=JSON.parse(fs.readFileSync(file,'utf8'));
 const shared=c.diffieHellman({privateKey,publicKey:c.createPublicKey({key:Buffer.from(packet.ephemeral,'base64'),format:'der',type:'spki'})});
 const key=Buffer.from(c.hkdfSync('sha256',shared,'historykids-admin-maintenance-v1','sealed-configuration',32));
 const decipher=c.createDecipheriv('aes-256-gcm',key,Buffer.from(packet.iv,'base64'));decipher.setAuthTag(Buffer.from(packet.tag,'base64'));
 const body=JSON.parse(Buffer.concat([decipher.update(Buffer.from(packet.ciphertext,'base64')),decipher.final()]).toString());
 if(body.operation!=='sironagasu7777-login-reset-20261102-v1')throw Error('Unexpected maintenance operation');
 const endpoint='https://historykids-ranking-api.historykids-5185046038.workers.dev/wealth/sengoku/world/admin/pin/provision';
 let result,status;
 for(let attempt=0;attempt<180;attempt++){
  const response=await fetch(endpoint,{method:'POST',headers:{Origin:'https://historykids.github.io','Content-Type':'application/json',Authorization:'Bearer '+c.randomBytes(32).toString('hex')},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  status=response.status;result=await response.json();
  if(response.ok||!['admin-required','route-not-found','account-try-later','rate-limited','ranking-unavailable'].includes(result.error))break;
  if(attempt<179)await new Promise(r=>setTimeout(r,5000));
 }
 if(status!==200||result.passwordChanged!==true)throw Error('Administrator maintenance failed: '+(result.error||status));
 console.log('Administrator account login password changed; existing sessions revoked; saved data and administrator PIN retained.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
