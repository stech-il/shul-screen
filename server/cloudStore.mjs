/**
 * Persistent synagogue cloud store for the Node server.
 *
 * - Synagogue JSON: GitHub when CLOUD_GITHUB_TOKEN is set, else local disk.
 * - Billing records + media files: always on DATA_DIR (Render persistent disk).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Root for durable local files — on Render set DATA_DIR=/var/data (disk mount). */
const ROOT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_DIR = path.join(ROOT_DIR, 'synagogues');
const GH_TOKEN = (process.env.CLOUD_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '').trim();
const GH_REPO = (process.env.CLOUD_GITHUB_REPO || 'stech-il/shul-screen-data').trim();
const GH_BRANCH = (process.env.CLOUD_GITHUB_BRANCH || 'main').trim();
const GH_PREFIX = 'synagogues';

function ensureLocalDir(dir = DATA_DIR) {
  fs.mkdirSync(dir, { recursive: true });
}

function localPath(id) {
  const safe = String(id).replace(/[^a-zA-Z0-9_\u0590-\u05FF-]/g, '_').slice(0, 80);
  return path.join(DATA_DIR, `${safe}.json`);
}

// —— Generic prefixed JSON records (e.g. billing) — always under ROOT_DIR ——

function recordDir(prefix) {
  return path.join(ROOT_DIR, prefix);
}

function recordPath(prefix, id) {
  const safe = String(id).replace(/[^a-zA-Z0-9_\u0590-\u05FF-]/g, '_').slice(0, 80);
  return path.join(recordDir(prefix), `${safe}.json`);
}

async function ghGetRecord(prefix, id) {
  const res = await ghFetch(
    `/repos/${GH_REPO}/contents/${prefix}/${encodeURIComponent(id)}.json?ref=${GH_BRANCH}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub get ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  return { sha: body.sha, record: decodeContent(body.content) };
}

export async function getRecord(prefix, id) {
  if (GH_TOKEN) {
    try {
      const file = await ghGetRecord(prefix, id);
      return file ? file.record : null;
    } catch (err) {
      console.error(`record get ${prefix}/${id} github failed, fallback local`, err);
    }
  }
  const p = recordPath(prefix, id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export async function putRecord(prefix, id, record) {
  ensureLocalDir(recordDir(prefix));
  fs.writeFileSync(recordPath(prefix, id), JSON.stringify(record, null, 2), 'utf8');
  if (!GH_TOKEN) return;
  const existing = await ghGetRecord(prefix, id).catch(() => null);
  const payload = {
    message: `upsert ${prefix}/${id}`,
    content: encodeContent(record),
    branch: GH_BRANCH,
  };
  if (existing?.sha) payload.sha = existing.sha;
  const res = await ghFetch(
    `/repos/${GH_REPO}/contents/${prefix}/${encodeURIComponent(id)}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub put ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function listRecords(prefix) {
  if (GH_TOKEN) {
    try {
      const res = await ghFetch(`/repos/${GH_REPO}/contents/${prefix}?ref=${GH_BRANCH}`);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`GitHub list ${res.status}`);
      const items = await res.json();
      if (!Array.isArray(items)) return [];
      const out = [];
      for (const item of items) {
        if (!item.name?.endsWith('.json') || item.type !== 'file') continue;
        const id = item.name.replace(/\.json$/, '');
        try {
          const file = await ghGetRecord(prefix, id);
          if (file?.record) out.push(file.record);
        } catch {
          /* skip broken */
        }
      }
      return out;
    } catch (err) {
      console.error(`record list ${prefix} github failed, fallback local`, err);
    }
  }
  const dir = recordDir(prefix);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    } catch {
      /* skip */
    }
  }
  return out;
}

export function cloudBackend() {
  return GH_TOKEN ? 'github' : 'local';
}

export function cloudConfigured() {
  return true;
}

async function ghFetch(apiPath, options = {}) {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'screensmart-cloud',
      ...(options.headers || {}),
    },
  });
  return res;
}

function encodeContent(obj) {
  return Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
}

