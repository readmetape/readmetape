// Approximate text width for Verdana, the font shields.io badges are drawn in.
// Values are Verdana advance widths in font units (2048 units per em), so a
// string's pixel width at size S is sum(units) * S / 2048. Characters outside
// the table fall back to the width of a digit. Kerning is ignored, as in shields.

const UNITS_PER_EM = 2048;
const FALLBACK = 1303;

const TABLE = {
  ' ': 720, '!': 805, '"': 942, '#': 1716, '$': 1303, '%': 2215, '&': 1499, "'": 548,
  '(': 913, ')': 913, '*': 1303, '+': 1716, ',': 745, '-': 913, '.': 745, '/': 913,
  '0': 1303, '1': 1303, '2': 1303, '3': 1303, '4': 1303, '5': 1303, '6': 1303,
  '7': 1303, '8': 1303, '9': 1303, ':': 913, ';': 913, '<': 1716, '=': 1716,
  '>': 1716, '?': 1112, '@': 2048,
  A: 1401, B: 1405, C: 1430, D: 1577, E: 1294, F: 1178, G: 1587, H: 1540, I: 862,
  J: 931, K: 1415, L: 1145, M: 1712, N: 1532, O: 1648, P: 1243, Q: 1648, R: 1430,
  S: 1401, T: 1255, U: 1501, V: 1401, W: 2028, X: 1404, Y: 1255, Z: 1405,
  '[': 913, '\\': 913, ']': 913, '^': 1716, _: 1303, '`': 1303,
  a: 1233, b: 1262, c: 1081, d: 1262, e: 1219, f: 720, g: 1262, h: 1292, i: 562,
  j: 676, k: 1192, l: 562, m: 1985, n: 1292, o: 1240, p: 1262, q: 1262, r: 869,
  s: 1067, t: 788, u: 1292, v: 1192, w: 1663, x: 1192, y: 1192, z: 1056,
  '{': 1300, '|': 913, '}': 1300, '~': 1716,
};

export function charUnits(ch) {
  return TABLE[ch] ?? FALLBACK;
}

// Width in pixels of `text` in Verdana at `size` px (default 11).
export function textWidth(text, { size = 11, bold = false, letterSpacing = 0 } = {}) {
  let units = 0;
  let count = 0;
  for (const ch of String(text)) {
    units += charUnits(ch);
    count++;
  }
  // Verdana Bold is roughly 10% wider than regular.
  const px = (units * size) / UNITS_PER_EM * (bold ? 1.1 : 1);
  return px + letterSpacing * count;
}

// Cards use the system UI font stack (Segoe UI, SF Pro, Helvetica), which
// runs about 12% narrower than Verdana. Slightly generous on purpose.
export function sansWidth(text, size, bold = false) {
  return textWidth(text, { size }) * (bold ? 0.95 : 0.88);
}
