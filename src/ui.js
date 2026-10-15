// `tape ui`: a local preview gallery and builder. One HTML page plus a
// small JSON/SVG API over node:http. Binds to 127.0.0.1 by default.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { loadCoin } from './coin.js';
import { render, loadOptions, TYPES } from './render.js';
import { THEME_NAMES, parseColors } from './theme.js';
import { STYLES, LOGOS } from './badge.js';
import { METRICS, formatPrice, formatUsd, formatChange, chainName } from './format.js';
import { VERSION } from './cli.js';

const PAGE = readFileSync(new URL('./ui.html', import.meta.url), 'utf8');
const MARK = readFileSync(new URL('./mark.svg', import.meta.url), 'utf8');
const ICON = readFileSync(new URL('./icon.png', import.meta.url));
// Fraunces and Fragment Mono from BRAND.md, served locally so the page makes
// no external requests.
const FONTS = Object.fromEntries(['fraunces-latin-400-normal', 'fraunces-latin-600-normal', 'fraunces-latin-400-italic', 'fragment-mono-latin-400-normal'].map((f) => [`/fonts/${f}.woff2`, readFileSync(new URL(`./fonts/${f}.woff2`, import.meta.url))]));
const TTL_MS = 60_000;

export function createUiServer({ token = '', chain = 'solana' } = {}) {
  // Short in-memory cache, so a gallery of a dozen previews costs one request
  // per data source instead of a dozen.
  const coins = new Map();
  async function coin(q, type) {
    const tf = q.get('timeframe') || '24h';
    const kind = type === 'badge' ? 'badge' : 'full';
    const key = [q.get('chain') || chain, q.get('token'), tf, kind, q.get('nologo') ? 1 : 0].join('|');
    const hit = coins.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const value = loadCoin(q.get('token'), loadOptions(type === 'badge' ? 'badge' : 'card', { chain: q.get('chain') || chain, timeframe: tf, logo: !q.get('nologo') }));
    coins.set(key, { at: Date.now(), value });
    value.catch(() => coins.delete(key));
    return value;
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams;
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(body);
    };
    const json = (status, obj) => send(status, JSON.stringify(obj));
    try {
      if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
      if (url.pathname === '/') return send(200, PAGE.replace('__MARK__', MARK), 'text/html; charset=utf-8');
      if (url.pathname === '/mark.svg') return send(200, MARK, 'image/svg+xml');
      if (url.pathname === '/icon.png') return send(200, ICON, 'image/png');
      if (FONTS[url.pathname]) return send(200, FONTS[url.pathname], 'font/woff2');
      if (url.pathname === '/api/meta') {
        return json(200, { version: VERSION, token, chain, types: TYPES, themes: THEME_NAMES, styles: STYLES, metrics: METRICS, logos: LOGOS });
      }
      if (!['/api/quote', '/api/render.svg'].includes(url.pathname)) return json(404, { error: 'Not found' });
      if (!q.get('token')) return json(400, { error: 'Missing "token"' });
      if (url.pathname === '/api/quote') {
        const c = await coin(q, 'card');
        const t = c.token;
        return json(200, {
          found: Boolean(t), chain: c.chain, address: c.address, symbol: t?.symbol ?? null, name: t?.name ?? null,
          price: formatPrice(t?.priceUsd), mcap: formatUsd(t?.marketCap ?? t?.fdv), liquidity: formatUsd(t?.liquidityUsd),
          volume: formatUsd(t?.volume24h), change: formatChange(c.change), up: typeof c.change === 'number' ? c.change >= 0 : null,
          chainName: chainName(c.chain), dex: t?.dexId ?? null, pair: t?.pairAddress ?? null, url: t?.url ?? null,
          candles: c.candles?.length ?? 0, logo: Boolean(c.logo), warnings: c.warnings,
        });
      }
      if (url.pathname === '/api/render.svg') {
        const type = q.get('type') || 'card';
        if (!TYPES.includes(type)) return json(400, { error: `Unknown type "${type}"` });
        const c = await coin(q, type);
        const svg = render(c, {
          type, theme: q.get('theme') || 'dark', timeframe: q.get('timeframe'), label: q.get('label') || undefined,
          labelColor: q.get('labelColor') || undefined, metric: q.get('metric') || (type === 'spark' ? 'price' : 'all'),
          style: q.get('style') || 'flat', logo: q.get('logo') || undefined, colors: parseColors(q.get('colors')),
          hideBorder: q.get('hideBorder') === '1',
        });
        return send(200, svg, 'image/svg+xml; charset=utf-8');
      }
      return json(404, { error: 'Not found' });
    } catch (err) {
      return json(/Invalid|Unknown|Spark|colour/i.test(err.message) ? 400 : 502, { error: err.message });
    }
  });
}

export async function startUi({ port = 4178, host = '127.0.0.1', token, chain } = {}) {
  const server = createUiServer({ token, chain });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const addr = server.address();
  const url = `http://${host.includes(':') ? `[${host}]` : host}:${addr.port}/${token ? `?token=${encodeURIComponent(token)}&chain=${encodeURIComponent(chain ?? 'solana')}` : ''}`;
  return { server, url, port: addr.port };
}