function decodeContent(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

async function ghGetFile(id) {
  const res = await ghFetch(
    `/repos/${GH_REPO}/contents/${GH_PREFIX}/${encodeURIComponent(id)}.json?ref=${GH_BRANCH}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub get ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  return {
    sha: body.sha,
    bundle: decodeContent(body.content),
  };
}

async function ghList() {
  const res = await ghFetch(
    `/repos/${GH_REPO}/contents/${GH_PREFIX}?ref=${GH_BRANCH}`,
  );
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub list ${res.status}: ${text.slice(0, 200)}`);
  }
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    if (!item.name?.endsWith('.json') || item.type !== 'file') continue;
    const id = item.name.replace(/\.json$/, '');
    try {
      const file = await ghGetFile(id);
      if (file?.bundle?.config) out.push(file.bundle);
    } catch {
      /* skip broken */
    }
  }
  return out;
}

async function ghPut(id, bundle) {
  const existing = await ghGetFile(id);
  const payload = {
    message: `upsert ${id} · rev ${bundle?.config?.revision ?? '?'}`,
    content: encodeContent(bundle),
    branch: GH_BRANCH,
  };
  if (existing?.sha) payload.sha = existing.sha;
  const res = await ghFetch(
    `/repos/${GH_REPO}/contents/${GH_PREFIX}/${encodeURIComponent(id)}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub put ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function ghDelete(id) {
  const existing = await ghGetFile(id);
  if (!existing) return;
  const res = await ghFetch(
    `/repos/${GH_REPO}/contents/${GH_PREFIX}/${encodeURIComponent(id)}.json`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `delete ${id}`,
        sha: existing.sha,
        branch: GH_BRANCH,
      }),
    },
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub delete ${res.status}: ${text.slice(0, 200)}`);
  }
}

function localList() {
  ensureLocalDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
      const bundle = JSON.parse(raw);
      if (bundle?.config?.id) out.push(bundle);
    } catch {
      /* skip */
    }
  }
  return out;
}

