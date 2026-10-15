/* Exact decimal integers for ryo and economy scores. Only display text is shortened. */
(function(root){
 'use strict';
 const units=['','万','億','兆','京','垓','秭','穣','溝','澗','正','載','極','恒河沙','阿僧祇','那由他','不可思議','無量大数'];
 const cap=9999n*10n**68n,safe=BigInt(Number.MAX_SAFE_INTEGER);
 function raw(value){
  if(typeof value==='bigint')return value;
  if(typeof value==='number'){if(!Number.isSafeInteger(value))throw Error('invalid-amount');return BigInt(value);}
  if(typeof value!=='string'||! /^-?\d{1,80}$/.test(value))throw Error('invalid-amount');
  return BigInt(value);
 }
 function pack(value){const n=raw(value);return n>=-safe&&n<=safe?Number(n):n.toString();}
 function integer(value){try{return raw(value)>=0n;}catch{return false;}}
 function valid(value){try{const n=raw(value);return n>=0n&&n<=cap;}catch{return false;}}
 function cmp(a,b){const x=raw(a),y=raw(b);return x<y?-1:x>y?1:0;}
 const add=(a,b)=>pack(raw(a)+raw(b)),sub=(a,b)=>pack(raw(a)-raw(b)),mul=(a,b)=>pack(raw(a)*raw(b));
 const sum=values=>pack(values.reduce((n,v)=>n+raw(v),0n));
 function clamp(value){const n=raw(value);if(n<0n)throw Error('insufficient');return pack(n>cap?cap:n);}
 function input(value){try{const text=String(value).normalize('NFKC').trim();return /^\d{1,72}$/.test(text)?pack(raw(text)):NaN;}catch{return NaN;}}
 function full(value){return raw(value).toString();}
 function format(value){
  let n;try{n=raw(value);}catch{return '—';}
  const sign=n<0n?'-':'';if(n<0n)n=-n;
  if(n<10000n)return sign+Number(n).toLocaleString('ja-JP');
  const high=Math.min(Math.floor((n.toString().length-1)/4),units.length-1);
  let text='';for(let i=high;i>=Math.max(0,high-2);i--){const base=10000n**BigInt(i),part=n/base;n%=base;if(part)text+=part.toString()+units[i];}
  return sign+text;
 }
 function key(value){if(!integer(value))throw Error('invalid-amount');const text=full(value);if(text.length>72)throw Error('invalid-amount');return text.padStart(72,'0');}
 const api=Object.freeze({units,MAX:cap.toString(),integer,valid,pack,cmp,add,sub,mul,sum,clamp,input,full,format,key});
 root.HKAmounts=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
