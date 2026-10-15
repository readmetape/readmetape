// End to end: the real page in headless Chromium against the mock APIs.
// Skipped when Playwright or Chromium is not installed (set TAPE_PLAYWRIGHT
// and TAPE_CHROMIUM to point at them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MINT } from '../fixtures/mock-api.js';
import { startDevSite } from '../scripts/dev-site.mjs';

const PW = process.env.TAPE_PLAYWRIGHT || '/home/claude/src-reels/tools/node_modules/playwright/index.mjs';
const CHROMIUM = process.env.TAPE_CHROMIUM || '/opt/pw-browsers/chromium';
const available = existsSync(PW) && existsSync(CHROMIUM);

test('builder works end to end in a browser', { skip: !available && 'playwright or chromium not installed', timeout: 60000 }, async (t) => {
  const { chromium } = await import(PW);
  const site = await startDevSite({ port: 0, mock: true });
  site.api.routes.Limited111111111111111111111111111111111 = { status: 429, body: {} };
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  t.after(async () => {
    await browser.close();
    await site.close();
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  const stage = page.locator('#stage');

  // Empty state: the example card, no horizontal scroll at 390px.
  await page.goto(site.pageUrl());
  assert.equal(await stage.getAttribute('data-state'), 'example');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at 390px');

  // Type, click, see the card.
  await page.fill('#token', MINT);
  await page.click('#go');
  await page.waitForSelector('#stage[data-state="ok"] svg');
  assert.match(await stage.innerHTML(), /\$DEMO/);
  assert.equal(await page.textContent('[data-k="price"]'), '$0.0042');
  assert.match(await page.textContent('#md-hosted'), new RegExp(`https://readmetape.com/api/card\\?chain=solana&token=${MINT}&theme=cream`));
  assert.match(page.url(), new RegExp(`token=${MINT}`));

  // Options re-render without a reload and land in the URL and the embeds.
  await page.fill('#label', 'paid to dev');
  await page.click('[data-key="theme"] [data-v="espresso"]');
  await page.waitForFunction(() => document.querySelector('#stage svg')?.innerHTML.includes('paid to dev'));
  assert.equal(await page.getAttribute('#plate', 'data-bg'), 'espresso');
  assert.match(page.url(), /theme=espresso/);
  await page.click('[data-key="type"] [data-v="badge"]');
  await page.click('[data-for="badge"] [data-v="mcap"]');
  await page.waitForFunction(() => /\$4\.2M/.test(document.querySelector('#stage svg')?.innerHTML ?? ''));
  assert.match(await page.textContent('#url-hosted'), /\/api\/badge\?chain=solana&token=\w+&metric=mcap&label=paid%20to%20dev$/);
  await page.click('#tab-action');
  assert.match(await page.textContent('#yaml-action'), /type: badge\n\s+metric: mcap/);
  assert.equal(await page.isVisible('#p-hosted'), false);

  // Shareable URL auto-runs on load, including the 7d window.
  await page.goto(site.pageUrl(`token=${MINT}&type=spark&timeframe=7d`));
  await page.waitForSelector('#stage[data-state="ok"] svg');
  assert.equal(await page.inputValue('#token'), MINT);
  assert.equal(await page.getAttribute('[data-key="type"] [data-v="spark"]', 'aria-pressed'), 'true');

  // Error states with human messages.
  await page.goto(site.pageUrl());
  await page.fill('#token', '0x7a3f1e0000000000000000000000000000c0ffee');
  await page.click('#go');
  await page.waitForSelector('#stage[data-state="error"]');
  assert.match(await stage.textContent(), /EVM address/);
  await page.goto(site.pageUrl('token=Limited111111111111111111111111111111111'));
  await page.waitForSelector('#stage[data-state="error"]');
  assert.match(await stage.textContent(), /rate limiting this browser/);
  await page.goto(site.pageUrl('token=NoPair1111111111111111111111111111111111'));
  await page.waitForSelector('#stage[data-state="nopair"]');
  assert.match(await page.textContent('#note'), /no trading pair/);

  // The example link fills a real token (the mock answers it with no pair).
  await page.goto(site.pageUrl());
  await page.click('#example');
  await page.waitForSelector('#stage[data-state="nopair"], #stage[data-state="ok"]');
  assert.equal(await page.inputValue('#token'), 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');

  assert.deepEqual(errors, []);
});
