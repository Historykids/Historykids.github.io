// Server-side bootstrap verifier. The code itself is never shipped to the browser.
const verifier=Object.freeze({"salt":"20292bf8762e8899f52d01aaeef7fb60835bf64cdf2bc5f9","hash":"47eedd60ed5d54ac978130104ef00eb52569b8d90e7852ecf14e8f7ccd964360","iterations":100000});
export async function verifyAdminCode(value,config=verifier){
 const code=typeof value==='string'?value.normalize('NFKC').trim():'';
 if(!/^\d{8}$/.test(code))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveBits']);
 const salt=Uint8Array.from(config.salt.match(/../g),byte=>parseInt(byte,16));
 const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:config.iterations},key,256));
 const expected=Uint8Array.from(config.hash.match(/../g),byte=>parseInt(byte,16));
 let difference=actual.length^expected.length;for(let i=0;i<actual.length;i++)difference|=actual[i]^expected[i];return difference===0;
}
