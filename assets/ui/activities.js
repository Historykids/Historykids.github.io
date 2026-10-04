/* Daily learning goals and timed town events share the atomic ryo wallet. */
(function (root) {
  "use strict";
  const C = root.HKCore || (typeof require === "function" ? require("./core.js") : null);
  const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
  const weekly = [
    [["correct",3,10,"クイズに3問正解"],["type",1,10,"入力で1問正解"],["eras",2,15,"2つの時代で正解"],["read",2,10,"歴史カードを2枚読む"],["town",1,5,"自分の町を見に行く"]],
    [["correct",4,15,"クイズに4問正解"],["choice",3,10,"4択で3問正解"],["type",2,15,"入力で2問正解"],["replay",1,10,"カードから1問解き直す"],["town",1,5,"自分の町を見に行く"]],
    [["correct",3,10,"クイズに3問正解"],["read",3,15,"歴史カードを3枚読む"],["eras",3,20,"3つの時代で正解"],["town",1,5,"自分の町を見に行く"],["events",1,20,"町イベントを1つ解決"]],
    [["correct",5,20,"クイズに5問正解"],["type",2,15,"入力で2問正解"],["eras",2,15,"2つの時代で正解"],["read",3,15,"歴史カードを3枚読む"],["town",1,5,"自分の町を見に行く"]],
    [["correct",4,15,"クイズに4問正解"],["choice",2,10,"4択で2問正解"],["eras",3,20,"3つの時代で正解"],["replay",2,15,"カードから2問解き直す"],["events",1,20,"町イベントを1つ解決"]],
    [["correct",6,25,"クイズに6問正解"],["type",3,20,"入力で3問正解"],["read",4,20,"歴史カードを4枚読む"],["eras",4,25,"4つの時代で正解"],["town",1,5,"自分の町を見に行く"]],
    [["correct",3,10,"クイズに3問正解"],["choice",3,10,"4択で3問正解"],["type",1,10,"入力で1問正解"],["replay",1,10,"カードから1問解き直す"],["events",1,20,"町イベントを1つ解決"]],
  ].map((day, index) => day.map(([metric,target,reward,title],i) => ({id:`${index}-${i}`,metric,target,reward,title})));
  const events = {
    festival: {title:"祭り開催！",icon:"🏮",description:"町のみんなでお祭りの準備。クイズに2問正解して、祭りを盛り上げよう！",target:2,reward:30},
    fire: {title:"火事が発生！",icon:"🔥",description:"住民が消火活動中。クイズに3問正解して、みんなを助けよう！",target:3,reward:40},
    shogun: {title:"将軍が町を訪問！",icon:"🏯",description:"将軍を迎える準備をしよう。クイズに2問正解して、おもてなしを成功させよう！",target:2,reward:30},
  };
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const eventPeriod = 30 * 60 * 1000;
  function weekday(day) { return (new Date(day+"T00:00:00Z").getUTCDay()+6)%7; }
  function fresh(day) { return {day,correct:{},type:{},choice:{},eras:{},read:{},replay:{},town:0,events:0,claimed:{}}; }
  function normalize(value, now=Date.now()) {
    const day=C.dayKey(new Date(now)), a=object(value) ? value : {};
    if (!object(a.daily) || a.daily.day!==day) a.daily=fresh(day);
    for(const name of ["correct","type","choice","eras","read","replay","claimed"]) if(!object(a.daily[name])) a.daily[name]={};
    for(const name of ["town","events"]) if(!Number.isSafeInteger(a.daily[name]) || a.daily[name]<0) a.daily[name]=0;
    const e=a.event;
    if(e && (!events[e.type] || typeof e.id!=="string" || !Number.isFinite(e.start) || e.end!==e.start+300000 || !object(e.answers))) a.event=null;
    // Migrate the earlier short cooldown without restarting an existing event.
    if(a.cycleMs!==eventPeriod) { a.nextEventAt=a.event ? a.event.start+eventPeriod : 0; a.cycleMs=eventPeriod; }
    if(!Number.isFinite(a.nextEventAt)) a.nextEventAt=0;
    return a;
  }
  function count(daily, metric) { return object(daily[metric]) ? Object.keys(daily[metric]).length : daily[metric] || 0; }
  function summary(value, now=Date.now()) {
    const a=normalize(value ? JSON.parse(JSON.stringify(value)) : null,now), index=weekday(a.daily.day);
    return { ...a,weekday:index,missions:weekly[index].map(m=>({...m,progress:Math.min(m.target,count(a.daily,m.metric)),claimed:!!a.daily.claimed[m.id]})),eventActive:!!a.event && !a.event.resolved && now<a.event.end };
  }
  function apply(wallet, action, data={}, now=Date.now(), random=Math.random) {
    const a=normalize(wallet.activities,now), d=a.daily; wallet.activities=a;
    let reward=0, already=false;
    if(action==="town") {
      d.town=1;
      if((!a.event || now>=a.event.end) && now>=a.nextEventAt) {
        const options=Object.keys(events).filter(type=>type!==a.event?.type), type=options[Math.floor(random()*options.length)];
        const start=a.nextEventAt ? a.nextEventAt+Math.floor((now-a.nextEventAt)/eventPeriod)*eventPeriod : now;
        a.event={id:`event-${start}-${Math.floor(random()*1e9)}`,type,start,end:start+300000,answers:{},resolved:false};
        a.nextEventAt=start+eventPeriod;
      }
    } else if(action==="read" && typeof data.id==="string") d.read[data.id]=true;
    else if(action==="quiz" && typeof data.id==="string" && C.eraOrder.includes(data.era)) {
      d.correct[data.id]=true; d.eras[data.era]=true;
      if(data.mode==="type" || data.mode==="choice") d[data.mode][data.id]=true;
      if(data.replay) d.replay[data.id]=true;
      const e=a.event;
      if(e && !e.resolved && now<e.end && (!data.eventId || data.eventId===e.id)) {
        e.answers[data.id]=true;
        if(Object.keys(e.answers).length>=events[e.type].target) { e.resolved=true; e.resolvedAt=now; d.events++; reward=events[e.type].reward; }
      }
    } else if(action==="claim") {
      const m=weekly[weekday(d.day)].find(m=>m.id===data.id);
      if(!m || data.day!==d.day || count(d,m.metric)<m.target) throw Error("mission-incomplete");
      if(d.claimed[m.id]) already=true;
      else { d.claimed[m.id]=true; reward=m.reward; }
    }
    wallet.balance+=reward;
    return {reward,already,event:a.event};
  }
  const api={weekdays,weekly,events,eventPeriod,weekday,normalize,summary,apply};root.HKActivities=api;
  if(typeof module!=="undefined") module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
