// The builder's data layer: state in the query string, DexScreener and
// GeckoTerminal straight from the browser, and the embed snippets. No DOM
// here, so the tests can run it in Node against the mock APIs.
// Rendering uses docs/lib/, a byte-for-byte copy of src/ (npm run sync-site).
import { selectPair, toTokenData } from './lib/dexscreener.js';
import { ohlcvUrl, parseOhlcv, TIMEFRAMES } from './lib/gecko.js';
import { candleChange } from './lib/coin.js';
import { render, TYPES } from './lib/render.js';
import { THEME_NAMES } from './lib/theme.js';
import { STYLES } from './lib/badge.js';
import { METRICS } from './lib/format.js';

export const SITE = 'https://readmetape.com';
export const REPO = 'OWNER/tape';
export const DEX_API = 'https://api.dexscreener.com';
export const GECKO_API = 'https://api.geckoterminal.com/api/v2';
export const CHAINS = ['solana', 'base', 'ethereum', 'bsc', 'arbitrum', 'polygon', 'avalanche', 'optimism'];
export const EXAMPLE = { chain: 'solana', token: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' };
export const PLACEHOLDER = 'YOUR_TOKEN_ADDRESS';
export const SPARK_METRICS = ['price', 'change'];
export const DEFAULTS = { token: '', chain: 'solana', type: 'card', theme: 'cream', timeframe: '24h', label: '', metric: '', style: 'flat' };
export { TYPES, THEME_NAMES, STYLES, METRICS, TIMEFRAMES };

export class TapeError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

// The metric a type actually uses ('' means the type's default).
export function metricFor(state) {
  if (state.type === 'badge') return pick(state.metric, METRICS, 'all');
  if (state.type === 'spark') return pick(state.metric, SPARK_METRICS, 'price');
  return '';
}

/** Query string -> builder state. Unknown values fall back to defaults. */
export function readState(search = '') {
  const q = new URLSearchParams(search);
  const s = { ...DEFAULTS };
  s.token = (q.get('token') || '').trim().slice(0, 140);
  s.chain = pick((q.get('chain') || '').toLowerCase(), CHAINS, DEFAULTS.chain);
  s.type = pick(q.get('type'), TYPES, DEFAULTS.type);
  s.theme = pick(q.get('theme'), THEME_NAMES, DEFAULTS.theme);
  s.timeframe = pick(q.get('timeframe'), Object.keys(TIMEFRAMES), DEFAULTS.timeframe);
  s.label = (q.get('label') || '').slice(0, 40);
  s.metric = q.get('metric') || '';
  s.style = pick(q.get('style'), STYLES, DEFAULTS.style);
  s.metric = metricFor(s) === s.metric ? s.metric : '';
  return s;
}

/** Builder state -> query string (defaults left out), "" when nothing is set. */
export function writeState(s) {
  const q = new URLSearchParams();
  if (s.token) q.set('token', s.token);
  if (s.chain !== DEFAULTS.chain) q.set('chain', s.chain);
  for (const k of ['type', 'theme', 'timeframe', 'style']) if (s[k] !== DEFAULTS[k]) q.set(k, s[k]);
  if (s.metric && s.metric !== metricFor({ ...s, metric: '' })) q.set('metric', s.metric);
  if (s.label) q.set('label', s.label);
  const str = q.toString();
  return str ? `?${str}` : '';
}

/**
 * Pasted text -> { chain, address }. Takes an address or chain:address and
 * explains the common mistakes in words a visitor understands.
 */
export function parseInput(raw, defaultChain = 'solana') {
  let s = String(raw ?? '').trim();
  let chain = defaultChain;
  const m = s.match(/^([a-z0-9-]+):(.+)$/i);
  if (m) {
    chain = m[1].toLowerCase();
    s = m[2].trim();
  }
  if (!s) throw new TapeError('EMPTY', 'paste a token address first, or try the example.');
  if (/^https?:\/\//i.test(s) || s.includes('/')) {
    throw new TapeError('BAD_ADDRESS', 'that is a link. paste the token address itself (the mint on Solana, the 0x contract elsewhere).');
  }
  if (!/^[A-Za-z0-9-]+$/.test(chain)) throw new TapeError('BAD_ADDRESS', `"${chain}" is not a chain tape knows.`);
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) {
    if (chain === 'solana') throw new TapeError('WRONG_CHAIN', 'that is an EVM address. pick its chain (base, ethereum, bsc and so on) and build again.');
    return { chain, address: s };
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) {
    if (chain !== 'solana') throw new TapeError('WRONG_CHAIN', 'that looks like a Solana mint. switch the chain to solana and build again.');
    return { chain, address: s };
  }
  throw new TapeError('BAD_ADDRESS', 'that does not look like a token address. paste the mint (Solana) or the 0x contract address.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with one retry on 429 and 5xx. Errors are TapeErrors with a readable message. */
export async function getJson(url, { fetch = globalThis.fetch, service = 'the API', retries = 1, retryDelayMs = 1500, timeoutMs = 10000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err?.name === 'TimeoutError') throw new TapeError('TIMEOUT', `${service} did not answer within ${timeoutMs / 1000} seconds. try again in a moment.`);
      throw new TapeError('NETWORK', `could not reach ${service}. check your connection; an ad blocker can also block it.`);
    }
    if (res.ok) {
      try {
        return await res.json();
      } catch {
        throw new TapeError('HTTP', `${service} sent something that is not JSON. try again in a moment.`, res.status);
      }
    }
    const retry = res.status === 429 || res.status >= 500;
    if (retry && attempt < retries) {
      await sleep(retryDelayMs * (attempt + 1));
      continue;
    }
    if (res.status === 429) throw new TapeError('RATE_LIMITED', `${service} is rate limiting this browser. wait a minute and try again.`, 429);
    throw new TapeError('HTTP', `${service} returned an error (HTTP ${res.status}). try again in a moment.`, res.status);
  }
}

