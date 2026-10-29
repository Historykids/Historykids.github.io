import {HistoryLeaderboard as QuizLeaderboard} from '../figure-api/ranking.mjs';
import '../../assets/ui/amounts.js';
import '../../assets/ui/wealth-rules.js';
import {WealthAdmin,adminRoutes} from './admin.mjs';
import {WealthPoker,pokerRoutes} from './poker.mjs';
import {WealthNotices,noticeRoutes} from './notices.mjs';
import {Accounts,accountRoutes} from './accounts.mjs';
import {SengokuCampaign,sengokuRoutes} from './sengoku.mjs';
import {SengokuWorlds,worldRoutes} from './sengoku-worlds.mjs';
const W = globalThis.HKWealthRules, M=globalThis.HKAmounts;
const decode=row=>{if(!row)return null;for(const key of ['balance','assets','score'])row[key]=M.pack(row[key]);return row;};
const legacyColumns = 'id,name,balance,buildings,residents,buildingValue,residentValue,assets,score,timestamp,revision';
const columns=legacyColumns+',rebirths';
const visible='id NOT IN (SELECT id FROM wealth_moderation WHERE banned=1 OR nameBlocked=1)';
const fail = (error, status = 400) => Response.json({error}, {status});
export class HistoryLeaderboard extends QuizLeaderboard {
  constructor(ctx) {
    super(ctx);
    this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_scores(id TEXT PRIMARY KEY,name TEXT NOT NULL,balance INTEGER NOT NULL,buildings INTEGER NOT NULL,residents INTEGER NOT NULL,buildingValue INTEGER NOT NULL,residentValue INTEGER NOT NULL,assets INTEGER NOT NULL,score INTEGER NOT NULL,timestamp INTEGER NOT NULL,revision INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_scores_v2(id TEXT PRIMARY KEY,name TEXT NOT NULL,balance TEXT NOT NULL,buildings INTEGER NOT NULL,residents INTEGER NOT NULL,buildingValue INTEGER NOT NULL,residentValue INTEGER NOT NULL,assets TEXT NOT NULL,score TEXT NOT NULL,timestamp INTEGER NOT NULL,revision INTEGER NOT NULL,scoreKey TEXT NOT NULL,assetsKey TEXT NOT NULL)');
    // Decimal TEXT avoids SQLite INTEGER/REAL rounding; fixed-width keys sort exactly.
    this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_schema_migrations(version INTEGER PRIMARY KEY)');
    if(!this.sql.exec('SELECT COUNT(*) AS total FROM wealth_schema_migrations WHERE version=2').toArray()[0].total){
    this.sql.exec("INSERT OR IGNORE INTO wealth_scores_v2("+legacyColumns+",scoreKey,assetsKey) SELECT id,name,CAST(balance AS TEXT),buildings,residents,buildingValue,residentValue,CAST(assets AS TEXT),CAST(score AS TEXT),timestamp,revision,printf('%072d',score),printf('%072d',assets) FROM wealth_scores");
      this.sql.exec('INSERT OR IGNORE INTO wealth_schema_migrations(version) VALUES(2)');
    }
    if(!this.sql.exec('PRAGMA table_info(wealth_scores_v2)').toArray().some(column=>column.name==='rebirths'))this.sql.exec('ALTER TABLE wealth_scores_v2 ADD COLUMN rebirths INTEGER NOT NULL DEFAULT 0');
    this.sql.exec('CREATE INDEX IF NOT EXISTS wealth_rebirth_points ON wealth_scores_v2(rebirths DESC,scoreKey DESC,assetsKey DESC,buildings DESC,residents DESC,id)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS wealth_points_v2 ON wealth_scores_v2(scoreKey DESC,assetsKey DESC,buildings DESC,residents DESC,id)');
    // Preserve records for review; moderation changes visibility and registration access.
    this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_moderation(id TEXT PRIMARY KEY,banned INTEGER NOT NULL DEFAULT 0,nameBlocked INTEGER NOT NULL DEFAULT 0)');
    if(!this.sql.exec('SELECT COUNT(*) AS total FROM wealth_schema_migrations WHERE version=3').toArray()[0].total){
      for(const row of this.sql.exec('SELECT id,name FROM wealth_scores_v2').toArray()){
        const banned=W.moderationName(row.name)==='さとうきよと',nameBlocked=W.blockedName(row.name);
        if(banned||nameBlocked)this.sql.exec('INSERT INTO wealth_moderation(id,banned,nameBlocked) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET banned=MAX(wealth_moderation.banned,excluded.banned),nameBlocked=excluded.nameBlocked',row.id,Number(banned),Number(nameBlocked));
      }
      this.sql.exec('INSERT OR IGNORE INTO wealth_schema_migrations(version) VALUES(3)');
    }
    this.admin=new WealthAdmin(ctx.storage,W);
    this.poker=new WealthPoker(ctx.storage,this.admin);
    this.notices=new WealthNotices(ctx.storage,this.admin);
    this.accounts=new Accounts(ctx.storage);
    this.sengoku=new SengokuCampaign(ctx.storage,this.admin,this.accounts,owner=>this.isBanned(owner));
    this.sengokuWorlds=new SengokuWorlds(ctx.storage,this.accounts,this.admin,this.sengoku,owner=>this.isBanned(owner));
    this.accounts.validateRename=(a,name)=>{if(this.isBanned(a.owner))throw Object.assign(Error('banned'),{status:403});if(W.blockedName(name,this.admin.words()))throw Object.assign(Error('account-name-blocked'),{status:400});};
    this.accounts.onRename=(a,name)=>{this.sengokuWorlds.renameAccount(a,name);this.sql.exec('UPDATE wealth_scores_v2 SET name=? WHERE id=?',name,a.owner);this.sql.exec('UPDATE wealth_scores SET name=? WHERE id=?',name,a.owner);this.sql.exec('UPDATE wealth_moderation SET nameBlocked=0 WHERE id=? AND banned=0',a.owner);};
  }
  isBanned(owner) { return !!owner && !!this.sql.exec('SELECT banned FROM wealth_moderation WHERE id=?',owner).toArray()[0]?.banned; }
  board(owner) {
    const entries = this.sql.exec('SELECT '+columns+' FROM wealth_scores_v2 WHERE '+visible+' ORDER BY rebirths DESC,scoreKey DESC,assetsKey DESC,buildings DESC,residents DESC,id LIMIT 100').toArray().map(decode);
    let previous = null, rank = 0;
    entries.forEach((entry, index) => { const key=entry.rebirths+':'+entry.score;if(key!==previous)rank=index+1;previous=key; entry.rank = rank; });
    const own = owner ? this.sql.exec('SELECT '+columns+' FROM wealth_scores_v2 WHERE '+visible+' AND id=?', owner).toArray().map(decode)[0] || null : null;
    const ownRank = own ? this.sql.exec('SELECT COUNT(*)+1 AS rank FROM wealth_scores_v2 WHERE '+visible+' AND (rebirths>? OR (rebirths=? AND scoreKey>?))', own.rebirths,own.rebirths,M.key(own.score)).toArray()[0].rank : null;
    const moderation=owner?this.sql.exec('SELECT banned,nameBlocked FROM wealth_moderation WHERE id=?',owner).toArray()[0]:null;
    const ownRevision=own?.revision||(!moderation?.banned&&moderation?.nameBlocked?this.sql.exec('SELECT revision FROM wealth_scores_v2 WHERE id=?',owner).toArray()[0]?.revision:0)||0;
    return {entries, own, ownRank, ownRevision, blockedWords:this.admin.words(), banned:!!moderation?.banned, nameBlocked:!!moderation?.nameBlocked, total: this.sql.exec('SELECT COUNT(*) AS total FROM wealth_scores_v2 WHERE '+visible).toArray()[0].total, at: Date.now()};
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const data = await request.json();
    if(accountRoutes.has(path))return this.accounts.fetch(path,data);
    try{data.owner=this.accounts.resolve(data.owner||'',path.startsWith('/ranking'));}catch(error){if(error.status)return fail(error.message,error.status);throw error;}
    if (!path.startsWith('/wealth')) return super.fetch(new Request(request.url,{method:'POST',body:JSON.stringify(data)}));
    const owner=data.owner;
    if(adminRoutes.has(path))return this.admin.fetch(path,data);
    if(pokerRoutes.has(path))return this.poker.fetch(path,data);
    if(noticeRoutes.has(path))return this.notices.fetch(path,data);
    if(sengokuRoutes.has(path))return this.sengoku.fetch(path,data);
    if(worldRoutes.has(path))return this.sengokuWorlds.fetch(path,data);
    if (path === '/wealth') return Response.json(this.board(owner));
    if (path !== '/wealth/register') return fail('not-found', 404);
    if (!/^[a-f0-9]{64}$/.test(owner)) return fail('identity-required', 401);
    if(this.isBanned(owner))return fail('banned',403);
    const name = W.cleanName(data.name);
    if (!name) return fail('nickname');
    if(W.blockedName(name,this.admin.words()))return fail('nickname-blocked');
    let metrics;
    try { metrics = W.metrics(data.snapshot); } catch { return fail('invalid-town'); }
    const old = this.sql.exec('SELECT '+columns+' FROM wealth_scores_v2 WHERE id=?', owner).toArray().map(decode)[0];
    // Identical retries remain successful even if the preceding response was lost.
    if (old && old.name === name && W.sameMetrics(old, metrics)) return Response.json({...this.board(owner), updated: false});
    if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision !== (old?.revision || 0)) return fail('record-changed', 409);
    this.sql.exec('INSERT INTO wealth_scores_v2('+columns+',scoreKey,assetsKey) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,rebirths=excluded.rebirths,balance=excluded.balance,buildings=excluded.buildings,residents=excluded.residents,buildingValue=excluded.buildingValue,residentValue=excluded.residentValue,assets=excluded.assets,score=excluded.score,timestamp=excluded.timestamp,revision=excluded.revision,scoreKey=excluded.scoreKey,assetsKey=excluded.assetsKey',
      owner, name, M.full(metrics.balance), metrics.buildings, metrics.residents, metrics.buildingValue, metrics.residentValue, M.full(metrics.assets), M.full(metrics.score), Date.now(), (old?.revision || 0) + 1, metrics.rebirths, M.key(metrics.score), M.key(metrics.assets));
    this.sql.exec('UPDATE wealth_moderation SET nameBlocked=0 WHERE id=? AND banned=0',owner);
    return Response.json({...this.board(owner), updated: true});
  }
}
export async function wealthRequest(request, env, reply) {
  const path = new URL(request.url).pathname;
  if (!['/wealth', '/wealth/register'].includes(path)&&!adminRoutes.has(path)&&!pokerRoutes.has(path)&&!noticeRoutes.has(path)&&!accountRoutes.has(path)&&!sengokuRoutes.has(path)&&!worldRoutes.has(path)) return reply({error: 'not-found'}, 404);
  if (request.method === 'OPTIONS') return reply({ok: true});
  const read=['/wealth/account/session','/wealth/account/load','/wealth/account/capabilities'].includes(path)||path==='/wealth'||path==='/wealth/admin/session'||path==='/wealth/admin/board'||path==='/wealth/poker'||path==='/wealth/notices'||path==='/wealth/admin/recipients'||path==='/wealth/admin/notice-history'||path==='/wealth/sengoku'||path==='/wealth/sengoku/board'||path==='/wealth/sengoku/world'||path==='/wealth/sengoku/worlds'||path==='/wealth/sengoku/world/ranking'||path==='/wealth/sengoku/world/alliances'||path==='/wealth/sengoku/chat';
  if (request.method !== (read ? 'GET' : 'POST')) return reply({error: 'method-not-allowed'}, 405);
  if (!env.LEADERBOARD || !env.RANK_READ_LIMITER || !env.RANK_WRITE_LIMITER || !env.RANK_GLOBAL_LIMITER) return reply({error: 'not-configured'}, 503);
  if(pokerRoutes.has(path)&&!env.POKER_ROOM_LIMITER)return reply({error:'not-configured'},503);
  if((sengokuRoutes.has(path)||worldRoutes.has(path))&&!env.SENGOKU_ACTIVITY_LIMITER)return reply({error:'not-configured'},503);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if ((token && !/^[a-f0-9]{64}$/.test(token)) || ((request.method === 'POST'&&path!=='/wealth/account/login'||adminRoutes.has(path)||path.startsWith('/wealth/admin/')||pokerRoutes.has(path)||sengokuRoutes.has(path)&&path!=='/wealth/sengoku/board') && !token)) return reply({error: 'identity-required'}, 401);
  const digest = token ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)) : null;
  const owner = digest ? Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') : '';
  const ip=request.headers.get('CF-Connecting-IP')||'anonymous';
  if(['/wealth/account/register','/wealth/account/login','/wealth/account/password','/wealth/account/rename'].includes(path)){
    if(!env.ACCOUNT_AUTH_LIMITER)return reply({error:'not-configured'},503);
    if(!(await env.ACCOUNT_AUTH_LIMITER.limit({key:ip})).success)return reply({error:'account-try-later'},429);
  }
  if(path==='/wealth/admin/claim'){
    if(!env.ADMIN_CLAIM_LIMITER)return reply({error:'not-configured'},503);
    if(!(await env.ADMIN_CLAIM_LIMITER.limit({key:ip})).success)return reply({error:'rate-limited'},429);
  }
  const rate = await (read ? env.RANK_READ_LIMITER : env.RANK_WRITE_LIMITER).limit({key:pokerRoutes.has(path)?'poker:'+owner:(sengokuRoutes.has(path)||worldRoutes.has(path))&&owner?'sengoku:'+owner:ip});
  const globalRate = await (pokerRoutes.has(path)?env.POKER_ROOM_LIMITER:(sengokuRoutes.has(path)||worldRoutes.has(path))?env.SENGOKU_ACTIVITY_LIMITER:env.RANK_GLOBAL_LIMITER).limit({key: 'site'});
  if (!rate.success || !globalRate.success) return reply({error: 'rate-limited'}, 429);
  let data = {};
  if(path==='/wealth/poker'&&request.method==='GET'){data.room=new URL(request.url).searchParams.get('room')||undefined;const ticket=new URL(request.url).searchParams.get('ticket');if(ticket)data.id=ticket;}
  if(path==='/wealth/sengoku/world'||path==='/wealth/sengoku/world/ranking'||path==='/wealth/sengoku/world/alliances'){const id=new URL(request.url).searchParams.get('world');if(id!==null)data.worldId=Number(id);}
  if(path==='/wealth/sengoku/world/ranking'){const region=new URL(request.url).searchParams.get('region');if(region!==null)data.region=region;}
  if(path==='/wealth/sengoku/board')data.period=new URL(request.url).searchParams.get('period')||'alltime';
  if(path==='/wealth/admin/notice-history')data.offset=Number(new URL(request.url).searchParams.get('offset')||0);
  if (request.method === 'POST') {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error: 'json-required'}, 415);
    if (Number(request.headers.get('Content-Length')) > (['/wealth/account/save','/wealth/account/register'].includes(path)?1100000:8000)) return reply({error: 'too-large'}, 413);
    try { const text = await request.text(); if (new TextEncoder().encode(text).length > (['/wealth/account/save','/wealth/account/register'].includes(path)?1100000:8000)) return reply({error: 'too-large'}, 413); data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); }
    catch { return reply({error: 'invalid-json'}, 400); }
  }
  try {
    const stub = env.LEADERBOARD.get(env.LEADERBOARD.idFromName('alltime-v1'));
    const result = await stub.fetch(new Request('https://internal'+path, {method: 'POST', body: JSON.stringify({...data, owner})}));
    return reply(await result.json(), result.status);
  } catch { return reply({error: 'ranking-unavailable'}, 503); }
}
