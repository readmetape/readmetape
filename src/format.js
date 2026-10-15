// Number formatting for badge values. All functions return null for missing input.

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function stripZeros(s) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

const UNITS = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

// 1234 -> "1.2K", 3_400_000 -> "3.4M", 123_456 -> "123K", 950 -> "950"
export function formatCompact(n) {
  if (!isNum(n)) return null;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  for (const [size, suffix] of UNITS) {
    // Round first so 999_950 becomes "1M" instead of "1000K".
    if (abs >= size * 0.9995) {
      const v = abs / size;
      const digits = v >= 99.95 ? 0 : 1;
      return sign + stripZeros(v.toFixed(digits)) + suffix;
    }
  }
  return sign + stripZeros(abs.toFixed(abs >= 100 ? 0 : 1));
}

// Prices: two significant digits below $1, cents above, compact from $100K.
export function formatPrice(n) {
  if (!isNum(n)) return null;
  if (n === 0) return '$0';
  if (n >= 1e5) return '$' + formatCompact(n);
  if (n >= 1) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (n < 1e-12) return '$' + n.toExponential(1);
  const decimals = Math.min(20, Math.max(2, -Math.floor(Math.log10(n)) + 1));
  return '$' + stripZeros(n.toFixed(decimals));
}

export function formatUsd(n) {
  if (!isNum(n)) return null;
  return '$' + formatCompact(n);
}

export function formatChange(n) {
  if (!isNum(n)) return null;
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  const body = abs >= 1000 ? Math.round(abs).toLocaleString('en-US') : abs.toFixed(1);
  return `${sign}${body}%`;
}

export const METRICS = ['price', 'mcap', 'change', 'volume', 'all'];

// Builds the right-hand badge text for a token (or null token = no data).
export function formatMetric(token, metric = 'all') {
  if (!METRICS.includes(metric)) {
    throw new Error(`Unknown metric "${metric}". Use one of: ${METRICS.join(', ')}`);
  }
  if (!token) return 'no pair yet';
  const price = formatPrice(token.priceUsd);
  const mcap = formatUsd(token.marketCap ?? token.fdv);
  const change = formatChange(token.change24h);
  const volume = formatUsd(token.volume24h);
  const parts = {
    price: price,
    mcap: mcap && `${mcap} mcap`,
    change: change && `${change} 24h`,
    volume: volume && `${volume} vol 24h`,
  };
  if (metric === 'all') {
    const all = [price, mcap && `${mcap} mcap`, change].filter(Boolean);
    return all.length ? all.join(' | ') : 'no data';
  }
  return parts[metric] || 'no data';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-10-14T12:30:00Z" -> "14 Oct, 12:30 UTC". Times are always UTC so a
// committed card reads the same for every visitor.
export function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

const CHAINS = { solana: 'Solana', ethereum: 'Ethereum', base: 'Base', bsc: 'BNB Chain', arbitrum: 'Arbitrum', polygon: 'Polygon', avalanche: 'Avalanche', optimism: 'Optimism' };

export function chainName(id) {
  if (!id) return null;
  return CHAINS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

// "DemoMint1111...1111" style shortening for addresses.
export function shortAddress(a) {
  return a && a.length > 12 ? `${a.slice(0, 4)}...${a.slice(-4)}` : a ?? '';
}