/**
 * A logo URL that is safe to place in an SVG href in this page: https only,
 * normalised by the URL parser (quotes and brackets come out percent-encoded),
 * ampersands escaped for markup. Anything else means a monogram.
 */
export function safeLogo(url) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const href = u.href;
    return /["'<>\s\\]/.test(href) ? null : href.replace(/&/g, '&amp;');
  } catch {
    return null;
  }
}

/** DexScreener: the token's most liquid pair, flattened. null = no pair yet. */
export async function loadToken({ chain, address }, { fetch, dexApi = DEX_API, retryDelayMs } = {}) {
  const body = await getJson(`${dexApi.replace(/\/+$/, '')}/tokens/v1/${chain}/${address}`, { fetch, service: 'DexScreener', retryDelayMs });
  const pairs = Array.isArray(body) ? body : body?.pairs;
  return toTokenData(selectPair(pairs, address), address);
}

/** GeckoTerminal candles for the token's pair, oldest first. */
export async function loadCandles(token, chain, timeframe, { fetch, geckoApi = GECKO_API, retryDelayMs } = {}) {
  const url = ohlcvUrl({ chain, pool: token.pairAddress, timeframe, side: token.side, api: geckoApi });
  return parseOhlcv(await getJson(url, { fetch, service: 'GeckoTerminal', retryDelayMs }));
}

/**
 * The same object src/coin.js loadCoin() returns, built in the browser:
 * { chain, address, token, candles, logo, timeframe, change, updatedAt, warnings }.
 * A chart failure is a warning, not an error, like in the CLI.
 */
