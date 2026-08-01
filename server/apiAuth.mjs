/**
 * Server-side API auth: bearer sessions + optional API key.
 * Display/kiosk can read stripped configs without auth.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(ROOT_DIR, 'api-sessions.json');

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const PLATFORM_API_KEY = String(process.env.PLATFORM_API_KEY || process.env.CLOUD_API_SECRET || '').trim();
const CRON_SECRET = String(process.env.CRON_SECRET || '').trim();
const BILLING_WEBHOOK_SECRET = String(process.env.BILLING_WEBHOOK_SECRET || '').trim();
const MAX_JSON_BODY = Number(process.env.MAX_JSON_BODY || 1_500_000);
const MAX_MEDIA_BODY = Number(process.env.MAX_MEDIA_BODY || 12_000_000);

/** @type {Map<string, object>} */
const sessions = new Map();

const rateBuckets = new Map();

function ensureRoot() {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
}

function loadSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const now = Date.now();
    for (const row of Array.isArray(raw) ? raw : []) {
      if (!row?.token || !row?.expiresAt || row.expiresAt <= now) continue;
      sessions.set(row.token, row);
    }
  } catch {
    /* ignore */
  }
}

function persistSessions() {
  try {
    ensureRoot();
    const now = Date.now();
    const rows = [...sessions.values()].filter((s) => s.expiresAt > now);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

loadSessions();

export function allowedCorsOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  const publicOrigin = String(
    process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'https://www.screensmart.co.il',
  )
    .trim()
    .replace(/\/$/, '');
  const allow = new Set(
    [
      publicOrigin,
      'https://www.screensmart.co.il',
      'https://screensmart.co.il',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
      ...(String(process.env.CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)),
    ].filter(Boolean),
  );
  if (origin && allow.has(origin)) return origin;
  if (!origin) return allow.has(publicOrigin) ? publicOrigin : '*';
  // Same-host requests without matching Origin still need a value for credentialed fetches
  return allow.has(publicOrigin) ? publicOrigin : 'null';
}

export function sendJson(res, status, obj, req) {
  const origin = req ? allowedCorsOrigin(req) : '*';
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Cron-Secret, X-Webhook-Secret',
    Vary: 'Origin',
  });
  res.end(JSON.stringify(obj));
}

export function readBodyLimited(req, maxBytes = MAX_JSON_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function maxMediaBody() {
  return MAX_MEDIA_BODY;
}

export function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

export function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

export function createSession(payload, ttlMs = SESSION_TTL_MS) {
  const token = crypto.randomBytes(32).toString('base64url');
  const row = {
    token,
    ...payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  sessions.set(token, row);
  persistSessions();
  return row;
}

export function revokeSession(token) {
  if (!token) return;
  sessions.delete(token);
  persistSessions();
}

export function getBearerToken(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1].trim();
  const key = String(req.headers['x-api-key'] || '').trim();
  return key || '';
}

export function resolveAuth(req) {
  const raw = getBearerToken(req);
  if (!raw) return null;
  if (PLATFORM_API_KEY && raw === PLATFORM_API_KEY) {
    return { kind: 'platform', username: 'api-key', viaApiKey: true };
  }
  const row = sessions.get(raw);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) {
      sessions.delete(raw);
      persistSessions();
    }
    return null;
  }
  // sliding expiry lightly
  row.expiresAt = Math.max(row.expiresAt, Date.now() + 60 * 60 * 1000);
  return { ...row, token: raw };
}

export function requirePlatform(req, res) {
  const auth = resolveAuth(req);
  if (!auth || auth.kind !== 'platform') {
    sendJson(res, 401, { ok: false, error: 'נדרשת התחברות מנהל מערכת' }, req);
    return null;
  }
  return auth;
}

export function requireCronOrPlatform(req, res) {
  const cron = String(req.headers['x-cron-secret'] || '').trim();
  if (CRON_SECRET && cron && cron === CRON_SECRET) {
    return { kind: 'cron' };
  }
  return requirePlatform(req, res);
}

export function requireWebhookSecret(req, res) {
  if (!BILLING_WEBHOOK_SECRET) {
    // Fail closed in production-like envs when secret missing after deploy guidance
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      sendJson(res, 503, { ok: false, error: 'webhook secret not configured' }, req);
      return false;
    }
    return true;
  }
  const got = String(
    req.headers['x-webhook-secret'] || req.headers['x-sumit-secret'] || '',
  ).trim();
  const q = (() => {
    try {
      return new URL(req.url || '/', 'http://local').searchParams.get('secret') || '';
    } catch {
      return '';
    }
  })();
  if (got === BILLING_WEBHOOK_SECRET || q === BILLING_WEBHOOK_SECRET) return true;
  sendJson(res, 401, { ok: false, error: 'invalid webhook secret' }, req);
  return false;
}

/** Member of synagogue, or platform admin. */
export function requireSynagogueAccess(req, res, synagogueId) {
  const auth = resolveAuth(req);
  if (!auth) {
    sendJson(res, 401, { ok: false, error: 'נדרשת התחברות' }, req);
    return null;
  }
  if (auth.kind === 'platform') return auth;
  if (auth.kind === 'member' && String(auth.synagogueId) === String(synagogueId)) return auth;
  sendJson(res, 403, { ok: false, error: 'אין הרשאה לבית כנסת זה' }, req);
  return null;
}

export function canAccessSynagogue(auth, synagogueId) {
  if (!auth) return false;
  if (auth.kind === 'platform') return true;
  return auth.kind === 'member' && String(auth.synagogueId) === String(synagogueId);
}

export function stripSecretsFromConfig(config) {
  if (!config || typeof config !== 'object') return config;
  const next = { ...config };
  if (Array.isArray(next.members)) {
    next.members = next.members.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const {
        passwordHash: _ph,
        pinHash: _pin,
        passkeys: _pk,
        googleSub: _gs,
        ...safe
      } = m;
      return {
        ...safe,
        // Keep presence flags for UI without secrets
        hasPasskeys: Array.isArray(m.passkeys) && m.passkeys.length > 0,
        googleLinked: Boolean(m.googleSub || m.email),
      };
    });
  }
  if (next.kioskExitPinHash) delete next.kioskExitPinHash;
  return next;
}

export function stripSecretsFromBundle(bundle) {
  if (!bundle?.config) return bundle;
  return { ...bundle, config: stripSecretsFromConfig(bundle.config) };
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const s = String(stored);
  if (s.includes(':')) {
    const [saltHex, hash] = s.split(':');
    if (!saltHex || !hash) return false;
    const next = crypto.createHash('sha256').update(`${saltHex}:${password}`).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(next, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
      return next === hash;
    }
  }
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  return legacy === s;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${hash}`;
}
