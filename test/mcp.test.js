// Spawns `tape mcp` and talks newline-delimited JSON-RPC to it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { startMockApi, mockEnv, MINT } from '../fixtures/mock-api.js';
import { assertWellFormed, assertGitHubSafe } from '../fixtures/svg-check.js';

const BIN = fileURLToPath(new URL('../bin/tape.js', import.meta.url));
let api;
let proc;
let nextId = 1;
const waiting = new Map();
let stderr = '';

function send(obj) {
  proc.stdin.write(JSON.stringify(obj) + '\n');
}
function rpc(method, params) {
  const id = nextId++;
  send({ jsonrpc: '2.0', id, method, params });
  return new Promise((resolve) => waiting.set(id, resolve));
}
const call = (name, args) => rpc('tools/call', { name, arguments: args });

before(async () => {
  api = await startMockApi();
  proc = spawn(process.execPath, [BIN, 'mcp'], { env: { ...process.env, ...mockEnv(api.url) } });
  proc.stderr.on('data', (d) => (stderr += d));
  createInterface({ input: proc.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  });
});
after(async () => {
  proc.stdin.end();
  await new Promise((r) => proc.on('exit', r));
  await api.close();
});

test('initialize echoes a supported protocol version', async () => {
  const r = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(r.result.protocolVersion, '2024-11-05');
  assert.deepEqual(r.result.capabilities, { tools: {} });
  assert.equal(r.result.serverInfo.name, 'tape');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const latest = await rpc('initialize', { protocolVersion: '1999-01-01' });
  assert.equal(latest.result.protocolVersion, '2025-06-18');
  assert.deepEqual((await rpc('ping')).result, {});
  assert.match(stderr, /ready on stdio/);
});

test('tools/list describes four tools with JSON Schemas', async () => {
  const { result } = await rpc('tools/list');
  assert.deepEqual(result.tools.map((t) => t.name), ['token_quote', 'render_card', 'render_badge', 'chart_points']);
  for (const t of result.tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.deepEqual(t.inputSchema.required, ['token']);
    assert.ok(t.description.length > 30);
  }
});

test('token_quote returns JSON market data', async () => {
  const r = await call('token_quote', { token: MINT });
  const q = JSON.parse(r.result.content[0].text);
  assert.equal(q.symbol, 'DEMO');
  assert.equal(q.priceUsd, 0.0042);
  assert.equal(q.change, 12.4);
  const none = JSON.parse((await call('token_quote', { token: 'Nothing1' })).result.content[0].text);
  assert.equal(none.found, false);
});

test('render_card and render_badge return SVG text', async () => {
  const card = (await call('render_card', { token: MINT, theme: 'light', label: 'paid to dev', colors: { accent: '#ff00aa' } })).result.content[0].text;
  assertWellFormed(card);
  assertGitHubSafe(card);
  assert.ok(card.includes('paid to dev') && card.includes('#FF00AA'));
  const spark = (await call('render_badge', { token: MINT, kind: 'spark', style: 'flat-square' })).result.content[0].text;
  assertWellFormed(spark);
  assert.match(spark, /stroke="#fff"/);
  const badge = (await call('render_badge', { token: MINT, metric: 'mcap' })).result.content[0].text;
  assert.ok(badge.includes('$4.2M mcap'));
});

test('chart_points returns candles oldest first', async () => {
  const r = JSON.parse((await call('chart_points', { token: MINT, timeframe: '7d' })).result.content[0].text);
  assert.equal(r.count, 42);
  assert.ok(r.points[0].t < r.points[41].t);
  assert.equal(r.points[41].close, 0.0042);
  assert.ok(r.min <= r.max);
});

test('tool errors are isError results, protocol errors are JSON-RPC errors', async () => {
  const bad = await call('render_card', { token: 'a/b' });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /Invalid token address/);
  assert.equal((await call('render_card', {})).result.isError, true);
  assert.equal((await call('render_badge', { token: MINT, style: 'round' })).result.isError, true);
  assert.equal((await call('nope', {})).error.code, -32602);
  assert.equal((await rpc('tools/call', { name: 'token_quote', arguments: 'x' })).error.code, -32602);
  assert.equal((await rpc('resources/list')).error.code, -32601);
});
