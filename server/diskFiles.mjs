/**
 * Browse / delete files on the persistent DATA_DIR disk (Render Disk).
 * Used by Agency → הגדרות מערכת.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

/** Folders under ROOT_DIR that are safe to manage from the UI. */
const MANAGED_KINDS = [
  { kind: 'media', label: 'מדיה (תמונות / וידאו / פונטים / קבצי פניות)', dir: 'media', nested: true },
  { kind: 'backups', label: 'גיבויים', dir: 'backups', nested: true },
  { kind: 'synagogues', label: 'הגדרות בתי כנסת (JSON מקומי)', dir: 'synagogues', nested: false },
  { kind: 'billing', label: 'רשומות חיוב / הו״ק', dir: 'billing', nested: false },
  { kind: 'inquiries', label: 'פניות', dir: 'inquiries', nested: false },
  { kind: 'heartbeats', label: 'סטטוס מסכים', dir: 'heartbeats', nested: false },
  { kind: 'templates', label: 'תבניות עיצוב', dir: 'templates', nested: false },
  { kind: 'notify-log', label: 'יומן התראות מייל', dir: 'notify-log', nested: false },
];

const PROTECTED_FILES = new Set([
  'billing/_platform.json',
  'templates/list.json',
]);

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeSegment(value) {
  const s = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop();
  if (!s || s === '.' || s === '..' || s.includes('..')) return '';
  return s.replace(/[^a-zA-Z0-9_.\u0590-\u05FF-]/g, '_').slice(0, 120);
}

function kindMeta(kind) {
  return MANAGED_KINDS.find((k) => k.kind === kind) || null;
}

function resolveUnderRoot(...parts) {
  const resolved = path.resolve(ROOT_DIR, ...parts);
  const root = path.resolve(ROOT_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('נתיב לא חוקי');
  }
  return resolved;
}

function relKey(...parts) {
  return parts.filter(Boolean).join('/');
}

function listFlatJsonDir(kind, dirName, label) {
  const dir = resolveUnderRoot(dirName);
  if (!fs.existsSync(dir)) {
    return { kind, label, synagogueId: '', bytes: 0, files: [] };
  }
  const files = [];
  let bytes = 0;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const relative = relKey(dirName, name);
    files.push({
      id: relative,
      kind,
      synagogueId: '',
      name,
      relative,
      bytes: st.size,
      mtime: st.mtime.toISOString(),
      protected: PROTECTED_FILES.has(relative),
      url: null,
    });
    bytes += st.size;
  }
  files.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name, 'he'));
  return { kind, label, synagogueId: '', bytes, files };
}

function listNestedDir(kind, dirName, label) {
  const root = resolveUnderRoot(dirName);
  if (!fs.existsSync(root)) return [];
  const groups = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const synagogueId = entry.name;
    const folder = path.join(root, synagogueId);
    const files = [];
    let bytes = 0;
    for (const name of fs.readdirSync(folder)) {
      if (name.startsWith('.')) continue;
      const full = path.join(folder, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const relative = relKey(dirName, synagogueId, name);
      const url =
        kind === 'media'
          ? `/api/cloud/media/${encodeURIComponent(synagogueId)}/${encodeURIComponent(name)}`
          : null;
      files.push({
        id: relative,
        kind,
        synagogueId,
        name,
        relative,
        bytes: st.size,
        mtime: st.mtime.toISOString(),
        protected: false,
        url,
      });
      bytes += st.size;
    }
    files.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name, 'he'));
    groups.push({
      kind,
      label: `${label} · ${synagogueId}`,
      synagogueId,
      bytes,
      files,
    });
  }
  groups.sort((a, b) => b.bytes - a.bytes || a.synagogueId.localeCompare(b.synagogueId));
  return groups;
}

