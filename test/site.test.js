// The website: docs/lib copies, the browser data layer (docs/web.js) and the
// hosted endpoints in api/, all against the local mock APIs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { startMockApi, MINT, pair } from '../fixtures/mock-api.js';
import { assertWellFormed } from '../fixtures/svg-check.js';
import { SITE_LIB } from '../scripts/sync-docs-lib.mjs';
import { startDevSite } from '../scripts/dev-site.mjs';
import * as W from '../docs/web.js';
import { makeHandler, parseQuery, isPrivateIp, isPublicHttpsUrl, CACHE_OK } from '../api/_tape.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('docs/lib is a byte-for-byte copy of src (run npm run sync-site)', () => {
  for (const name of SITE_LIB) assert.equal(read(`docs/lib/${name}.js`), read(`src/${name}.js`), `docs/lib/${name}.js drifted from src`);
  assert.deepEqual(readdirSync(new URL('../docs/lib', import.meta.url)).sort(), SITE_LIB.map((n) => `${n}.js`).sort());
});

test('site files: no dashes, no external scripts, version shown', () => {
  for (const f of ['docs/index.html', 'docs/app.js', 'docs/web.js', 'api/_tape.js']) assert.doesNotMatch(read(f), /[\u2013\u2014]/, f);
  const html = read('docs/index.html');
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  assert.match(html, /<script type="module" src="app.js">/);
  assert.match(html, new RegExp(`v${JSON.parse(read('package.json')).version.replace(/\./g, '\\.')}`));
});

test('state round-trips through the query string', () => {
  const s = W.readState('?token=abc&chain=base&type=spark&metric=change&style=for-the-badge&timeframe=7d&label=paid%20to%20dev');
  assert.deepEqual(s, { ...W.DEFAULTS, token: 'abc', chain: 'base', type: 'spark', metric: 'change', style: 'for-the-badge', timeframe: '7d', label: 'paid to dev' });
  assert.deepEqual(W.readState(W.writeState(s)), s);
  assert.equal(W.writeState(W.DEFAULTS), '');
  const junk = W.readState('?type=poster&theme=neon&chain=mars&metric=mcap');
  assert.equal(junk.type, 'card');
  assert.equal(junk.theme, 'cream');
  assert.equal(junk.chain, 'solana');
  assert.equal(junk.metric, '', 'mcap is not a card metric');
});

