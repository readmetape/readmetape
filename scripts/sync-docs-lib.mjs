// Copies the browser-safe modules from src/ to docs/lib/, byte for byte, so
// the site renders cards with exactly the code the CLI and the action use.
// test/site-lib.test.js fails when the copies drift. Run: npm run sync-site
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Every module here must import only other modules in this list, and must
// not touch Node globals at import time.
export const SITE_LIB = ['badge', 'card', 'chart', 'coin', 'dexscreener', 'format', 'gecko', 'http', 'logo', 'render', 'svg', 'theme', 'width'];

export function syncDocsLib(root = fileURLToPath(new URL('..', import.meta.url))) {
  mkdirSync(`${root}docs/lib`, { recursive: true });
  for (const name of SITE_LIB) copyFileSync(`${root}src/${name}.js`, `${root}docs/lib/${name}.js`);
  return SITE_LIB.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`copied ${syncDocsLib()} modules to docs/lib/`);
}
