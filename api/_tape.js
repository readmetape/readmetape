// Shared code for the hosted endpoints /api/card, /api/spark and /api/badge.
// Vercel does not expose files starting with "_" as routes.
//
// GET /api/card?chain=solana&token=<address>&theme=cream&label=paid%20to%20dev
// Answers image/svg+xml, rendered by tape's own renderers from DexScreener and
// GeckoTerminal data, cached by the CDN for 5 minutes.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { loadCoin, parseTokenSpec } from '../src/coin.js';
import { render } from '../src/render.js';
import { THEME_NAMES, parseColors } from '../src/theme.js';
import { shield, STYLES, LOGOS, COLORS } from '../src/badge.js';
import { METRICS } from '../src/format.js';
import { TIMEFRAMES } from '../src/gecko.js';
import { fetchLogo } from '../src/logo.js';

export const CACHE_OK = 'public, s-maxage=300, stale-while-revalidate=600';
export const CACHE_BAD_INPUT = 'public, max-age=300, s-maxage=3600';
export const CACHE_UPSTREAM = 'public, max-age=30, s-maxage=30, stale-while-revalidate=60';
const MEMO_TTL_MS = 60_000;
const MEMO_MAX = 200;

class BadInput extends Error {}

const truthy = (v) => v !== null && /^(1|true|yes|on)$/i.test(v);
const falsy = (v) => v !== null && /^(0|false|no|off)$/i.test(v);

// First present value among the spellings (snake, kebab and camel case).
function param(q, ...names) {
  for (const n of names) if (q.has(n)) return q.get(n);
  return null;
}

function oneOf(value, list, name, fallback) {
  if (value === null || value === '') return fallback;
  if (!list.includes(value)) throw new BadInput(`Unknown ${name} "${value}". Use one of: ${list.join(', ')}`);
  return value;
}

/** Query -> { spec, timeframe, tokenLogo, opts } for one type. Throws BadInput. */
export function parseQuery(type, q) {
  const token = (q.get('token') || '').trim();
  if (!token) throw new BadInput('Missing "token": pass ?token=<address>&chain=<chain>');
  if (token.length > 140) throw new BadInput('"token" is too long');
  const chain = (q.get('chain') || 'solana').trim().toLowerCase();
  let spec;
  try {
    spec = parseTokenSpec(token, chain);
  } catch (err) {
    throw new BadInput(err.message);
  }
  const timeframe = oneOf(q.get('timeframe'), Object.keys(TIMEFRAMES), 'timeframe', '24h');
  const label = param(q, 'label');
  if (label && label.length > 40) throw new BadInput('"label" is longer than 40 characters');
  const opts = { type, label: label || undefined };
  if (type === 'card') {
    opts.theme = oneOf(q.get('theme'), THEME_NAMES, 'theme', 'dark');
    try {
      opts.colors = parseColors(q.get('colors'));
    } catch (err) {
      throw new BadInput(err.message);
    }
    opts.hideBorder = truthy(param(q, 'hide_border', 'hide-border', 'hideBorder'));
  } else {
    const metrics = type === 'spark' ? ['price', 'change'] : METRICS;
    opts.metric = oneOf(q.get('metric'), metrics, 'metric', type === 'spark' ? 'price' : 'all');
    opts.style = oneOf(q.get('style'), STYLES, 'style', 'flat');
    opts.logo = oneOf(q.get('logo'), LOGOS, 'logo', undefined);
    const lc = param(q, 'label_color', 'label-color', 'labelColor');
    if (lc) {
      if (!/^#?[0-9a-f]{3,8}$/i.test(lc)) throw new BadInput(`Invalid label_color "${lc}" (use hex like 9a5b00)`);
      opts.labelColor = lc;
    }
  }
  const tokenLogo = type === 'card' && !falsy(param(q, 'token_logo', 'token-logo', 'tokenLogo'));
  return { spec, timeframe, tokenLogo, opts };
}

// Private, loopback, link-local and other non-public addresses.
export function isPrivateIp(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
  }
  return true;
}

/**
 * Logos come from DexScreener's token info, which token creators control. Only
 * public https hosts on the default port are fetched; everything else gets the
 * monogram.
 */
export async function isPublicHttpsUrl(url, { resolve = lookup } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) || host === 'localhost' || /\.(localhost|local|internal|lan|home|corp)$/i.test(host) || !host.includes('.')) return false;
  try {
    const addrs = await resolve(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

function errorSvg(type, message) {
  return shield({ label: 'tape', value: message, color: COLORS.none, style: 'flat' });
}

function send(req, res, status, svg, cache, error) {
  res.statusCode = status;
  res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
  res.setHeader('cache-control', cache);
  res.setHeader('x-content-type-options', 'nosniff');
  // If someone opens the SVG directly: no scripts, only inline data images.
  res.setHeader('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  res.setHeader('access-control-allow-origin', '*');
  if (error) res.setHeader('x-tape-error', String(error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 200));
  res.end(req.method === 'HEAD' ? undefined : svg);
}

/**
 * @param {'card'|'spark'|'badge'} type
 * @param {object} [o]
 * @param {(url: string) => Promise<boolean>} [o.logoAllowed]  gate for token logo URLs
 * @param {() => number} [o.now]
 */
export function makeHandler(type, { logoAllowed = isPublicHttpsUrl, now = () => Date.now() } = {}) {
  // Per-instance memo, so a burst of README views costs one upstream call.
  const memo = new Map();

  async function coinFor({ spec, timeframe, tokenLogo }) {
    const key = [type === 'badge' ? 'b' : 'f', spec.chain, spec.address, timeframe, tokenLogo ? 1 : 0].join('|');
    const hit = memo.get(key);
    if (hit && now() - hit.at < MEMO_TTL_MS) return hit.value;
    const value = (async () => {
      const coin = await loadCoin(spec, { timeframe, chart: type !== 'badge', logo: false });
      const url = coin.token?.imageUrl;
      if (tokenLogo && url && (await logoAllowed(url))) coin.logo = await fetchLogo(url, { onWarning: (w) => coin.warnings.push(w) });
      return coin;
    })();
    memo.set(key, { at: now(), value });
    value.catch(() => memo.delete(key));
    if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
    return value;
  }

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('allow', 'GET, HEAD');
      return res.end();
    }
    const q = new URL(req.url, 'http://localhost').searchParams;
    let parsed;
    let svg;
    try {
      parsed = parseQuery(type, q);
      // Render once with no data first, so bad colours or styles fail before any upstream call.
      render({ chain: parsed.spec.chain, address: parsed.spec.address, token: null, timeframe: parsed.timeframe }, parsed.opts);
    } catch (err) {
      return send(req, res, 400, errorSvg(type, 'bad request'), CACHE_BAD_INPUT, err.message);
    }
    try {
      svg = render(await coinFor(parsed), parsed.opts);
    } catch (err) {
      const limited = err.code === 'RATE_LIMITED';
      return send(req, res, limited ? 503 : 502, errorSvg(type, limited ? 'rate limited, retry soon' : 'data unavailable'), CACHE_UPSTREAM, err.message);
    }
    return send(req, res, 200, svg, CACHE_OK);
  };
}
