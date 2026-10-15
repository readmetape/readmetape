// The coin card: a 495x195 SVG in the visual language of GitHub's UI.
// GitHub-safe by construction: no scripts, no foreignObject, no external
// references (the logo is a data URI), fonts come from font-family stacks.
import { resolveTheme } from './theme.js';
import { sparkPaths } from './chart.js';
import { escapeXml, idPrefix, FONT_SANS, FONT_SERIF, FONT_MONO } from './svg.js';
import { sansWidth } from './width.js';
import { formatPrice, formatUsd, formatTime, chainName, shortAddress } from './format.js';

export const CARD_WIDTH = 495;
export const CARD_HEIGHT = 195;

const P = 24;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const TABULAR = ' style="font-variant-numeric:tabular-nums"';

const DEX_NAMES = { raydium: 'Raydium', pumpswap: 'PumpSwap', meteora: 'Meteora', orca: 'Orca', uniswap: 'Uniswap', pancakeswap: 'PancakeSwap', aerodrome: 'Aerodrome' };

export function truncate(text, maxWidth, size, bold = false) {
  const s = String(text);
  if (sansWidth(s, size, bold) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && sansWidth(out + '...', size, bold) > maxWidth) out = out.slice(0, -1);
  return out.trimEnd() + '...';
}

function txt(x, y, size, fill, content, extra = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${extra}>${escapeXml(content)}</text>`;
}

function avatar(coin, t, id, cx, cy, r) {
  if (coin.logo) {
    return (
      `<clipPath id="${id}-a"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
      `<image x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" href="${coin.logo}" xlink:href="${coin.logo}" clip-path="url(#${id}-a)" preserveAspectRatio="xMidYMid slice"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" stroke="${t.border}"/>`
    );
  }
  // Monogram: up to two letters of the symbol on a tinted circle.
  const letters = (coin.token?.symbol || coin.address || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="${t.accent}" fill-opacity=".14" stroke="${t.accent}" stroke-opacity=".45"/>` +
    `<text x="${cx}" y="${cy + 5}" font-size="${letters.length > 1 ? 14 : 16}" font-weight="700" fill="${t.accent}" text-anchor="middle">${escapeXml(letters)}</text>`
  );
}

function changePill(change, timeframe, t, right, y) {
  const dir = !isNum(change) ? null : change >= 0 ? 'up' : 'down';
  const color = dir ? t[dir] : t.muted;
  const value = dir ? `${Math.abs(change) >= 1000 ? Math.round(Math.abs(change)).toLocaleString('en-US') : Math.abs(change).toFixed(1)}%` : 'n/a';
  const tf = timeframe;
  const vw = sansWidth(value, 12, true);
  const tw = sansWidth(tf, 11);
  const w = Math.ceil(10 + (dir ? 12 : 0) + vw + 5 + tw + 10);
  const x = right - w;
  let ix = x + 10;
  const mid = y + 10;
  let s = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="19" rx="9.5" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-opacity=".4"/>`;
  if (dir === 'up') s += `<path d="M${ix} ${mid + 2.5}l4-5 4 5z" fill="${color}"/>`;
  if (dir === 'down') s += `<path d="M${ix} ${mid - 2.5}l4 5 4-5z" fill="${color}"/>`;
  if (dir) ix += 12;
  s += `<text x="${ix}" y="${mid + 4}" font-size="12" font-weight="600" fill="${color}"${TABULAR}>${escapeXml(value)}</text>`;
  s += `<text x="${right - 10}" y="${mid + 4}" font-size="11" fill="${color}" fill-opacity=".75" text-anchor="end">${escapeXml(tf)}</text>`;
  return { svg: s, dir };
}

/**
 * Render a coin card.
 * @param {object} coin  Result of loadCoin(): { token, candles, logo, timeframe, change, updatedAt, address, chain }.
 * @param {object} [opts]
 * @param {string} [opts.theme='dark']   dark | light | github_dark | transparent
 * @param {object} [opts.colors]          overrides: bg, border, text, muted, accent, up, down
 * @param {string} [opts.label]           small chip after the symbol, for example "paid to dev"
 * @param {boolean} [opts.hideBorder]
 * @returns {string} SVG markup
 */
