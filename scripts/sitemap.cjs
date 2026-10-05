const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'sitemap-pages.json'), 'utf8'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function checkDate(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, 'lastmod must be YYYY-MM-DD');
  assert.equal(new Date(value + 'T00:00:00Z').toISOString().slice(0, 10), value, 'lastmod must be a real date');
}

function checkFile(file) {
  assert.equal(typeof file, 'string');
  assert(!path.isAbsolute(file) && !file.split('/').includes('..'), 'file must be inside the site');
  assert(file.endsWith('.html'), 'only HTML content pages belong in this sitemap');
  assert(fs.statSync(path.join(root, file)).isFile(), 'missing page: ' + file);
}

function checkCanonical(file, url, indexable) {
  const dom = new JSDOM(read(file));
  try {
    const d = dom.window.document;
    const links = [...d.querySelectorAll('head link[rel~="canonical"]')];
    assert.equal(links.length, 1, file + ': exactly one canonical link is required');
    assert.equal(links[0].getAttribute('href'), url, file + ': canonical does not match the sitemap');
    assert(!d.querySelector('meta[http-equiv="refresh" i]'), file + ': redirect pages must not be listed');
    if (indexable) {
      assert(d.title.trim(), file + ': missing title');
      for (const meta of d.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]')) {
        assert(!/(?:^|[\s,])(noindex|none)(?:$|[\s,])/i.test(meta.content), file + ': page is not indexable');
      }
    }
  } finally { dom.window.close(); }
}

function validatePages() {
  assert.equal(new URL(config.origin).origin, config.origin, 'origin must be an absolute origin without a trailing slash');
  assert.equal(new URL(config.origin).protocol, 'https:');
  assert(config.pages.length > 0 && config.pages.length <= 50000);
  const urls = new Set(), files = new Set();
  for (const page of config.pages) {
    checkFile(page.file);
    assert(page.path.startsWith('/') && !page.path.startsWith('//'));
    const url = new URL(page.path, config.origin);
    assert.equal(url.origin, config.origin);
    assert(!url.search && !url.hash, 'do not list game variants or hash-based views');
    assert.equal(url.href, config.origin + page.path, 'URL must already be normalized');
    assert(!urls.has(url.href), 'duplicate URL: ' + url.href);
    assert(!files.has(page.file), 'duplicate file: ' + page.file);
    checkDate(page.lastmod);
    checkCanonical(page.file, url.href, true);
    urls.add(url.href); files.add(page.file);
  }
  for (const alias of config.aliases) {
    checkFile(alias.file);
    assert(!files.has(alias.file), 'alias is listed more than once');
    const target = config.origin + alias.canonical;
    assert(urls.has(target), 'alias target must be in the sitemap');
    checkCanonical(alias.file, target, false);
    files.add(alias.file);
  }
  for (const item of config.excluded) {
    checkFile(item.file);
    assert(item.reason && !files.has(item.file), 'excluded files need a reason and must not be listed');
    files.add(item.file);
  }
  // CI uses Git's published inventory, so scratch copies and local previews cannot leak into the sitemap.
  let tracked = null;
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (path.resolve(top) === root) {
      tracked = execFileSync('git', ['ls-files', '-z', '--', '*.html'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    }
  } catch { /* A downloaded source snapshot can generate the same sitemap without Git. */ }
  if (tracked) for (const file of tracked) assert(files.has(file), 'unclassified published HTML: ' + file + '; add it to sitemap-pages.json');
  return [...urls];
}

function validateXml(xml, urls) {
  assert(Buffer.byteLength(xml, 'utf8') < 50 * 1024 * 1024);
  const dom = new JSDOM(xml, { contentType: 'application/xml' });
  try {
    const d = dom.window.document;
    assert.equal(d.documentElement.localName, 'urlset');
    assert.equal(d.documentElement.namespaceURI, namespace);
    assert.deepEqual([...d.getElementsByTagNameNS(namespace, 'loc')].map(el => el.textContent), urls);
    const entries = [...d.documentElement.children];
    assert.equal(entries.length, urls.length);
    for (const entry of entries) {
      assert.equal(entry.localName, 'url');
      assert.deepEqual([...entry.children].map(el => el.localName), ['loc', 'lastmod']);
      checkDate(entry.lastElementChild.textContent);
    }
  } finally { dom.window.close(); }
}

function main() {
  assert(process.argv.length === 3 && ['--write', '--check'].includes(process.argv[2]), 'use --write or --check');
  const urls = validatePages();
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="' + namespace + '">\n' +
    config.pages.map((page, i) => '  <url>\n    <loc>' + escape(urls[i]) + '</loc>\n    <lastmod>' + page.lastmod + '</lastmod>\n  </url>').join('\n') +
    '\n</urlset>\n';
  validateXml(xml, urls);
  const text = urls.join('\n') + '\n';
  const robots = 'User-agent: *\nAllow: /\n\nSitemap: ' + config.origin + '/sitemap.xml\n';
  const artifacts = { 'sitemap.xml': xml, 'sitemap.txt': text, 'robots.txt': robots };
  for (const [file, content] of Object.entries(artifacts)) {
    if (process.argv[2] === '--write') fs.writeFileSync(path.join(root, file), content, 'utf8');
    else assert.equal(read(file), content, file + ': stale or invalid; run npm run sitemap');
  }
  console.log('Sitemap ' + (process.argv[2] === '--write' ? 'generated' : 'verified') + ': ' + urls.length + ' canonical URLs; XML, dates, page files, canonical links and robots.txt are consistent.');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
