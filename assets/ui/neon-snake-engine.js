/* Shared authoritative snake simulation, keyboard movement and cosmetic progression. */
(function(root){
 'use strict';
 const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 const skins=Object.freeze([
  {id:'mint',name:'ミントフロー',rarity:'BASIC',colors:['#74ffd3','#16a88f'],free:true},
  {id:'violet',name:'バイオレット',rarity:'BASIC',colors:['#bc9cff','#6843d8'],free:true},
  {id:'sunrise',name:'サンライズ',rarity:'BASIC',colors:['#ffcf7c','#ec6d67'],free:true},
  {id:'sakura',name:'夜桜',rarity:'RARE',colors:['#ffb7e3','#b04a8f'],cost:180},
  {id:'glacier',name:'グレイシア',rarity:'RARE',colors:['#d8f8ff','#509bcf'],cost:350},
  {id:'ember',name:'残火',rarity:'RARE',colors:['#ffe391','#f15c40'],cost:550},
  {id:'tiger',name:'琥珀タイガー',rarity:'EPIC',colors:['#ffca5b','#433048'],cost:800},
  {id:'circuit',name:'サイバーライン',rarity:'EPIC',colors:['#a4ff74','#197264'],cost:1100},
  {id:'ocean',name:'深海のしずく',rarity:'MISSION',colors:['#73dcff','#3c5fd2'],require:{key:'totalFood',goal:400,label:'光を累計400個集める'}},
  {id:'rose',name:'ローズハンター',rarity:'MISSION',colors:['#ff719b','#703978'],require:{key:'totalKills',goal:10,label:'累計10匹を倒す'}},
  {id:'aurora',name:'オーロラ',rarity:'LEGEND',colors:['#7effcb','#9e7fff','#ff92da'],require:{key:'best',goal:2500,label:'長さ2,500を達成する'}},
  {id:'crown',name:'黄金の軌跡',rarity:'LEGEND',colors:['#fff2ac','#c99a43'],require:{key:'firsts',goal:1,label:'アリーナ1位でプレイを終える'}}
 ]);
 const skin=id=>skins.find(s=>s.id===id)||skins[0];
 class Grid{
  constructor(size=90){this.size=size;this.cells=new Map();}
  add(x,y,value){const key=Math.floor(x/this.size)+':'+Math.floor(y/this.size);let a=this.cells.get(key);if(!a)this.cells.set(key,a=[]);a.push(value);}
  near(x,y,r){const a=[],s=this.size;for(let i=Math.floor((x-r)/s);i<=Math.floor((x+r)/s);i++)for(let j=Math.floor((y-r)/s);j<=Math.floor((y+r)/s);j++){const list=this.cells.get(i+':'+j);if(list)a.push(...list);}return a;}
 }
 const BODY_STEP=4;
 function advance(s,dt,control={}){
  if(control.x||control.y)s.targetAngle=Math.atan2(control.y,control.x);else if(Number.isFinite(control.angle))s.targetAngle=control.angle;const wanted=Number.isFinite(s.targetAngle)?s.targetAngle:s.angle;
  const turn=s.bot?4.4:8.8,delta=angleDiff(wanted,s.angle);s.angle+=clamp(delta,-turn*dt,turn*dt);
  s.boost=!!control.boost&&s.mass>85;const speed=s.boost?265:155;s.speed=speed;
  s.x+=Math.cos(s.angle)*speed*dt;s.y+=Math.sin(s.angle)*speed*dt;
  const anchor=s.body[0],dx=s.x-anchor.x,dy=s.y-anchor.y,d=Math.hypot(dx,dy);
  if(d>=BODY_STEP){for(let n=BODY_STEP;n<=d;n+=BODY_STEP)s.body.unshift({x:anchor.x+dx*n/d,y:anchor.y+dy*n/d});}
  const max=Math.min(700,Math.ceil((150+s.mass*.75)/BODY_STEP));if(s.body.length>max)s.body.length=max;
 }
 function curve(s,index,time){const p=s.body[index],before=index?s.body[index-1]:s,after=s.body[Math.min(s.body.length-1,index+1)],dx=before.x-after.x,dy=before.y-after.y,d=Math.hypot(dx,dy)||1,step=s.bodyStep||BODY_STEP,headFade=Math.min(1,index*step/65),tailFade=Math.min(1,(s.body.length-index)*step/50),wave=Math.sin(index*step/31-time*6+s.id*.73)*7.5*headFade*tailFade;return{x:p.x-dy/d*wave,y:p.y+dx/d*wave};}
 class Arena{
  constructor({seed=Date.now(),bots=3,name='YOU',skinId='mint',multiplayer=false,radius=1800,foodTarget=1000}={}){this.seed=seed>>>0||1;this.radius=radius;this.foodTarget=foodTarget;this.time=0;this.food=[];this.nextFood=1;this.snakes=[];this.nextId=1;this.multiplayer=multiplayer;this.ended=false;this.events=[];this.player=multiplayer?null:this.spawn(false,name,skinId);for(let i=0;i<bots;i++)this.spawn(true,['LUNA','MOMO','ORBIT'][i%3],skins[i%skins.length].id);for(let i=0;i<foodTarget;i++)this.addFood();this.stats=this.player?.stats||null;this.rebuild();}
  random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
  point(limit=this.radius-130){const a=this.random()*TAU,r=Math.sqrt(this.random())*limit;return{x:Math.cos(a)*r,y:Math.sin(a)*r};}
  spawn(bot,name,skinId){let p=bot?this.point():{x:0,y:0};for(let n=0;n<60&&this.snakes.some(s=>s.alive&&(distance(s,p)<320||s.body.some((b,i)=>i%12===0&&distance(b,p)<100)));n++)p=this.point(bot?this.radius-130:this.radius*.4);const a=bot?this.random()*TAU:-Math.PI/2,mass=bot?250+this.random()*350:180,length=150+mass*.75,body=[];for(let n=0;n<length;n+=BODY_STEP)body.push({x:p.x-Math.cos(a)*n,y:p.y-Math.sin(a)*n});const s={id:this.nextId++,bot,name,skin:skinId,x:p.x,y:p.y,angle:a,mass,radius:13,body,alive:true,boost:false,age:0,thinkAt:0,target:null,respawnAt:0,input:{x:0,y:0,boost:false},stats:null};if(!bot)s.stats={id:String(this.seed)+'-'+s.id+'-'+this.random(),food:0,kills:0,seconds:0,best:180,peakRank:99,rank:99};this.snakes.push(s);return s;}
  addFood(p){if(this.food.length>=2100)return;const v=p||this.point();this.food.push({id:this.nextFood++,x:v.x,y:v.y,value:v.value||2+this.random()*4,color:v.color??Math.floor(this.random()*6),born:this.time,rich:!!p,dead:false});}
  rebuild(){this.foodGrid=new Grid(110);for(const f of this.food)if(!f.dead)this.foodGrid.add(f.x,f.y,f);this.bodyGrid=new Grid(85);for(const s of this.snakes)if(s.alive&&s.age>=3)for(let i=0;i<s.body.length;i+=2){const p=curve(s,i,this.time);this.bodyGrid.add(p.x,p.y,{snake:s,x:p.x,y:p.y,index:i});}}
  aim(s){if(this.time<s.thinkAt&&s.target)return Math.atan2(s.target.y-s.y,s.target.x-s.x);s.thinkAt=this.time+.16+this.random()*.18;let ax=0,ay=0;const edge=Math.hypot(s.x,s.y);if(edge>this.radius-300){ax-=s.x/edge*5;ay-=s.y/edge*5;}for(const hit of this.bodyGrid.near(s.x,s.y,155)){if(hit.snake===s||hit.snake.age<3)continue;const dx=s.x-hit.x,dy=s.y-hit.y,d=Math.hypot(dx,dy);if(d>0&&d<155&&Math.cos(Math.atan2(-dy,-dx)-s.angle)>-.2){const power=(155-d)/d*.15;ax+=dx*power;ay+=dy*power;}}let best=null,bestD=Infinity;for(const f of this.foodGrid.near(s.x,s.y,430)){const d=distance(s,f)/(f.rich?1.5:1);if(d<bestD){bestD=d;best=f;}}if(!best)best=this.point();const d=Math.max(1,distance(s,best));ax+=(best.x-s.x)/d;ay+=(best.y-s.y)/d;s.target={x:s.x+ax*250,y:s.y+ay*250};return Math.atan2(ay,ax);}
  kill(s,killer,reason){if(!s.alive)return;s.alive=false;s.respawnAt=this.time+3+this.random()*3;const count=Math.min(160,s.body.length),stride=Math.max(1,Math.floor(s.body.length/count));for(let i=0;i<s.body.length;i+=stride){const p=s.body[i];this.addFood({x:p.x+(this.random()-.5)*22,y:p.y+(this.random()-.5)*22,value:clamp(s.mass/count*.65,3,24),color:skins.findIndex(k=>k.id===s.skin)%6});}if(killer?.stats){killer.stats.kills++;this.events.push({type:'kill',playerId:killer.id,name:s.name});}if(s.stats){s.stats.rank=this.rankOf(s);this.events.push({type:'end',playerId:s.id,reason:reason||(killer?'ほかのヘビにぶつかった！':'アリーナの外に出た！')});}if(!this.multiplayer&&s===this.player)this.ended=true;}
  ranking(){return this.snakes.filter(s=>s.alive||!this.multiplayer&&s===this.player).sort((a,b)=>b.mass-a.mass||a.id-b.id);}
  rankOf(s){return 1+this.snakes.filter(other=>other!==s&&other.alive&&(other.mass>s.mass||other.mass===s.mass&&other.id<s.id)).length;}
  remove(s){this.snakes=this.snakes.filter(other=>other!==s);}
  step(dt,control={}){if(this.ended)return;dt=clamp(dt,0,1/30);this.time+=dt;this.rebuild();for(const s of [...this.snakes]){if(!s.alive){if(s.bot&&this.time>s.respawnAt){const n=this.spawn(true,s.name,s.skin);this.snakes.pop();Object.assign(s,n);}continue;}s.age+=dt;if(s.stats)s.stats.seconds+=dt;s.radius=13+Math.min(7,Math.sqrt(s.mass)/22);const input=s.bot?{angle:this.aim(s)}:this.multiplayer?s.input:control;advance(s,dt,input);if(s.boost){s.mass=Math.max(85,s.mass-20*dt);if(this.random()<dt*12){const tail=s.body.at(-1);this.addFood({x:tail.x,y:tail.y,value:2,color:1});}}if(Math.hypot(s.x,s.y)>this.radius-s.radius){this.kill(s,null);continue;}for(const f of this.foodGrid.near(s.x,s.y,s.radius+12)){if(!f.dead&&distance(s,f)<s.radius+7){f.dead=true;s.mass+=f.value;if(s.stats){s.stats.food++;if(s.stats.food%8===0)this.events.push({type:'eat',playerId:s.id});}}}}
   const deaths=new Map();for(const s of this.snakes){if(!s.alive||s.age<3)continue;for(const hit of this.bodyGrid.near(s.x,s.y,s.radius+24)){const other=hit.snake;if(other===s||!other.alive||other.age<3)continue;if(distance(s,hit)<s.radius+other.radius-4){deaths.set(s,other);break;}}}for(const [s,k]of deaths)this.kill(s,k);
   this.food=this.food.filter(f=>!f.dead&&(!f.rich||this.time-f.born<85));while(this.food.length<this.foodTarget)this.addFood();for(const s of this.snakes)if(s.stats){s.stats.best=Math.max(s.stats.best,Math.floor(s.mass));if(s.alive)s.stats.rank=this.rankOf(s);s.stats.peakRank=Math.min(s.stats.peakRank,s.stats.rank);}}
 }
 const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'}),integer=v=>Number.isFinite(v)?clamp(Math.floor(v),0,1e9):0;
 function profile(raw){let p={};try{p=typeof raw==='string'?JSON.parse(raw):raw||{};}catch{}if(!p||typeof p!=='object')p={};const valid=Array.isArray(p.owned)?p.owned.filter(id=>skins.some(s=>s.id===id)):[],owned=[...new Set([...skins.filter(s=>s.free).map(s=>s.id),...valid])];return{version:1,name:typeof p.name==='string'?p.name.slice(0,16):'',coins:integer(p.coins),xp:integer(p.xp),best:integer(p.best),games:integer(p.games),totalFood:integer(p.totalFood),totalKills:integer(p.totalKills),totalSeconds:integer(p.totalSeconds),firsts:integer(p.firsts),owned,selected:owned.includes(p.selected)?p.selected:'mint',runs:Array.isArray(p.runs)?p.runs.filter(s=>typeof s==='string').slice(-20):[],daily:p.daily?.day===day()?{day:day(),food:integer(p.daily.food),kills:integer(p.daily.kills),seconds:integer(p.daily.seconds),claimed:Array.isArray(p.daily.claimed)?p.daily.claimed.filter(k=>['food','kills','seconds'].includes(k)):[]}:{day:day(),food:0,kills:0,seconds:0,claimed:[]}};}
 const level=p=>Math.floor(Math.sqrt(p.xp/120))+1;
 function unlock(p){const earned=[];for(const s of skins)if(s.require&&p[s.require.key]>=s.require.goal&&!p.owned.includes(s.id)){p.owned.push(s.id);earned.push(s.id);}return earned;}
 function settle(p,stats){if(p.runs.includes(stats.id))return{coins:0,xp:0,unlocked:[],duplicate:true};const food=integer(stats.food),kills=integer(stats.kills),seconds=integer(stats.seconds),best=integer(stats.best),rank=integer(stats.rank)||99,oldLevel=level(p),xp=food*3+kills*80+seconds,baseCoins=Math.floor(food/6)+kills*18+Math.floor(seconds/15)+(rank===1?50:rank<=3?20:0);p.best=Math.max(p.best,best);p.totalFood+=food;p.totalKills+=kills;p.totalSeconds+=seconds;p.games++;if(rank===1)p.firsts++;p.xp+=xp;const coins=baseCoins+(level(p)-oldLevel)*30;p.coins+=coins;p.daily.food+=food;p.daily.kills+=kills;p.daily.seconds+=seconds;p.runs.push(stats.id);p.runs=p.runs.slice(-20);return{coins,xp,unlocked:unlock(p),duplicate:false};}
 const missions=Object.freeze([{id:'food',title:'光を集めよう',goal:120,reward:60,unit:'個'},{id:'seconds',title:'のびのび、3分',goal:180,reward:80,unit:'秒'},{id:'kills',title:'ハンターの一歩',goal:3,reward:100,unit:'匹'}]);
 function claim(p,id){const m=missions.find(m=>m.id===id);if(!m||p.daily[id]<m.goal||p.daily.claimed.includes(id))return false;p.daily.claimed.push(id);p.coins+=m.reward;return true;}
 function equip(p,id){const s=skins.find(s=>s.id===id);if(!s)return false;if(!p.owned.includes(id)){if(!s.cost||p.coins<s.cost)return false;p.coins-=s.cost;p.owned.push(id);}p.selected=id;return true;}
 const api=Object.freeze({Arena,Grid,skins,skin,profile,level,settle,missions,claim,equip,unlock,angleDiff,clamp,advance,curve,BODY_STEP});root.HKNeonSnake=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
