(function(){
  "use strict";
  const $=id=>document.getElementById(id), E=window.HKCore.esc, people=window.HKFigurePeople;
  let person=people[0], history=[], busy=false, mode="api", ready=false, controller=null, revision=0;
  const endpoint=window.HKAIConfig?.endpoint||"";
  const normalize=s=>s.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu,"");
  function retrieve(question,p=person){
    const q=normalize(question); const follow=/^(それ|その|もっと|なぜ|どうして|詳しく|くわしく)/.test(q);
    const last=history.filter(x=>x.role==="user").slice(-2,-1)[0]?.content||"";
    const search=q+(follow?normalize(last):"");
    return p.facts.map((f,i)=>({...f,i,score:f.keys.split(" ").reduce((n,k)=>n+(search.includes(k)?Math.min(5,k.length):0),0)})).sort((a,b)=>b.score-a.score||a.i-b.i);
  }
  function guide(question){
    const q=normalize(question);
    if(/^(こんにちは|こんばんは|おはよう|やあ)/.test(q))return {text:person.intro,facts:[]};
    if(/ありがとう|さようなら/.test(q))return {text:"話してくれてありがとう。また気になることを聞いてください。歴史のクイズにも挑戦してみよう！",facts:[]};
    if(/誰|だれ|自己紹介|何をした|どんな人/.test(q))return {text:person.intro,facts:person.facts.slice(0,1)};
    const found=retrieve(question);
    if(found[0].score>0)return {text:(/^(もっと|詳しく|くわしく)/.test(q)?"さっきの話を、もう少し整理してみよう。\n\n":"いい質問ですね。資料をもとにお話しします。\n\n")+found[0].text+(found[1].score>0?"\n\n"+found[1].text:""),facts:found.filter(f=>f.score>0).slice(0,2)};
    if(/現代|スマホ|ゲーム|好き|気持ち|勉強|学校|友達/.test(q))return {text:"【想像の会話】本人が今の質問に答えた記録はありません。私になりきって考えるなら、「気になったことを調べ、まわりの人と話し合ってみてほしい」と伝えたいですね。\n\n歴史の話なら、"+person.topics[0]+" という質問から始めてみよう。",facts:[]};
    return {text:"その質問に答えられる資料が、この資料会話にはまだありません。分からないことを史実として言い切ることはできません。\n\n「"+person.topics.join("」「")+"」なら、資料を使って話せます。AI会話では、ほかの質問もできます。",facts:[]};
  }

  function sources(div,facts){
    if(!Array.isArray(facts)||!facts.length)return;const links=document.createElement("div");links.className="sources";links.append("参考資料： ");
    for(const item of facts.slice(0,6)){try{const url=new URL(item.url);if(url.protocol!=="https:")continue;const a=document.createElement("a");a.href=url.href;a.target="_blank";a.rel="noopener noreferrer";a.textContent=item.label||url.hostname;links.append(a);}catch{}}
    div.append(links);
  }
  function addMessage(role,text,facts=[]){
    const div=document.createElement("div");div.className="chat-message"+(role==="user"?" user":"");
    const label=document.createElement("span");label.className="speaker";label.textContent=role==="user"?"あなた":person.name+(mode==="api"?" · AI":" · 資料会話");
    const body=document.createElement("div");body.textContent=text;div.append(label,body);$("chatMessages").append(div);sources(div,facts);$("chatMessages").scrollTop=$("chatMessages").scrollHeight;return {div,body};
  }
  function updateControls(){
    const available=mode==="guide"||ready;
    $("sendChat").disabled=busy||!available;$("chatInput").disabled=busy||!available;$("resetChat").disabled=busy;
    document.querySelectorAll(".figure-choice").forEach(b=>b.disabled=busy);
    document.querySelectorAll(".suggestions button").forEach(b=>b.disabled=busy||!available);
    $("stopChat").hidden=!busy;$("useGuide").disabled=busy;$("enableAI").disabled=busy;
    $("engineBadge").textContent=mode==="guide"?"資料会話":ready?"AI会話 · API接続":"AI会話 · 接続準備中";
  }
  function select(id){
    if(busy)return;person=people.find(p=>p.id===id)||people[0];history=[];$("chatMessages").replaceChildren();
    $("figureName").textContent=person.name;$("figureEra").textContent=person.era;$("figureTag").textContent=person.tag;$("figureAvatar").textContent=person.glyph;
    document.querySelectorAll(".figure-choice").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.person===person.id)));
    $("suggestions").innerHTML=person.topics.map(t=>`<button type="button">${E(t)}</button>`).join("");addMessage("assistant",person.intro);$("chatStatus").textContent="";updateControls();
  }
  async function initializeAPI(){
    mode="api";ready=false;updateControls();$("enableAI").disabled=true;
    if(!endpoint){$("engineStatus").textContent="AIは現在、接続準備中です。資料会話は利用できます。";$("enableAI").hidden=true;return;}
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
    question=String(question||"").trim().slice(0,500);if(!question||busy||(mode==="api"&&!ready))return;
    const user={role:"user",content:question};history.push(user);addMessage("user",question);$("chatInput").value="";busy=true;updateControls();
    if(mode==="guide"){const answer=guide(question);addMessage("assistant",answer.text,answer.facts);history.push({role:"assistant",content:answer.text});history=history.slice(-8);busy=false;updateControls();return;}
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
  $("enableAI").onclick=initializeAPI;$("useGuide").onclick=()=>{mode=mode==="api"?"guide":"api";$("useGuide").textContent=mode==="guide"?"AI会話に戻る":"資料会話を試す";updateControls();};$("stopChat").onclick=()=>controller?.abort();
  window.HKFigures={people,retrieve,guide,send,initializeAPI,get history(){return history;}};select(new URLSearchParams(location.search).get("person"));initializeAPI();
})();
