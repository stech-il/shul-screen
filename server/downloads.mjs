/**
 * App installers for admin download:
 * - Windows Electron kiosk (.exe)
 * - Android kiosk APK
 *
 * Sources (first match wins per platform):
 * 1. Env URL: DOWNLOAD_WINDOWS_URL / DOWNLOAD_ANDROID_URL / DOWNLOAD_ANDROID_MANAGE_URL
 * 2. downloads/manifest.json entries with url or file
 * 3. Files discovered under downloads/ (and release/ as local fallback)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendJson } from './apiAuth.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR
  ? path.resolve(process.env.DOWNLOADS_DIR)
  : path.join(ROOT, 'downloads');
const RELEASE_DIR = path.join(ROOT, 'release');

const MIME = {
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.apk': 'application/vnd.android.package-archive',
  '.aab': 'application/octet-stream',
  '.msi': 'application/octet-stream',
  '.zip': 'application/zip',
  '.blockmap': 'application/octet-stream',
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function fileMeta(filePath) {
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return null;
    return {
      size: st.size,
      mtime: st.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

function pickLatest(dir, matcher) {
  if (!fs.existsSync(dir)) return null;
  const names = fs
    .readdirSync(dir)
    .filter((n) => matcher.test(n))
    .map((n) => {
      const full = path.join(dir, n);
      try {
        return { name: n, full, mtime: fs.statSync(full).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  return names[0] ?? null;
}

function resolveLocal(platform) {
  const preferred =
    platform === 'windows'
      ? [
          path.join(DOWNLOADS_DIR, 'screensmart-Setup.exe'),
          () => pickLatest(DOWNLOADS_DIR, /^screensmart-Setup-.*\.exe$/i),
          () => pickLatest(RELEASE_DIR, /^screensmart-Setup-.*\.exe$/i),
        ]
      : platform === 'android'
        ? [
            path.join(DOWNLOADS_DIR, 'screensmart-kiosk.apk'),
            path.join(DOWNLOADS_DIR, 'screensmart-android-debug.apk'),
            () => pickLatest(DOWNLOADS_DIR, /screensmart.*\.apk$/i),
            () => pickLatest(RELEASE_DIR, /screensmart.*\.apk$/i),
          ]
        : [
            path.join(DOWNLOADS_DIR, 'screensmart-manage.apk'),
            () => pickLatest(DOWNLOADS_DIR, /manage.*\.apk$/i),
          ];

  for (const entry of preferred) {
    if (typeof entry === 'function') {
      const hit = entry();
      if (hit?.full) return hit.full;
      continue;
    }
    if (fs.existsSync(entry) && fs.statSync(entry).isFile()) return entry;
  }
  return null;
}

function envUrl(platform) {
  if (platform === 'windows') return String(process.env.DOWNLOAD_WINDOWS_URL || '').trim();
  if (platform === 'android') return String(process.env.DOWNLOAD_ANDROID_URL || '').trim();
  if (platform === 'androidManage') {
    return String(process.env.DOWNLOAD_ANDROID_MANAGE_URL || '').trim();
  }
  return '';
}

function buildItem(platform, defaults) {
  const manifest = readJson(path.join(DOWNLOADS_DIR, 'manifest.json'), {});
  const m = manifest?.[platform] && typeof manifest[platform] === 'object' ? manifest[platform] : {};
  const fromEnv = envUrl(platform);
  if (fromEnv) {
    return {
      id: platform,
      available: true,
      ...defaults,
      ...m,
      url: fromEnv,
      source: 'env',
    };
  }
  if (m.url && /^https?:\/\//i.test(String(m.url))) {
    return {
      id: platform,
      available: true,
      ...defaults,
      ...m,
      url: String(m.url),
      source: 'manifest',
    };
  }
  let filePath = null;
  if (m.file) {
    const candidate = path.join(DOWNLOADS_DIR, path.basename(String(m.file)));
    if (fs.existsSync(candidate)) filePath = candidate;
  }
  if (!filePath) filePath = resolveLocal(platform);
  if (!filePath) {
    return {
      id: platform,
      available: false,
      ...defaults,
      ...m,
      url: null,
      source: 'missing',
    };
  }
  const meta = fileMeta(filePath);
  const name = path.basename(filePath);
  return {
    id: platform,
    available: true,
    ...defaults,
    ...m,
    fileName: name,
    size: meta?.size ?? null,
    mtime: meta?.mtime ?? null,
    url: `/downloads/${encodeURIComponent(name)}`,
    source: filePath.startsWith(RELEASE_DIR) ? 'release' : 'downloads',
  };
}

export function listDownloads() {
  return {
    at: new Date().toISOString(),
    items: [
      buildItem('windows', {
        titleHe: 'אפליקציית מחשב (Windows)',
        titleEn: 'Windows kiosk app',
        kind: 'windows',
        autoStart: true,
        offline: true,
      }),
      buildItem('android', {
        titleHe: 'אפליקציית Android (מסך / APK)',
        titleEn: 'Android kiosk APK',
        kind: 'android',
        autoStart: true,
        offline: true,
      }),
      buildItem('androidManage', {
        titleHe: 'אפליקציית ניהול לטלפון',
        titleEn: 'Android management app',
        kind: 'androidManage',
        autoStart: false,
        offline: true,
      }),
    ],
  };
}

function safeDownloadName(raw) {
  const name = path.basename(decodeURIComponent(String(raw || '')));
  if (!name || name === '.' || name === '..') return null;
  if (!/^[a-zA-Z0-9._+-]+$/.test(name)) return null;
  return name;
}

function findServableFile(name) {
  for (const dir of [DOWNLOADS_DIR, RELEASE_DIR]) {
    const full = path.join(dir, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function sendFile(res, filePath, downloadName) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const st = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': st.size,
    'Content-Disposition': `attachment; filename="${downloadName}"`,
    'Cache-Control': 'public, max-age=3600',
  });
  fs.createReadStream(filePath).pipe(res);
}

/** GET /api/downloads — catalog · GET /downloads/:file — binary */
export async function handleDownloads(req, res, url) {
  if (url.pathname === '/api/downloads') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method not allowed' }, req);
      return true;
    }
    sendJson(res, 200, listDownloads(), req);
    return true;
  }

  if (!url.pathname.startsWith('/downloads/')) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method not allowed' }, req);
    return true;
  }

  const name = safeDownloadName(url.pathname.slice('/downloads/'.length));
  if (!name) {
    sendJson(res, 400, { error: 'bad file name' }, req);
    return true;
  }
  const filePath = findServableFile(name);
  if (!filePath) {
    sendJson(res, 404, { error: 'file not found' }, req);
    return true;
  }
  if (req.method === 'HEAD') {
    const ext = path.extname(filePath).toLowerCase();
    const st = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    res.end();
    return true;
  }
  sendFile(res, filePath, name);
  return true;
}
