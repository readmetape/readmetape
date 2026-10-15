// GeckoTerminal OHLCV client. Docs: https://www.geckoterminal.com/dex-api
// GET /networks/{network}/pools/{pool}/ohlcv/{day|hour|minute}?aggregate=&limit=
import { getJson } from './http.js';

export const DEFAULT_GECKO_API = 'https://api.geckoterminal.com/api/v2';

// DexScreener chain id -> GeckoTerminal network id. Unknown ids pass through.
export const NETWORKS = {
  solana: 'solana',
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  optimism: 'optimism',
};

// 24h: 96 candles of 15 minutes. 7d: 42 candles of 4 hours.
export const TIMEFRAMES = {
  '24h': { timeframe: 'minute', aggregate: 15, limit: 96, spanMs: 864e5 },
  '7d': { timeframe: 'hour', aggregate: 4, limit: 42, spanMs: 7 * 864e5 },
};

export function geckoNetwork(chainId) {
  return NETWORKS[chainId] ?? chainId;
}

export function ohlcvUrl({ chain, pool, timeframe = '24h', side = 'base', api }) {
  const tf = TIMEFRAMES[timeframe];
  if (!tf) throw new Error(`Unknown timeframe "${timeframe}". Use one of: ${Object.keys(TIMEFRAMES).join(', ')}`);
  if (!/^[A-Za-z0-9_]+$/.test(pool || '')) throw new Error(`Invalid pool address "${pool}"`);
  const base = (api || process.env.TAPE_GECKO_API || DEFAULT_GECKO_API).replace(/\/+$/, '');
  const q = new URLSearchParams({ aggregate: tf.aggregate, limit: tf.limit, currency: 'usd', token: side });
  return `${base}/networks/${geckoNetwork(chain)}/pools/${pool}/ohlcv/${tf.timeframe}?${q}`;
}

/**
 * Turn an OHLCV response into ascending candles [t, open, high, low, close, volume]
 * with t in unix seconds. Invalid rows are dropped, duplicate timestamps merged.
 */
export function parseOhlcv(body) {
  const list = body?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];
  const byTime = new Map();
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const r = row.slice(0, 6).map(Number);
    if (r.slice(0, 5).some((v) => !Number.isFinite(v))) continue;
    if (!Number.isFinite(r[5])) r[5] = 0;
    byTime.set(r[0], r);
  }
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
}

export async function fetchCandles(opts) {
  const url = ohlcvUrl(opts);
  const body = await getJson(url, {
    service: 'GeckoTerminal',
    timeoutMs: opts.timeoutMs ?? 10000,
    headers: { accept: 'application/json;version=20230302' },
  });
  return parseOhlcv(body);
}
