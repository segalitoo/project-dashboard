/**
 * dev-server.mjs — local dev server with edit-save + rescan endpoints.
 *
 * Static file serving (replaces python3 -m http.server) plus:
 *   POST /api/save-meta  — overwrite projects-meta.json with the request body
 *   POST /api/scan       — run `node scan-projects.mjs --no-live-check`
 *
 * Production (GitHub Pages) doesn't run this, so the dashboard falls
 * back to copy-to-clipboard if the endpoints are unreachable.
 */
import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { extname, join, normalize, resolve } from 'path';
import { spawn } from 'child_process';

const PORT = Number(process.env.PORT) || 8000;
const ROOT = resolve(process.cwd());
const META_FILE = join(ROOT, 'projects-meta.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let buf = '';
    req.on('data', (chunk) => { buf += chunk; });
    req.on('end', () => resolveBody(buf));
    req.on('error', reject);
  });
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function handleSaveMeta(req, res) {
  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || !parsed.projects) {
      jsonResponse(res, 400, { ok: false, error: 'Missing "projects" key in payload' });
      return;
    }
    const formatted = JSON.stringify(parsed, null, 2) + '\n';
    await writeFile(META_FILE, formatted, 'utf-8');
    jsonResponse(res, 200, { ok: true });
  } catch (err) {
    jsonResponse(res, 500, { ok: false, error: String(err.message || err) });
  }
}

function handleScan(res) {
  const proc = spawn('node', ['scan-projects.mjs', '--no-live-check'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => { stdout += d.toString(); });
  proc.stderr.on('data', (d) => { stderr += d.toString(); });
  proc.on('close', (code) => {
    const ok = code === 0;
    jsonResponse(res, ok ? 200 : 500, { ok, code, stdout, stderr });
  });
  proc.on('error', (err) => {
    jsonResponse(res, 500, { ok: false, error: String(err.message || err) });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/save-meta' && req.method === 'POST') {
    await handleSaveMeta(req, res);
    return;
  }
  if (pathname === '/api/scan' && req.method === 'POST') {
    handleScan(res);
    return;
  }

  const relRaw = pathname === '/' ? '/index.html' : pathname;
  const rel = decodeURIComponent(relRaw);
  const safe = normalize(rel).replace(/^(\.\.[\\/])+/, '');
  const full = join(ROOT, safe);
  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await readFile(full);
    const mime = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Serving HTTP on :${PORT} (http://localhost:${PORT}/)`);
});
