// Shared SVG helpers.
// SVGs in a README cannot load web fonts, so every family is a stack that
// falls back to fonts the reader already has.
export const FONT_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
export const FONT_SERIF = "Fraunces,'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
export const FONT_MONO = "'Fragment Mono',ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Short stable id prefix (FNV-1a), so several SVGs can be nested in one grid
// without their gradient and clip-path ids colliding.
export function idPrefix(...parts) {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'pt' + h.toString(36);
}

// Removes parts of an SVG that change on every run (the "updated" time), so
// the action can tell whether anything the reader cares about has changed.
export function stableSvg(svg) {
  return String(svg ?? '').replace(/(<text[^>]*data-pt="updated"[^>]*>)[^<]*(<\/text>)/g, '$1$2');
}

export function svgSize(svg) {
  const head = String(svg).match(/<svg\b[^>]*>/)?.[0] ?? '';
  const w = Number(head.match(/\swidth="([\d.]+)"/)?.[1]);
  const h = Number(head.match(/\sheight="([\d.]+)"/)?.[1]);
  return { width: w || 0, height: h || 0 };
}

/**
 * Lays several SVGs out in a grid inside one SVG. Each child keeps its own
 * coordinate system as a nested <svg>.
 */
export function renderGrid(svgs, { columns = 2, gap = 12, title = 'Tape coins' } = {}) {
  if (!svgs.length) throw new Error('renderGrid needs at least one SVG');
  const cols = Math.max(1, Math.min(columns, svgs.length));
  const sizes = svgs.map(svgSize);
  const colW = Math.max(...sizes.map((s) => s.width));
  const rows = Math.ceil(svgs.length / cols);
  const rowH = [];
  sizes.forEach((s, i) => {
    const r = Math.floor(i / cols);
    rowH[r] = Math.max(rowH[r] ?? 0, s.height);
  });
  const width = cols * colW + (cols - 1) * gap;
  const height = rowH.reduce((a, b) => a + b, 0) + (rows - 1) * gap;
  const children = svgs.map((svg, i) => {
    const x = (i % cols) * (colW + gap);
    const r = Math.floor(i / cols);
    const y = rowH.slice(0, r).reduce((a, b) => a + b, 0) + r * gap;
    return String(svg).trim().replace(/^<svg\b([^>]*)>/, (m, attrs) => {
      const kept = attrs.replace(/\s(xmlns(:xlink)?|role|aria-label)="[^"]*"/g, '');
      return `<svg x="${x}" y="${y}"${kept}>`;
    });
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>${children.join('')}</svg>\n`
  );
}