export function renderCard(coin, opts = {}) {
  const t = resolveTheme(opts.theme ?? 'dark', opts.colors ?? {});
  if (t.editorial) return renderEditorial(coin, opts, t);
  const token = coin?.token ?? null;
  const timeframe = coin?.timeframe ?? '24h';
  const id = idPrefix(coin?.chain, coin?.address, opts.theme, timeframe, opts.label, JSON.stringify(opts.colors ?? {}));
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const R = W - P;

  const symbol = token?.symbol ? `$${token.symbol}` : shortAddress(coin?.address) || 'Unknown token';
  const price = token ? formatPrice(token.priceUsd) ?? 'n/a' : 'n/a';
  const title = `${symbol} ${price}`;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.bg}" stroke="${opts.hideBorder ? 'none' : t.border}"/>`,
    `<g font-family="${FONT_SANS}">`,
  );

  // Header: avatar, symbol, optional label chip, meta line; price and pill on the right.
  out.push(avatar(coin ?? {}, t, id, P + 20, 44, 20));
  const priceW = sansWidth(price, 22, true);
  const textX = P + 52;
  const textMax = R - priceW - textX - 16;
  const sym = truncate(symbol, Math.min(textMax, 180), 17, true);
  out.push(txt(textX, 41, 17, t.text, sym, ' font-weight="600"'));
  if (opts.label) {
    const lx = textX + Math.ceil(sansWidth(sym, 17, true)) + 8;
    const label = truncate(opts.label, Math.max(40, R - priceW - 16 - lx - 16), 11);
    const lw = Math.ceil(sansWidth(label, 11) + 16);
    out.push(
      `<rect x="${lx + 0.5}" y="27.5" width="${lw - 1}" height="17" rx="8.5" fill="${t.accent}" fill-opacity=".12" stroke="${t.accent}" stroke-opacity=".5"/>`,
      txt(lx + lw / 2, 40, 11, t.accent, label, ' font-weight="500" text-anchor="middle"'),
    );
  }
  const dex = token?.dexId ? DEX_NAMES[token.dexId] ?? token.dexId : null;
  const meta = token ? [token.name, chainName(coin.chain ?? token.chainId), dex].filter(Boolean).join(' · ') : `No trading pair yet · ${chainName(coin?.chain) ?? ''}`;
  out.push(txt(textX, 60, 12, t.muted, truncate(meta, R - 110 - textX, 12)));
  out.push(txt(R, 42, 22, t.text, price, ` font-weight="600" text-anchor="end"${TABULAR}`));
  const pill = changePill(coin?.change, timeframe, t, R, 50);
  out.push(pill.svg);

  // Chart: area + line of close prices, a dotted line at the opening price and
  // a dot on the latest value.
  const closes = (coin?.candles ?? []).map((c) => c[4]);
  const box = { x: P, y: 86, w: W - P * 2, h: 40 };
  const bottom = 134;
  const paths = sparkPaths(closes, box, bottom);
  if (paths) {
    const first = closes[0];
    const last = closes[closes.length - 1];
    const color = pill.dir ? t[pill.dir] : last >= first ? t.up : t.down;
    out.push(
      `<defs><linearGradient id="${id}-g" x1="0" y1="${box.y}" x2="0" y2="${bottom}" gradientUnits="userSpaceOnUse">` +
        `<stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`,
      `<path d="M${P} ${paths.first[1].toFixed(2)}H${R}" stroke="${t.muted}" stroke-opacity=".5" stroke-dasharray="1 3" stroke-linecap="round"/>`,
      `<path d="${paths.area}" fill="url(#${id}-g)"/>`,
      `<path d="${paths.line}" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<circle cx="${paths.last[0]}" cy="${paths.last[1].toFixed(2)}" r="5" fill="${color}" fill-opacity=".25"/>`,
      `<circle cx="${paths.last[0]}" cy="${paths.last[1].toFixed(2)}" r="2.5" fill="${color}"/>`,
    );
  } else {
    const msg = token ? 'No chart data yet' : 'No trading pair on DexScreener yet';
    out.push(
      `<path d="M${P} 110H${R}" stroke="${t.muted}" stroke-opacity=".5" stroke-dasharray="1 3" stroke-linecap="round"/>`,
      `<rect x="${W / 2 - sansWidth(msg, 12) / 2 - 10}" y="100" width="${Math.ceil(sansWidth(msg, 12) + 20)}" height="20" fill="${t.bg === 'none' ? 'none' : t.bg}"/>`,
      txt(W / 2, 114, 12, t.muted, msg, ' text-anchor="middle"'),
    );
  }

  // Stats row.
  const stats = [
    ['Market cap', formatUsd(token?.marketCap ?? token?.fdv)],
    ['Liquidity', formatUsd(token?.liquidityUsd)],
    ['Volume 24h', formatUsd(token?.volume24h)],
  ];
  stats.forEach(([k, v], i) => {
    const x = P + i * 104;
    out.push(txt(x, 156, 11, t.muted, k), txt(x, 174, 13, t.text, v ?? 'n/a', ` font-weight="600"${TABULAR}`));
  });
  out.push(
    txt(R, 156, 11, t.muted, 'Updated', ' text-anchor="end"'),
    `<text x="${R}" y="174" font-size="12" fill="${t.muted}" text-anchor="end" data-pt="updated"${TABULAR}>${escapeXml(formatTime(coin?.updatedAt ?? Date.now()))}</text>`,
  );
  out.push('</g></svg>');
  return out.join('') + '\n';
}

