// Small fetch wrapper: timeouts, retries with backoff on HTTP 429 and 5xx,
// Retry-After support, and a byte limit for binary downloads.
const UA = 'tape (+https://github.com/OWNER/tape)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseDelay() {
  const v = Number(process.env.TAPE_RETRY_BASE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 800;
}

// Seconds or an HTTP date, capped so a hostile header cannot stall a run.
export function retryAfterMs(header, capMs = 15000) {
  if (!header) return null;
  const secs = Number(header);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), capMs) : null;
}

/**
 * fetch() with retries. Resolves to an ok Response; rejects with a readable
 * error (err.status is set for HTTP errors, err.code = 'RATE_LIMITED' on 429).
 */
export async function request(url, { service = 'API', retries = 3, timeoutMs = 10000, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': UA, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : err?.cause?.message || err.message;
      if (attempt < retries && err?.name !== 'TimeoutError') {
        await sleep(baseDelay() * 2 ** attempt);
        continue;
      }
      throw new Error(`Could not reach ${service} (${url}): ${reason}`);
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const wait = retryAfterMs(res.headers.get('retry-after')) ?? baseDelay() * 2 ** attempt + Math.random() * 100;
      await res.body?.cancel().catch(() => {});
      await sleep(wait);
      continue;
    }
    const err = new Error(
      res.status === 429
        ? `${service} rate limit hit (HTTP 429) after ${attempt + 1} attempts. Try again in a minute.`
        : `${service} returned HTTP ${res.status} for ${url}`,
    );
    err.status = res.status;
    if (res.status === 429) err.code = 'RATE_LIMITED';
    throw err;
  }
}

export async function getJson(url, opts = {}) {
  const res = await request(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
  try {
    return await res.json();
  } catch {
    throw new Error(`${opts.service || 'API'} returned invalid JSON for ${url}`);
  }
}

// Downloads at most maxBytes; rejects when the body is larger.
export async function getBytes(url, { maxBytes = 65536, ...opts } = {}) {
  const res = await request(url, { retries: 1, ...opts });
  const declared = Number(res.headers.get('content-length'));
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`File is ${declared} bytes, over the ${maxBytes} byte limit`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`File is over the ${maxBytes} byte limit`);
    chunks.push(chunk);
  }
  return { bytes: Buffer.concat(chunks), contentType: res.headers.get('content-type') || '' };
}