export function listDiskInventory() {
  const groups = [];
  for (const meta of MANAGED_KINDS) {
    if (meta.nested) {
      groups.push(...listNestedDir(meta.kind, meta.dir, meta.label));
    } else {
      const g = listFlatJsonDir(meta.kind, meta.dir, meta.label);
      if (g.files.length) groups.push(g);
    }
  }

  let totalBytes = 0;
  let totalFiles = 0;
  for (const g of groups) {
    totalBytes += g.bytes;
    totalFiles += g.files.length;
  }

  return {
    root: ROOT_DIR,
    dataDirSet: Boolean(process.env.DATA_DIR),
    totalBytes,
    totalFiles,
    groups,
    kinds: MANAGED_KINDS.map((k) => ({ kind: k.kind, label: k.label })),
  };
}

function resolveFilePath({ kind, synagogueId, fileName, relative }) {
  if (relative) {
    const parts = String(relative)
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map(safeSegment);
    if (!parts.length || parts.some((p) => !p)) throw new Error('נתיב לא חוקי');
    const meta = kindMeta(parts[0]) || MANAGED_KINDS.find((k) => k.dir === parts[0]);
    if (!meta) throw new Error('סוג קובץ לא מורשה');
    return { full: resolveUnderRoot(...parts), relative: parts.join('/'), meta };
  }

  const meta = kindMeta(kind);
  if (!meta) throw new Error('סוג קובץ לא מורשה');
  const name = safeSegment(fileName);
  if (!name) throw new Error('שם קובץ חסר');
  if (meta.nested) {
    const sid = safeSegment(synagogueId);
    if (!sid) throw new Error('חסר מזהה בית כנסת');
    return {
      full: resolveUnderRoot(meta.dir, sid, name),
      relative: relKey(meta.dir, sid, name),
      meta,
    };
  }
  return {
    full: resolveUnderRoot(meta.dir, name),
    relative: relKey(meta.dir, name),
    meta,
  };
}

export function deleteDiskFile(input) {
  const { full, relative } = resolveFilePath(input);
  if (PROTECTED_FILES.has(relative)) {
    throw new Error('לא ניתן למחוק קובץ מערכת מוגן');
  }
  if (!fs.existsSync(full)) {
    throw new Error('הקובץ לא נמצא');
  }
  const st = fs.statSync(full);
  if (!st.isFile()) throw new Error('היעד אינו קובץ');
  fs.unlinkSync(full);
  const parent = path.dirname(full);
  try {
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
      fs.rmdirSync(parent);
    }
  } catch {
    /* ignore */
  }
  return { ok: true, deleted: relative, bytes: st.size };
}

export function deleteDiskFolder({ kind, synagogueId }) {
  const meta = kindMeta(kind);
  if (!meta || !meta.nested) throw new Error('ניתן למחוק תיקייה רק למדיה או גיבויים');
  const sid = safeSegment(synagogueId);
  if (!sid) throw new Error('חסר מזהה בית כנסת');
  const full = resolveUnderRoot(meta.dir, sid);
  if (!fs.existsSync(full)) throw new Error('התיקייה לא נמצאה');
  let removed = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(full)) {
    const p = path.join(full, name);
    try {
      const st = fs.statSync(p);
      if (st.isFile()) {
        bytes += st.size;
        fs.unlinkSync(p);
        removed += 1;
      }
    } catch {
      /* ignore */
    }
  }
  try {
    fs.rmdirSync(full);
  } catch {
    /* may not be empty */
  }
  return { ok: true, deleted: relKey(meta.dir, sid), removed, bytes };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 */
export async function handleDiskFiles(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    if (url.pathname === '/api/cloud/disk' && req.method === 'GET') {
      sendJson(res, 200, listDiskInventory());
      return;
    }

    if (url.pathname === '/api/cloud/disk/file' && (req.method === 'DELETE' || req.method === 'POST')) {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const result = deleteDiskFile(body);
      sendJson(res, 200, result);
      return;
    }

    if (
      url.pathname === '/api/cloud/disk/folder' &&
      (req.method === 'DELETE' || req.method === 'POST')
    ) {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const result = deleteDiskFolder(body);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('disk files api', err);
    sendJson(res, 400, { error: String(err?.message || err) });
  }
}