test('parseInput explains bad input', () => {
  assert.deepEqual(W.parseInput(`  ${MINT} `), { chain: 'solana', address: MINT });
  assert.deepEqual(W.parseInput('base:0x7a3f1e0000000000000000000000000000c0ffee'), { chain: 'base', address: '0x7a3f1e0000000000000000000000000000c0ffee' });
  const code = (fn) => {
    try {
      fn();
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(code(() => W.parseInput('')), 'EMPTY');
  assert.equal(code(() => W.parseInput('0x7a3f1e0000000000000000000000000000c0ffee')), 'WRONG_CHAIN');
  assert.equal(code(() => W.parseInput(MINT, 'base')), 'WRONG_CHAIN');
  assert.equal(code(() => W.parseInput('https://dexscreener.com/solana/abc')), 'BAD_ADDRESS');
  assert.equal(code(() => W.parseInput('not an address')), 'BAD_ADDRESS');
});

test('safeLogo only passes clean https URLs', () => {
  assert.equal(W.safeLogo('https://dd.dexscreener.com/a.png?x=1&y=2'), 'https://dd.dexscreener.com/a.png?x=1&amp;y=2');
  assert.equal(W.safeLogo('http://example.com/a.png'), null);
  assert.equal(W.safeLogo('javascript:alert(1)'), null);
  assert.ok(!W.safeLogo('https://x.com/a.png" onload="alert(1)').includes('"'));
  assert.equal(W.safeLogo(null), null);
});

test('embed snippets', () => {
  const s = { ...W.DEFAULTS, token: MINT, label: 'paid to dev' };
  assert.equal(W.hostedUrl(s), `https://readmetape.com/api/card?chain=solana&token=${MINT}&theme=cream&label=paid%20to%20dev`);
  assert.equal(
    W.hostedMarkdown(s, { symbol: 'DEMO', url: 'https://dexscreener.com/solana/x' }),
    `[![$DEMO price card](https://readmetape.com/api/card?chain=solana&token=${MINT}&theme=cream&label=paid%20to%20dev)](https://dexscreener.com/solana/x)`,
  );
  const badge = { ...W.DEFAULTS, token: '0xabc', chain: 'base', type: 'badge', metric: 'mcap', style: 'flat-square' };
  assert.equal(W.hostedUrl(badge), 'https://readmetape.com/api/badge?chain=base&token=0xabc&metric=mcap&style=flat-square');
  assert.match(W.hostedUrl({ ...W.DEFAULTS }), /token=YOUR_TOKEN_ADDRESS/);
  const yaml = W.workflowYaml({ ...badge, label: "dev's cut" });
  assert.match(yaml, /tokens: base:0xabc\n {10}type: badge\n {10}metric: mcap\n {10}style: flat-square\n {10}label: 'dev''s cut'$/);
  assert.match(W.workflowYaml(s), /uses: OWNER\/tape@v1\n {8}with:\n {10}tokens: DemoMint1+\n {10}theme: cream\n {10}label: 'paid to dev'/);
  assert.equal(W.actionMarkdown(s, null), `[![coin price card](.github/tape.svg)](https://dexscreener.com/solana/${MINT})`);
});

let api;
before(async () => {
  api = await startMockApi();
});
after(async () => {
  await api?.close();
});

test('loadCoinWeb builds the same coin shape as loadCoin, from the browser APIs', async () => {
  const coin = await W.loadCoinWeb({ chain: 'solana', address: MINT }, { dexApi: api.url, geckoApi: api.url, now: Date.parse('2026-10-14T12:00:00Z') });
  assert.equal(coin.token.symbol, 'DEMO');
  assert.equal(coin.candles.length, 96);
  assert.equal(coin.change, 12.4);
  assert.equal(coin.logo, null, 'the mock logo is http, so the preview uses a monogram');
  const svg = W.renderPreview(coin, { ...W.DEFAULTS, token: MINT, label: 'paid to dev' });
  assertWellFormed(svg);
  assert.ok(svg.includes('$DEMO') && svg.includes('paid to dev') && svg.includes('#FFFDF8'));
  const week = await W.loadCoinWeb({ chain: 'solana', address: MINT }, { timeframe: '7d', token: coin.token, dexApi: api.url, geckoApi: api.url });
  assert.equal(week.candles.length, 42);
  assert.equal(typeof week.change, 'number');
  const badge = W.renderPreview(coin, { ...W.DEFAULTS, type: 'badge', metric: 'price' });
  assert.match(badge, /\$0\.0042/);
});

test('loadCoinWeb: no pair, chart failure and rate limits', async () => {
  const none = await W.loadCoinWeb({ chain: 'solana', address: 'NoPair1111111111111111111111111111111111' }, { dexApi: api.url, geckoApi: api.url });
  assert.equal(none.token, null);
  assertWellFormed(W.renderPreview(none, W.DEFAULTS));

  api.routes.GeckoDown11111111111111111111111111111111 = [pair({ pairAddress: 'PairDown1' }, 'GeckoDown11111111111111111111111111111111')];
  api.gecko.PairDown1 = { status: 500, failTimes: 5 };
  const noChart = await W.loadCoinWeb({ chain: 'solana', address: 'GeckoDown11111111111111111111111111111111' }, { dexApi: api.url, geckoApi: api.url, retryDelayMs: 1 });
  assert.equal(noChart.candles, null);
  assert.match(noChart.warnings[0], /no chart right now: GeckoTerminal returned an error \(HTTP 500\)/);

  api.routes.Limited111111111111111111111111111111111 = { status: 429, body: {} };
  await assert.rejects(
    W.loadCoinWeb({ chain: 'solana', address: 'Limited111111111111111111111111111111111' }, { dexApi: api.url, geckoApi: api.url, retryDelayMs: 1 }),
    (e) => e.code === 'RATE_LIMITED' && /rate limiting this browser/.test(e.message),
  );
  await assert.rejects(W.loadToken({ chain: 'solana', address: MINT }, { dexApi: 'http://127.0.0.1:9' }), (e) => e.code === 'NETWORK');
});

// ---------- hosted endpoints ----------

test('parseQuery validates every option', () => {
  const q = (s) => new URLSearchParams(s);
  const card = parseQuery('card', q(`token=base:0xabc&theme=cream&hide-border=1&colors=accent%3Df29e1f&token_logo=0`));
  assert.deepEqual(card.spec, { chain: 'base', address: '0xabc' });
  assert.equal(card.opts.theme, 'cream');
  assert.equal(card.opts.hideBorder, true);
  assert.deepEqual(card.opts.colors, { accent: 'f29e1f' });
  assert.equal(card.tokenLogo, false);
  const spark = parseQuery('spark', q(`token=${MINT}&metric=change&style=for-the-badge&label_color=9a5b00&logo=solana`));
  assert.deepEqual([spark.opts.metric, spark.opts.style, spark.opts.labelColor, spark.opts.logo], ['change', 'for-the-badge', '9a5b00', 'solana']);
  for (const bad of ['', 'token=a/b', `token=${MINT}&theme=neon`, `token=${MINT}&timeframe=1y`, `token=${MINT}&colors=nope`, `token=${MINT}&label=${'x'.repeat(41)}`]) {
    assert.throws(() => parseQuery('card', q(bad)), undefined, bad);
  }
  assert.throws(() => parseQuery('spark', q(`token=${MINT}&metric=mcap`)));
  assert.throws(() => parseQuery('badge', q(`token=${MINT}&label_color=red`)));
});

test('logo gate: public https hosts only', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['104.18.0.1', '8.8.8.8', '2606:4700::1']) assert.ok(!isPrivateIp(ip), ip);
  const resolve = async (host) => (host === 'evil.example' ? [{ address: '127.0.0.1' }] : [{ address: '104.18.0.1' }]);
  assert.equal(await isPublicHttpsUrl('https://dd.dexscreener.com/a.png', { resolve }), true);
  assert.equal(await isPublicHttpsUrl('https://evil.example/a.png', { resolve }), false);
  for (const u of ['http://dd.dexscreener.com/a.png', 'https://127.0.0.1/a.png', 'https://[::1]/a.png', 'https://localhost/a.png', 'https://cdn.example:8443/a.png', 'not a url']) {
    assert.equal(await isPublicHttpsUrl(u, { resolve }), false, u);
  }
});

