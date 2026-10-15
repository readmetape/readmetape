// Local stand-in for the Vercel deployment: serves docs/ as static files and
// routes /api/<name> to the default export of api/<name>.js, like Vercel does.
//
//   node scripts/dev-site.mjs            live APIs
//   node scripts/dev-site.mjs --mock     fixtures/mock-api.js instead of DexScreener and GeckoTerminal
//   node scripts/dev-site.mjs --port 4180
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = join(root, 'docs');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon',
};

export async function startDevSite({ port = 4180, host = '127.0.0.1', mock = false } = {}) {
  let api = null;
  if (mock) {
    const { startMockApi, mockEnv } = await import('../fixtures/mock-api.js');
    api = await startMockApi();
    Object.assign(process.env, mockEnv(api.url));
  }
  const handlers = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const fn = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/);
      if (fn) {
        const file = join(root, 'api', `${fn[1]}.js`);
        if (!existsSync(file)) return void res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
        if (!handlers.has(file)) handlers.set(file, (await import(pathToFileURL(file).href)).default);
        return await handlers.get(file)(req, res);
      }
      let path = normalize(join(docs, decodeURIComponent(url.pathname)));
      if (!path.startsWith(docs + sep) && path !== docs) return void res.writeHead(403).end();
      if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
      const body = await readFile(path).catch(() => null);
      if (!body) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err?.stack || err));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const url = `http://${host}:${server.address().port}`;
  return {
    server,
    url,
    port: server.address().port,
    api,
    // The page only honours ?api= on localhost; it points the browser at the mock.
    pageUrl: (query = '') => `${url}/${api ? `?api=${encodeURIComponent(api.url)}${query ? `&${query}` : ''}` : query ? `?${query}` : ''}`,
    close: async () => {
      await new Promise((r) => server.close(r));
      await api?.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--port');
  const site = await startDevSite({ mock: args.includes('--mock'), port: i >= 0 ? Number(args[i + 1]) : 4180 });
  console.log(`tape site running at ${site.pageUrl()}`);
  if (site.api) console.log(`mock DexScreener and GeckoTerminal at ${site.api.url} (example token DemoMint1111111111111111111111111111111111)`);
}
