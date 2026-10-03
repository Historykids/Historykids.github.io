(function(){
  "use strict";
  const $=id=>document.getElementById(id), E=window.HKCore.esc, people=window.HKFigurePeople;
  let person=people[0], history=[], busy=false, ready=false, controller=null, revision=0;
  const endpoint=window.HKAIConfig?.endpoint||"";

  function sources(div,facts){
    if(!Array.isArray(facts)||!facts.length)return;const links=document.createElement("div");links.className="sources";links.append("参考資料： ");
    for(const item of facts.slice(0,6)){try{const url=new URL(item.url);if(url.protocol!=="https:")continue;const a=document.createElement("a");a.href=url.href;a.target="_blank";a.rel="noopener noreferrer";a.textContent=item.label||url.hostname;links.append(a);}catch{}}
    div.append(links);
  }
  function addMessage(role,text,facts=[]){
    const div=document.createElement("div");div.className="chat-message"+(role==="user"?" user":"");
    const label=document.createElement("span");label.className="speaker";label.textContent=role==="user"?"あなた":person.name+" · AI";
    const body=document.createElement("div");body.textContent=text;div.append(label,body);$("chatMessages").append(div);sources(div,facts);$("chatMessages").scrollTop=$("chatMessages").scrollHeight;return {div,body};
  }
  function updateControls(){
    $("sendChat").disabled=busy||!ready;$("chatInput").disabled=busy||!ready;$("resetChat").disabled=busy;
    document.querySelectorAll(".figure-choice").forEach(b=>b.disabled=busy);
    document.querySelectorAll(".suggestions button").forEach(b=>b.disabled=busy||!ready);
    $("stopChat").hidden=!busy;$("enableAI").disabled=busy;
    $("engineBadge").textContent=ready?"AI会話 · API接続":"AI会話 · 接続準備中";
  }
  function select(id){
    if(busy)return;person=people.find(p=>p.id===id)||people[0];history=[];$("chatMessages").replaceChildren();
    $("figureName").textContent=person.name;$("figureEra").textContent=person.era;$("figureTag").textContent=person.tag;$("figureAvatar").textContent=person.glyph;
    document.querySelectorAll(".figure-choice").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.person===person.id)));
    $("suggestions").innerHTML=person.topics.map(t=>`<button type="button">${E(t)}</button>`).join("");addMessage("assistant",person.intro);$("chatStatus").textContent="";updateControls();
  }
  async function initializeAPI(){
    ready=false;updateControls();$("enableAI").disabled=true;
    if(!endpoint){$("engineStatus").textContent="AIは現在、接続準備中です。";$("enableAI").hidden=true;return;}
    const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),10000);
    try{
      const url=new URL(endpoint);if(url.protocol!=="https:")throw Error("invalid-endpoint");
      $("engineStatus").textContent="AIにつないでいます…";
      const response=await fetch(url.href.replace(/\/chat\/?$/,"/health"),{signal:timeout.signal,credentials:"omit",cache:"no-store"});
      const data=await response.json();if(!response.ok||data.ready!==true)throw Error("unavailable");
      ready=true;$("engineStatus").textContent="準備できました。聞きたいことを入力してね。";$("enableAI").hidden=true;
    }catch{$("engineStatus").textContent="AIに接続できませんでした。少し待って再接続してね。";$("enableAI").hidden=false;$("enableAI").textContent="再接続する";}
    finally{clearTimeout(timer);updateControls();}
  }
  async function send(question){
    question=String(question||"").trim().slice(0,500);if(!question||busy||!ready)return;
    const user={role:"user",content:question};history.push(user);addMessage("user",question);$("chatInput").value="";busy=true;updateControls();
    const id=++revision,msg=addMessage("assistant","考えています…"),abort=new AbortController();controller=abort;msg.div.classList.add("typing");
    $("chatStatus").textContent="AIが回答を作っています…";let expired=false;
    const timer=setTimeout(()=>{expired=true;abort.abort();},45000);
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"omit",signal:abort.signal,body:JSON.stringify({person:person.id,messages:history.slice(-8)})});
      const data=await response.json();if(!response.ok){const error=Error("api");error.status=response.status;throw error;}
      if(id!==revision)return;
      const answer=typeof data.answer==="string"?data.answer.replace(/<think>[\s\S]*?<\/think>/g,"").trim():"";if(!answer)throw Error("empty");
      msg.body.textContent=answer.slice(0,4000);sources(msg.div,data.sources);history.push({role:"assistant",content:answer});history=history.slice(-8);
      $("chatStatus").textContent="本人になりきった創作の会話です。史実は参考資料でも確認してね。";
    }catch(error){
      if(id!==revision)return;
      if(history.at(-1)===user)history.pop();
      msg.body.textContent=abort.signal.aborted?(expired?"回答に時間がかかっています。もう一度試してね。":"回答を止めました。"):error.status===429?"今は質問が混み合っています。少し待ってから送ってね。":"AIに接続できませんでした。もう一度試してね。";
      $("chatStatus").textContent="この質問は回答できませんでした。";
    }finally{clearTimeout(timer);if(id===revision){controller=null;busy=false;msg.div.classList.remove("typing");updateControls();}}
  }
  $("figureList").innerHTML=people.map(p=>`<button class="figure-choice" data-person="${p.id}" aria-pressed="false"><span class="figure-avatar" aria-hidden="true">${p.glyph}</span><span><b>${p.name}</b><small>${p.era}</small></span></button>`).join("");
  $("figureList").onclick=e=>{const b=e.target.closest("[data-person]");if(b)select(b.dataset.person);};$("resetChat").onclick=()=>select(person.id);
  $("suggestions").onclick=e=>{const b=e.target.closest("button");if(b)send(b.textContent);};$("chatForm").onsubmit=e=>{e.preventDefault();send($("chatInput").value);};
  $("chatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(e.target.value);}};
  $("enableAI").onclick=initializeAPI;$("stopChat").onclick=()=>controller?.abort();
  window.HKFigures={people,send,initializeAPI,get history(){return history;}};select(new URLSearchParams(location.search).get("person"));initializeAPI();
})();
