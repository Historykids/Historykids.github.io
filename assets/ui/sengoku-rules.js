/* Modern prefectures and game rules. Castle/commander placement is historical fiction. */
(function(root){
 'use strict';
 const names=['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'];
 const castles=['上ノ国勝山館','浪岡城','九戸城','白石城','脇本城','山形城','会津若松城','水戸城','唐沢山城','箕輪城','鉢形城','本佐倉城','八王子城','小田原城','春日山城','増山城','七尾城','一乗谷城','武田氏館','上田城','岐阜城','浜松城','小牧山城','伊賀上野城','安土城','福知山城','大阪城','姫路城','高取城','和歌山城','鳥取城','月山富田城','岡山城','郡山城','大内氏館・高嶺城','勝瑞城','丸亀城','湯築城','岡豊城','久留米城','名護屋城','原城','人吉城','臼杵城','飫肥城','知覧城','首里城'];
 const tiers=[2,1,1,2,1,2,3,2,1,1,1,1,4,3,2,1,2,2,2,2,2,2,2,2,3,4,5,4,2,2,1,2,2,3,2,1,2,1,2,2,2,2,1,2,1,3,3];
 const units={infantry:{name:'足軽',icon:'槍',attack:100,cost:20,strong:'gunners',weak:'archers'},archers:{name:'弓兵',icon:'弓',attack:110,cost:30,strong:'infantry',weak:'cavalry'},cavalry:{name:'騎馬兵',icon:'馬',attack:130,cost:40,strong:'archers',weak:'gunners'},gunners:{name:'鉄砲兵',icon:'砲',attack:145,cost:60,strong:'cavalry',weak:'infantry'}};
 const keys=Object.keys(units);
 const factions=[
  {id:'oda',name:'織田家',general:'nobunaga',capital:'23',motto:'天下布武',color:'#b34837',crest:'織',place:'尾張・愛知',description:'尾張から、新しい天下へ。',history:'尾張を統一し、美濃へ勢力を広げた織田信長。',source:'https://www.museum.city.nagoya.jp/exhibition/owari/theme_07/index.html'},
  {id:'takeda',name:'武田家',general:'shingen',capital:'19',motto:'風林火山',color:'#895637',crest:'武',place:'甲斐・山梨',description:'山を越え、騎馬の力で進め。',history:'武田氏館は、信玄を含む武田氏三代の本拠。',source:'https://www.city.kofu.yamanashi.jp/senior/bunkazai/002.html'},
  {id:'uesugi',name:'上杉家',general:'kenshin',capital:'15',motto:'越後の龍',color:'#446d77',crest:'毘',place:'越後・新潟',description:'知略と弓で、北の地から挑む。',history:'春日山城を居城とした上杉謙信。',source:'https://www.city.joetsu.niigata.jp/site/cultural-property/cultural-property-jpn002.html'},
  {id:'tokugawa',name:'徳川家',general:'ieyasu',capital:'22',motto:'不撓不屈',color:'#546849',crest:'徳',place:'遠江・静岡（浜松）',description:'兵糧を守り、着実に領土を広げる。',history:'家康は1570年から1586年まで浜松を本拠とした。',source:'https://www.city.hamamatsu.shizuoka.jp/kouen/hennsen1.html'}
 ];
 const generals={nobunaga:{name:'織田信長',mark:'織',unit:'gunners',bonus:20,description:'鉄砲兵の戦力＋20%',region:'23'},shingen:{name:'武田信玄',mark:'武',unit:'cavalry',bonus:20,description:'騎馬兵の戦力＋20%',region:'19'},kenshin:{name:'上杉謙信',mark:'毘',unit:'archers',bonus:20,description:'弓兵の戦力＋20%',region:'15'},ieyasu:{name:'徳川家康',mark:'徳',unit:null,bonus:0,food:80,description:'出陣に使う兵糧−20%',region:'22'},masamune:{name:'伊達政宗',mark:'伊',unit:'gunners',bonus:15,description:'鉄砲兵の戦力＋15%',region:'04'},yukimura:{name:'真田幸村',mark:'六',unit:'infantry',bonus:20,description:'足軽の戦力＋20%',region:'20'},motonari:{name:'毛利元就',mark:'毛',unit:'archers',bonus:15,description:'弓兵の戦力＋15%',region:'34'},yoshihiro:{name:'島津義弘',mark:'島',unit:'cavalry',bonus:15,description:'騎馬兵の戦力＋15%',region:'46'},hideyoshi:{name:'豊臣秀吉',mark:'豊',unit:null,bonus:0,all:8,description:'全部隊の戦力＋8%',milestone:10}};
 const tactics={assault:{name:'総攻撃',power:120,food:135,description:'戦力＋20%。兵糧を多く使う。'},balanced:{name:'正攻法',power:100,food:100,description:'戦力と兵糧のバランスをとる。'},guard:{name:'守備重視',power:90,food:70,description:'戦力−10%。兵糧の消費を抑える。'}};
 const regions=names.map((name,i)=>({id:String(i+1).padStart(2,'0'),name,castle:castles[i],tier:tiers[i],unit:keys[i%4]}));
 const land='2-3 2-5 3-4 3-5 4-6 4-7 5-6 6-7 6-15 7-8 7-9 7-10 7-15 8-9 8-11 8-12 9-10 10-11 10-15 10-20 11-12 11-13 11-19 11-20 12-13 13-14 13-19 14-19 14-22 15-16 15-20 16-17 16-20 16-21 17-18 18-21 18-25 18-26 19-20 19-22 20-21 20-22 20-23 21-23 21-24 21-25 22-23 23-24 24-25 24-26 24-29 24-30 25-26 26-27 26-28 26-29 27-28 27-29 27-30 28-31 28-33 29-30 31-32 31-33 31-34 32-34 32-35 33-34 34-35 36-37 36-38 36-39 37-38 38-39 40-41 40-43 40-44 41-42 43-44 43-45 43-46 44-45 45-46';
 const sea='1-2 28-36 33-37 34-38 35-40 46-47';
 const edges=(s,water)=>s.split(' ').map(pair=>({ends:pair.split('-').map(n=>n.padStart(2,'0')),sea:water}));const routes=[...edges(land,false),...edges(sea,true)];
 const region=id=>regions.find(r=>r.id===id),faction=id=>factions.find(f=>f.id===id),troops=army=>keys.reduce((n,k)=>n+(army[k]||0),0);
 const active=s=>s.generals.find(g=>g.id===s.activeGeneral)||s.generals[0];
 const capacity=s=>Math.min(50000,500+(active(s).level-1)*600+(s.fortLevel-1)*1200+(s.bestTerritories-1)*300);
 function reachable(s,id){return !s.ownedRegions.includes(id)&&routes.some(e=>(!e.sea||s.port)&&e.ends.includes(id)&&e.ends.some(n=>s.ownedRegions.includes(n)));}
 function enemy(s,id){const r=region(id);return{...r,army:Math.round((200+r.tier*r.tier*120)*(1+Math.min(s.unifications,20)*.25)),level:r.tier,reward:r.tier>=4?300:100};}
 function validFormation(s,a){return a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>keys.includes(k))&&keys.every(k=>Number.isSafeInteger(a[k])&&a[k]>=0&&a[k]<=s.army[k])&&troops(a)>0&&troops(a)<=capacity(s);}
 function formation(s){let left=capacity(s);return Object.fromEntries(keys.map(k=>{const n=Math.min(s.army[k],left);left-=n;return[k,n];}));}
 function power(s,a,tactic,correct,target){
  const g=active(s),ability=generals[g.id],foe=region(target)?.unit;let total=0;
  for(const k of keys){const u=units[k],match=u.strong===foe?120:u.weak===foe?85:100,bonus=100+(ability.unit===k?ability.bonus:0);total+=a[k]*u.attack*match*bonus;}
  const base=Math.floor(total/1000000),level=100+(g.level-1)*3+(ability.all||0),fort=100+(s.fortLevel-1)*2;
  return Math.floor(base*level*fort*tactics[tactic].power*(100+correct*10)/100000000);
 }
 function foodCost(s,a,tactic){const g=generals[active(s).id],base=Math.ceil((troops(a)+a.gunners*.5)/30);return Math.max(1,Math.ceil(base*tactics[tactic].food*(g.food||100)/10000));}
 function initial(id,now){const f=faction(id);return{version:1,factionId:id,capital:f.capital,ownedRegions:[f.capital],bestTerritories:1,defeatedRegions:[],generals:[{id:f.general,level:1,experience:0}],activeGeneral:f.general,army:{infantry:300,archers:100,cavalry:50,gunners:0},resources:{militaryMerit:0,food:500},fortLevel:1,port:false,battlesWon:0,battlesLost:0,totalMerit:0,totalCorrect:0,unifications:0,claimedRewards:[],learnedCards:[],pending:null,lastResult:null,published:false,lastDailyWin:'',startedAt:now,fastestMs:null,week:{key:'',merit:0}};}
 const api={version:1,regions,routes,factions,generals,units,keys,tactics,region,faction,troops,active,capacity,reachable,enemy,validFormation,formation,power,foodCost,initial};
 root.HKSengokuRules=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
