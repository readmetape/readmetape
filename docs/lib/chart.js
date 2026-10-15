// Sparkline geometry: candles -> points -> smooth SVG paths.

const r2 = (n) => Math.round(n * 100) / 100;

// Close prices with timestamps, the series every chart is drawn from.
export function chartPoints(candles) {
  return (candles ?? []).map((c) => ({ t: c[0], price: c[4] }));
}

/** Maps values into a box. A flat series sits in the middle. */
export function scale(values, { x = 0, y = 0, w, h }) {
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return values.map((v, i) => [
    x + (n === 1 ? w : (i / (n - 1)) * w),
    span > 0 ? y + h - ((v - min) / span) * h : y + h / 2,
  ]);
}

// Monotone cubic interpolation (Fritsch-Carlson): smooth, but never
// overshoots, so the line does not invent highs or lows that did not happen.
export function smoothPath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  if (n === 2) return `M${r2(pts[0][0])} ${r2(pts[0][1])}L${r2(pts[1][0])} ${r2(pts[1][1])}`;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    slope[i] = dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0;
  }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  m[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${r2(pts[i][0] + h)} ${r2(pts[i][1] + m[i] * h)} ${r2(pts[i + 1][0] - h)} ${r2(pts[i + 1][1] - m[i + 1] * h)} ${r2(pts[i + 1][0])} ${r2(pts[i + 1][1])}`;
  }
  return d;
}

/**
 * Line and area paths for a series inside a box. The area closes along the
 * bottom edge of the box (or at bottomY). Returns null when there are fewer than 2 values.
 */
export function sparkPaths(values, box, bottomY = box.y + box.h) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const pts = scale(clean, box);
  const line = smoothPath(pts);
  const bottom = r2(bottomY);
  const area = `${line}L${r2(pts[pts.length - 1][0])} ${bottom}L${r2(pts[0][0])} ${bottom}Z`;
  return { line, area, first: pts[0], last: pts[pts.length - 1], points: pts };
}
