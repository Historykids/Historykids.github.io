import {rankingRequest} from '../figure-api/ranking.mjs';
import {snakeRequest,SNAKE_VERSION} from './neon-snake.mjs';
export {NeonSnakeArena} from './neon-snake.mjs';
import {wealthRequest} from './wealth.mjs';
export {HistoryLeaderboard} from './wealth.mjs';
const origin='https://historykids.github.io';
function reply(body,status=200,allow=origin){return Response.json(body,{status,headers:{'Access-Control-Allow-Origin':allow,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Admin-Password','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}});}
export default {async fetch(request,env){
 const url=new URL(request.url),incoming=request.headers.get('Origin');
 if(incoming&&incoming!==origin)return reply({error:'origin-not-allowed'},403,'');
 if(url.pathname==='/health'&&request.method==='GET')return reply({release:'simple-alliance-20261101-r1',snakeOnlineVersion:SNAKE_VERSION,snakeReady:!!env.SNAKE_ARENA,ready:!!env.LEADERBOARD&&!!env.RANK_READ_LIMITER&&!!env.RANK_WRITE_LIMITER&&!!env.RANK_GLOBAL_LIMITER});
 if(!incoming)return reply({error:'origin-required'},403,'');
 if(url.pathname.startsWith('/snake/'))return snakeRequest(request,env,reply);
 return url.pathname.startsWith('/wealth')?wealthRequest(request,env,reply):rankingRequest(request,env,reply);
}};
