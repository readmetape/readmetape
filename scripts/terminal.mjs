// Builds assets/terminal.svg from real CLI runs against the mock APIs.
// Usage: node scripts/terminal.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockApi, mockEnv, MINT } from '../fixtures/mock-api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const api = await startMockApi();
const cwd = mkdtempSync(join(tmpdir(), 'tape-term-'));
const env = { ...process.env, ...mockEnv(api.url), FORCE_COLOR: '1' };
const RIVET = '0x7a3f1e0000000000000000000000000000c0ffee';
const sessions = [
  ['npx readme-tape quote $MINT', ['quote', MINT]],
  ['npx readme-tape $MINT --type card --label "paid to dev" --out .github/tape.svg', [MINT, '--type', 'card', '--label', 'paid to dev', '--out', '.github/tape.svg']],
  ['npx readme-tape $MINT,base:$RIVET --type card --out .github/coins.svg', [`${MINT},base:${RIVET}`, '--type', 'card', '--out', '.github/coins.svg']],
];
// The session starts by setting the two example addresses as shell variables.
const lines = [`\x1b[35m$\x1b[0m MINT=${MINT} RIVET=${RIVET}`, ''];
for (const [shown, args] of sessions) {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [`${root}bin/tape.js`, ...args], { env, cwd });
  lines.push(`\x1b[35m$\x1b[0m ${shown}`, ...(stdout + stderr).trimEnd().split('\n'), '');
}
await api.close();
lines.pop();

const COLORS = { 1: null, 31: '#B3402E', 32: '#2E7D4F', 35: '#9A5B00', 90: '#7A6F5E' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function line(text, y) {
  let out = '';
  let fill = null;
  let bold = false;
  for (const part of text.split(/(\x1b\[\d+m)/)) {
    const m = part.match(/^\x1b\[(\d+)m$/);
    if (m) {
      const c = Number(m[1]);
      if (c === 0) { fill = null; bold = false; } else if (c === 1) bold = true; else fill = COLORS[c] ?? null;
      continue;
    }
    if (!part) continue;
    out += `<tspan${fill ? ` fill="${fill}"` : ''}${bold ? ' font-weight="700"' : ''}>${esc(part)}</tspan>`;
  }
  return `<text x="24" y="${y}" xml:space="preserve">${out}</text>`;
}
const W = 920;
const LH = 20;
const H = 64 + lines.length * LH + 16;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="tape terminal session with example data">
<title>tape terminal session (example data)</title>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="6" fill="#FFFDF8" stroke="#E2D7C3"/>
<path d="M.5 36.5H${W - 0.5}" stroke="#E2D7C3"/>
<circle cx="22" cy="18.5" r="4.5" fill="none" stroke="#D3C5AC"/><circle cx="38" cy="18.5" r="4.5" fill="none" stroke="#D3C5AC"/><circle cx="54" cy="18.5" r="4.5" fill="none" stroke="#D3C5AC"/>
<text x="${W / 2}" y="23" text-anchor="middle" font-family="Fraunces,'Iowan Old Style','Palatino Linotype',Georgia,serif" font-style="italic" font-size="13" fill="#7A6F5E">tape, example data</text>
<g font-family="'Fragment Mono',ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace" font-size="13" fill="#1C1914" style="font-variant-ligatures:none">
${lines.map((l, i) => line(l, 62 + i * LH)).join('\n')}
</g>
</svg>
`;
writeFileSync(`${root}assets/terminal.svg`, svg);
console.log(lines.join('\n'));
