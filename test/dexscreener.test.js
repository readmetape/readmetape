import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fetchToken, selectPair, toTokenData } from '../src/dexscreener.js';
import { startMockApi, pair, MINT } from '../fixtures/mock-api.js';

process.env.TAPE_RETRY_BASE_MS = '5';

let api;
before(async () => {
  api = await startMockApi({
    [MINT]: [
      pair({ pairAddress: 'small', liquidity: { usd: 1000 }, priceUsd: '0.001' }),
      pair({ pairAddress: 'big', liquidity: { usd: 250000 } }),
      pair({ pairAddress: 'nolq', liquidity: undefined }),
    ],
    RateLimited: { status: 429, body: { error: 'slow down' } },
    ServerError: { status: 500, body: 'oops' },
    BadJson: { status: 200, body: 'not json' },
  });
});
after(() => api.close());

test('selectPair picks the highest liquidity pair', () => {
  const pairs = [pair({ liquidity: { usd: 5 } }), pair({ liquidity: { usd: 50 }, pairAddress: 'x' }), pair({ liquidity: {} })];
  assert.equal(selectPair(pairs, MINT).pairAddress, 'x');
  assert.equal(selectPair([], MINT), null);
  assert.equal(selectPair(undefined, MINT), null);
});

test('selectPair prefers pairs where the token is the base token', () => {
  const asQuote = pair({
    pairAddress: 'quote',
    liquidity: { usd: 9e9 },
    baseToken: { address: 'Other', symbol: 'OTH' },
    quoteToken: { address: MINT, symbol: 'DEMO' },
  });
  assert.equal(selectPair([asQuote, pair()], MINT).pairAddress, pair().pairAddress);
  // Only quote pairs: price is derived from priceNative.
  const data = toTokenData(selectPair([{ ...asQuote, priceUsd: '2', priceNative: '4' }], MINT), MINT);
  assert.equal(data.symbol, 'DEMO');
  assert.equal(data.priceUsd, 0.5);
  assert.equal(data.marketCap, null);
});

test('EVM addresses match case-insensitively', () => {
  const evm = '0xAbCdEf0000000000000000000000000000000001';
  const p = pair({ baseToken: { address: evm.toLowerCase(), symbol: 'E' } });
  assert.equal(toTokenData(selectPair([p], evm), evm).symbol, 'E');
});

test('fetchToken normalizes the most liquid pair', async () => {
  const t = await fetchToken(MINT, { api: api.url });
  assert.equal(t.symbol, 'DEMO');
  assert.equal(t.priceUsd, 0.0042);
  assert.equal(t.marketCap, 4200000);
  assert.equal(t.change24h, 12.4);
  assert.equal(t.volume24h, 1234567);
  assert.equal(t.liquidityUsd, 250000);
  assert.equal(t.pairAddress, 'big');
  assert.ok(api.requests.includes(`/tokens/v1/solana/${MINT}`));
});

test('fetchToken resolves null when no pair exists', async () => {
  assert.equal(await fetchToken('Unknown111', { api: api.url }), null);
});

test('fetchToken errors are clear', async () => {
  await assert.rejects(fetchToken('RateLimited', { api: api.url }), /rate limit hit \(HTTP 429\) after 4 attempts/);
  await assert.rejects(fetchToken('ServerError', { api: api.url }), /HTTP 500/);
  await assert.rejects(fetchToken('BadJson', { api: api.url }), /invalid JSON/);
  await assert.rejects(fetchToken('', { api: api.url }), /required/);
  await assert.rejects(fetchToken('../etc', { api: api.url }), /Invalid token address/);
  await assert.rejects(fetchToken(MINT, { api: api.url, chain: 'So/lana' }), /Invalid chain/);
  await assert.rejects(fetchToken(MINT, { api: 'http://127.0.0.1:1' }), /Could not reach DexScreener/);
});

test('TAPE_DEXSCREENER_API env var selects the endpoint', async () => {
  process.env.TAPE_DEXSCREENER_API = api.url;
  try {
    assert.equal((await fetchToken(MINT)).symbol, 'DEMO');
  } finally {
    delete process.env.TAPE_DEXSCREENER_API;
  }
});

test('429 responses are retried with backoff before failing', async () => {
  let calls = 0;
  const before = api.requests.length;
  // A route that fails twice, then succeeds.
  const body = [pair({ baseToken: { address: 'Flaky', name: 'Demo', symbol: 'DEMO' } })];
  api.routes.Flaky = { get status() { return ++calls <= 2 ? 429 : 200; }, body };
  const t = await fetchToken('Flaky', { api: api.url });
  assert.equal(t.symbol, 'DEMO');
  assert.equal(api.requests.length - before, 3);
});

test('imageUrl is kept only for http(s) URLs on the base token', () => {
  assert.equal(toTokenData(pair({ info: { imageUrl: 'https://x.test/a.png' } }), MINT).imageUrl, 'https://x.test/a.png');
  assert.equal(toTokenData(pair({ info: { imageUrl: 'javascript:alert(1)' } }), MINT).imageUrl, null);
});
