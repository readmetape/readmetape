// Starts the mock APIs from fixtures/ and `tape ui` against them, for
// screenshots and local development without network access.
// Usage: node scripts/demo.mjs [port]
import { startMockApi, mockEnv, MINT } from '../fixtures/mock-api.js';

const api = await startMockApi();
Object.assign(process.env, mockEnv(api.url));
const { startUi } = await import('../src/ui.js');
const { url } = await startUi({ port: Number(process.argv[2] ?? 4178), token: MINT, chain: 'solana' });
console.log(`tape ui with example data running at ${url}`);
