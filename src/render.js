// One entry point for every output type, shared by the CLI, the action, the
// preview server and the MCP server.
import { renderBadge, renderSpark } from './badge.js';
import { renderCard } from './card.js';
import { renderGrid } from './svg.js';
import { loadCoin } from './coin.js';

export const TYPES = ['badge', 'card', 'spark'];

/**
 * @param {object} coin  loadCoin() result
 * @param {object} opts  { type, theme, colors, label, labelColor, metric, style, logo, hideBorder }
 */
export function render(coin, opts = {}) {
  const type = opts.type ?? 'badge';
  if (type === 'card') return renderCard(coin, opts);
  if (type === 'spark') return renderSpark(coin, opts);
  if (type === 'badge') return renderBadge(coin?.token ?? null, opts);
  throw new Error(`Unknown type "${type}". Use one of: ${TYPES.join(', ')}`);
}

// What a type needs from the network: badges never need candles or logos.
export function loadOptions(type, opts = {}) {
  return { ...opts, chart: type !== 'badge', logo: type === 'card' && opts.logo !== false };
}

/** Loads several tokens (sequentially, to be gentle with rate limits) and renders a grid. */
export async function renderMany(specs, opts = {}) {
  const coins = [];
  for (const spec of specs) coins.push(await loadCoin(spec, loadOptions(opts.type ?? 'card', opts.load)));
  const svgs = coins.map((c) => render(c, opts));
  const columns = opts.columns ?? (opts.type === 'card' || !opts.type ? 2 : 1);
  return { coins, svgs, grid: renderGrid(svgs, { columns, gap: opts.type === 'card' || !opts.type ? 12 : 6 }) };
}
