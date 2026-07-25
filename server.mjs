/**
 * Production server for Render (and similar hosts).
 * Serves the Vite build + proxies Pikud HaOref alerts.
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function proxyOref(res) {
  const req = https.get(
    'https://www.oref.org.il/WarningMessages/alert/alerts.json',
    {
      headers: {
        Referer: 'https://www.oref.org.il/',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'User-Agent': 'ShulScreen/0.3',
      },
    },
    (upstream) => {
      const chunks = [];
      upstream.on('data', (c) => chunks.push(c));
      upstream.on('end', () => {
        const body = Buffer.concat(chunks);
        send(res, upstream.statusCode || 200, body, {
          'Content-Type': upstream.headers['content-type'] || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
      });
    },
  );
  req.on('error', (err) => {
    send(res, 502, JSON.stringify({ error: String(err.message) }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  });
  req.setTimeout(10000, () => {
    req.destroy();
    send(res, 504, JSON.stringify({ error: 'oref timeout' }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  });
}

function serveStatic(reqPath, res) {
  const safe = path.normalize(decodeURIComponent(reqPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST, safe === path.sep ? 'index.html' : safe);
  if (!filePath.startsWith(DIST)) {
    send(res, 403, 'Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not found');
      return;
    }
    send(res, 200, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800',
    });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/oref/alerts') {
    proxyOref(res);
    return;
  }
  if (url.pathname === '/healthz') {
    send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    return;
  }
  serveStatic(url.pathname, res);
});

if (!fs.existsSync(DIST)) {
  console.error('Missing dist/ — run npm run build first');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`Shul Screen listening on :${PORT}`);
});
