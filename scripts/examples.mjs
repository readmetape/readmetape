// Regenerates examples/*.svg by running the real CLI against the mock APIs in
// fixtures/. All values are made-up example data.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startMockApi, mockEnv, MINT } from '../fixtures/mock-api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const api = await startMockApi();
const env = { ...process.env, ...mockEnv(api.url) };
const LOOM = 'LoomMint2222222222222222222222222222222222';
const RIVET = 'base:0x7a3f1e0000000000000000000000000000c0ffee';
const KILN = 'bsc:0x2b8e900000000000000000000000000000000bee';
const runs = [
  ['card-cream.svg', [MINT, '--type', 'card', '--theme', 'cream']],
  ['card-espresso.svg', [MINT, '--type', 'card', '--theme', 'espresso']],
  ['card-cream-dev.svg', [MINT, '--type', 'card', '--theme', 'cream', '--label', 'paid to dev', '--timeframe', '7d']],
  ['card-espresso-down.svg', [RIVET, '--type', 'card', '--theme', 'espresso']],
  ['card-dark.svg', [MINT, '--type', 'card']],
  ['card-light.svg', [MINT, '--type', 'card', '--theme', 'light']],
  ['card-github-dark.svg', [MINT, '--type', 'card', '--theme', 'github_dark']],
  ['card-transparent.svg', [MINT, '--type', 'card', '--theme', 'transparent']],
  ['card-dev.svg', [MINT, '--type', 'card', '--label', 'paid to dev', '--timeframe', '7d']],
  ['card-down.svg', [RIVET, '--type', 'card']],
  ['card-custom.svg', [KILN, '--type', 'card', '--bg', '1a1033', '--border', '3b2a66', '--accent', 'f2cc60', '--muted', 'a89cc8']],
  ['grid.svg', [`${MINT},${LOOM},${RIVET},${KILN}`, '--type', 'card', '--theme', 'cream']],
  ['spark.svg', [MINT, '--type', 'spark', '--logo', 'solana']],
  ['spark-change.svg', [RIVET, '--type', 'spark', '--metric', 'change']],
  ['spark-dev.svg', [MINT, '--type', 'spark', '--style', 'for-the-badge', '--label', 'paid to dev', '--label-color', '9a5b00']],
  ['badge-all.svg', [MINT, '--logo', 'solana']],
  ['badge-price.svg', [MINT, '--metric', 'price']],
  ['badge-mcap.svg', [MINT, '--metric', 'mcap', '--style', 'flat-square']],
  ['badge-down.svg', [RIVET, '--metric', 'change']],
  ['badge-dev.svg', [MINT, '--metric', 'price', '--label', 'paid to dev', '--label-color', '9a5b00']],
  ['badge-no-pair.svg', ['NoPair1111111111111111111111111111111111', '--metric', 'price']],
];
mkdirSync(`${root}examples`, { recursive: true });
for (const [file, args] of runs) {
  // Async on purpose: the mock server runs in this process.
  const { stderr } = await promisify(execFile)(process.execPath, [`${root}bin/tape.js`, ...args, '--out', `examples/${file}`], { env, cwd: root });
  process.stderr.write(stderr);
}
await api.close();
