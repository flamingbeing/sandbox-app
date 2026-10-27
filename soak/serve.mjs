// The e2e server: the real Worker (worker/sites.js) in Node, with the repo's files as its static assets and the
// emulators for /api/claims (EMULATOR is honoured on localhost only), and an in-memory bucket for /api/files/ (one per
// server run, shared by every test's browser contexts). node e2e/serve.mjs [port]
// GET /__test/bump makes sw.js look new (a comment changes), so a test can see an update arrive.
// APP_DIR=dist serves a Vite build (npx vite build) in place of app/: the same tests, on the built page.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { IMPORT_MAP } from '../worker/headers.js';
import { fileURLToPath } from 'node:url';
import worker from '../worker/sites.js';
import { memoryBucket } from '../e2e/memory-bucket.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8100);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const APP_DIR = process.env.APP_DIR ? path.resolve(ROOT, process.env.APP_DIR) : '';
// The dependency bump changes the inline import map. Match its hash in the test response only.
const html = await fs.readFile(path.join(ROOT, 'app/index.html'), 'utf8');
const importMapHash = `'sha256-${crypto.createHash('sha256').update(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).digest('base64')}'`;
let bump = 0;

const env = {
  FIREBASE_PROJECT: 'demo-sandbox-app', EMULATOR: '1',
  AUTH_EMULATOR: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:8102',
  FIRESTORE_EMULATOR: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8101',
  FILES: memoryBucket(),
  ASSETS: { async fetch(req) {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url).pathname));
    if (APP_DIR && file.startsWith(path.join(ROOT, 'app') + path.sep)) file = path.join(APP_DIR, path.relative(path.join(ROOT, 'app'), file));
    if (!file.startsWith(ROOT + path.sep) || /[\\/]\.(git|devkit)[\\/]/.test(file)) return new Response('', { status: 404 });
    try {
      let body = await fs.readFile(file);
      // Test-only port mapping; the checked-in application remains unchanged.
      if (file.endsWith('/src/roles.js')) body = Buffer.from(body.toString().replace('fs || 8080', `fs || ${Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8101').split(':')[1])}`).replace('auth || 9099', 'auth || 8102'));
      // Observation at the public app-sync boundary (chaos waits on it; off only with SOAK_RACE=1 and no SOAK_TRACE). No engine implementation is changed.
      if ((process.env.SOAK_TRACE || process.env.SOAK_RACE !== '1') && file.endsWith('/src/cloud.js')) body = Buffer.from(body.toString().replace('  await app.ready;', `
  await app.ready;
  const originalSave = app.sync.save.bind(app.sync);
  app.sync.save = (...args) => {
    const [kind, scope, record] = args;
    const call = crypto.randomUUID();
    window.__soakTrace?.({ type: 'save-call', call, kind, record });
    const promise = originalSave(...args);
    promise.then(
      () => window.__soakTrace?.({ type: 'save-resolve', call, record }),
      error => window.__soakTrace?.({ type: 'save-reject', call, record, error: String(error) })
    );
    return promise;
  };
`));
      if (file.endsWith(`${path.sep}sw.js`) && bump) body = Buffer.concat([body, Buffer.from(`\n// test bump ${bump}\n`)]);
      return new Response(body, { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' } });
    } catch { return new Response('', { status: 404 }); }
  } },
};

http.createServer(async (req, res) => {
  try {
  if (req.url === '/__test/bump') { bump++; res.end(String(bump)); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
  const headers = Object.fromEntries(r.headers);
  for (const name of ['content-security-policy', 'content-security-policy-report-only']) {
    if (headers[name]) headers[name] = headers[name].replace(IMPORT_MAP, importMapHash);
  }
  res.writeHead(r.status, headers);
  res.end(Buffer.from(await r.arrayBuffer()));
  } catch (error) {
    console.error('test server request failed:', req.url, error.message);
    if (!res.headersSent) res.writeHead(500);
    res.end('test server request failed');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`e2e server on http://localhost:${PORT}/app/`));
