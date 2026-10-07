import {HistoryLeaderboard as QuizLeaderboard} from '../figure-api/ranking.mjs';
import '../../assets/ui/wealth-rules.js';
const W = globalThis.HKWealthRules;
const columns = 'id,name,balance,buildings,residents,buildingValue,residentValue,assets,score,timestamp,revision';
const fail = (error, status = 400) => Response.json({error}, {status});
export class HistoryLeaderboard extends QuizLeaderboard {
  constructor(ctx) {
    super(ctx);
    this.sql.exec('CREATE TABLE IF NOT EXISTS wealth_scores(id TEXT PRIMARY KEY,name TEXT NOT NULL,balance INTEGER NOT NULL,buildings INTEGER NOT NULL,residents INTEGER NOT NULL,buildingValue INTEGER NOT NULL,residentValue INTEGER NOT NULL,assets INTEGER NOT NULL,score INTEGER NOT NULL,timestamp INTEGER NOT NULL,revision INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS wealth_points ON wealth_scores(score DESC,assets DESC,buildings DESC,residents DESC,id)');
  }
  board(owner) {
    const entries = this.sql.exec('SELECT '+columns+' FROM wealth_scores ORDER BY score DESC,assets DESC,buildings DESC,residents DESC,id LIMIT 100').toArray();
    let previous = null, rank = 0;
    entries.forEach((entry, index) => { if (entry.score !== previous) rank = index + 1; previous = entry.score; entry.rank = rank; });
    const own = owner ? this.sql.exec('SELECT '+columns+' FROM wealth_scores WHERE id=?', owner).toArray()[0] || null : null;
    const ownRank = own ? this.sql.exec('SELECT COUNT(*)+1 AS rank FROM wealth_scores WHERE score>?', own.score).toArray()[0].rank : null;
    return {entries, own, ownRank, total: this.sql.exec('SELECT COUNT(*) AS total FROM wealth_scores').toArray()[0].total, at: Date.now()};
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/wealth')) return super.fetch(request);
    const data = await request.json(), owner = data.owner || '';
    if (path === '/wealth') return Response.json(this.board(owner));
    if (path !== '/wealth/register') return fail('not-found', 404);
    if (!/^[a-f0-9]{64}$/.test(owner)) return fail('identity-required', 401);
    const name = W.cleanName(data.name);
    if (!name) return fail('nickname');
    let metrics;
    try { metrics = W.metrics(data.snapshot); } catch { return fail('invalid-town'); }
    const old = this.sql.exec('SELECT '+columns+' FROM wealth_scores WHERE id=?', owner).toArray()[0];
    // Identical retries remain successful even if the preceding response was lost.
    if (old && old.name === name && W.sameMetrics(old, metrics)) return Response.json({...this.board(owner), updated: false});
    if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision !== (old?.revision || 0)) return fail('record-changed', 409);
    this.sql.exec('INSERT INTO wealth_scores('+columns+') VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,balance=excluded.balance,buildings=excluded.buildings,residents=excluded.residents,buildingValue=excluded.buildingValue,residentValue=excluded.residentValue,assets=excluded.assets,score=excluded.score,timestamp=excluded.timestamp,revision=excluded.revision',
      owner, name, metrics.balance, metrics.buildings, metrics.residents, metrics.buildingValue, metrics.residentValue, metrics.assets, metrics.score, Date.now(), (old?.revision || 0) + 1);
    return Response.json({...this.board(owner), updated: true});
  }
}
export async function wealthRequest(request, env, reply) {
  const path = new URL(request.url).pathname;
  if (!['/wealth', '/wealth/register'].includes(path)) return reply({error: 'not-found'}, 404);
  if (request.method === 'OPTIONS') return reply({ok: true});
  if (request.method !== (path === '/wealth' ? 'GET' : 'POST')) return reply({error: 'method-not-allowed'}, 405);
  if (!env.LEADERBOARD || !env.RANK_READ_LIMITER || !env.RANK_WRITE_LIMITER || !env.RANK_GLOBAL_LIMITER) return reply({error: 'not-configured'}, 503);
  const rate = await (path === '/wealth' ? env.RANK_READ_LIMITER : env.RANK_WRITE_LIMITER).limit({key: request.headers.get('CF-Connecting-IP') || 'anonymous'});
  const globalRate = await env.RANK_GLOBAL_LIMITER.limit({key: 'site'});
  if (!rate.success || !globalRate.success) return reply({error: 'rate-limited'}, 429);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if ((token && !/^[a-f0-9]{64}$/.test(token)) || (request.method === 'POST' && !token)) return reply({error: 'identity-required'}, 401);
  const digest = token ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)) : null;
  const owner = digest ? Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') : '';
  let data = {};
  if (request.method === 'POST') {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error: 'json-required'}, 415);
    if (Number(request.headers.get('Content-Length')) > 8000) return reply({error: 'too-large'}, 413);
    try { const text = await request.text(); if (new TextEncoder().encode(text).length > 8000) return reply({error: 'too-large'}, 413); data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); }
    catch { return reply({error: 'invalid-json'}, 400); }
  }
  try {
    const stub = env.LEADERBOARD.get(env.LEADERBOARD.idFromName('alltime-v1'));
    const result = await stub.fetch(new Request('https://internal'+path, {method: 'POST', body: JSON.stringify({...data, owner})}));
    return reply(await result.json(), result.status);
  } catch { return reply({error: 'ranking-unavailable'}, 503); }
}
