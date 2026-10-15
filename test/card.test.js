import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockApi, mockEnv, MINT, NOW, TOKENS } from '../fixtures/mock-api.js';
import { assertWellFormed, assertGitHubSafe } from '../fixtures/svg-check.js';
import { loadCoin, renderCard, renderSpark, renderBadge, renderGrid, stableSvg, render, THEME_NAMES, THEMES, CARD_WIDTH, CARD_HEIGHT } from '../src/index.js';

let api;
let demo;
before(async () => {
  api = await startMockApi();
  Object.assign(process.env, mockEnv(api.url));
  demo = await loadCoin(MINT, { now: NOW });
});
after(() => api.close());

const check = (svg) => {
  assertWellFormed(svg);
  assertGitHubSafe(svg);
  return svg;
};

test('card has the size, symbol, price, change, stats and time', () => {
  const svg = check(renderCard(demo));
  assert.match(svg, new RegExp(`width="${CARD_WIDTH}" height="${CARD_HEIGHT}"`));
  for (const s of ['$DEMO', '$0.0042', '12.4%', '24h', '$4.2M', '$250K', '$1.2M', 'Demo Coin · Solana · Raydium', '14 Oct, 12:00 UTC']) {
    assert.ok(svg.includes(s), `missing ${s}`);
  }
  assert.ok(svg.includes(THEMES.dark.up), 'rising coin uses the up colour');
  assert.match(svg, /<path d="M24 [\d.]+C/, 'smooth chart line');
});

test('logo is embedded as a PNG data URI, monogram otherwise', async () => {
  assert.match(renderCard(demo), /href="data:image\/png;base64,iVBOR/);
  const rivet = await loadCoin('base:0x7a3f1e0000000000000000000000000000c0ffee', { now: NOW });
  const svg = check(renderCard(rivet));
  assert.doesNotMatch(svg, /<image/);
  assert.match(svg, />RI<\/text>/);
  assert.ok(svg.includes(THEMES.dark.down), 'falling coin uses the down colour');
  const noLogo = await loadCoin(MINT, { now: NOW, logo: false });
  assert.doesNotMatch(renderCard(noLogo), /<image/);
});

test('every theme renders valid, GitHub-safe SVG with its colours', () => {
  for (const theme of THEME_NAMES) {
    const svg = check(renderCard(demo, { theme }));
    assert.ok(svg.includes(THEMES[theme].text), theme);
  }
  assert.match(renderCard(demo, { theme: 'transparent' }), /fill="none" stroke="#8B949E66"/);
  assert.throws(() => renderCard(demo, { theme: 'neon' }), /Unknown theme/);
});

test('cream and espresso use the editorial layout', async () => {
  for (const theme of ['cream', 'espresso']) {
    const svg = check(renderCard(demo, { theme, label: 'paid to dev' }));
    assert.match(svg, new RegExp(`width="${CARD_WIDTH}" height="${CARD_HEIGHT}"`));
    assert.ok(svg.includes(THEMES[theme].bg) && svg.includes(THEMES[theme].up), theme);
    for (const s of ['$DEMO', '$0.0042', '12.4%', 'MARKET CAP', '$4.2M', '$250K', '$1.2M', 'Demo Coin · Solana · Raydium', '14 Oct, 12:00 UTC', '>paid to dev<']) {
      assert.ok(svg.includes(s), `${theme} missing ${s}`);
    }
    assert.match(svg, /Fraunces/);
    assert.match(svg, /Fragment Mono/);
    assert.doesNotMatch(svg, /rx="9.5"/, 'no pills in the editorial layout');
  }
  const rivet = await loadCoin('base:0x7a3f1e0000000000000000000000000000c0ffee', { now: NOW });
  const down = check(renderCard(rivet, { theme: 'cream' }));
  assert.ok(down.includes(THEMES.cream.down));
  assert.match(down, />RI<\/text>/);
  const none = check(renderCard(await loadCoin('NoPair1111', { now: NOW }), { theme: 'espresso' }));
  assert.ok(none.includes('No trading pair on DexScreener yet'));
  const a = renderCard(demo, { theme: 'cream' });
  assert.equal(stableSvg(a), stableSvg(renderCard({ ...demo, updatedAt: '2026-10-15T09:00:00Z' }, { theme: 'cream' })));
});

test('custom colours, hidden border and the "paid to dev" chip', () => {
  const svg = check(renderCard(demo, { colors: { bg: '101010', accent: '#ff00aa', up: '0f0' }, hideBorder: true, label: 'paid to dev' }));
  assert.ok(svg.includes('fill="#101010" stroke="none"'));
  assert.ok(svg.includes('#FF00AA'));
  assert.ok(svg.includes('#0F0'));
  assert.match(svg, />paid to dev<\/text>/);
  assert.throws(() => renderCard(demo, { colors: { bg: 'red' } }), /Invalid colour/);
  assert.throws(() => renderCard(demo, { colors: { glow: '000' } }), /Unknown colour key/);
});

test('long names and labels are truncated, text is escaped', () => {
  const coin = { ...demo, token: { ...demo.token, symbol: 'A&B<LONGSYMBOLNAME>', name: 'A very long token name that will not fit on one line at all' } };
  const svg = check(renderCard(coin, { label: 'a label that is much too long for the space' }));
  assert.ok(svg.includes('A&amp;B&lt;'));
  assert.match(svg, /\.\.\.<\/text>/);
});

test('no pair and no chart data states', async () => {
  const none = check(renderCard(await loadCoin('NoPair1111', { now: NOW })));
  assert.ok(none.includes('No trading pair on DexScreener yet'));
  assert.ok(none.includes('n/a'));
  const flat = check(renderCard({ ...demo, candles: [] }));
  assert.ok(flat.includes('No chart data yet'));
});

test('7d timeframe uses the candle change', async () => {
  const week = await loadCoin(MINT, { now: NOW, timeframe: '7d' });
  assert.equal(week.candles.length, 42);
  assert.ok(Math.abs(week.change - 12.4) < 0.01, `got ${week.change}`);
  assert.match(check(renderCard(week)), />7d<\/text>/);
});

test('stableSvg ignores only the updated time', () => {
  const a = renderCard(demo);
  const b = renderCard({ ...demo, updatedAt: '2026-10-15T09:00:00Z' });
  assert.notEqual(a, b);
  assert.equal(stableSvg(a), stableSvg(b));
  assert.notEqual(stableSvg(a), stableSvg(renderCard({ ...demo, token: { ...demo.token, priceUsd: 0.005 } })));
});

test('spark badge draws a sparkline and validates its metric', () => {
  const svg = check(renderSpark(demo));
  assert.match(svg, /stroke="#fff" stroke-width="1.5"/);
  assert.ok(svg.includes('$0.0042'));
  assert.ok(check(renderSpark(demo, { metric: 'change', style: 'for-the-badge', label: 'paid to dev', labelColor: '8250DF' })).includes('#8250DF'));
  assert.throws(() => renderSpark(demo, { metric: 'mcap' }), /price" or "change/);
  assert.ok(check(renderSpark({ token: null })).includes('no pair yet'));
});

test('grid nests every SVG with unique ids', async () => {
  const coins = [];
  for (const a of Object.keys(TOKENS)) coins.push(await loadCoin({ chain: TOKENS[a].chain, address: a }, { now: NOW }));
  const grid = check(renderGrid(coins.map((c) => renderCard(c)), { columns: 2 }));
  assert.match(grid, /^<svg[^>]+width="1002" height="402"/);
  assert.equal((grid.match(/<svg/g) || []).length, 5);
  const ids = [...grid.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  const badges = check(renderGrid(coins.map((c) => renderBadge(c.token)), { columns: 1, gap: 6 }));
  assert.match(badges, /height="98"/);
});

test('render() dispatches on type', () => {
  assert.ok(render(demo, { type: 'badge' }).includes('$4.2M mcap'));
  assert.ok(render(demo, { type: 'card' }).includes('Market cap'));
  assert.throws(() => render(demo, { type: 'poster' }), /Unknown type/);
});
