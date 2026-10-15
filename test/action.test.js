// Runs src/action.js the way GitHub does: as a node process with INPUT_* env
// vars, inside a git checkout that has a remote to push to.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockApi, mockEnv, pair, MINT } from '../fixtures/mock-api.js';
import { assertWellFormed, assertGitHubSafe } from '../fixtures/svg-check.js';
import { expandPath } from '../src/action.js';

const ACTION = fileURLToPath(new URL('../src/action.js', import.meta.url));
const RIVET = 'base:0x7a3f1e0000000000000000000000000000c0ffee';
let api;
let work;
let remote;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function runAction(inputs, extraEnv = {}) {
  const output = join(mkdtempSync(join(tmpdir(), 'pt-out-')), 'out');
  writeFileSync(output, '');
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_WORKSPACE: work, GITHUB_OUTPUT: output, GITHUB_REF_NAME: 'main', ...mockEnv(api.url), ...extraEnv };
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v;
  return new Promise((resolve) => {
    execFile(process.execPath, [ACTION], { env, cwd: work }, (err, stdout, stderr) => {
      const outputs = {};
      for (const m of readFileSync(output, 'utf8').matchAll(/^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2$/gm)) outputs[m[1]] = m[3];
      resolve({ code: err ? err.code : 0, stdout, stderr, outputs });
    });
  });
}

const commitCount = () => Number(git(remote, 'rev-list', '--count', 'main'));
const read = (p) => readFileSync(join(work, p), 'utf8');

before(async () => {
  api = await startMockApi();
  const root = mkdtempSync(join(tmpdir(), 'pt-repo-'));
  remote = join(root, 'remote.git');
  work = join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', remote);
  git(root, 'init', '-b', 'main', work);
  git(work, 'remote', 'add', 'origin', remote);
  writeFileSync(join(work, 'README.md'), '# demo\n');
  git(work, 'add', '.');
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'init');
  git(work, 'push', '-u', 'origin', 'main');
});
after(() => api.close());

test('writes a card by default, sets outputs and commits it', async () => {
  const r = await runAction({ token: MINT, cache: '.github/tape-cache.json' });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.outputs.price, '0.0042');
  assert.equal(r.outputs.mcap, '4200000');
  assert.equal(r.outputs.change, '12.4');
  assert.equal(r.outputs['svg-path'], '.github/tape.svg');
  assert.equal(r.outputs.changed, 'true');
  assert.equal(r.outputs.committed, 'true');
  assert.deepEqual(JSON.parse(r.outputs.data)[0].symbol, 'DEMO');
  const svg = read('.github/tape.svg');
  assertWellFormed(svg);
  assertGitHubSafe(svg);
  assert.ok(svg.includes('Market cap'));
  assert.equal(commitCount(), 2);
  assert.equal(git(remote, 'log', '-1', '--format=%s|%an', 'main'), 'chore: update tape|github-actions[bot]');
  assert.match(git(remote, 'show', '--stat', '--format=', 'main'), /tape-cache\.json/);
});

test('does not commit when only the time would change', async () => {
  const r = await runAction({ token: MINT, cache: '.github/tape-cache.json' });
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /Nothing changed, nothing to commit/);
  assert.equal(r.outputs.changed, 'false');
  assert.equal(r.outputs.committed, 'false');
  assert.equal(commitCount(), 2);
});

test('commits again when the price moves', async () => {
  api.routes[MINT] = { body: [pair({ priceUsd: '0.0051', priceChange: { h24: -3.2 } })] };
  const r = await runAction({ token: MINT });
  assert.equal(r.code, 0, r.stdout);
  assert.equal(commitCount(), 3);
  const svg = git(remote, 'show', 'main:.github/tape.svg');
  assert.ok(svg.includes('$0.0051') && svg.includes('3.2%') && svg.includes('#FF5F6D'));
  delete api.routes[MINT];
});

test('several tokens, spark type, paths template and a grid in one commit', async () => {
  const r = await runAction({ tokens: `${MINT}, ${RIVET}`, type: 'spark', path: 'coins/{symbol}.svg', grid: 'coins/all.svg', label: 'paid to dev' });
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.outputs.paths, `coins/DEMO.svg,coins/RIVET.svg`);
  for (const p of ['coins/DEMO.svg', 'coins/RIVET.svg', 'coins/all.svg']) assertWellFormed(read(p));
  assert.ok(read('coins/RIVET.svg').includes('paid to dev'));
  assert.equal((read('coins/all.svg').match(/<svg/g) || []).length, 3);
  assert.equal(commitCount(), 4);
  assert.equal(git(remote, 'show', '--name-only', '--format=', 'main').split('\n').length, 3);
});

test('explicit paths, theme, timeframe and commit: false', async () => {
  const r = await runAction({ tokens: `${MINT},${RIVET}`, paths: 'a.svg, b.svg', theme: 'light', timeframe: '7d', colors: 'accent=ff00aa', commit: 'false' });
  assert.equal(r.code, 0, r.stdout);
  assert.ok(read('a.svg').includes('#FFFFFF') && read('a.svg').includes('>7d<'));
  assert.ok(read('b.svg').includes('$RIVET'));
  assert.equal(commitCount(), 4);
});

test('bad inputs fail with ::error::', async () => {
  const cases = [
    [{ commit: 'false' }, /Input "tokens" \(or "token"\) is required/],
    [{ token: MINT, commit: 'maybe' }, /Input "commit" must be true or false/],
    [{ token: MINT, path: '../escape.svg', commit: 'false' }, /must stay inside the repository/],
    [{ token: MINT, type: 'poster' }, /Input "type" must be one of/],
    [{ token: MINT, theme: 'neon' }, /Input "theme"/],
    [{ token: MINT, timeframe: '1y' }, /Input "timeframe"/],
    [{ tokens: `${MINT},${RIVET}`, paths: 'one.svg' }, /one path per token/],
    [{ tokens: `${MINT},${RIVET}`, path: 'same.svg' }, /same file/],
    [{ token: MINT, type: 'badge', style: 'round', commit: 'false' }, /Unknown style/],
    [{ token: MINT, colors: 'glow=000' }, /Invalid colour override/],
  ];
  for (const [inputs, re] of cases) {
    const r = await runAction(inputs);
    assert.equal(r.code, 1, JSON.stringify(inputs));
    assert.match(r.stdout, new RegExp('::error::.*' + re.source), JSON.stringify(inputs));
  }
});

test('token without a pair writes a "no pair yet" file and empty outputs', async () => {
  const r = await runAction({ token: 'NoPair111', type: 'badge', path: 'none.svg', commit: 'false' });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /::warning::No DexScreener pair/);
  assert.equal(r.outputs.price, '');
  assert.match(read('none.svg'), /no pair yet/);
});

test('expandPath strips unsafe characters from placeholders', () => {
  assert.equal(expandPath('x/{symbol}-{n}.svg', { symbol: '../$A B', n: 2 }), 'x/..AB-2.svg');
  assert.ok(existsSync(join(work, '.github/tape-cache.json')));
});
