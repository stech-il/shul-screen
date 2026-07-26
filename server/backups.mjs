/**
 * Per-synagogue backups on the persistent disk (DATA_DIR).
 * Keeps snapshots for 7 days with list / create / restore API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBundle, getRecord, putBundle, putRecord } from './cloudStore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BACKUP_ROOT = path.join(ROOT_DIR, 'backups');
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Skip auto-backup if one was taken less than this ago (manual always allowed). */
const AUTO_MIN_INTERVAL_MS = 15 * 60 * 1000;

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_\u0590-\u05FF-]/g, '_').slice(0, 80);
}

function synagogueBackupDir(id) {
  return path.join(BACKUP_ROOT, safeId(id));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function backupFileName(at = new Date()) {
  // 2026-07-26T16-50-00-000Z.json — filesystem-safe
  return `${at.toISOString().replace(/[:.]/g, '-')}.json`;
}

function parseBackupStamp(fileName) {
  const base = fileName.replace(/\.json$/, '');
  // reverse filesystem-safe ISO
  const iso = base.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/,
    '$1:$2:$3.$4',
  );
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function pruneBackups(synagogueId) {
  const dir = synagogueBackupDir(synagogueId);
  if (!fs.existsSync(dir)) return { removed: 0 };
  const cutoff = Date.now() - RETENTION_MS;
  let removed = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const stamp = parseBackupStamp(f);
    if (stamp && stamp < cutoff) {
      try {
        fs.unlinkSync(path.join(dir, f));
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return { removed };
}

export function listBackups(synagogueId) {
  const dir = synagogueBackupDir(synagogueId);
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const full = path.join(dir, f);
    try {
      const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
      const st = fs.statSync(full);
      items.push({
        id: f.replace(/\.json$/, ''),
        fileName: f,
        createdAt: raw.createdAt || new Date(parseBackupStamp(f) || st.mtimeMs).toISOString(),
        reason: raw.reason || 'auto',
        revision: raw.bundle?.config?.revision ?? null,
        name: raw.bundle?.config?.name || synagogueId,
        hasBilling: Boolean(raw.billing),
        bytes: st.size,
      });
    } catch {
      /* skip corrupt */
    }
  }
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return items;
}

function lastBackupAgeMs(synagogueId) {
  const items = listBackups(synagogueId);
  if (!items.length) return Infinity;
  return Date.now() - Date.parse(items[0].createdAt);
}

/**
 * Create a full snapshot: synagogue bundle + billing subscription (if any).
 */
export async function createBackup(synagogueId, options = {}) {
  const reason = options.reason || 'manual';
  const force = Boolean(options.force);
  if (!force && reason === 'auto' && lastBackupAgeMs(synagogueId) < AUTO_MIN_INTERVAL_MS) {
    return { skipped: true, reason: 'too-soon' };
  }

  const bundle = options.bundle || (await getBundle(synagogueId));
  if (!bundle?.config) {
    throw new Error('אין הגדרות לשמירה בגיבוי');
  }

  let billing = null;
  try {
    billing = await getRecord('billing', synagogueId);
  } catch {
    billing = null;
  }

  const createdAt = nowIso();
  const fileName = backupFileName(new Date(createdAt));
  const dir = synagogueBackupDir(synagogueId);
  ensureDir(dir);
  const payload = {
    version: 1,
    synagogueId,
    createdAt,
    reason,
    bundle,
    billing: billing && billing.synagogueId !== '_platform' ? billing : null,
  };
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(payload, null, 2), 'utf8');
  pruneBackups(synagogueId);
  return {
    skipped: false,
    id: fileName.replace(/\.json$/, ''),
    fileName,
    createdAt,
    reason,
  };
}

export async function restoreBackup(synagogueId, backupId) {
  const fileName = backupId.endsWith('.json') ? backupId : `${backupId}.json`;
  const full = path.join(synagogueBackupDir(synagogueId), fileName);
  if (!fs.existsSync(full)) {
    throw new Error('גיבוי לא נמצא');
  }
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!raw?.bundle?.config) {
    throw new Error('קובץ גיבוי פגום');
  }

  // Safety snapshot of current state before restore
  await createBackup(synagogueId, { reason: 'pre-restore', force: true }).catch(() => {});

  const config = {
    ...raw.bundle.config,
    id: synagogueId,
    revision: (Number(raw.bundle.config.revision) || 0) + 1,
    updatedAt: nowIso(),
  };
  const bundle = {
    ...raw.bundle,
    config,
    syncedAt: nowIso(),
    pendingSync: false,
  };
  await putBundle(synagogueId, bundle);

  if (raw.billing && raw.billing.synagogueId) {
    await putRecord('billing', synagogueId, {
      ...raw.billing,
      synagogueId,
      updatedAt: nowIso(),
    });
  }

  return {
    ok: true,
    restoredAt: nowIso(),
    from: raw.createdAt,
    revision: config.revision,
  };
}

