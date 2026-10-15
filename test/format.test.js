import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, formatUsd, formatChange, formatCompact, formatMetric } from '../src/format.js';

test('formatPrice keeps two significant digits below $1', () => {
  assert.equal(formatPrice(0.000042), '$0.000042');
  assert.equal(formatPrice(0.0042), '$0.0042');
  assert.equal(formatPrice(0.12345), '$0.12');
  assert.equal(formatPrice(0.5), '$0.5');
  assert.equal(formatPrice(0.00000000123), '$0.0000000012');
});

test('formatPrice above $1', () => {
  assert.equal(formatPrice(1), '$1.00');
  assert.equal(formatPrice(1234.567), '$1,234.57');
  assert.equal(formatPrice(250000), '$250K');
  assert.equal(formatPrice(0), '$0');
});

test('formatUsd uses K, M, B, T suffixes', () => {
  assert.equal(formatUsd(1200), '$1.2K');
  assert.equal(formatUsd(3_400_000), '$3.4M');
  assert.equal(formatUsd(1_100_000_000), '$1.1B');
  assert.equal(formatUsd(2_000_000_000_000), '$2T');
  assert.equal(formatUsd(950), '$950');
  assert.equal(formatUsd(123_456), '$123K');
  assert.equal(formatUsd(999_999), '$1M');
  assert.equal(formatUsd(5_000), '$5K');
});

test('formatCompact handles negatives and missing values', () => {
  assert.equal(formatCompact(-1500), '-1.5K');
  assert.equal(formatCompact(null), null);
  assert.equal(formatCompact(NaN), null);
});

test('formatChange adds a sign and one decimal', () => {
  assert.equal(formatChange(12.44), '+12.4%');
  assert.equal(formatChange(-3.06), '-3.1%');
  assert.equal(formatChange(0), '+0.0%');
  assert.equal(formatChange(1234.5), '+1,235%');
  assert.equal(formatChange(undefined), null);
});

test('formatMetric builds each metric', () => {
  const t = { symbol: 'X', priceUsd: 0.0042, marketCap: 4_200_000, change24h: 12.4, volume24h: 1_200_000 };
  assert.equal(formatMetric(t, 'all'), '$0.0042 | $4.2M mcap | +12.4%');
  assert.equal(formatMetric(t, 'price'), '$0.0042');
  assert.equal(formatMetric(t, 'mcap'), '$4.2M mcap');
  assert.equal(formatMetric(t, 'change'), '+12.4% 24h');
  assert.equal(formatMetric(t, 'volume'), '$1.2M vol 24h');
  assert.equal(formatMetric(null, 'all'), 'no pair yet');
  assert.equal(formatMetric({ ...t, marketCap: null, fdv: 5e6 }, 'mcap'), '$5M mcap');
  assert.throws(() => formatMetric(t, 'nope'), /Unknown metric/);
});
