# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-14

### Added

- readmetape.com is now the product: a live card builder above the fold. Paste a token (any DexScreener chain), pick card, spark or badge, theme, timeframe, metric, style and label, and the preview renders in the browser from DexScreener and GeckoTerminal with tape's own renderer. Loading, empty, error (rate limited, not found, bad address, wrong chain) and "no pair yet" states, a ledger of the token's numbers, four README backgrounds, shareable URLs (`?token=...&type=...`) that run on load, and a one-click example token.
- Hosted endpoints `/api/card`, `/api/spark` and `/api/badge` that answer `image/svg+xml` with a 5 minute CDN cache, so a README needs one line and no Action. The builder offers that line or the GitHub Action workflow, both filled in with your options.
- `scripts/dev-site.mjs` (`npm run site`, `npm run site:mock`): serves `docs/` and the `/api` handlers locally the way Vercel does.
- `docs/lib/`: byte-for-byte copies of the browser-safe modules in `src/` (`npm run sync-site`), checked by a test.
- Tests for the browser data layer, the hosted handlers (headers, validation, logo host checks, memo, upstream errors) and an end to end browser test of the builder against the mock APIs.

### Changed

- `shield()` in `src/badge.js` is exported, for the endpoints' error badges.
- The mock APIs in `fixtures/` send `access-control-allow-origin: *` so the site can call them from a browser.

## [1.0.0] - 2026-10-14

Released as **Tape** (npm package `readme-tape`, CLI `tape`, ticker $TAPE). The project was called coin-badge in 0.1.0.

### Added

- Coin card SVG (495x195) in the style of GitHub's UI: token logo embedded as a data URI (PNG, JPEG, GIF or WebP, at most 96 KB) or a generated monogram, symbol, name, chain and DEX, price, change pill, area chart, market cap, liquidity, 24h volume and an "updated" time.
- Card themes `cream` and `espresso` in tape's editorial layout (serif symbol, mono figures, hairline rules, no pills), and `dark`, `light`, `github_dark` and `transparent` in the compact layout, plus colour overrides (`--bg`, `--border`, `--text`, `--muted`, `--accent`, `--up`, `--down` or `--colors`) and `--hide-border`.
- `--label` chip on cards and label colour on badges for coins whose fees go to the developer, for example "paid to dev".
- Compact sparkline badge (`--type spark`) in all three badge styles.
- Charts from GeckoTerminal OHLCV for the most liquid pool: `--timeframe 24h` (96 candles of 15 minutes) or `7d` (42 candles of 4 hours). The 7d change is computed from the candles.
- Several tokens in one run (`token,chain:token`) rendered to separate files and an optional grid SVG.
- `tape quote` with a Unicode sparkline, and `--json` for raw data.
- `tape ui`: local preview gallery of every style and theme with a builder form and copy-paste markdown, workflow and CLI snippets.
- `tape mcp`: Model Context Protocol server over stdio with the tools `token_quote`, `render_card`, `render_badge` and `chart_points`.
- Action inputs `tokens`, `type`, `theme`, `timeframe`, `colors`, `hide-border`, `token-logo`, `label-color`, `paths`, `grid`, `columns`, `cache`, `cache-ttl` and `commit-message`; outputs `paths`, `changed`, `committed` and `data`.
- Optional JSON cache of chart data in the repository: fresh entries skip a GeckoTerminal request, old entries are used when GeckoTerminal is rate limited or down.
- Retries with exponential backoff and `Retry-After` support for HTTP 429 and 5xx responses from both APIs.
- `cream` uses the tape palette (card `#FFFDF8`, text `#1C1914`, dark amber `#9A5B00`, up `#2E7D4F`, down `#B3402E`), `espresso` its dark counterpart (`#211A12`, amber `#F29E1F`). `dark` keeps a neutral near-black with the amber accent, `github_dark` keeps GitHub's Primer colours.
- `tape ui`: an editorial dashboard in cream with an espresso mode, a ledger of the token's numbers, live previews on four README backgrounds, and loading, empty and error states. It serves Fraunces and Fragment Mono locally, so the page makes no external requests.
- Brand kit, landing page in `docs/`, CI for Node 20 and 22 that also renders `examples/`, issue and pull request templates, security policy and code of conduct.

### Changed

- The action's default output is now a card at `.github/tape.svg` (was a badge at `.github/coin-badge.svg`). Set `type: badge` and `path` to keep the old output.
- The action commits only when what an SVG shows changes; a new "updated" time alone does not produce a commit.
- Default commit message is `chore: update tape`.
- Environment variable `COIN_BADGE_API` is replaced by `TAPE_DEXSCREENER_API`; `TAPE_GECKO_API` is new.
- Gradient and clip-path ids in badges are now unique per badge, so several badges can share one SVG.

## [0.1.0] - 2026-10-14

### Added

- GitHub Action that writes a market data badge to the repository and commits it only when it changed.
- `coin-badge` CLI with `--metric`, `--style`, `--label`, `--logo`, `--out` and `--json`.
- Programmatic API: `fetchToken` and `renderBadge`.
- DexScreener client that picks the most liquid pair for a token.
- Badge styles `flat`, `flat-square` and `for-the-badge`, with a built-in Verdana width table.
- Optional Solana and Ethereum icons.