let site;
test('dev site serves docs/ and the /api handlers', async (t) => {
  site = await startDevSite({ port: 0, mock: true });
  t.after(() => site.close());
  const page = await fetch(site.url + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /put it in your README/);
  assert.match((await fetch(site.url + '/app.js')).headers.get('content-type'), /javascript/);
  assert.equal((await fetch(site.url + '/lib/card.js')).status, 200);
  assert.notEqual((await fetch(site.url + '/%2e%2e/package.json')).status, 200, 'no path traversal');
  assert.equal((await fetch(site.url + '/api/nope')).status, 404);

  for (const [type, query, expect] of [
    ['card', `token=${MINT}&theme=cream&label=paid%20to%20dev`, ['$DEMO', 'paid to dev', '#FFFDF8']],
    ['spark', `token=${MINT}&metric=change`, ['+12.4%']],
    ['badge', `token=${MINT}&metric=price&style=for-the-badge`, ['$0.0042']],
  ]) {
    const r = await fetch(`${site.url}/api/${type}?${query}`);
    assert.equal(r.status, 200, type);
    assert.equal(r.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.equal(r.headers.get('cache-control'), CACHE_OK);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    const svg = await r.text();
    assertWellFormed(svg);
    for (const e of expect) assert.ok(svg.includes(e) || svg.includes(e.toUpperCase()), `${type} has ${e}`);
  }
  const nopair = await fetch(`${site.url}/api/card?token=NoPair1111111111111111111111111111111111`);
  assert.equal(nopair.status, 200);
  assert.match(await nopair.text(), /No trading pair/);

  const bad = await fetch(`${site.url}/api/card?token=${MINT}&theme=neon`);
  assert.equal(bad.status, 400);
  assert.match(bad.headers.get('x-tape-error'), /Unknown theme "neon"/);
  assert.match(bad.headers.get('cache-control'), /max-age/);
  assertWellFormed(await bad.text());
  assert.equal((await fetch(`${site.url}/api/badge`)).status, 400);
  assert.equal((await fetch(`${site.url}/api/badge?token=${MINT}`, { method: 'POST' })).status, 405);
  const head = await fetch(`${site.url}/api/badge?token=${MINT}`, { method: 'HEAD' });
  assert.equal(head.status, 200);
});

// A tiny req/res pair for calling a handler directly.
async function call(handler, url) {
  const headers = {};
  let body = '';
  const res = {
    statusCode: 200,
    setHeader: (k, v) => (headers[k.toLowerCase()] = v),
    end: (b) => (body = b ?? ''),
  };
  await handler({ method: 'GET', url }, res);
  return { status: res.statusCode, headers, body };
}

test('handler: logo embedding, per-instance memo and upstream errors', async () => {
  const env = { ...process.env };
  Object.assign(process.env, { TAPE_DEXSCREENER_API: api.url, TAPE_GECKO_API: api.url, TAPE_RETRY_BASE_MS: '1' });
  try {
    const card = makeHandler('card', { logoAllowed: async () => true });
    const n = api.requests.length;
    const r = await call(card, `/api/card?token=${MINT}&theme=espresso`);
    assert.equal(r.status, 200);
    assert.match(r.body, /href="data:image\/png;base64,/);
    await call(card, `/api/card?token=${MINT}&theme=cream`);
    assert.equal(api.requests.length - n, 3, 'tokens, ohlcv and logo once; the second theme comes from the memo');
    const noLogo = await call(makeHandler('card'), `/api/card?token=${MINT}`);
    assert.doesNotMatch(noLogo.body, /data:image/, 'the default gate refuses the loopback mock host');

    api.routes.Down1111111111111111111111111111111111111 = { status: 500, body: {} };
    const down = await call(makeHandler('badge'), '/api/badge?token=Down1111111111111111111111111111111111111');
    assert.equal(down.status, 502);
    assert.match(down.headers['cache-control'], /s-maxage=30/);
    assert.match(down.body, /data unavailable/);
    api.routes.Busy1111111111111111111111111111111111111 = { status: 429, body: {} };
    const busy = await call(makeHandler('badge'), '/api/badge?token=Busy1111111111111111111111111111111111111');
    assert.equal(busy.status, 503);
    assert.match(busy.body, /rate limited/);
  } finally {
    process.env = env;
  }
});
