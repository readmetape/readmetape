// Pure-JS SVG badge renderer in the visual language of shields.io, plus the
// compact sparkline badge.
import { textWidth } from './width.js';
import { formatMetric, formatPrice, formatChange } from './format.js';
import { escapeXml, idPrefix } from './svg.js';
import { normalizeColor } from './theme.js';
import { scale } from './chart.js';

export { escapeXml };

export const STYLES = ['flat', 'flat-square', 'for-the-badge'];
export const LOGOS = ['solana', 'ethereum'];

export const COLORS = {
  label: '#555',
  up: '#4c1',
  down: '#e05d44',
  none: '#9f9f9f',
};

const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';


// Green for flat or rising, red for falling, grey when there is no data.
export function badgeColor(token) {
  const c = token?.change24h;
  if (typeof c !== 'number' || !Number.isFinite(c)) return COLORS.none;
  return c >= 0 ? COLORS.up : COLORS.down;
}

// Simple white glyphs drawn for this project, 14x14 box at (x, y).
function logoSvg(name, x, y) {
  if (name === 'solana') {
    // Three slanted bars, the middle one leaning the other way.
    const right = (t) => `<path d="M${x + 3} ${t}h11l-3 3H${x}z"/>`;
    const left = (t) => `<path d="M${x} ${t}h11l3 3H${x + 3}z"/>`;
    return `<g fill="#fff">${right(y + 1)}${left(y + 5.5)}${right(y + 10)}</g>`;
  }
  if (name === 'ethereum') {
    // Two stacked diamonds.
    const cx = x + 7;
    return (
      `<g fill="#fff"><path d="M${cx} ${y}l4.5 7.2-4.5 2.6-4.5-2.6z"/>` +
      `<path d="M${cx} ${y + 10.8}l4.5-2.6L${cx} ${y + 14}l-4.5-5.8z" opacity=".8"/></g>`
    );
  }
  return '';
}

function layout(label, value, style, hasLogo, extra = 0) {
  const ftb = style === 'for-the-badge';
  const pad = ftb ? 9 : 5;
  const size = ftb ? 10 : 11;
  const spacing = ftb ? 1.25 : 0;
  const logoW = hasLogo ? 14 + (ftb ? 6 : 3) : 0;
  const labelText = ftb ? label.toUpperCase() : label;
  const valueText = ftb ? value.toUpperCase() : value;
  const lw = Math.ceil(textWidth(labelText, { size, letterSpacing: spacing }));
  const vw = Math.ceil(textWidth(valueText, { size, bold: ftb, letterSpacing: spacing }));
  const left = label ? lw + pad * 2 + logoW : hasLogo ? 14 + pad * 2 : 0;
  const right = vw + pad * 2 + extra;
  return {
    ftb, pad, size, spacing, logoW, labelText, valueText, lw, vw, left, right,
    height: ftb ? 28 : 20,
    total: left + right,
  };
}

function text(str, cx, y, opts) {
  const { size, spacing, bold, shadow } = opts;
  const extra = `font-size="${size}"${spacing ? ` letter-spacing="${spacing}"` : ''}${bold ? ' font-weight="bold"' : ''}`;
  const s = escapeXml(str);
  const sh = shadow
    ? `<text x="${cx}" y="${y + 1}" ${extra} fill="#010101" fill-opacity=".3" aria-hidden="true">${s}</text>`
    : '';
  return `${sh}<text x="${cx}" y="${y}" ${extra} fill="#fff">${s}</text>`;
}

