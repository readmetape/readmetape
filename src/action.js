// GitHub Action entry point. Reads INPUT_* env vars, renders one SVG per token
// (plus an optional grid), sets outputs in $GITHUB_OUTPUT and commits the
// files only when what they show has changed. No dependencies.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadCoin, parseTokenList } from './coin.js';
import { render, loadOptions, TYPES } from './render.js';
import { renderGrid, stableSvg } from './svg.js';
import { openCache } from './cache.js';
import { parseColors, THEME_NAMES } from './theme.js';
import { TIMEFRAMES } from './gecko.js';

const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

export function getInput(env, name, fallback = '') {
  const v = env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function parseBool(v, name) {
  if (/^(true|yes|1)$/i.test(v)) return true;
  if (/^(false|no|0)$/i.test(v)) return false;
  throw new Error(`Input "${name}" must be true or false, got "${v}"`);
}

export function setOutput(env, name, value) {
  const file = env.GITHUB_OUTPUT;
  const v = value === null || value === undefined ? '' : String(value);
  if (!file) {
    console.log(`${name}=${v}`);
    return;
  }
  const delim = `tape_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delim}\n${v}\n${delim}\n`);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Commits and pushes the files git sees as changed. Returns true when committed.
export function commitIfChanged(cwd, files, message, env = process.env) {
  const rels = files.map((f) => relative(cwd, f));
  if (git(cwd, ['status', '--porcelain', '--', ...rels]) === '') return false;
  git(cwd, ['add', '--', ...rels]);
  git(cwd, ['-c', `user.name=${BOT_NAME}`, '-c', `user.email=${BOT_EMAIL}`, 'commit', '-m', message, '--', ...rels]);
  const ref = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  git(cwd, ['push', 'origin', ref ? `HEAD:${ref}` : 'HEAD']);
  return true;
}

function inside(workspace, path, input) {
  const file = resolve(workspace, path);
  const rel = relative(workspace, file);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Input "${input}" must stay inside the repository: ${path}`);
  return file;
}

// {n}, {chain}, {address} and {symbol} placeholders in output paths.
export function expandPath(template, vars) {
  return template.replace(/\{(n|chain|address|symbol)\}/g, (_, k) => String(vars[k] ?? '').replace(/[^A-Za-z0-9._-]/g, ''));
}

// Writes `svg` unless the file already shows the same thing. Returns true if written.
function writeIfChanged(file, svg) {
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (before !== null && stableSvg(before) === stableSvg(svg)) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, svg);
  return true;
}

export function readInputs(env) {
  const list = [getInput(env, 'tokens'), getInput(env, 'token')].filter(Boolean).join(',');
  if (!list) throw new Error('Input "tokens" (or "token") is required: the token address(es) to track');
  const chain = getInput(env, 'chain', 'solana');
  const specs = parseTokenList(list, chain);
  const type = getInput(env, 'type', 'card');
  if (!TYPES.includes(type)) throw new Error(`Input "type" must be one of ${TYPES.join(', ')}, got "${type}"`);
  const theme = getInput(env, 'theme', 'dark');
  if (!THEME_NAMES.includes(theme)) throw new Error(`Input "theme" must be one of ${THEME_NAMES.join(', ')}, got "${theme}"`);
  const timeframe = getInput(env, 'timeframe', '24h');
  if (!TIMEFRAMES[timeframe]) throw new Error(`Input "timeframe" must be 24h or 7d, got "${timeframe}"`);
  const paths = getInput(env, 'paths').split(',').map((s) => s.trim()).filter(Boolean);
  const path = getInput(env, 'path', specs.length > 1 ? '.github/tape-{n}.svg' : '.github/tape.svg');
  if (paths.length && paths.length !== specs.length) {
    throw new Error(`Input "paths" has ${paths.length} entries for ${specs.length} tokens; give one path per token`);
  }
  const columns = Number(getInput(env, 'columns', type === 'card' ? '2' : '1'));
  if (!Number.isInteger(columns) || columns < 1 || columns > 6) throw new Error('Input "columns" must be a whole number from 1 to 6');
  const ttl = Number(getInput(env, 'cache-ttl', '10'));
  if (!Number.isFinite(ttl) || ttl < 0) throw new Error('Input "cache-ttl" must be a number of minutes');
  return {
    specs, type, timeframe, columns,
    paths: specs.map((_, i) => paths[i] ?? path),
    grid: getInput(env, 'grid'),
    cache: getInput(env, 'cache'),
    cacheTtlMs: ttl * 60000,
    tokenLogo: parseBool(getInput(env, 'token-logo', 'true'), 'token-logo'),
    commit: parseBool(getInput(env, 'commit', 'true'), 'commit'),
    message: getInput(env, 'commit-message', 'chore: update tape'),
    render: {
      type, theme,
      colors: parseColors(getInput(env, 'colors')),
      label: getInput(env, 'label') || undefined,
      labelColor: getInput(env, 'label-color') || undefined,
      metric: getInput(env, 'metric', type === 'spark' ? 'price' : 'all'),
      style: getInput(env, 'style', 'flat'),
      logo: getInput(env, 'logo') || undefined,
      hideBorder: parseBool(getInput(env, 'hide-border', 'false'), 'hide-border'),
    },
  };
}

export async function run(env = process.env) {
  const inp = readInputs(env);
  const workspace = env.GITHUB_WORKSPACE || process.cwd();
  const cache = inp.cache ? openCache(inside(workspace, inp.cache, 'cache')) : null;
  const gridFile = inp.grid ? inside(workspace, inp.grid, 'grid') : null;

  const results = [];
  for (const [i, spec] of inp.specs.entries()) {
    const coin = await loadCoin(spec, loadOptions(inp.type, { timeframe: inp.timeframe, cache, cacheTtlMs: inp.cacheTtlMs, logo: inp.tokenLogo }));
    for (const w of coin.warnings) console.log(`::warning::${w}`);
    const t = coin.token;
    if (!t) console.log(`::warning::No DexScreener pair found for ${spec.address} on ${spec.chain}. Wrote a "no pair yet" ${inp.type}.`);
    else console.log(`$${t.symbol}: price=${t.priceUsd} mcap=${t.marketCap ?? t.fdv} change=${coin.change} (${inp.timeframe})`);
    const rel = expandPath(inp.paths[i], { n: i + 1, chain: spec.chain, address: spec.address, symbol: t?.symbol ?? spec.address });
    const file = inside(workspace, rel, 'paths');
    const svg = render(coin, inp.render);
    results.push({ coin, rel, file, svg, changed: writeIfChanged(file, svg) });
  }
  const dupes = results.map((r) => r.rel).filter((p, i, a) => a.indexOf(p) !== i);
  if (dupes.length) throw new Error(`Two tokens would write to the same file (${dupes[0]}). Set "paths" or use {n} in "path"`);

  let gridChanged = false;
  if (gridFile) gridChanged = writeIfChanged(gridFile, renderGrid(results.map((r) => r.svg), { columns: inp.columns, gap: inp.type === 'card' ? 12 : 6 }));
  const changed = gridChanged || results.some((r) => r.changed);
  // The cache is only written alongside a visible change, so a quiet market
  // does not produce cache-only commits.
  const cacheWritten = cache && (changed || !existsSync(cache.file)) ? cache.save() : false;

  const first = results[0].coin;
  setOutput(env, 'price', first.token?.priceUsd);
  setOutput(env, 'mcap', first.token?.marketCap ?? first.token?.fdv);
  setOutput(env, 'change', first.change);
  setOutput(env, 'svg-path', results[0].rel);
  setOutput(env, 'paths', results.map((r) => r.rel).join(','));
  setOutput(env, 'changed', changed);
  setOutput(env, 'data', JSON.stringify(results.map(({ coin: c, rel }) => ({
    chain: c.chain, address: c.address, symbol: c.token?.symbol ?? null, priceUsd: c.token?.priceUsd ?? null,
    marketCap: c.token?.marketCap ?? c.token?.fdv ?? null, change: c.change ?? null, timeframe: c.timeframe, path: rel,
  }))));

  let committed = false;
  if (inp.commit) {
    const files = results.map((r) => r.file);
    if (gridFile) files.push(gridFile);
    if (cacheWritten) files.push(cache.file);
    committed = changed && commitIfChanged(workspace, files.filter((f) => existsSync(f)), inp.message, env);
    console.log(committed ? `Committed ${results.length + (gridFile ? 1 : 0)} file(s)` : 'Nothing changed, nothing to commit');
  } else {
    console.log(changed ? 'Files updated (commit: false)' : 'Nothing changed');
  }
  setOutput(env, 'committed', committed);
  return { results, changed, committed };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  run().catch((err) => {
    const detail = err.stderr ? `\n${String(err.stderr).trim()}` : '';
    console.log(`::error::${err.message}${detail}`.replace(/\n/g, '%0A'));
    process.exitCode = 1;
  });
}
