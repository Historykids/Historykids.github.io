/* Deterministic visual terrain only. Ownership, combat and rewards remain server-authoritative. */
(function(root){
 'use strict';
 const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453123;return n-Math.floor(n);},smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
 function noise(x,z){const a=Math.floor(x),b=Math.floor(z),u=smooth(x-a),v=smooth(z-b);return mix(mix(hash(a,b),hash(a+1,b),u),mix(hash(a,b+1),hash(a+1,b+1),u),v);}
 function height(x,z){const broad=noise(x*.13+30,z*.13+80),ridge=1-Math.abs(noise(x*.27+9,z*.27+4)*2-1),fine=noise(x*.8,z*.8);return .18+Math.pow(Math.max(0,(broad-.28)/.72),1.8)*3.8+Math.pow(ridge,5)*.6+fine*.13;}
 function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 function samples(ring,count,seed=1){const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),a=Math.min(...xs),b=Math.min(...zs),w=Math.max(...xs)-a,h=Math.max(...zs)-b,result=[];for(let i=0;i<count*12&&result.length<count;i++){const p=[a+hash(i+seed,seed*3)*w,b+hash(seed*5,i+seed)*h];if(inside(p,ring))result.push(p);}return result;}
 function subdivide(a,b,c,out,depth=0){const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(b[0]-c[0],b[1]-c[1]),ca=Math.hypot(c[0]-a[0],c[1]-a[1]);if(Math.max(ab,bc,ca)<.85||depth>=9){out.push(a,b,c);return;}const mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];if(ab>=bc&&ab>=ca){const m=mid(a,b);subdivide(a,m,c,out,depth+1);subdivide(m,b,c,out,depth+1);}else if(bc>=ca){const m=mid(b,c);subdivide(a,b,m,out,depth+1);subdivide(a,m,c,out,depth+1);}else{const m=mid(c,a);subdivide(a,b,m,out,depth+1);subdivide(m,b,c,out,depth+1);}}
 const api={hash,noise,height,inside,samples,subdivide};root.HKTenkaTerrain=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