export async function backupAllSynagogues(reason = 'daily') {
  const { listBundles } = await import('./cloudStore.mjs');
  const all = await listBundles();
  let created = 0;
  let skipped = 0;
  for (const b of all) {
    const id = b?.config?.id;
    if (!id) continue;
    try {
      const r = await createBackup(id, { reason, force: reason !== 'auto', bundle: b });
      if (r.skipped) skipped += 1;
      else created += 1;
    } catch (err) {
      console.error(`backup failed for ${id}`, err);
    }
  }
  return { created, skipped, total: all.length };
}

let cronTimer = null;

/** Milliseconds until next local midnight in Asia/Jerusalem. */
function msUntilNextMidnight() {
  const now = new Date();
  // Format "parts" in Israel time so DST is handled correctly.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const h = get('hour');
  const m = get('minute');
  const s = get('second');
  const elapsedTodayMs = ((h * 60 + m) * 60 + s) * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const remaining = dayMs - elapsedTodayMs;
  // If we're within a second of midnight, schedule for tomorrow to avoid a double-fire.
  return remaining < 1000 ? dayMs : remaining;
}

function scheduleNextMidnightBackup() {
  const delay = msUntilNextMidnight();
  const hours = (delay / 3_600_000).toFixed(1);
  console.log(`Backups: next daily run in ~${hours}h (00:00 Asia/Jerusalem)`);
  cronTimer = setTimeout(() => {
    void backupAllSynagogues('daily')
      .then((r) => console.log('Backups: daily done', r))
      .catch((err) => console.error('Backups: daily failed', err))
      .finally(() => scheduleNextMidnightBackup());
  }, delay);
}

export function startBackupCron() {
  if (cronTimer) return;
  scheduleNextMidnightBackup();
}

// —— HTTP ——

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

export async function handleBackups(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    // GET /api/cloud/backups/:id
    const listMatch = url.pathname.match(/^\/api\/cloud\/backups\/([^/]+)$/);
    if (listMatch && req.method === 'GET') {
      const id = decodeURIComponent(listMatch[1]);
      pruneBackups(id);
      sendJson(res, 200, {
        synagogueId: id,
        retentionDays: 7,
        items: listBackups(id),
      });
      return;
    }

    // POST /api/cloud/backups/:id  { reason? }
    if (listMatch && req.method === 'POST') {
      const id = decodeURIComponent(listMatch[1]);
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const result = await createBackup(id, {
        reason: body.reason || 'manual',
        force: true,
      });
      sendJson(res, 200, { ok: true, ...result, items: listBackups(id) });
      return;
    }

    // POST /api/cloud/backups/:id/restore  { backupId }
    const restoreMatch = url.pathname.match(/^\/api\/cloud\/backups\/([^/]+)\/restore$/);
    if (restoreMatch && req.method === 'POST') {
      const id = decodeURIComponent(restoreMatch[1]);
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (!body.backupId) {
        sendJson(res, 400, { error: 'missing backupId' });
        return;
      }
      const result = await restoreBackup(id, String(body.backupId));
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('backups api', err);
    sendJson(res, 500, { error: String(err?.message || err) });
  }
}