// Editorial layout for the `cream` and `espresso` themes: serif symbol, mono
// numbers, hairline rules instead of pills and fills. Same 495x195 size.
const monoWidth = (s, size, spacing = 0) => String(s).length * (size * 0.6 + spacing);
const serifWidth = (s, size, bold = false) => sansWidth(s, size, bold) * 1.04;
const MONO_CAPS = ' letter-spacing=".08em"';

function fitSerif(text, maxWidth, size) {
  const s = String(text);
  if (serifWidth(s, size, true) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && serifWidth(out + '...', size, true) > maxWidth) out = out.slice(0, -1);
  return out.trimEnd() + '...';
}

function fitMono(text, maxWidth, size, spacing = 0) {
  const s = String(text);
  const max = Math.max(1, Math.floor(maxWidth / (size * 0.6 + spacing)));
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 3)).trimEnd() + '...';
}

function renderEditorial(coin, opts, t) {
  const token = coin?.token ?? null;
  const timeframe = coin?.timeframe ?? '24h';
  const id = idPrefix(coin?.chain, coin?.address, opts.theme, timeframe, opts.label, JSON.stringify(opts.colors ?? {}));
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const R = W - P;
  const mono = ` font-family="${FONT_MONO}"`;
  const serif = ` font-family="${FONT_SERIF}"`;
  const symbol = token?.symbol ? `$${token.symbol}` : shortAddress(coin?.address) || 'Unknown token';
  const price = token ? formatPrice(token.priceUsd) ?? 'n/a' : 'n/a';
  const title = `${symbol} ${price}`;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.bg}" stroke="${opts.hideBorder ? 'none' : t.border}"/>`,
    `<g font-family="${FONT_SERIF}">`,
  ];

  // Avatar: token logo, or a serif monogram inside a hairline ring.
  const cx = P + 18;
  const cy = 44;
  if (coin?.logo) {
    out.push(
      `<clipPath id="${id}-a"><circle cx="${cx}" cy="${cy}" r="18"/></clipPath>`,
      `<image x="${cx - 18}" y="${cy - 18}" width="36" height="36" href="${coin.logo}" xlink:href="${coin.logo}" clip-path="url(#${id}-a)" preserveAspectRatio="xMidYMid slice"/>`,
      `<circle cx="${cx}" cy="${cy}" r="17.5" stroke="${t.border}"/>`,
    );
  } else {
    const letters = (token?.symbol || coin?.address || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="17.5" fill="${t.grid}" stroke="${t.border}"/>`,
      `<text x="${cx}" y="${cy + 5}" font-size="${letters.length > 1 ? 14 : 16}" font-weight="600" fill="${t.text}" text-anchor="middle">${escapeXml(letters)}</text>`,
    );
  }

  // Price and change, right aligned. Numbers are mono with tabular figures.
  const priceW = monoWidth(price, 22);
  const x0 = P + 48;
  out.push(`<text x="${R}" y="45" font-size="22" fill="${t.text}" text-anchor="end"${mono}${TABULAR}>${escapeXml(price)}</text>`);
  const change = coin?.change;
  const dir = !isNum(change) ? null : change >= 0 ? 'up' : 'down';
  const chColor = dir ? t[dir] : t.muted;
  const chValue = dir ? `${Math.abs(change) >= 1000 ? Math.round(Math.abs(change)).toLocaleString('en-US') : Math.abs(change).toFixed(1)}%` : 'n/a';
  const chText = `${chValue} ${timeframe}`;
  const chW = monoWidth(chText, 11.5);
  if (dir) {
    const ax = R - chW - 12;
    out.push(dir === 'up' ? `<path d="M${ax} 63l4-6 4 6z" fill="${chColor}"/>` : `<path d="M${ax} 57l4 6 4-6z" fill="${chColor}"/>`);
  }
  out.push(`<text x="${R}" y="64" font-size="11.5" fill="${chColor}" text-anchor="end"${mono}${TABULAR}>${escapeXml(chValue)} <tspan fill="${t.muted}">${escapeXml(timeframe)}</tspan></text>`);

  // Symbol, optional label, meta line.
  const textMax = R - priceW - x0 - 20;
  const sym = fitSerif(symbol, Math.min(textMax, 190), 21);
  out.push(`<text x="${x0}" y="44" font-size="21" font-weight="600" fill="${t.text}" letter-spacing="-.01em">${escapeXml(sym)}</text>`);
  if (opts.label) {
    const lx = x0 + Math.ceil(serifWidth(sym, 21, true)) + 10;
    const label = fitMono(opts.label, Math.max(40, R - priceW - 20 - lx - 14), 10);
    const lw = Math.ceil(monoWidth(label, 10) + 14);
    out.push(
      `<rect x="${lx + 0.5}" y="30.5" width="${lw - 1}" height="17" rx="3" stroke="${t.accent}" stroke-opacity=".55"/>`,
      `<text x="${lx + lw / 2}" y="42.5" font-size="10" fill="${t.accent}" text-anchor="middle"${mono}>${escapeXml(label)}</text>`,
    );
  }
  const dex = token?.dexId ? DEX_NAMES[token.dexId] ?? token.dexId : null;
  const meta = token ? [token.name, chainName(coin.chain ?? token.chainId), dex].filter(Boolean).join(' · ') : `No trading pair yet · ${chainName(coin?.chain) ?? ''}`;
  out.push(`<text x="${x0}" y="63" font-size="12.5" font-style="italic" fill="${t.muted}">${escapeXml(truncate(meta, R - chW - 40 - x0, 12.5))}</text>`);

  // Hairlines frame the chart.
  out.push(`<path d="M${P} 80.5H${R}M${P} 144.5H${R}" stroke="${t.border}"/>`);
  const closes = (coin?.candles ?? []).map((c) => c[4]);
  const box = { x: P, y: 92, w: W - P * 2, h: 40 };
  const paths = sparkPaths(closes, box, 144);
  if (paths) {
    const color = dir ? t[dir] : closes[closes.length - 1] >= closes[0] ? t.up : t.down;
    out.push(
      `<defs><linearGradient id="${id}-g" x1="0" y1="${box.y}" x2="0" y2="144" gradientUnits="userSpaceOnUse">` +
        `<stop offset="0" stop-color="${color}" stop-opacity=".16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`,
      `<path d="M${P} ${paths.first[1].toFixed(2)}H${R}" stroke="${t.muted}" stroke-opacity=".45" stroke-dasharray="1 3" stroke-linecap="round"/>`,
      `<path d="${paths.area}" fill="url(#${id}-g)"/>`,
      `<path d="${paths.line}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<circle cx="${paths.last[0]}" cy="${paths.last[1].toFixed(2)}" r="3" fill="${t.bg === 'none' ? color : t.bg}" stroke="${color}" stroke-width="1.5"/>`,
    );
  } else {
    const msg = token ? 'No chart data yet' : 'No trading pair on DexScreener yet';
    out.push(`<text x="${W / 2}" y="117" font-size="13" font-style="italic" fill="${t.muted}" text-anchor="middle">${escapeXml(msg)}</text>`);
  }

  // Ledger row: mono caps labels over mono values.
  const stats = [
    ['Market cap', formatUsd(token?.marketCap ?? token?.fdv)],
    ['Liquidity', formatUsd(token?.liquidityUsd)],
    ['Volume 24h', formatUsd(token?.volume24h)],
  ];
  stats.forEach(([k, v], i) => {
    const x = P + i * 104;
    out.push(
      `<text x="${x}" y="162" font-size="9" fill="${t.muted}"${mono}${MONO_CAPS}>${escapeXml(k.toUpperCase())}</text>`,
      `<text x="${x}" y="179" font-size="13" fill="${t.text}"${mono}${TABULAR}>${escapeXml(v ?? 'n/a')}</text>`,
    );
  });
  out.push(
    `<text x="${R}" y="162" font-size="9" fill="${t.muted}" text-anchor="end"${mono}${MONO_CAPS}>UPDATED</text>`,
    `<text x="${R}" y="179" font-size="11" fill="${t.muted}" text-anchor="end" data-pt="updated"${mono}${TABULAR}>${escapeXml(formatTime(coin?.updatedAt ?? Date.now()))}</text>`,
  );
  out.push('</g></svg>');
  return out.join('') + '\n';
}
