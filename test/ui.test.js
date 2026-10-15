import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startMockApi, mockEnv, MINT } from '../fixtures/mock-api.js';
import { assertWellFormed } from '../fixtures/svg-check.js';
import { startUi } from '../src/ui.js';

let api;
let ui;
let base;
before(async () => {
  api = await startMockApi();
  Object.assign(process.env, mockEnv(api.url));
  ui = await startUi({ port: 0, token: MINT });
  base = `http://127.0.0.1:${ui.port}`;
});
after(async () => {
  await new Promise((r) => ui.server.close(r));
  await api.close();
});

test('serves the single-page dashboard with no external requests', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.ok(html.includes('<svg') && html.includes('Builder') && html.includes('Every style'));
  assert.doesNotMatch(html, /(src|href)="https?:/);
  assert.doesNotMatch(html, /[\u2013\u2014]/);
  assert.match(ui.url, /\?token=DemoMint/);
  assert.match(html, /Ledger/);
  for (const f of ['fraunces-latin-600-normal', 'fragment-mono-latin-400-normal']) {
    const font = await fetch(`${base}/fonts/${f}.woff2`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
  }
});

test('meta, quote and render endpoints', async () => {
  const meta = await (await fetch(base + '/api/meta')).json();
  assert.deepEqual(meta.types, ['badge', 'card', 'spark']);
  assert.equal(meta.token, MINT);
  const q = await (await fetch(`${base}/api/quote?token=${MINT}`)).json();
  assert.equal(q.symbol, 'DEMO');
  assert.equal(q.price, '$0.0042');
  assert.equal(q.candles, 96);
  const r = await fetch(`${base}/api/render.svg?token=${MINT}&type=card&theme=github_dark&label=paid%20to%20dev&colors=accent%3Dff00aa`);
  assert.match(r.headers.get('content-type'), /image\/svg\+xml/);
  const svg = await r.text();
  assertWellFormed(svg);
  assert.ok(svg.includes('#FF00AA') && svg.includes('#151B23'));
});

test('caches loaded coins between requests', async () => {
  const n = api.requests.length;
  for (const theme of ['dark', 'light', 'transparent']) await (await fetch(`${base}/api/render.svg?token=${MINT}&type=card&theme=${theme}`)).text();
  assert.equal(api.requests.length, n, 'no new upstream requests within the TTL');
});

test('errors are JSON with useful status codes', async () => {
  assert.equal((await fetch(`${base}/api/quote`)).status, 400);
  assert.equal((await fetch(`${base}/api/render.svg?token=${MINT}&type=poster`)).status, 400);
  assert.equal((await fetch(`${base}/api/render.svg?token=${MINT}&type=card&theme=neon`)).status, 400);
  assert.equal((await fetch(`${base}/api/quote?token=a%2Fb`)).status, 400);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});

test('`tape ui` prints the URL and keeps running', async () => {
  const bin = fileURLToPath(new URL('../bin/tape.js', import.meta.url));
  const p = spawn(process.execPath, [bin, 'ui', '--port', '0'], { env: { ...process.env, ...mockEnv(api.url) } });
  const out = await new Promise((resolve) => p.stdout.once('data', (d) => resolve(String(d))));
  assert.match(out, /tape ui running at http:\/\/127\.0\.0\.1:\d+\//);
  const html = await (await fetch(out.match(/http\S+/)[0])).text();
  assert.ok(html.includes('tape'));
  p.kill();
});
