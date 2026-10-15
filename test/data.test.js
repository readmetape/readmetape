// GeckoTerminal client, cache, logos, chart geometry and loadCoin.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockApi, mockEnv, MINT, NOW, candles, logoPng } from '../fixtures/mock-api.js';
import { ohlcvUrl, parseOhlcv, geckoNetwork } from '../src/gecko.js';
import { openCache } from '../src/cache.js';
import { toDataUri, sniffImage, fetchLogo } from '../src/logo.js';
import { smoothPath, scale, sparkPaths } from '../src/chart.js';
import { loadCoin, parseTokenSpec, parseTokenList, candleChange } from '../src/coin.js';
import { retryAfterMs } from '../src/http.js';

let api;
before(async () => {
  api = await startMockApi();
  Object.assign(process.env, mockEnv(api.url));
});
after(() => api.close());

const POOL = 'PairDEMO1111111111111111111111111111111';

test('ohlcvUrl maps chains to GeckoTerminal networks and timeframes', () => {
  assert.equal(geckoNetwork('ethereum'), 'eth');
  assert.equal(geckoNetwork('polygon'), 'polygon_pos');
  assert.equal(geckoNetwork('sui'), 'sui');
  assert.equal(
    ohlcvUrl({ chain: 'ethereum', pool: '0xabc', timeframe: '24h', api: 'https://g.test/api/v2/' }),
    'https://g.test/api/v2/networks/eth/pools/0xabc/ohlcv/minute?aggregate=15&limit=96&currency=usd&token=base',
  );
  assert.match(ohlcvUrl({ chain: 'bsc', pool: 'p', timeframe: '7d', side: 'quote' }), /\/networks\/bsc\/pools\/p\/ohlcv\/hour\?aggregate=4&limit=42&currency=usd&token=quote$/);
  assert.throws(() => ohlcvUrl({ chain: 'solana', pool: 'p', timeframe: '1y' }), /Unknown timeframe/);
  assert.throws(() => ohlcvUrl({ chain: 'solana', pool: '../x' }), /Invalid pool/);
});

test('parseOhlcv sorts ascending, drops bad rows and merges duplicates', () => {
  const body = { data: { attributes: { ohlcv_list: [[3, 1, 1, 1, 3, 9], [1, 1, 1, 1, 1], [2, 'x', 1, 1, 1, 1], [3, 1, 1, 1, 4, 9], 'junk'] } } };
  assert.deepEqual(parseOhlcv(body), [[1, 1, 1, 1, 1, 0], [3, 1, 1, 1, 4, 9]]);
  assert.deepEqual(parseOhlcv({}), []);
});

test('Retry-After parsing is capped', () => {
  assert.equal(retryAfterMs('2'), 2000);
  assert.equal(retryAfterMs('9999'), 15000);
  assert.equal(retryAfterMs(null), null);
});

test('GeckoTerminal 429 is retried and then succeeds', async () => {
  api.gecko[POOL] = { failTimes: 2, candles: candles(MINT) };
  const before = api.requests.length;
  const coin = await loadCoin(MINT, { now: NOW });
  assert.equal(coin.candles.length, 96);
  assert.deepEqual(coin.warnings, []);
  assert.equal(api.requests.slice(before).filter((u) => u.includes('/ohlcv/')).length, 3);
  delete api.gecko[POOL];
});

test('persistent GeckoTerminal errors leave the chart empty with a warning', async () => {
  api.gecko[POOL] = { failTimes: 99 };
  const coin = await loadCoin(MINT, { now: NOW });
  assert.equal(coin.candles, null);
  assert.match(coin.warnings[0], /No chart data: GeckoTerminal rate limit/);
  assert.equal(coin.change, 12.4, 'change still comes from DexScreener');
  delete api.gecko[POOL];
});

test('cache: fresh entries skip the request, stale ones are a fallback', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'pt-cache-')), 'cache.json');
  let cache = openCache(file);
  await loadCoin(MINT, { now: NOW, cache, logo: false });
  assert.equal(cache.save(), true);
  assert.equal(cache.save(), false, 'unchanged content is not rewritten');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(json.entries[`solana/${POOL}/24h/base`].candles.length, 96);

  cache = openCache(file);
  const n = api.requests.length;
  const fresh = await loadCoin(MINT, { now: NOW + 5 * 60000, cache, logo: false });
  assert.equal(fresh.candles.length, 96);
  assert.equal(api.requests.slice(n).filter((u) => u.includes('/ohlcv/')).length, 0);

  api.gecko[POOL] = { failTimes: 99 };
  const stale = await loadCoin(MINT, { now: NOW + 60 * 60000, cache, logo: false });
  assert.equal(stale.candles.length, 96);
  assert.match(stale.warnings[0], /Chart data from cache \(60 min old\)/);
  delete api.gecko[POOL];

  writeFileSync(file, '{not json');
  assert.equal(openCache(file).get('x'), null, 'a broken cache file is ignored');
});

test('logos: sniffed, size-limited, and replaced by a monogram on failure', async () => {
  assert.equal(sniffImage(logoPng()), 'image/png');
  assert.equal(sniffImage(Buffer.from('<svg/>')), null);
  assert.match(toDataUri(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), /^data:image\/jpeg;base64,/);
  const warnings = [];
  assert.equal(await fetchLogo(`${api.url}/logo/huge.png`, { onWarning: (w) => warnings.push(w) }), null);
  assert.equal(await fetchLogo(`${api.url}/logo/html.png`, { onWarning: (w) => warnings.push(w) }), null);
  assert.equal(await fetchLogo('file:///etc/passwd'), null);
  assert.match(warnings[0], /byte limit/);
  assert.match(warnings[1], /not a PNG/);
  assert.match(await fetchLogo(`${api.url}/logo/blue.png`), /^data:image\/png;base64,/);
});

test('token specs and lists', () => {
  assert.deepEqual(parseTokenSpec('abc'), { chain: 'solana', address: 'abc' });
  assert.deepEqual(parseTokenSpec('Base:0xAb', 'solana'), { chain: 'base', address: '0xAb' });
  assert.deepEqual(parseTokenList(' a, base:0xb ,\nc ', 'bsc').map((s) => s.chain), ['bsc', 'base', 'bsc']);
  assert.throws(() => parseTokenSpec('a/b'), /Invalid token address/);
  assert.equal(candleChange([[0, 2, 0, 0, 2], [1, 2, 0, 0, 3]]), 50);
  assert.equal(candleChange([]), null);
});

test('smooth chart path never overshoots the data range', () => {
  const values = [1, 5, 5, 2, 8, 8, 8, 3];
  const pts = scale(values, { x: 0, y: 10, w: 100, h: 50 });
  const d = smoothPath(pts);
  const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
  assert.ok(Math.min(...ys) >= 10 - 1e-9 && Math.max(...ys) <= 60 + 1e-9, d);
  assert.equal(sparkPaths([1], { x: 0, y: 0, w: 10, h: 10 }), null);
  assert.match(sparkPaths([1, 1], { x: 0, y: 0, w: 10, h: 10 }).line, /^M0 5L10 5$/);
});
