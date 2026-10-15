# Contributing to tape

tape is small on purpose: one package, no dependencies, an action that runs straight from `src/`. Contributions that keep it that way are the easiest to merge.

## Getting a working copy

```sh
git clone https://github.com/OWNER/tape.git
cd tape
npm test            # about 70 tests, all offline
npm run demo        # tape ui on example data at http://127.0.0.1:4178
```

Node 18 or newer. There is nothing to install.

## Where things live

| Path | What it holds |
| --- | --- |
| `src/card.js` | The card. The compact layout and the editorial layout (`cream`, `espresso`) live side by side. |
| `src/badge.js` | Shields-style badges and the sparkline badge. |
| `src/theme.js` | Every theme and the colour override parser. |
| `src/coin.js`, `dexscreener.js`, `gecko.js`, `logo.js` | Data loading: pair choice, candles, logo inlining. |
| `src/cli.js`, `action.js`, `mcp.js`, `ui.js` | The four front ends. `ui.html` and `fonts/` are served by `ui.js`. |
| `fixtures/` | Mock DexScreener, GeckoTerminal and logo servers, plus the SVG checks. Not run as tests. |
| `docs/` | readmetape.com: `index.html`, `app.js` (the page), `web.js` (data and embeds, no DOM) and `lib/`, a copy of the browser-safe `src/` modules. |
| `api/` | Vercel functions `/api/card`, `/api/spark`, `/api/badge`; shared code in `_tape.js`. |
| `scripts/` | `demo.mjs`, `examples.mjs` (rebuilds `examples/`), `terminal.mjs` (rebuilds `assets/terminal.svg`), `dev-site.mjs` (local site, `--mock` for example data), `sync-docs-lib.mjs` (`npm run sync-site`). |

## Three rules

1. **No dependencies.** Node built-ins only. If you need a helper, write the twenty lines.
2. **Tests run offline.** Point the clients at the mocks in `fixtures/mock-api.js` through `TAPE_DEXSCREENER_API` and `TAPE_GECKO_API`. A test that needs the internet will not be merged.
3. **Output changes are visible.** If a card, badge or terminal frame looks different after your change, run `npm run examples`, `node scripts/terminal.mjs` and `npm run sync-site`, commit the results, and add a line to `CHANGELOG.md`.

SVGs must stay GitHub safe: no scripts, no `<style>` element, no `foreignObject`, no external references. `fixtures/svg-check.js` fails the build otherwise.

## Opening a pull request

Say what changed and why in a few lines. Before and after screenshots help for anything visual. One topic per pull request keeps review quick.
