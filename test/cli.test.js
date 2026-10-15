import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockApi, mockEnv, MINT } from '../fixtures/mock-api.js';
import { assertWellFormed, assertGitHubSafe } from '../fixtures/svg-check.js';
import { blockSparkline } from '../src/cli.js';

const BIN = fileURLToPath(new URL('../bin/tape.js', import.meta.url));
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const RIVET = 'base:0x7a3f1e0000000000000000000000000000c0ffee';
let api;

function cli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { env: { ...process.env, ...mockEnv(api.url) } }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr }),
    );
  });
}

before(async () => {
  api = await startMockApi();
});
after(() => api.close());

test('--help documents commands and options, --version matches package.json', async () => {
  const r = await cli(['--help']);
  assert.equal(r.code, 0);
  for (const s of ['--type', 'card', 'spark', 'github_dark', 'tape ui', 'tape mcp', 'paid to dev']) assert.ok(r.stdout.includes(s), s);
  assert.equal((await cli(['-v'])).stdout.trim(), PKG.version);
});

test('default output is a shields badge on stdout', async () => {
  const r = await cli([MINT, '--metric', 'price']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^<svg/);
  assert.ok(r.stdout.includes('$0.0042'));
});

test('--type card writes a card file with theme, label and colours', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'pt-cli-')), 'nested', 'card.svg');
  const r = await cli([MINT, '--type', 'card', '--theme', 'light', '--label', 'paid to dev', '--accent', 'ff00aa', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /wrote .*card\.svg \(card, \$DEMO \$0\.0042 \+12\.4%\)/);
  const svg = readFileSync(out, 'utf8');
  assertWellFormed(svg);
  assertGitHubSafe(svg);
  assert.ok(svg.includes('#FFFFFF') && svg.includes('#FF00AA') && svg.includes('paid to dev'));
});

test('--type spark and --timeframe 7d', async () => {
  const r = await cli([MINT, '--type', 'spark', '--metric', 'change', '--timeframe', '7d']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('+12.4%'));
  assert.match(r.stdout, /stroke="#fff"/);
});

test('several tokens become one grid SVG', async () => {
  const r = await cli([`${MINT},${RIVET}`, '--type', 'card']);
  assert.equal(r.code, 0, r.stderr);
  assertWellFormed(r.stdout);
  assert.match(r.stdout, /width="1002" height="195"/);
  assert.ok(r.stdout.includes('$RIVET'));
  const one = await cli([MINT, RIVET, '--type', 'badge', '--columns', '1']);
  assert.match(one.stdout, /width="\d+" height="46"/);
});

test('quote prints a readable summary with a sparkline', async () => {
  const r = await cli(['quote', MINT]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\$DEMO {2}Demo Coin/);
  assert.match(r.stdout, /price {7}\$0\.0042 {3}\+12\.4% 24h/);
  assert.match(r.stdout, /chart 24h +[▁▂▃▄▅▆▇█]{32}/);
  assert.doesNotMatch(r.stdout, /\x1b\[/, 'no colours when not a TTY');
  const j = JSON.parse((await cli(['quote', MINT, '--json'])).stdout);
  assert.equal(j.token.symbol, 'DEMO');
  assert.equal(j.candles.length, 96);
});

test('--cache writes chart data to a JSON file', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'pt-cli-')), 'cache.json');
  const r = await cli([MINT, '--type', 'spark', '--cache', file]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(file));
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).version, 1);
});

test('usage errors exit 2, runtime errors exit 1', async () => {
  for (const args of [[], [MINT, '--type', 'poster'], [MINT, '--theme', 'neon'], [MINT, '--bogus'], [MINT, '--type', 'spark', '--metric', 'mcap'], [MINT, '--bg', 'red'], [MINT, '--columns', '0'], ['quote']]) {
    const r = await cli(args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /tape --help/);
  }
  const r = await cli(['bad/address']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid token address/);
});

test('unknown token still renders a "no pair yet" output', async () => {
  const r = await cli(['Nothing111', '--type', 'card']);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.includes('No trading pair'));
  assert.match(r.stderr, /no DexScreener pair/);
});

test('blockSparkline resamples to the requested width', () => {
  assert.equal(blockSparkline([1, 2, 3, 4, 5, 6, 7, 8], 8), '▁▂▃▄▅▆▇█');
  assert.equal(blockSparkline([2, 2, 2], 3), '▄▄▄');
  assert.equal(blockSparkline([]), '');
});
