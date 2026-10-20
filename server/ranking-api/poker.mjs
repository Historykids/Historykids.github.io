import C from '../../assets/ui/table-rules.js';
const M=globalThis.HKAmounts;
export const pokerRoutes=new Set(['/wealth/poker','/wealth/poker/reserve','/wealth/poker/commit','/wealth/poker/draw','/wealth/poker/leave','/wealth/poker/ack']);
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
const roomName=n=>n===1?'royal-one':'royal-'+n;
const roomNumber=value=>{if(value===undefined||value==='royal-one')return 1;if(typeof value!=='string'||!/^royal-[1-9]\d{0,5}$/.test(value))fail('poker-room',404);return Number(value.slice(6));};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(id);
export class WealthPoker{
 constructor(storage,admin){
  this.storage=storage;this.sql=storage.sql;this.admin=admin;this.now=()=>Date.now();this.shuffle=()=>C.deck();
  this.sql.exec('CREATE TABLE IF NOT EXISTS poker_room(singleton INTEGER PRIMARY KEY CHECK(singleton=1),state TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS poker_tickets(id TEXT PRIMARY KEY,owner TEXT NOT NULL,status TEXT NOT NULL,receipt TEXT NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS poker_ticket_owner ON poker_tickets(owner,status)');
  this.sql.exec('INSERT OR IGNORE INTO poker_room(singleton,state) VALUES(1,?)',JSON.stringify(this.empty()));
  this.sql.exec('CREATE TABLE IF NOT EXISTS poker_rooms(id INTEGER PRIMARY KEY,state TEXT NOT NULL)');
  this.sql.exec('INSERT OR IGNORE INTO poker_rooms(id,state) SELECT 1,state FROM poker_room WHERE singleton=1');
 }
 empty(){return{phase:'lobby',handId:null,stake:null,players:[],startAt:null,deadline:null,nextAt:null,deck:[],discards:[],result:null};}
 ticket(id){const row=this.sql.exec('SELECT * FROM poker_tickets WHERE id=?',id).toArray()[0];return row?{...JSON.parse(row.receipt),status:row.status,owner:row.owner}:null;}
 latest(owner){const row=this.sql.exec("SELECT * FROM poker_tickets WHERE owner=? AND status!='acked' ORDER BY rowid DESC LIMIT 1",owner).toArray()[0];return row?{...JSON.parse(row.receipt),status:row.status,owner:row.owner}:null;}
 saveTicket(t){const {owner,status,...receipt}=t;this.sql.exec('INSERT INTO poker_tickets(id,owner,status,receipt) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,receipt=excluded.receipt',t.id,owner,status,JSON.stringify(receipt));}
 finishTicket(p,payout,kind,handName=''){
  const t=this.ticket(p.id);if(!t||['done','acked'].includes(t.status))return;
  this.saveTicket({...t,status:'done',payout:M.full(payout),kind,handName,settledAt:this.now()});
 }
 settle(s){
  if(s.phase!=='playing')return;
  const live=s.players.filter(p=>!p.folded),ranked=live.map(p=>({p,value:C.evaluate(p.hand)}));
  let winners=[];for(const r of ranked){if(!winners.length||C.compare(r.value.rank,winners[0].value.rank)>0)winners=[r];else if(!C.compare(r.value.rank,winners[0].value.rank))winners.push(r);}
  const pot=BigInt(s.stake)*BigInt(s.players.length),share=winners.length?pot/BigInt(winners.length):0n;let remainder=winners.length?pot%BigInt(winners.length):0n;
  const awarded=new Map(winners.map(r=>[r.p.id,M.pack(share+(remainder-->0n?1n:0n))]));
  for(const p of s.players){const value=p.folded?null:C.evaluate(p.hand),base=awarded.get(p.id)??0,payout=winners.length?M.rebirth.boost(base,p.rebirths):M.pack(s.stake);this.finishTicket(p,payout,winners.length?'showdown':'refund',value?.name||'フォールド');}
  s.result={pot:M.full(pot),winners:winners.map(r=>r.p.id),message:winners.length?'勝者にポットを払い戻しました。':'全員フォールドのため掛け金を返しました。'};
  s.phase='showdown';s.nextAt=this.now()+10000;s.deadline=null;s.deck=[];s.discards=[];
 }
 advance(s){
  const now=this.now();
  if(s.phase==='showdown'&&now>=s.nextAt){Object.assign(s,this.empty());return;}
  if(s.phase==='playing'){
   if(now>=s.deadline){for(const p of s.players)if(!p.drawn)p.folded=true;this.settle(s);}
   return;
  }
  if(s.phase!=='lobby')return;
  for(const p of s.players.filter(p=>now-p.seenAt>(p.paid?90000:30000)||now-p.joinedAt>(p.paid?120000:30000)))this.finishTicket(p,s.stake,'refund');
  s.players=s.players.filter(p=>!['done','acked'].includes(this.ticket(p.id)?.status));
  const paid=s.players.filter(p=>p.paid);
  if(!s.players.length)s.stake=null;
  if(paid.length<2){s.startAt=null;return;}
  s.startAt??=now+10000;
  if(now<s.startAt)return;
  for(const p of s.players.filter(p=>!p.paid))this.finishTicket(p,s.stake,'refund');
  s.players=paid;s.phase='playing';s.handId=crypto.randomUUID();s.deck=this.shuffle();s.discards=[];s.deadline=now+45000;s.startAt=null;
  for(const p of s.players){p.hand=s.deck.splice(0,5);p.drawn=false;p.folded=false;p.holds=[];}
 }
 view(s,owner,room,rooms){
  const mine=this.latest(owner),own=s.players.find(p=>p.owner===owner),reveal=s.phase==='showdown';
  return{room:roomName(room),rooms:rooms.map(r=>({id:roomName(r.id),name:'第'+r.id+'室',phase:r.state.phase,seats:r.state.players.length,players:r.state.players.filter(p=>p.paid).length,capacity:6,stake:r.state.stake,joinable:r.state.phase==='lobby'&&r.state.players.length<6})),phase:s.phase,handId:s.handId,stake:s.stake,startAt:s.startAt,deadline:s.deadline,nextAt:s.nextAt,now:this.now(),capacity:6,result:s.result,
   players:s.players.map(p=>({id:p.id,name:p.name,rebirths:p.rebirths,paid:p.paid,drawn:!!p.drawn,folded:!!p.folded,hand:p.hand&&(p.owner===owner||reveal&&!p.folded)?p.hand:null,handName:reveal&&!p.folded?C.evaluate(p.hand).name:null})),
   ownId:own?.id||null,ticket:mine?{...Object.fromEntries(Object.entries(mine).filter(([key])=>key!=='owner')),room:mine.room||'royal-one'}:null};
 }
 fetch(path,data){
  try{
   const owner=data.owner;if(!/^[a-f0-9]{64}$/.test(owner||''))fail('identity-required',401);
   let output;
   const work=()=>{
    const rooms=this.sql.exec('SELECT r.id,CASE WHEN r.id=1 THEN (SELECT state FROM poker_room WHERE singleton=1) ELSE r.state END AS state FROM poker_rooms r ORDER BY r.id').toArray().map(r=>({id:r.id,original:r.state,state:JSON.parse(r.state)}));
    for(const r of rooms)this.advance(r.state);
    const latest=this.latest(owner),byId=data.id?this.ticket(data.id):null;
    if(byId&&byId.owner!==owner)fail('poker-ticket',403);
    const chosen=byId?.room||latest?.room||(latest?'royal-one':data.room),room=roomNumber(chosen);
    const target=rooms.find(r=>r.id===room);if(!target)fail('poker-room',404);const s=target.state;
    const own=s.players.find(p=>p.owner===owner);if(own&&path==='/wealth/poker')own.seenAt=this.now();
    if(path==='/wealth/poker/reserve'){
     if(!validId(data.id))fail('poker-input');const previous=this.ticket(data.id),latest=this.latest(owner);
     if(previous){if(previous.owner!==owner)fail('poker-ticket',403);}
     else{
     if(latest)fail(latest.status==='done'?'poker-settlement-pending':'poker-already-joined',409);
     if(s.phase!=='lobby')fail('poker-spectating',409);if(s.players.length>=6)fail('poker-full',409);
     const player=this.sql.exec('SELECT name,rebirths,balance FROM wealth_scores_v2 WHERE id=?',owner).toArray()[0];
     const moderation=this.sql.exec('SELECT banned,nameBlocked FROM wealth_moderation WHERE id=?',owner).toArray()[0];
     if(!player||player.rebirths<10)fail('poker-locked',403);if(moderation?.banned||moderation?.nameBlocked||this.admin.rules.blockedName(player.name,this.admin.words()))fail('poker-name',403);
     if(!M.valid(data.stake)||M.cmp(data.stake,1)<0)fail('poker-stake');if(s.stake!==null&&M.cmp(data.stake,s.stake))fail('poker-stake-changed',409);
     if(M.cmp(data.stake,player.balance)>0)fail('insufficient');s.stake=M.full(data.stake);
     const p={id:data.id,owner,name:player.name,rebirths:player.rebirths,paid:false,seenAt:this.now(),joinedAt:this.now()};s.players.push(p);
     this.saveTicket({id:p.id,owner,room:roomName(room),status:'reserved',stake:s.stake,rebirths:p.rebirths,at:this.now(),payout:'0'});
     }
    }else if(path!=='/wealth/poker'){
     if(!validId(data.id))fail('poker-input');const ticket=this.ticket(data.id);if(!ticket||ticket.owner!==owner)fail('poker-ticket',403);
     const p=s.players.find(p=>p.id===ticket.id);
     if(path==='/wealth/poker/ack'){
      if(ticket.status==='done')this.saveTicket({...ticket,status:'acked'});else if(ticket.status!=='acked')fail('poker-open',409);
     }else if(!['done','acked'].includes(ticket.status)){
      if(!p)fail('poker-ticket',409);
      if(path==='/wealth/poker/commit'){
       if(s.phase!=='lobby'&&!p.paid)fail('poker-spectating',409);p.paid=true;p.seenAt=this.now();this.saveTicket({...ticket,status:'paid'});
      }else if(path==='/wealth/poker/leave'){
       if(s.phase==='lobby'){this.finishTicket(p,s.stake,'refund');s.players=s.players.filter(x=>x!==p);}
       else if(s.phase==='playing'){p.folded=true;p.drawn=true;if(s.players.filter(x=>!x.folded).length<=1||s.players.every(x=>x.drawn||x.folded))this.settle(s);}
      }else if(path==='/wealth/poker/draw'){
       if(s.phase!=='playing'||!p.paid||p.folded||data.handId!==s.handId)fail('poker-open',409);
       const holds=data.holds;if(!Array.isArray(holds)||holds.length>5||new Set(holds).size!==holds.length||holds.some(i=>!Number.isInteger(i)||i<0||i>4))fail('poker-holds');
       const sorted=[...holds].sort((a,b)=>a-b);if(p.drawn){if(JSON.stringify(sorted)!==JSON.stringify(p.holds))fail('poker-already-drawn',409);}
       else{
        const discard=[];p.hand=p.hand.map((c,i)=>{if(sorted.includes(i))return c;if(!s.deck.length){const deck=C.deck();s.deck=deck.filter(c=>s.discards.includes(c));s.discards=[];}if(!s.deck.length)fail('poker-deck',503);discard.push(c);return s.deck.shift();});
        s.discards.push(...discard);p.drawn=true;p.holds=sorted;if(s.players.every(x=>x.drawn||x.folded))this.settle(s);
       }
      }
     }
    }
    this.advance(s);
    if(rooms.some(r=>r.state.players.length>=6)&&!rooms.some(r=>r.state.phase==='lobby'&&r.state.players.length<6))rooms.push({id:Math.max(...rooms.map(r=>r.id))+1,state:this.empty(),original:null});
    for(const r of rooms){const json=JSON.stringify(r.state);if(json!==r.original){this.sql.exec('INSERT INTO poker_rooms(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state',r.id,json);if(r.id===1)this.sql.exec('UPDATE poker_room SET state=? WHERE singleton=1',json);}}
    output=this.view(s,owner,room,rooms);
   };
   if(this.storage.transactionSync)this.storage.transactionSync(work);else work();
   return Response.json(output);
  }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});throw error;}
 }
}
