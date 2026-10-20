(function(){
 'use strict';
 const $=id=>document.getElementById(id),Q=window.HKPachinkoRules;if(!$('pachinkoCanvas')||!Q)return;
 const canvas=$('pachinkoCanvas');let ctx=null,frame=null,generation=0,last=null,landed=0;
 try{ctx=canvas.getContext('2d');}catch{}
 const width=720,height=820,pockets=Q.pockets,xFor=i=>105+i*85;
 function resize(){
  if(!ctx)return;const box=canvas.getBoundingClientRect(),pixels=Math.max(300,Math.min(720,box.width||600))*Math.min(window.devicePixelRatio||1,1.5);
  canvas.width=Math.round(pixels);canvas.height=Math.round(pixels*height/width);ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
 }
 function circle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
 function position(ball,index,age){
  if(age<0||age>1)return null;const target=xFor(ball.pocket);
  if(age<.2){const a=age/.2;return{x:660+15*Math.sin(a*Math.PI),y:730-615*a};}
  const t=(age-.2)/.8;return{x:550+(target-550)*Math.pow(t,.8)+Math.sin(t*Math.PI*10+index*1.8)*19*Math.sin(Math.PI*t),y:130+580*Math.pow(t,1.25)};
 }
 function paint(data=null,elapsed=Infinity){
  if(!ctx)return;ctx.clearRect(0,0,width,height);
  const glow=ctx.createRadialGradient(360,370,30,360,400,390);glow.addColorStop(0,'#224649');glow.addColorStop(.75,'#0e242b');glow.addColorStop(1,'#061018');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='#c6a25a';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(360,400,310,366,0,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#c5a56340';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(360,400,298,354,0,0,Math.PI*2);ctx.stroke();
  for(let row=0;row<11;row++)for(let col=0;col<8;col++){const x=135+col*59+(row%2?29:0),y=178+row*42;if(x>600)continue;circle(x,y,4.5,'#07161c');circle(x-1,y-2,2.6,'#dac590');circle(x-1.5,y-3,1,'#fff5cf');}
  ctx.strokeStyle='#a6c5cd80';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(660,748);ctx.quadraticCurveTo(708,440,670,130);ctx.quadraticCurveTo(654,62,578,100);ctx.stroke();
  for(let i=0;i<7;i++){
   const x=xFor(i),hot=data&&data.balls.some((b,n)=>b.pocket===i&&elapsed>=n*260+2600);ctx.fillStyle=i===3?'#9d6937':'#12333b';ctx.fillRect(x-36,683,72,55);ctx.strokeStyle=hot?'#ffe9a4':'#8f8458';ctx.strokeRect(x-36,683,72,55);
   ctx.font=i===3?'bold 12px sans-serif':'11px sans-serif';ctx.textAlign='center';ctx.fillStyle=hot?'#fff1bc':'#c8bd95';ctx.fillText(i===3?'START':i===0||i===6?'OUT':i===1||i===5?'1 / 10':'2 / 10',x,715);
  }
  ctx.font='10px serif';ctx.fillStyle='#a6a88e';ctx.textAlign='center';ctx.fillText('THE GOLDEN PAVILION · TEN SILVER BALLS',360,785);
  if(data)for(let i=0;i<10;i++){
   const age=(elapsed-i*260)/2600,p=position(data.balls[i],i,age);if(!p)continue;
   for(let j=5;j>=1;j--){const trail=position(data.balls[i],i,age-j*.012);if(trail)circle(trail.x,trail.y,Math.max(1,4-j*.4),'rgba(190,237,247,'+(1-j/6)*.15+')');}
   circle(p.x+1,p.y+3,7,'#0007');const metal=ctx.createRadialGradient(p.x-2,p.y-3,1,p.x,p.y,7);metal.addColorStop(0,'#fff');metal.addColorStop(.35,'#daeaf0');metal.addColorStop(1,'#657b8e');circle(p.x,p.y,6.5,metal);
  }
 }
 function digits(values){[...$('pachinkoDigits').children].forEach((el,i)=>el.textContent=values[i]);}
 function progress(data,count){
  $('pachinkoBallCount').textContent=count+' / 10球';$('pachinkoProgress').value=count;
  if(data){const finished=data.balls.slice(0,count),starts=finished.filter(b=>b.pocket===3);$('pachinkoStartCount').textContent=starts.length+'回';if(starts.length)digits(starts.at(-1).digits);}
 }
 function stop(){generation++;if(frame!==null)cancelAnimationFrame(frame);frame=null;$('pachinkoMachine').classList.remove('pachinko-playing');}
 function idle(){
  stop();last=null;landed=0;resize();paint();digits([7,7,7]);progress(null,0);$('pachinkoStartCount').textContent='0回';$('pachinkoCall').textContent='10球に、運を託せ。';$('pachinkoMachine').classList.remove('pachinko-fever');$('pachinkoBallResults').replaceChildren();
 }
 function show(data){
  stop();if(!Q.valid(data))return;last=data;resize();paint(data);progress(data,10);
  const choice=data.balls.find(b=>b.digits?.every(d=>d===7))||data.balls.find(b=>b.digits&&b.digits.every(d=>d===b.digits[0]))||data.balls.filter(b=>b.digits).at(-1);
  if(choice)digits(choice.digits);$('pachinkoMachine').classList.toggle('pachinko-fever',data.jackpots>0);$('pachinkoCall').textContent=data.title;
  $('pachinkoBallResults').replaceChildren(...data.balls.map((b,i)=>{const el=document.createElement('span');el.textContent=(i+1)+'球目 '+pockets[b.pocket].label+(b.digits?' '+b.digits.join(''):'');if(b.digits&&b.digits.every(d=>d===b.digits[0]))el.className='pachinko-ball-win';return el;}));
 }
 function animate(round,{fast=false,onPocket=()=>{},done=()=>{}}={}){
  idle();const data=round.data;last=data;const version=generation;
  if(fast||!ctx){show(data);setTimeout(done,fast?120:250);return;}
  $('pachinkoMachine').classList.add('pachinko-playing');$('pachinkoCall').textContent='銀の玉が、釘の森へ。';let start=null,previous=-100;
  const step=time=>{
   if(version!==generation)return;if(start===null)start=time;const elapsed=time-start;
   if(elapsed-previous>=30){previous=elapsed;paint(data,elapsed);const count=Math.min(10,Math.max(0,Math.floor((elapsed-2600)/260)+1));if(count>landed){for(let i=landed;i<count;i++)onPocket(data.balls[i]);landed=count;progress(data,count);}}
   if(elapsed>=5040){show(data);done();return;}frame=requestAnimationFrame(step);
  };frame=requestAnimationFrame(step);
 }
 window.addEventListener('resize',()=>{resize();if(last)paint(last);else paint();});
 window.HKPachinko=Object.freeze({idle,show,animate});idle();
})();
