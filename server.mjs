/**
 * Production server for Render (and similar hosts).
 * Serves the Vite build + proxies Pikud HaOref alerts + cloud synagogue DB API.
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cloudConfigured,
  deleteBundle,
  getBundle,
  getMediaFile,
  listBundles,
  listHeartbeats,
  putBundle,
  putHeartbeat,
  putMediaFile,
  statusPayload,
} from './server/cloudStore.mjs';
import { billingConfigured, handleBilling, startBillingCron } from './server/billing.mjs';
import { handleBackups, startBackupCron } from './server/backups.mjs';

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

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function proxyOref(res) {
  const req = https.get(
    'https://www.oref.org.il/WarningMessages/alert/alerts.json',
    {
      headers: {
        Referer: 'https://www.oref.org.il/',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'User-Agent': 'smartech/0.3',
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

async function handleCloud(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname === '/api/cloud/status') {
    sendJson(res, 200, statusPayload());
    return;
  }

  if (url.pathname === '/api/cloud/synagogues' && req.method === 'GET') {
    try {
      const bundles = await listBundles();
      sendJson(res, 200, {
        items: bundles.map((b) => ({
          id: b.config.id,
          name: b.config.name,
          updatedAt: b.config.updatedAt,
          revision: b.config.revision,
          config: b.config,
          syncedAt: b.syncedAt,
        })),
      });
    } catch (err) {
      sendJson(res, 500, { error: String(err.message || err) });
    }
    return;
  }

  // Backup API (before synagogue match — different path shape)
  if (url.pathname.startsWith('/api/cloud/backups/')) {
    await handleBackups(req, res, url);
    return;
  }

  // Heartbeats — display posts, agency reads
  if (url.pathname === '/api/cloud/heartbeats' && req.method === 'GET') {
    try {
      sendJson(res, 200, { items: await listHeartbeats() });
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) });
    }
    return;
  }
  if (url.pathname === '/api/cloud/heartbeats' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const saved = await putHeartbeat(body);
      sendJson(res, 200, { ok: true, heartbeat: saved });
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) });
    }
    return;
  }

  // POST /api/cloud/media/:synagogueId  { fileName, contentType, dataBase64 }
  const mediaPost = url.pathname.match(/^\/api\/cloud\/media\/([^/]+)$/);
  if (mediaPost && req.method === 'POST') {
    try {
      const synagogueId = decodeURIComponent(mediaPost[1]);
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const fileName = String(body.fileName || `file-${Date.now()}.bin`);
      const contentType = String(body.contentType || 'application/octet-stream');
      const dataBase64 = String(body.dataBase64 || '');
      if (!dataBase64) {
        sendJson(res, 400, { error: 'missing dataBase64' });
        return;
      }
      const buffer = Buffer.from(dataBase64, 'base64');
      const saved = await putMediaFile(synagogueId, fileName, buffer, contentType);
      sendJson(res, 200, { ok: true, url: saved.url, fileName: saved.fileName, bytes: saved.bytes });
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) });
    }
    return;
  }

  // GET /api/cloud/media/:synagogueId/:fileName
  const mediaGet = url.pathname.match(/^\/api\/cloud\/media\/([^/]+)\/([^/]+)$/);
  if (mediaGet && req.method === 'GET') {
    try {
      const synagogueId = decodeURIComponent(mediaGet[1]);
      const fileName = decodeURIComponent(mediaGet[2]);
      const file = await getMediaFile(synagogueId, fileName);
      if (!file) {
        sendJson(res, 404, { error: 'media not found' });
        return;
      }
      send(res, 200, file.buffer, {
        'Content-Type': file.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) });
    }
    return;
  }

  const match = url.pathname.match(/^\/api\/cloud\/synagogues\/([^/]+)$/);
  if (!match) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  const id = decodeURIComponent(match[1]);

  try {
    if (req.method === 'GET') {
      const bundle = await getBundle(id);
      if (!bundle) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      sendJson(res, 200, bundle);
      return;
    }

    if (req.method === 'PUT') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const config = body.config || body;
      if (!config?.id) {
        sendJson(res, 400, { error: 'missing config.id' });
        return;
      }
      if (config.id !== id) {
        sendJson(res, 400, { error: 'id mismatch' });
        return;
      }
      // Never wipe a valid cloud license with an empty/missing one from a stale client
      const existing = await getBundle(id);
      if (existing?.config?.license && !config.license) {
        config.license = existing.config.license;
      } else if (
        existing?.config?.license &&
        config.license &&
        existing.config.license.expiresAt &&
        (!config.license.expiresAt ||
          Date.parse(config.license.expiresAt) < Date.parse(existing.config.license.expiresAt))
      ) {
        // Keep the longer-lived license unless explicitly locked by platform
        if (!config.license.locked) {
          config.license = {
            ...existing.config.license,
            ...config.license,
            expiresAt: existing.config.license.expiresAt,
            activatedAt: existing.config.license.activatedAt || config.license.activatedAt,
          };
        }
      }
      const bundle = {
        config,
        syncedAt: new Date().toISOString(),
        weather: body.weather,
        pendingSync: false,
      };
      await putBundle(id, bundle);
      sendJson(res, 200, { ok: true, backend: statusPayload().backend, syncedAt: bundle.syncedAt });
      return;
    }

    if (req.method === 'DELETE') {
      await deleteBundle(id);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error('cloud api', err);
    sendJson(res, 500, { error: String(err.message || err) });
  }
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
  if (url.pathname.startsWith('/api/cloud')) {
    void handleCloud(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/billing')) {
    void handleBilling(req, res, url);
    return;
  }
  serveStatic(url.pathname, res);
});

if (!fs.existsSync(DIST)) {
  console.error('Missing dist/ — run npm run build first');
  process.exit(1);
}

server.listen(PORT, () => {
  const st = statusPayload();
  console.log(`smartech listening on :${PORT}`);
  console.log(
    `Cloud DB: ${st.backend}${st.persistent ? ` (${st.repo})` : ' — set CLOUD_GITHUB_TOKEN for durable storage'}`,
  );
  if (!cloudConfigured()) {
    console.warn('Cloud API disabled');
  }
  if (billingConfigured()) {
    console.log('SUMIT billing: enabled — recurring cycle every 6h');
    startBillingCron();
  } else {
    console.log('SUMIT billing: disabled (set SUMIT_COMPANY_ID / SUMIT_API_KEY / SUMIT_API_PUBLIC_KEY)');
  }
  startBackupCron();
  console.log('Backups: daily snapshots on disk, 7-day retention');
});