function localGet(id) {
  const p = localPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function localPut(id, bundle) {
  ensureLocalDir();
  fs.writeFileSync(localPath(id), JSON.stringify(bundle, null, 2), 'utf8');
}

function localDelete(id) {
  const p = localPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export async function listBundles() {
  if (GH_TOKEN) {
    try {
      return await ghList();
    } catch (err) {
      console.error('cloud list github failed, fallback local', err);
      return localList();
    }
  }
  return localList();
}

export async function getBundle(id) {
  if (GH_TOKEN) {
    try {
      const file = await ghGetFile(id);
      if (file) {
        localPut(id, file.bundle); // warm local cache
        return file.bundle;
      }
      return null;
    } catch (err) {
      console.error('cloud get github failed, fallback local', err);
      return localGet(id);
    }
  }
  return localGet(id);
}

export async function putBundle(id, bundle) {
  localPut(id, bundle);
  if (GH_TOKEN) {
    await ghPut(id, bundle);
  }
  // Auto snapshot on disk (throttled inside createBackup)
  try {
    const { createBackup } = await import('./backups.mjs');
    await createBackup(id, { reason: 'auto', bundle });
  } catch (err) {
    console.warn('auto-backup failed', err);
  }
}

export async function deleteBundle(id) {
  localDelete(id);
  if (GH_TOKEN) {
    await ghDelete(id);
  }
}

// —— Binary media files on persistent disk (Render Disk / DATA_DIR) ——
const MEDIA_PREFIX = 'media';
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MEDIA_ROOT = path.join(ROOT_DIR, MEDIA_PREFIX);

function safeMediaName(name) {
  return String(name || 'file')
    .replace(/[^\w.\u0590-\u05FF-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100) || 'file';
}

function localMediaDir(synagogueId) {
  const safe = String(synagogueId).replace(/[^a-zA-Z0-9_\u0590-\u05FF-]/g, '_').slice(0, 80);
  return path.join(MEDIA_ROOT, safe);
}

function localMediaPath(synagogueId, fileName) {
  return path.join(localMediaDir(synagogueId), safeMediaName(fileName));
}

function guessContentType(fileName) {
  const ext = path.extname(String(fileName)).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Store a media file on the persistent disk. Returns a public API path.
 * (Does NOT use GitHub — binaries belong on the Render disk.)
 */
export async function putMediaFile(synagogueId, fileName, buffer, contentType) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length === 0) throw new Error('קובץ ריק');
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error(`קובץ גדול מדי (עד ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))}MB)`);
  }
  const safe = safeMediaName(fileName);
  const dir = localMediaDir(synagogueId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localMediaPath(synagogueId, safe), buffer);

  const url = `/api/cloud/media/${encodeURIComponent(synagogueId)}/${encodeURIComponent(safe)}`;
  return {
    url,
    fileName: safe,
    bytes: buffer.length,
    contentType: contentType || guessContentType(safe),
  };
}

/** Read a media file from the persistent disk. */
export async function getMediaFile(synagogueId, fileName) {
  const safe = safeMediaName(fileName);
  const p = localMediaPath(synagogueId, safe);
  if (!fs.existsSync(p)) return null;
  const buffer = fs.readFileSync(p);
  return { buffer, contentType: guessContentType(safe), sha: null };
}

export function statusPayload() {
  let diskOk = false;
  let mediaCount = 0;
  let billingCount = 0;
  try {
    fs.mkdirSync(MEDIA_ROOT, { recursive: true });
    fs.mkdirSync(recordDir('billing'), { recursive: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    diskOk = fs.existsSync(MEDIA_ROOT);
    if (diskOk) {
      for (const dir of fs.readdirSync(MEDIA_ROOT, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        const files = fs.readdirSync(path.join(MEDIA_ROOT, dir.name));
        mediaCount += files.length;
      }
    }
    billingCount = fs
      .readdirSync(recordDir('billing'))
      .filter((f) => f.endsWith('.json') && !f.startsWith('_')).length;
  } catch {
    diskOk = false;
  }
  return {
    ok: true,
    backend: cloudBackend(),
    repo: GH_TOKEN ? GH_REPO : null,
    persistent: Boolean(GH_TOKEN) || Boolean(process.env.DATA_DIR),
    media: true,
    mediaRoot: MEDIA_ROOT,
    rootDir: ROOT_DIR,
    diskOk,
    mediaFileCount: mediaCount,
    billingRecordCount: billingCount,
    dataDirSet: Boolean(process.env.DATA_DIR),
  };
}

// —— Screen heartbeats (online status for Agency) — disk only, not GitHub ——

function writeHeartbeatLocal(synagogueId, rec) {
  ensureLocalDir(recordDir('heartbeats'));
  fs.writeFileSync(recordPath('heartbeats', synagogueId), JSON.stringify(rec, null, 2), 'utf8');
}

function readHeartbeatLocal(synagogueId) {
  const p = recordPath('heartbeats', synagogueId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export async function putHeartbeat(hb) {
  if (!hb?.synagogueId) throw new Error('missing synagogueId');
  const rec = {
    synagogueId: hb.synagogueId,
    at: hb.at || new Date().toISOString(),
    version: hb.version || '',
    online: hb.online !== false,
    layout: hb.layout || '',
  };
  writeHeartbeatLocal(rec.synagogueId, rec);
  return rec;
}

export async function getHeartbeat(synagogueId) {
  return readHeartbeatLocal(synagogueId);
}

export async function listHeartbeats() {
  const dir = recordDir('heartbeats');
  ensureLocalDir(dir);
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name.startsWith('_')) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (rec?.synagogueId) out.push(rec);
    } catch {
      /* ignore bad file */
    }
  }
  return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

// —— Saved design templates — one shared list for the whole platform ——

export async function getDesignTemplates() {
  const rec = await getRecord('templates', 'list');
  return Array.isArray(rec?.items) ? rec.items : [];
}

export async function putDesignTemplates(items) {
  if (!Array.isArray(items)) throw new Error('items must be an array');
  await putRecord('templates', 'list', {
    items,
    updatedAt: new Date().toISOString(),
  });
  return items;
}