// Exported for the hosted endpoints' error badges.
export function shield({ label, value, color, labelColor = COLORS.label, style = 'flat', logo, spark }) {
  if (!STYLES.includes(style)) throw new Error(`Unknown style "${style}". Use one of: ${STYLES.join(', ')}`);
  if (logo && !LOGOS.includes(logo)) throw new Error(`Unknown logo "${logo}". Use one of: ${LOGOS.join(', ')}`);
  const sparkW = spark ? 44 : 0;
  const L = layout(label, value, style, Boolean(logo), spark ? sparkW + 5 : 0);
  const { height: h, total: w, left, right, ftb, pad } = L;
  const rounded = style === 'flat';
  const textY = ftb ? 18 : 14;
  const labelCx = (left + L.logoW) / 2;
  const valueCx = left + (spark ? sparkW + 5 : 0) + (right - (spark ? sparkW + 5 : 0)) / 2;
  const title = `${label}: ${value}`;
  const id = idPrefix(label, value, style, color, w);

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
  );
  if (rounded) {
    parts.push(
      `<linearGradient id="${id}-s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
      `<clipPath id="${id}-r"><rect width="${w}" height="${h}" rx="3" fill="#fff"/></clipPath>`,
    );
  }
  parts.push(
    `<g${rounded ? ` clip-path="url(#${id}-r)"` : ''} shape-rendering="crispEdges">`,
    `<rect width="${left}" height="${h}" fill="${labelColor}"/>`,
    `<rect x="${left}" width="${right}" height="${h}" fill="${color}"/>`,
    rounded ? `<rect width="${w}" height="${h}" fill="url(#${id}-s)"/>` : '',
    '</g>',
  );
  if (logo) parts.push(logoSvg(logo, ftb ? 9 : 5, ftb ? 7 : 3));
  if (spark) {
    const sx = left + pad;
    const top = ftb ? 7 : 5;
    const pts = scale(spark, { x: sx, y: top, w: sparkW, h: h - top * 2 });
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    parts.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  parts.push(`<g text-anchor="middle" font-family="${FONT}" text-rendering="geometricPrecision">`);
  const common = { size: L.size, spacing: L.spacing, shadow: !ftb };
  if (label) parts.push(text(L.labelText, labelCx, textY, common));
  parts.push(text(L.valueText, valueCx, textY, { ...common, bold: ftb }));
  parts.push('</g></svg>');
  return parts.join('') + '\n';
}

function defaultLabel(token) {
  return token?.symbol ? `$${token.symbol}` : 'coin';
}

/**
 * Render a shields-style badge.
 * @param {object|null} token  Result of fetchToken(), or null for "no pair yet".
 * @param {object} [opts]
 * @param {string} [opts.metric='all']   price | mcap | change | volume | all
 * @param {string} [opts.style='flat']   flat | flat-square | for-the-badge
 * @param {string} [opts.label]          Left text. Defaults to "$SYMBOL".
 * @param {string} [opts.labelColor]     Left background, hex.
 * @param {string} [opts.logo]           solana | ethereum
 * @returns {string} SVG markup
 */
export function renderBadge(token, opts = {}) {
  const { metric = 'all', style = 'flat', logo } = opts;
  return shield({
    label: opts.label ?? defaultLabel(token),
    value: formatMetric(token, metric),
    color: badgeColor(token),
    labelColor: opts.labelColor ? normalizeColor(opts.labelColor, 'labelColor') : COLORS.label,
    style,
    logo,
  });
}

/**
 * Compact sparkline badge: label, a white sparkline and the price (or change)
 * on a green or red background.
 * @param {object} coin  Result of loadCoin() ({ token, candles, change, timeframe }).
 * @param {object} [opts]  style, label, labelColor, logo, metric ('price' | 'change')
 */
export function renderSpark(coin, opts = {}) {
  const token = coin?.token ?? null;
  const closes = (coin?.candles ?? []).map((c) => c[4]).filter(Number.isFinite);
  const metric = opts.metric ?? 'price';
  if (!['price', 'change'].includes(metric)) throw new Error(`Spark badges show "price" or "change", not "${metric}"`);
  const change = coin?.change;
  let value = 'no pair yet';
  if (token) value = (metric === 'change' ? formatChange(change) : formatPrice(token.priceUsd)) ?? 'no data';
  return shield({
    label: opts.label ?? defaultLabel(token),
    value,
    color: badgeColor({ change24h: change }),
    labelColor: opts.labelColor ? normalizeColor(opts.labelColor, 'labelColor') : COLORS.label,
    style: opts.style ?? 'flat',
    logo: opts.logo,
    spark: token && closes.length >= 2 ? closes : null,
  });
}
