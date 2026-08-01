/**
 * Production server for Render (and similar hosts).
 * Serves the Vite build + proxies Pikud HaOref alerts + cloud synagogue DB API.
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudConfigured, statusPayload } from './server/cloudStore.mjs';
import { billingConfigured, handleBilling, startBillingCron } from './server/billing.mjs';
import { startBackupCron } from './server/backups.mjs';
import { handleOrefDrill } from './server/orefDrill.mjs';
import {
  handleNotifications,
  startNotificationCron,
  mailConfigured,
} from './server/notifications.mjs';
import { handleInquiries } from './server/inquiries.mjs';
import { handlePasswordReset } from './server/passwordReset.mjs';
import { handleAltAuth } from './server/altAuth.mjs';
import { handleTrialSignup } from './server/trialSignup.mjs';
import { handleLandingAnalytics } from './server/landingAnalytics.mjs';
import { handlePublicDirectory } from './server/publicDirectory.mjs';
import { handleCloud } from './server/cloudHttp.mjs';
import { sendJson } from './server/apiAuth.mjs';

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
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
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
        'User-Agent': 'screensmart/0.3',
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
  if (url.pathname.startsWith('/api/oref/drill')) {
    void handleOrefDrill(req, res, url).then((handled) => {
      if (!handled) sendJson(res, 404, { error: 'not found' }, req);
    });
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
  if (url.pathname.startsWith('/api/notifications')) {
    void handleNotifications(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/inquiries')) {
    void handleInquiries(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/signup')) {
    void handleTrialSignup(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/analytics')) {
    void handleLandingAnalytics(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/public')) {
    void handlePublicDirectory(req, res, url).then((handled) => {
      if (!handled) sendJson(res, 404, { error: 'not found' }, req);
    });
    return;
  }
  if (url.pathname.startsWith('/api/auth')) {
    void handlePasswordReset(req, res, url).then(async (handled) => {
      if (handled) return;
      const alt = await handleAltAuth(req, res, url);
      if (!alt) sendJson(res, 404, { error: 'not found' }, req);
    });
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
  console.log(`screensmart listening on :${PORT}`);
  console.log(
    `Cloud DB: ${st.backend}${st.persistent ? ` (${st.repo})` : ' — set CLOUD_GITHUB_TOKEN for durable storage'}`,
  );
  if (!cloudConfigured()) {
    console.warn('Cloud API disabled');
  }
  if (billingConfigured()) {
    console.log('SUMIT billing: enabled — weekly SUMIT sync per synagogue (local store between pulls)');
    startBillingCron();
  } else {
    console.log('SUMIT billing: disabled (set SUMIT_COMPANY_ID / SUMIT_API_KEY / SUMIT_API_PUBLIC_KEY)');
  }
  startBackupCron();
  console.log('Backups: daily at 00:00 Asia/Jerusalem, 7-day retention');
  startNotificationCron();
  if (mailConfigured()) {
    console.log('Notifications: SMTP enabled — daily scan at 09:00 Asia/Jerusalem');
  }
});
