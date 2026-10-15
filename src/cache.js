// Optional JSON cache for OHLCV candles, kept in the repository between action
// runs. A fresh entry skips the GeckoTerminal request; a stale entry is used as
// a fallback when GeckoTerminal is rate limited or down.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const VERSION = 1;
const MAX_ENTRIES = 50;

function serialize(data) {
  // One candle per line keeps diffs readable when the file is committed.
  const entries = Object.entries(data.entries).map(([key, e]) => {
    const rows = e.candles.map((c) => '        ' + JSON.stringify(c)).join(',\n');
    return `    ${JSON.stringify(key)}: {\n      "fetchedAt": ${JSON.stringify(e.fetchedAt)},\n      "candles": [\n${rows}\n      ]\n    }`;
  });
  return `{\n  "version": ${VERSION},\n  "entries": {\n${entries.join(',\n')}\n  }\n}\n`;
}

export function openCache(file) {
  let original = null;
  let data = { version: VERSION, entries: {} };
  if (file && existsSync(file)) {
    original = readFileSync(file, 'utf8');
    try {
      const parsed = JSON.parse(original);
      if (parsed?.version === VERSION && parsed.entries && typeof parsed.entries === 'object') data = parsed;
    } catch {
      // A broken cache file is ignored and rewritten.
    }
  }
  return {
    file,
    /** Returns { candles, ageMs } or null. */
    get(key, now = Date.now()) {
      const e = data.entries[key];
      if (!e || !Array.isArray(e.candles)) return null;
      return { candles: e.candles, ageMs: now - Date.parse(e.fetchedAt) };
    },
    set(key, candles, now = Date.now()) {
      data.entries[key] = { fetchedAt: new Date(now).toISOString(), candles };
      const keys = Object.keys(data.entries);
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete data.entries[k];
    },
    /** Writes the file when the content changed. Returns true if written. */
    save() {
      if (!file) return false;
      const text = serialize(data);
      if (text === original) return false;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      original = text;
      return true;
    },
  };
}
