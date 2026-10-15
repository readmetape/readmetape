// Token logos are embedded in the SVG as base64 data URIs, because GitHub
// serves README images through a proxy that blocks external references.
import { getBytes } from './http.js';

export const MAX_LOGO_BYTES = 96 * 1024;

// Only raster formats, recognised by their magic bytes (SVG logos are skipped
// on purpose: they can carry scripts and external references).
export function sniffImage(bytes) {
  const b = bytes;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function toDataUri(bytes) {
  const type = sniffImage(bytes);
  if (!type) throw new Error('Logo is not a PNG, JPEG, GIF or WebP image');
  return `data:${type};base64,${bytes.toString('base64')}`;
}

/** Resolves to a data URI, or null when the logo is missing or unusable. */
export async function fetchLogo(url, { maxBytes = MAX_LOGO_BYTES, timeoutMs = 8000, onWarning } = {}) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const { bytes } = await getBytes(url, { maxBytes, timeoutMs, service: 'logo host' });
    return toDataUri(bytes);
  } catch (err) {
    onWarning?.(`Logo skipped (${err.message}); using a monogram instead.`);
    return null;
  }
}
