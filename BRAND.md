# tape brand

- **Name:** tape, always lowercase in the wordmark and in copy
- **Ticker:** $TAPE
- **Pitch:** live coin cards for your README.
- **CLI:** `tape`. **npm:** `readme-tape`.
- **Mark:** a flat roll of tape with a strip pulled off and a torn edge: you tear off a strip and tape your coin's live card to the README.

The full kit (icons, lockups, social images, logo sheet) lives outside this repo. This file covers what the repo itself uses.

## Assets in this repo

| File | What it is |
| --- | --- |
| `assets/icon.png` | App icon, 512 px: cream roll on an amber tile, transparent rounded corners. The primary brand. |
| `assets/coin.png` | Same icon, full bleed, 1000 px. The token image; reads when cropped to a circle. |
| `assets/logo.svg` | The roll alone in amber `#F29E1F`. Favicons, sizes under 32 px, one-colour use. |
| `assets/logo-mono.svg` | The roll in `currentColor`. |
| `assets/banner.png` | GitHub social preview, 1280x640, light (source: `assets/banner.html`). |
| `assets/terminal.svg`, `assets/dashboard.png` | Product shots in the cream look. |
| `docs/preview.png` | readmetape.com builder with example data, 1440x900; the site's social image. |

## Palette

tape is a light brand: warm cream paper, ink text, one amber accent. Espresso is the dark option.

| Role | Cream (default) | Espresso |
| --- | --- | --- |
| Page | `#F6F1E8` | `#17120C` |
| Card | `#FFFDF8` | `#211A12` |
| Raised | `#EFE7D9` | `#2C2318` |
| Line | `#E2D7C3` | `#3A2F22` |
| Text | `#1C1914` | `#F3EADB` |
| Muted | `#7A6F5E` | `#A39580` |
| Accent | `#F29E1F` (fills), `#9A5B00` (text on cream) | `#F29E1F` |
| Up | `#2E7D4F` | `#6CBF8E` |
| Down | `#B3402E` | `#E07A64` |
| Icon roll | `#FFF4DC` | `#FFF4DC` |

Amber does one job per screen: the action, or the key number. Price direction is only ever green or red. Amber buttons carry ink text (`#1C1914`).

## Typography

- **Fraunces** 400 and 600 (plus 400 italic) for headings, prose and the wordmark. Headings tighten to -0.02em to -0.035em.
- **Fragment Mono** for every number, code sample, label and CLI line, with tabular figures and ligatures off.
- Wordmark: `tape` in Fraunces 600, lowercase, tracking -0.02em to -0.04em at display sizes.
- README SVGs cannot load fonts, so the cards name Fraunces and Fragment Mono first and fall back to Iowan Old Style, Palatino or Georgia and the system monospace.

## Shape

6 px radius everywhere, 1 px hairlines instead of shadows, a strict 4/8/12/16/24/32/48/64 spacing scale, generous margins. Layouts are editorial: a wide left column for prose and the product, a narrow right column for data.

## Logo usage

- The icon (amber tile) is the brand at 32 px and up: avatar, token image, app icon, nav, lockups.
- The flat roll is for sizes under 32 px and for one-colour use.
- Clear space: a quarter of the icon height on every side.
- Do not redraw, rotate, add shadows, gradients or outlines, or recolour the icon. The roll alone may be amber, ink, white or `currentColor`.

## Voice

- Say what it does with a number: "renders price, chart and mcap as a 495x195 SVG, refreshed every 30 minutes."
- Lowercase, short, like a dev posting on CT. A command beats an adjective.
- The site leads with the tool: input, one amber button, live preview. Prose and docs sit below it.
- No price talk. tape shows market data; it never predicts or promotes a coin. Example output is always labelled as example data. Not financial advice.