export async function loadCoinWeb(spec, { timeframe = '24h', chart = true, token: known, fetch, dexApi, geckoApi, retryDelayMs, now = Date.now() } = {}) {
  const { chain, address } = spec;
  const warnings = [];
  const token = known !== undefined ? known : await loadToken(spec, { fetch, dexApi, retryDelayMs });
  let candles = null;
  if (token?.pairAddress && chart) {
    try {
      candles = await loadCandles(token, chain, timeframe, { fetch, geckoApi, retryDelayMs });
      if (!candles.length) warnings.push('GeckoTerminal has no candles for this pair yet, so the chart is empty.');
    } catch (err) {
      warnings.push(`no chart right now: ${err.message}`);
    }
  }
  const change = timeframe === '24h' ? token?.change24h ?? candleChange(candles) : candleChange(candles);
  return { chain, address, token, candles, logo: safeLogo(token?.imageUrl), timeframe, change, updatedAt: new Date(now).toISOString(), warnings };
}

/** Options for render(), from the builder state. */
export function renderOptions(s) {
  const o = { type: s.type, label: s.label || undefined };
  if (s.type === 'card') o.theme = s.theme;
  else {
    o.style = s.style;
    o.metric = metricFor(s);
  }
  return o;
}

export function renderPreview(coin, s) {
  return render(coin, renderOptions(s));
}

/** The hosted image URL for the current state. */
export function hostedUrl(s, site = SITE) {
  const q = new URLSearchParams();
  q.set('chain', s.chain);
  q.set('token', s.token || PLACEHOLDER);
  if (s.type === 'card') q.set('theme', s.theme);
  if (s.type !== 'badge' && s.timeframe !== '24h') q.set('timeframe', s.timeframe);
  if (s.type !== 'card') {
    const m = metricFor(s);
    if (m !== metricFor({ ...s, metric: '' })) q.set('metric', m);
    if (s.style !== 'flat') q.set('style', s.style);
  }
  if (s.label) q.set('label', s.label);
  return `${site}/api/${s.type}?${q.toString().replace(/\+/g, '%20')}`;
}

function altText(s, token) {
  const sym = token?.symbol ? `$${token.symbol}` : 'coin';
  return `${sym} ${s.type === 'card' ? 'price card' : 'price'}`.replace(/[[\]]/g, '');
}

function linkFor(s, token) {
  return token?.url || `https://dexscreener.com/${s.chain}/${s.token || PLACEHOLDER}`;
}

/** One line of markdown for the hosted image, linked to the chart. */
export function hostedMarkdown(s, token, site = SITE) {
  return `[![${altText(s, token)}](${hostedUrl(s, site)})](${linkFor(s, token)})`;
}

const yamlValue = (v) => (/^[\w.-]+(:[\w.-]+)?$/.test(v) ? v : `'${String(v).replace(/'/g, "''")}'`);

/** The workflow file for the self-hosted GitHub Action route. */
export function workflowYaml(s) {
  const tokens = s.chain === 'solana' ? s.token || PLACEHOLDER : `${s.chain}:${s.token || PLACEHOLDER}`;
  const inputs = [['tokens', tokens]];
  if (s.type !== 'card') inputs.push(['type', s.type]);
  if (s.type === 'card') inputs.push(['theme', s.theme]);
  if (s.type !== 'badge' && s.timeframe !== '24h') inputs.push(['timeframe', s.timeframe]);
  if (s.type !== 'card') {
    const m = metricFor(s);
    if (m !== metricFor({ ...s, metric: '' })) inputs.push(['metric', m]);
    if (s.style !== 'flat') inputs.push(['style', s.style]);
  }
  if (s.label) inputs.push(['label', s.label]);
  return [
    'name: tape',
    'on:',
    '  schedule:',
    "    - cron: '*/30 * * * *'",
    '  workflow_dispatch:',
    'permissions:',
    '  contents: write',
    'jobs:',
    '  tape:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    `      - uses: ${REPO}@v1`,
    '        with:',
    ...inputs.map(([k, v]) => `          ${k}: ${yamlValue(v)}`),
  ].join('\n');
}

/** The README line for the action's output file. */
export function actionMarkdown(s, token) {
  return `[![${altText(s, token)}](.github/tape.svg)](${linkFor(s, token)})`;
}
