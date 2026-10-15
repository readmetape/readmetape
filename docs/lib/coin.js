// Loads everything a render needs for one token: DexScreener market data,
// GeckoTerminal candles for the chart and the logo as a data URI.
import { fetchToken, validateAddress } from './dexscreener.js';
import { fetchCandles, geckoNetwork, TIMEFRAMES } from './gecko.js';
import { fetchLogo } from './logo.js';

export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

// "address" or "chain:address".
export function parseTokenSpec(spec, defaultChain = 'solana') {
  const s = String(spec ?? '').trim();
  const i = s.indexOf(':');
  const chain = i > 0 ? s.slice(0, i).toLowerCase() : defaultChain;
  const address = i > 0 ? s.slice(i + 1) : s;
  validateAddress(address, chain);
  return { chain, address };
}

// "a, b,solana:c" -> specs. Newlines work as separators too.
export function parseTokenList(list, defaultChain = 'solana') {
  return String(list ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseTokenSpec(s, defaultChain));
}

// Percent change over the candles, from the first open to the last close.
export function candleChange(candles) {
  if (!candles?.length) return null;
  const first = candles[0][1];
  const last = candles[candles.length - 1][4];
  return first > 0 ? ((last - first) / first) * 100 : null;
}

/**
 * @param {string|{chain,address}} spec
 * @param {object} [o]
 * @param {string} [o.chain='solana']     default chain when spec has none
 * @param {string} [o.timeframe='24h']    24h | 7d
 * @param {boolean} [o.chart=true]        fetch OHLCV candles
 * @param {boolean} [o.logo=true]         fetch and embed the token logo
 * @param {object} [o.cache]              openCache() result
 * @param {number} [o.cacheTtlMs]
 * @returns {Promise<{token, candles, logo, timeframe, change, updatedAt, warnings, chain, address}>}
 */
export async function loadCoin(spec, o = {}) {
  const { chain, address } = typeof spec === 'string' ? parseTokenSpec(spec, o.chain) : spec;
  const timeframe = o.timeframe ?? '24h';
  if (!TIMEFRAMES[timeframe]) throw new Error(`Unknown timeframe "${timeframe}". Use 24h or 7d`);
  const now = o.now ?? Date.now();
  const warnings = [];
  const token = await fetchToken(address, { chain, api: o.api });

  let candles = null;
  if (token?.pairAddress && o.chart !== false) {
    const key = `${geckoNetwork(chain)}/${token.pairAddress}/${timeframe}/${token.side}`;
    const cached = o.cache?.get(key, now);
    const ttl = o.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    if (cached && cached.ageMs >= 0 && cached.ageMs < ttl) {
      candles = cached.candles;
    } else {
      try {
        candles = await fetchCandles({ chain, pool: token.pairAddress, timeframe, side: token.side, api: o.geckoApi });
        o.cache?.set(key, candles, now);
      } catch (err) {
        if (cached) {
          candles = cached.candles;
          warnings.push(`Chart data from cache (${Math.round(cached.ageMs / 60000)} min old): ${err.message}`);
        } else {
          warnings.push(`No chart data: ${err.message}`);
        }
      }
    }
  }

  let logo = null;
  if (token?.imageUrl && o.logo !== false) {
    logo = await fetchLogo(token.imageUrl, { onWarning: (w) => warnings.push(w) });
  }

  const change = timeframe === '24h' ? token?.change24h ?? candleChange(candles) : candleChange(candles);
  return { chain, address, token, candles, logo, timeframe, change, updatedAt: new Date(now).toISOString(), warnings };
}
