// Command line interface. bin/tape.js only calls main().
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadCoin, parseTokenList } from './coin.js';
import { render, renderMany, loadOptions, TYPES } from './render.js';
import { openCache } from './cache.js';
import { THEME_NAMES, COLOR_KEYS, parseColors, normalizeColor } from './theme.js';
import { STYLES, LOGOS } from './badge.js';
import { METRICS, formatPrice, formatUsd, formatChange, chainName } from './format.js';
import { TIMEFRAMES } from './gecko.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `tape ${VERSION}: live coin cards for your README. tape a coin's price, chart and mcap onto your repo.

Usage
  tape <token> [options]             render one SVG (stdout or --out)
  tape <token,token,...> [options]   render several into one grid SVG
  tape quote <token> [--json]        print price, mcap, liq, volume and a sparkline
  tape ui [token] [--port 4178]      local preview gallery and builder
  tape mcp                           MCP server over stdio for AI agents

A token is an address, or chain:address (for example base:0xabc...).

Render options
  --type <name>       ${TYPES.join(' | ')} (default: badge)
  --chain <id>        DexScreener chain id (default: solana)
  --timeframe <tf>    ${Object.keys(TIMEFRAMES).join(' | ')} chart and change window (default: 24h)
  --theme <name>      ${THEME_NAMES.join(' | ')} (card, default: dark)
  --${COLOR_KEYS.join(', --')} <hex>
                      override one card colour
  --colors <list>     same thing as one list: "bg=fffdf8,accent=f29e1f"
  --hide-border       card without its border
  --no-logo           monogram instead of the token logo
  --label <text>      badge left text or card chip, for example "paid to dev"
  --label-color <hex> badge left background
  --metric <name>     ${METRICS.join(' | ')} (badge, default: all; spark: price | change)
  --style <name>      ${STYLES.join(' | ')} (badge and spark, default: flat)
  --logo <name>       ${LOGOS.join(' | ')} (chain icon on badge and spark)
  --columns <n>       grid columns (default: 2 for cards, 1 otherwise)
  --cache <file>      reuse chart data under 10 minutes old from this JSON file
  --out <file>        write the SVG to a file instead of stdout
  --json              print the loaded data as JSON instead of an SVG

Other
  --port <n>          ui port (default: 4178)
  -h, --help          show this help
  -v, --version       print the version

