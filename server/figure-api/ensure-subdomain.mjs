import { createHash } from 'node:crypto';

export async function ensureSubdomain({account, token, repository = 'Historykids/Historykids.github.io', request = fetch}) {
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !token) throw Error('Cloudflare secrets are missing or account ID is invalid');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers/subdomain';
  const headers = {Authorization: 'Bearer ' + token, 'Content-Type':'application/json'};
  const current = await request(url, {headers, signal:AbortSignal.timeout(15000)});
  const data = await current.json();
  if (current.ok && data.success === true && typeof data.result?.subdomain === 'string' && data.result.subdomain) return 'existing';
  const absent = current.status === 404 || (current.ok && data.success === true && !data.result?.subdomain) || (data.errors || []).some(e => e.code === 10007);
  if (!absent || current.status === 401 || current.status === 403) throw Error('Cannot check workers.dev: HTTP ' + current.status);
  const subdomain = 'historykids-' + createHash('sha256').update(account + '|' + repository).digest('hex').slice(0,10);
  const created = await request(url, {method:'PUT',headers,body:JSON.stringify({subdomain}),signal:AbortSignal.timeout(15000)});
  const result = await created.json();
  if (!created.ok || result.success !== true || result.result?.subdomain !== subdomain) {
    throw Error('Cannot register workers.dev: HTTP ' + created.status + ', codes ' + (result.errors || []).map(e=>e.code).join(','));
  }
  return 'created';
}
