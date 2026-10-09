import "../../assets/ui/figure-data.js";
import {personaMessages} from "./persona.mjs";
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
  let timer;try{
   const result=await Promise.race([env.AI.run(env.AI_MODEL||"@cf/qwen/qwen3-30b-a3b-fp8",{messages:personaMessages(person,messages),max_tokens:1200,temperature:.5}),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error("timeout")),40000))]);
   const answer=(result.response||result.choices?.[0]?.message?.content||"").replace(/<think>[\s\S]*?(?:<\/think>|$)/g,"").replace(/(?:\*\*)?【\s*想像の会話\s*】(?:\*\*)?\s*/g,"").trim().slice(0,4000);
   if(!answer)return reply({error:"empty-response"},502);
   return reply({answer});
  }catch{return reply({error:"generation-unavailable"},503);}finally{clearTimeout(timer);}
 }
};

