// Card themes. `cream` and `espresso` are the tape house style: an editorial
// layout with a serif symbol, mono numbers and hairline rules. `dark`, `light`
// and `github_dark` use the compact GitHub-style layout so cards sit naturally
// in any README. `transparent` keeps mid tones that read on both.
export const THEMES = {
  dark: {
    bg: '#0F0F12', border: '#2A2A30', text: '#F2F2F3', muted: '#8B8B93',
    accent: '#F29E1F', up: '#3DDC84', down: '#FF5F6D', grid: '#1C1C21',
  },
  light: {
    bg: '#FFFFFF', border: '#D1D9E0', text: '#1F2328', muted: '#59636E',
    accent: '#9A6700', up: '#1A7F37', down: '#D1242F', grid: '#EFF2F5',
  },
  github_dark: {
    bg: '#151B23', border: '#3D444D', text: '#F0F6FC', muted: '#9198A1',
    accent: '#4493F8', up: '#3FB950', down: '#F85149', grid: '#262C36',
  },
  // Mid tones that stay readable on both a light and a dark README.
  transparent: {
    bg: 'none', border: '#8B949E66', text: '#7D8590', muted: '#8B949E',
    accent: '#D99A00', up: '#2DA44E', down: '#E5534B', grid: '#8B949E33',
  },
  cream: {
    bg: '#FFFDF8', border: '#E2D7C3', text: '#1C1914', muted: '#7A6F5E',
    accent: '#9A5B00', up: '#2E7D4F', down: '#B3402E', grid: '#EFE7D9', editorial: true,
  },
  espresso: {
    bg: '#211A12', border: '#3A2F22', text: '#F3EADB', muted: '#A39580',
    accent: '#F29E1F', up: '#6CBF8E', down: '#E07A64', grid: '#2C2318', editorial: true,
  },
};

export const THEME_NAMES = Object.keys(THEMES);
export const COLOR_KEYS = ['bg', 'border', 'text', 'muted', 'accent', 'up', 'down'];

export function normalizeColor(value, key) {
  const v = String(value).trim().replace(/^#/, '');
  if (v === 'none' || v === 'transparent') return 'none';
  if (!/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
    throw new Error(`Invalid colour for "${key}": "${value}" (use hex like fffdf8 or #F29E1F)`);
  }
  return `#${v.toUpperCase()}`;
}

// "bg=fffdf8,accent=f29e1f" -> { bg: '#FFFDF8', accent: '#F29E1F' }
export function parseColors(str) {
  const out = {};
  for (const part of String(str ?? '').split(/[,\s]+/).filter(Boolean)) {
    const [k, v] = part.split('=');
    if (!COLOR_KEYS.includes(k) || v === undefined) {
      throw new Error(`Invalid colour override "${part}". Use key=hex with keys: ${COLOR_KEYS.join(', ')}`);
    }
    out[k] = v;
  }
  return out;
}

export function resolveTheme(name = 'dark', overrides = {}) {
  const base = THEMES[name];
  if (!base) throw new Error(`Unknown theme "${name}". Use one of: ${THEME_NAMES.join(', ')}`);
  const theme = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null || v === '') continue;
    if (!COLOR_KEYS.includes(k)) throw new Error(`Unknown colour key "${k}". Use: ${COLOR_KEYS.join(', ')}`);
    theme[k] = normalizeColor(v, k);
  }
  return theme;
}
