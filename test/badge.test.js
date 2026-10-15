import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBadge, badgeColor, escapeXml, COLORS, STYLES } from '../src/badge.js';
import { textWidth, charUnits } from '../src/width.js';
import { assertWellFormed } from '../fixtures/svg-check.js';

const up = { symbol: 'DEMO', priceUsd: 0.0042, marketCap: 4_200_000, change24h: 12.4, volume24h: 1e6 };
const down = { ...up, change24h: -8.3 };

test('width table matches Verdana proportions', () => {
  assert.equal(charUnits('0'), 1303);
  assert.ok(charUnits('i') < charUnits('m'));
  assert.equal(charUnits('一'), 1303, 'unknown chars use the fallback');
  // "Hello" at 11px Verdana is about 29px; shields measures 28.5 to 29.
  const w = textWidth('Hello');
  assert.ok(w > 27 && w < 31, `got ${w}`);
  assert.ok(textWidth('abc', { bold: true }) > textWidth('abc'));
  assert.equal(textWidth('ab', { letterSpacing: 2 }), textWidth('ab') + 4);
});

test('color logic', () => {
  assert.equal(badgeColor(up), COLORS.up);
  assert.equal(badgeColor({ change24h: 0 }), COLORS.up);
  assert.equal(badgeColor(down), COLORS.down);
  assert.equal(badgeColor(null), COLORS.none);
  assert.equal(badgeColor({ priceUsd: 1, change24h: null }), COLORS.none);
});

test('every style renders well-formed SVG with the values', () => {
  for (const style of STYLES) {
    const svg = renderBadge(up, { style, logo: 'solana' });
    assertWellFormed(svg);
    const ftb = style === 'for-the-badge';
    assert.ok(svg.includes('>$DEMO<'));
    assert.ok(svg.includes(ftb ? '$0.0042 | $4.2M MCAP | +12.4%' : '$0.0042 | $4.2M mcap | +12.4%'), style);
    assert.ok(svg.includes(COLORS.up));
    assert.match(svg, ftb ? /height="28"/ : /height="20"/);
  }
});

test('flat has rounded corners and gradient, flat-square does not', () => {
  const flat = renderBadge(up, { style: 'flat' });
  const square = renderBadge(up, { style: 'flat-square' });
  assert.match(flat, /rx="3"/);
  assert.match(flat, /linearGradient/);
  assert.doesNotMatch(square, /rx="3"|linearGradient/);
});

test('badge width grows with text so labels fit', () => {
  const short = renderBadge(up, { metric: 'price' });
  const long = renderBadge(up, { metric: 'all' });
  const width = (s) => Number(s.match(/width="(\d+)"/)[1]);
  assert.ok(width(long) > width(short) + 50);
  const est = Math.ceil(textWidth('$DEMO')) + Math.ceil(textWidth('$0.0042')) + 20;
  assert.equal(width(short), est);
});

test('negative change is red, missing data is grey with "no pair yet"', () => {
  assert.ok(renderBadge(down).includes(COLORS.down));
  const none = renderBadge(null);
  assertWellFormed(none);
  assert.ok(none.includes('no pair yet'));
  assert.ok(none.includes(COLORS.none));
  assert.ok(none.includes('>coin<'));
});

test('custom labels are escaped', () => {
  const svg = renderBadge(up, { label: 'A&B <x>' });
  assertWellFormed(svg);
  assert.ok(svg.includes('A&amp;B &lt;x&gt;'));
  assert.equal(escapeXml(`"'`), '&quot;&apos;');
});

test('logos and validation', () => {
  assert.match(renderBadge(up, { logo: 'ethereum' }), /<path/);
  assert.doesNotMatch(renderBadge(up), /<path/);
  assert.throws(() => renderBadge(up, { style: 'plastic' }), /Unknown style/);
  assert.throws(() => renderBadge(up, { logo: 'doge' }), /Unknown logo/);
});
