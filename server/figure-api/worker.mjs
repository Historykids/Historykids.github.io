import "../../assets/ui/figure-data.js";
const people=globalThis.HKFigurePeople;
const allowedOrigin="https://historykids.github.io";
function reply(body,status=200,origin=allowedOrigin){return Response.json(body,{status,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store","Vary":"Origin","X-Content-Type-Options":"nosniff"}});}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get("Origin");
  if(origin&&origin!==allowedOrigin)return reply({error:"origin-not-allowed"},403,"");
  if(url.pathname==="/health"&&request.method==="GET")return reply({ready:!!env.AI&&!!env.AI_LIMITER&&!!env.GLOBAL_LIMITER});
  if(!origin)return reply({error:"origin-required"},403,"");
  if(url.pathname!=="/chat")return reply({error:"not-found"},404);
  if(request.method==="OPTIONS")return reply({ok:true});
  if(request.method!=="POST")return reply({error:"method-not-allowed"},405);
  if(!env.AI||!env.AI_LIMITER||!env.GLOBAL_LIMITER)return reply({error:"not-configured"},503);
  if(!request.headers.get("Content-Type")?.startsWith("application/json"))return reply({error:"json-required"},415);
  if(Number(request.headers.get("Content-Length"))>12000)return reply({error:"too-large"},413);
  const rate=await env.AI_LIMITER.limit({key:request.headers.get("CF-Connecting-IP")||"anonymous"});
  const globalRate=await env.GLOBAL_LIMITER.limit({key:"site"});
  if(!rate.success||!globalRate.success)return reply({error:"rate-limited"},429);
  let data;try{const text=await request.text();if(text.length>12000)return reply({error:"too-large"},413);data=JSON.parse(text);}catch{return reply({error:"invalid-json"},400);}
  const person=people.find(p=>p.id===data.person),messages=data.messages;
  if(!person||!Array.isArray(messages)||messages.length<1||messages.length>8||messages.at(-1)?.role!=="user")return reply({error:"invalid-conversation"},400);
  if(messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=="string"||!m.content.trim()||m.content.length>(m.role==='user'?500:4000)))return reply({error:"invalid-message"},400);
  const system="あなたは日本史学習サイトの"+person.name+"になりきる会話相手です。"+person.tone+"。日本語で中学生に分かりやすく、質問に直接答えてください。通常は150〜300字、短い回答を頼まれたら短く答えます。決まり文句で話題を戻さず、質問と会話の文脈に合う自然な返答をしてください。史実を正確に説明し、質問に誤りがあれば優しく訂正してください。実際の本人の発言や会話記録を装わないでください。現代の話題や本人の気持ちの想像には【想像の会話】を付け、不確かな史実は不明と答えます。次の確認済みの資料を優先し、資料にない一般的な日本史の質問にも知識を使って答えてください。参考URLを捏造してはいけません。\n"+person.facts.map(f=>f.text).join("\n")+"\n/no_think";
  let timer;try{
   const result=await Promise.race([env.AI.run(env.AI_MODEL||"@cf/qwen/qwen3-30b-a3b-fp8",{messages:[{role:"system",content:system},...messages],max_tokens:1200,temperature:.5}),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error("timeout")),40000))]);
   const answer=(result.response||result.choices?.[0]?.message?.content||"").replace(/<think>[\s\S]*?(?:<\/think>|$)/g,"").trim().slice(0,4000);
   if(!answer)return reply({error:"empty-response"},502);
   return reply({answer,sources:[...new Set(person.facts.map(f=>f.url))].map(url=>({url}))});
  }catch{return reply({error:"generation-unavailable"},503);}finally{clearTimeout(timer);}
 }
};
