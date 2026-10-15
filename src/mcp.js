// Model Context Protocol server over stdio: JSON-RPC 2.0, one JSON message
// per line. stdout carries protocol messages only; logs go to stderr.
import { createInterface } from 'node:readline';
import { loadCoin } from './coin.js';
import { render, loadOptions } from './render.js';
import { THEME_NAMES, COLOR_KEYS } from './theme.js';
import { STYLES, LOGOS } from './badge.js';
import { METRICS } from './format.js';
import { VERSION } from './cli.js';

const PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18'];
const LATEST = '2025-06-18';

const tokenProps = {
  token: { type: 'string', description: 'Token address (mint on Solana), or chain:address' },
  chain: { type: 'string', description: 'DexScreener chain id: solana, ethereum, base, bsc, ...', default: 'solana' },
};
const timeframe = { type: 'string', enum: ['24h', '7d'], default: '24h', description: 'Chart and change window' };

export const TOOLS = [
  {
    name: 'token_quote',
    description: 'Live market data for a token from DexScreener (most liquid pair): price, market cap, liquidity, 24h volume and price change.',
    inputSchema: { type: 'object', properties: { ...tokenProps, timeframe }, required: ['token'], additionalProperties: false },
  },
  {
    name: 'render_card',
    description: 'Render a 495x195 coin card SVG (logo, price, change, chart, market cap, liquidity, volume) that displays correctly in a GitHub README. Returns the SVG text.',
    inputSchema: {
      type: 'object',
      properties: {
        ...tokenProps,
        timeframe,
        theme: { type: 'string', enum: THEME_NAMES, default: 'dark' },
        label: { type: 'string', description: 'Optional chip next to the symbol, for example "paid to dev"' },
        colors: {
          type: 'object',
          description: 'Optional hex colour overrides',
          properties: Object.fromEntries(COLOR_KEYS.map((k) => [k, { type: 'string' }])),
          additionalProperties: false,
        },
        hide_border: { type: 'boolean', default: false },
        token_logo: { type: 'boolean', default: true, description: 'Embed the token logo; false draws a monogram' },
      },
      required: ['token'],
      additionalProperties: false,
    },
  },
  {
    name: 'render_badge',
    description: 'Render a shields-style badge SVG, or a compact sparkline badge with kind "spark". Returns the SVG text.',
    inputSchema: {
      type: 'object',
      properties: {
        ...tokenProps,
        kind: { type: 'string', enum: ['badge', 'spark'], default: 'badge' },
        metric: { type: 'string', enum: METRICS, description: 'badge: any; spark: price or change' },
        style: { type: 'string', enum: STYLES, default: 'flat' },
        label: { type: 'string', description: 'Left text, default $SYMBOL' },
        label_color: { type: 'string', description: 'Left background colour, hex' },
        logo: { type: 'string', enum: LOGOS },
        timeframe,
      },
      required: ['token'],
      additionalProperties: false,
    },
  },
  {
    name: 'chart_points',
    description: 'OHLCV candles from GeckoTerminal for the token\'s most liquid pool, oldest first, plus the change over the window.',
    inputSchema: { type: 'object', properties: { ...tokenProps, timeframe }, required: ['token'], additionalProperties: false },
  },
];

function quoteJson(coin) {
  const t = coin.token;
  if (!t) return { chain: coin.chain, address: coin.address, found: false, message: 'No trading pair on DexScreener yet' };
  return {
    found: true, chain: coin.chain, address: t.address, symbol: t.symbol, name: t.name,
    priceUsd: t.priceUsd, marketCap: t.marketCap, fdv: t.fdv, liquidityUsd: t.liquidityUsd, volume24h: t.volume24h,
    change: coin.change, timeframe: coin.timeframe, dexId: t.dexId, pairAddress: t.pairAddress, url: t.url,
  };
}

function load(args, type) {
  return loadCoin(args.token, loadOptions(type, { chain: args.chain ?? 'solana', timeframe: args.timeframe ?? '24h', logo: args.token_logo !== false }));
}

export async function callTool(name, args = {}) {
  if (typeof args.token !== 'string' || !args.token) throw new Error('"token" is required');
  if (name === 'token_quote') return JSON.stringify(quoteJson(await load(args, args.timeframe === '7d' ? 'spark' : 'badge')), null, 2);
  if (name === 'render_card') {
    const coin = await load(args, 'card');
    return render(coin, { type: 'card', theme: args.theme ?? 'dark', label: args.label, colors: args.colors ?? {}, hideBorder: Boolean(args.hide_border) });
  }
  if (name === 'render_badge') {
    const type = args.kind === 'spark' ? 'spark' : 'badge';
    const coin = await load(args, type);
    return render(coin, {
      type, metric: args.metric ?? (type === 'spark' ? 'price' : 'all'), style: args.style ?? 'flat',
      label: args.label, labelColor: args.label_color, logo: args.logo,
    });
  }
  if (name === 'chart_points') {
    const coin = await load(args, 'spark');
    const points = (coin.candles ?? []).map(([t, open, high, low, close, volume]) => ({ t: new Date(t * 1000).toISOString(), open, high, low, close, volume }));
    const closes = points.map((p) => p.close);
    return JSON.stringify({
      ...quoteJson(coin), count: points.length,
      min: closes.length ? Math.min(...closes) : null, max: closes.length ? Math.max(...closes) : null,
      warnings: coin.warnings, points,
    }, null, 2);
  }
  throw new Error(`Unknown tool "${name}"`);
}

export async function handle(msg) {
  const { id, method, params } = msg ?? {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Invalid Request');
  const isNotification = id === undefined;
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    return reply({
      protocolVersion: PROTOCOLS.includes(asked) ? asked : LATEST,
      capabilities: { tools: {} },
      serverInfo: { name: 'tape', version: VERSION },
    });
  }
  if (method.startsWith('notifications/')) return null;
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return fail(-32602, `Unknown tool: ${params?.name}`);
    if (params.arguments !== undefined && (typeof params.arguments !== 'object' || params.arguments === null)) {
      return fail(-32602, 'arguments must be an object');
    }
    try {
      const text = await callTool(tool.name, params.arguments ?? {});
      return reply({ content: [{ type: 'text', text }] });
    } catch (err) {
      return reply({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
    }
  }
  return isNotification ? null : fail(-32601, `Method not found: ${method}`);
}

export function startMcpServer({ input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const send = (obj) => output.write(JSON.stringify(obj) + '\n');
  let pending = Promise.resolve();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    // Answer in order; tool calls run one after another.
    pending = pending.then(async () => {
      const res = await handle(msg).catch((err) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: err.message } }));
      if (res && (msg.id !== undefined || res.error)) send(res);
    });
  });
  process.stderr.write(`tape MCP server ${VERSION} ready on stdio\n`);
  return new Promise((r) => rl.on('close', () => pending.then(r)));
}