Environment
  TAPE_DEXSCREENER_API   DexScreener base URL (default: https://api.dexscreener.com)
  TAPE_GECKO_API         GeckoTerminal base URL (default: https://api.geckoterminal.com/api/v2)

Examples
  tape So11111111111111111111111111111111111111112 --metric price
  tape <mint> --type card --theme light --label "paid to dev" --out card.svg
  tape <mint>,base:0xabc... --type card --columns 2 --out coins.svg

npm package: readme-tape (npx readme-tape ...). Market data only, not financial advice.`;

class UsageError extends Error {}

const OPTIONS = {
  type: { type: 'string', default: 'badge' },
  chain: { type: 'string', default: 'solana' },
  timeframe: { type: 'string', default: '24h' },
  theme: { type: 'string', default: 'dark' },
  colors: { type: 'string' },
  'hide-border': { type: 'boolean', default: false },
  'no-logo': { type: 'boolean', default: false },
  label: { type: 'string' },
  'label-color': { type: 'string' },
  metric: { type: 'string' },
  style: { type: 'string', default: 'flat' },
  logo: { type: 'string' },
  columns: { type: 'string' },
  cache: { type: 'string' },
  out: { type: 'string', short: 'o' },
  json: { type: 'boolean', default: false },
  port: { type: 'string', default: '4178' },
  host: { type: 'string', default: '127.0.0.1' },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
  ...Object.fromEntries(COLOR_KEYS.map((k) => [k, { type: 'string' }])),
};

// Validates flags and turns them into render options.
export function renderOptions(o) {
  if (!TYPES.includes(o.type)) throw new UsageError(`unknown type "${o.type}" (use ${TYPES.join(', ')})`);
  if (!TIMEFRAMES[o.timeframe]) throw new UsageError(`unknown timeframe "${o.timeframe}" (use ${Object.keys(TIMEFRAMES).join(', ')})`);
  if (!THEME_NAMES.includes(o.theme)) throw new UsageError(`unknown theme "${o.theme}" (use ${THEME_NAMES.join(', ')})`);
  if (!STYLES.includes(o.style)) throw new UsageError(`unknown style "${o.style}" (use ${STYLES.join(', ')})`);
  if (o.logo && !LOGOS.includes(o.logo)) throw new UsageError(`unknown logo "${o.logo}" (use ${LOGOS.join(', ')})`);
  const metric = o.metric ?? (o.type === 'spark' ? 'price' : 'all');
  const allowed = o.type === 'spark' ? ['price', 'change'] : METRICS;
  if (o.type !== 'card' && !allowed.includes(metric)) throw new UsageError(`unknown metric "${metric}" for ${o.type} (use ${allowed.join(', ')})`);
  let colors;
  try {
    colors = { ...parseColors(o.colors), ...Object.fromEntries(COLOR_KEYS.filter((k) => o[k]).map((k) => [k, o[k]])) };
    for (const [k, v] of Object.entries(colors)) normalizeColor(v, k);
    if (o['label-color']) normalizeColor(o['label-color'], 'label-color');
  } catch (err) {
    throw new UsageError(err.message);
  }
  const columns = o.columns === undefined ? undefined : Number(o.columns);
  if (columns !== undefined && !(Number.isInteger(columns) && columns > 0 && columns <= 6)) throw new UsageError('--columns must be a whole number from 1 to 6');
  return {
    type: o.type, theme: o.theme, colors, label: o.label, labelColor: o['label-color'], metric, style: o.style,
    logo: o.logo, hideBorder: o['hide-border'], columns,
  };
}

const SPARK = ' ▁▂▃▄▅▆▇█';
// Unicode block sparkline, resampled to `width` characters.
export function blockSparkline(values, width = 32) {
  if (!values?.length) return '';
  const pick = Array.from({ length: Math.min(width, values.length) }, (_, i) => values[Math.round((i * (values.length - 1)) / Math.max(1, Math.min(width, values.length) - 1))]);
  const min = Math.min(...pick);
  const span = Math.max(...pick) - min;
  return pick.map((v) => SPARK[span > 0 ? 1 + Math.round(((v - min) / span) * 7) : 4]).join('');
}

export function formatQuote(coin, { color = false } = {}) {
  const t = coin.token;
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  if (!t) return `${coin.address} on ${chainName(coin.chain)}: no trading pair on DexScreener yet\n`;
  const ch = formatChange(coin.change);
  const dir = typeof coin.change === 'number' ? (coin.change >= 0 ? 32 : 31) : 90;
  const rows = [
    `${c('1', '$' + t.symbol)}  ${t.name ?? ''}  ${c(90, `${chainName(coin.chain)} / ${t.dexId ?? 'unknown dex'}`)}`,
    '',
    `  price       ${c('1', formatPrice(t.priceUsd) ?? 'n/a')}   ${c(dir, (ch ?? 'n/a') + ' ' + coin.timeframe)}`,
    `  mcap        ${formatUsd(t.marketCap ?? t.fdv) ?? 'n/a'}`,
    `  liquidity   ${formatUsd(t.liquidityUsd) ?? 'n/a'}`,
    `  volume 24h  ${formatUsd(t.volume24h) ?? 'n/a'}`,
  ];
  const closes = (coin.candles ?? []).map((k) => k[4]);
  if (closes.length > 1) rows.push(`  chart ${coin.timeframe.padEnd(5)} ${c(dir, blockSparkline(closes))}`);
  rows.push(`  pair        ${c(90, t.pairAddress ?? 'n/a')}`);
  return rows.join('\n') + '\n';
}

function write(out, text) {
  const file = resolve(out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  const err = (m) => io.stderr.write(`tape: ${m}\n`);
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  } catch (e) {
    err(e.message);
    err('Run "tape --help" for usage.');
    return 2;
  }
  const { values: o, positionals } = args;
  if (o.help) return io.stdout.write(HELP + '\n'), 0;
  if (o.version) return io.stdout.write(VERSION + '\n'), 0;

  try {
    const [cmd, ...rest] = positionals;
    if (cmd === 'mcp') {
      const { startMcpServer } = await import('./mcp.js');
      await startMcpServer();
      return null;
    }
    if (cmd === 'ui') {
      const port = Number(o.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError('--port must be a number from 0 to 65535');
      const { startUi } = await import('./ui.js');
      const { url } = await startUi({ port, host: o.host, token: rest[0], chain: o.chain });
      io.stdout.write(`tape ui running at ${url}\nCtrl+C to stop.\n`);
      return null;
    }
    const isQuote = cmd === 'quote';
    const list = isQuote ? rest : positionals;
    if (list.length === 0) throw new UsageError('missing token address');
    if (isQuote && list.length > 1) throw new UsageError('quote takes one token');
    const opts = renderOptions(o);
    const specs = parseTokenList(list.join(','), o.chain);
    const cache = o.cache ? openCache(resolve(o.cache)) : null;
    const load = { timeframe: o.timeframe, cache, logo: !o['no-logo'] };
    const warn = (coin) => {
      for (const w of coin.warnings) err(w);
      if (!coin.token) err(`no DexScreener pair found for ${coin.address} on ${coin.chain}`);
    };

    if (isQuote) {
      const coin = await loadCoin(specs[0], loadOptions('spark', load));
      warn(coin);
      cache?.save();
      io.stdout.write(o.json ? JSON.stringify(coin, null, 2) + '\n' : formatQuote(coin, { color: !process.env.NO_COLOR && Boolean(io.stdout.isTTY || process.env.FORCE_COLOR) }));
      return 0;
    }

    let output;
    let summary;
    if (specs.length === 1) {
      const coin = await loadCoin(specs[0], loadOptions(opts.type, load));
      warn(coin);
      output = o.json ? JSON.stringify(coin, null, 2) + '\n' : render(coin, opts);
      summary = `${opts.type}, ` + (coin.token ? `$${coin.token.symbol} ${formatPrice(coin.token.priceUsd)} ${formatChange(coin.change) ?? ''}`.trim() : 'no pair yet');
    } else {
      const { coins, svgs, grid } = await renderMany(specs, { ...opts, load });
      coins.forEach(warn);
      output = o.json ? JSON.stringify(coins, null, 2) + '\n' : grid;
      summary = `grid of ${svgs.length} ${opts.type}s`;
    }
    cache?.save();
    if (o.out) {
      write(o.out, output);
      err(`wrote ${o.out} (${o.json ? 'json' : summary})`);
    } else {
      io.stdout.write(output);
    }
    return 0;
  } catch (e) {
    err(e.message);
    if (e instanceof UsageError) {
      err('Run "tape --help" for usage.');
      return 2;
    }
    return 1;
  }
}
