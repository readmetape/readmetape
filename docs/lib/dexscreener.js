// DexScreener client. Docs: https://docs.dexscreener.com/api/reference
import { getJson } from './http.js';

export const DEFAULT_API = 'https://api.dexscreener.com';

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sameAddress(a, b) {
  if (!a || !b) return false;
  // EVM addresses are case-insensitive hex; Solana base58 is case-sensitive.
  return a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Pick the most liquid pair for `address`. Pairs where the token is the base
 * token are preferred, since DexScreener's priceUsd and marketCap describe the
 * base token. Returns null when there is nothing usable.
 */
export function selectPair(pairs, address) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const liq = (p) => num(p?.liquidity?.usd) ?? 0;
  const asBase = pairs.filter((p) => sameAddress(p?.baseToken?.address, address));
  const pool = asBase.length ? asBase : pairs;
  return pool.reduce((best, p) => (liq(p) > liq(best) ? p : best), pool[0]);
}

// Normalize a DexScreener pair into the flat shape the renderers use.
export function toTokenData(pair, address) {
  if (!pair) return null;
  const isBase = !address || sameAddress(pair.baseToken?.address, address);
  const token = isBase ? pair.baseToken : pair.quoteToken;
  let priceUsd = num(pair.priceUsd);
  if (!isBase) {
    // priceNative is the base price in quote units, so quote USD = base USD / priceNative.
    const native = num(pair.priceNative);
    priceUsd = priceUsd !== null && native ? priceUsd / native : null;
  }
  const image = pair.info?.imageUrl;
  return {
    chainId: pair.chainId ?? null,
    address: token?.address ?? address ?? null,
    symbol: token?.symbol ?? null,
    name: token?.name ?? null,
    side: isBase ? 'base' : 'quote',
    priceUsd,
    marketCap: isBase ? num(pair.marketCap) : null,
    fdv: isBase ? num(pair.fdv) : null,
    // The 24h change and volume belong to the pair; unknown for a quote token.
    change24h: isBase ? num(pair.priceChange?.h24) : null,
    volume24h: num(pair.volume?.h24),
    liquidityUsd: num(pair.liquidity?.usd),
    dexId: pair.dexId ?? null,
    pairAddress: pair.pairAddress ?? null,
    url: pair.url ?? null,
    // pair.info describes the base token, so the image only applies to it.
    imageUrl: isBase && typeof image === 'string' && /^https?:\/\//.test(image) ? image : null,
  };
}

export function validateAddress(address, chain) {
  if (!address || typeof address !== 'string') throw new Error('A token address is required');
  if (!/^[A-Za-z0-9]+$/.test(address)) throw new Error(`Invalid token address "${address}"`);
  if (!/^[a-z0-9-]+$/.test(chain)) throw new Error(`Invalid chain id "${chain}"`);
}

/**
 * Fetch market data for a token. Resolves to null when DexScreener knows no
 * pair for it yet; rejects on network or HTTP errors (429 is retried first).
 * @param {string} address  Token address (mint on Solana).
 * @param {object} [opts]
 * @param {string} [opts.chain='solana']  DexScreener chain id.
 * @param {string} [opts.api]  Base URL. Defaults to $TAPE_DEXSCREENER_API or the public API.
 * @param {number} [opts.timeoutMs=10000]
 */
export async function fetchToken(address, { chain = 'solana', api, timeoutMs = 10000 } = {}) {
  validateAddress(address, chain);
  const base = (api || process.env.TAPE_DEXSCREENER_API || DEFAULT_API).replace(/\/+$/, '');
  const body = await getJson(`${base}/tokens/v1/${chain}/${address}`, { service: 'DexScreener', timeoutMs });
  const pairs = Array.isArray(body) ? body : body?.pairs;
  return toTokenData(selectPair(pairs, address), address);
}
