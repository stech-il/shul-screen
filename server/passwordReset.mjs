/**
 * Forgot-password flow: one-time link valid for 5 minutes.
 *
 * POST /api/auth/forgot-password  { kind, synagogueId?, username }
 * GET  /api/auth/reset-password?token=
 * POST /api/auth/reset-password   { token, password }
 * POST /api/auth/platform-login   { username, password }  (optional server-side platform auth)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBundle, putBundle } from './cloudStore.mjs';
import { getPlatformSettings } from './billing.mjs';
import { mailConfigured, sendMail } from './mail.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOKENS_FILE = path.join(ROOT_DIR, 'password-reset-tokens.json');
const PLATFORM_ACCOUNTS_FILE = path.join(ROOT_DIR, 'platform-accounts.json');

const TTL_MS = 5 * 60 * 1000;
const PUBLIC_ORIGIN = String(
  process.env.PUBLIC_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://www.screensmart.co.il',
)
  .trim()
  .replace(/\/$/, '');

/** @type {Map<string, object>} */
const tokens = new Map();

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function ensureRoot() {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
}

function loadTokensFromDisk() {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    const now = Date.now();
    for (const row of Array.isArray(raw) ? raw : []) {
      if (!row?.token || !row?.expiresAt || row.expiresAt <= now) continue;
      tokens.set(row.token, row);
    }
  } catch {
    /* ignore */
  }
}

function persistTokens() {
  try {
    ensureRoot();
    const now = Date.now();
    const rows = [...tokens.values()].filter((t) => t.expiresAt > now);
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch (err) {
    console.warn('password-reset persist failed', err?.message || err);
  }
}

loadTokensFromDisk();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [saltHex, hash] = stored.split(':');
    if (!saltHex || !hash) return false;
    const next = crypto.createHash('sha256').update(`${saltHex}:${password}`).digest('hex');
    return next === hash;
  }
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  return legacy === stored;
}

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase();
}

function loadPlatformAccounts() {
  try {
    if (!fs.existsSync(PLATFORM_ACCOUNTS_FILE)) return { accounts: [] };
    const raw = JSON.parse(fs.readFileSync(PLATFORM_ACCOUNTS_FILE, 'utf8'));
    const accounts = Array.isArray(raw?.accounts) ? raw.accounts : [];
    return {
      accounts: accounts.filter((a) => a?.username && a?.passwordHash),
    };
  } catch {
    return { accounts: [] };
  }
}

function savePlatformAccounts(store) {
  ensureRoot();
  fs.writeFileSync(PLATFORM_ACCOUNTS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function listPlatformAccountUsernames() {
  return loadPlatformAccounts().accounts.map((a) => normalizeUsername(a.username)).filter(Boolean);
}

function handlePlatformAccountsList() {
  return {
    status: 200,
    body: { ok: true, accounts: listPlatformAccountUsernames().map((username) => ({ username })) },
  };
}

function handlePlatformAccountCreate(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username || username.length < 2) {
    return { status: 400, body: { ok: false, error: 'שם משתמש קצר מדי' } };
  }
  if (password.length < 8) {
    return { status: 400, body: { ok: false, error: 'סיסמה חייבת לפחות 8 תווים' } };
  }
  const store = loadPlatformAccounts();
  if (store.accounts.some((a) => normalizeUsername(a.username) === username)) {
    return { status: 409, body: { ok: false, error: 'שם המשתמש כבר קיים' } };
  }
  store.accounts.push({ username, passwordHash: hashPassword(password) });
  savePlatformAccounts(store);
  return { status: 201, body: { ok: true, username } };
}

function handlePlatformAccountReset(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username) return { status: 400, body: { ok: false, error: 'חסר שם משתמש' } };
  if (password.length < 8) {
    return { status: 400, body: { ok: false, error: 'סיסמה חייבת לפחות 8 תווים' } };
  }
  const store = loadPlatformAccounts();
  const idx = store.accounts.findIndex((a) => normalizeUsername(a.username) === username);
  if (idx < 0) {
    // Allow creating via reset when managing from agency (first sync)
    store.accounts.push({ username, passwordHash: hashPassword(password) });
  } else {
    store.accounts[idx] = { username, passwordHash: hashPassword(password) };
  }
  savePlatformAccounts(store);
  return { status: 200, body: { ok: true, username } };
}

function handlePlatformAccountDelete(body) {
  const username = normalizeUsername(body.username);
  if (!username) return { status: 400, body: { ok: false, error: 'חסר שם משתמש' } };
  const store = loadPlatformAccounts();
  if (store.accounts.length <= 1) {
    return { status: 400, body: { ok: false, error: 'לא ניתן למחוק את המשתמש האחרון' } };
  }
  const next = store.accounts.filter((a) => normalizeUsername(a.username) !== username);
  if (next.length === store.accounts.length) {
    return { status: 404, body: { ok: false, error: 'משתמש לא נמצא' } };
  }
  savePlatformAccounts({ accounts: next });
  return { status: 200, body: { ok: true, username } };
}

function purgeExpired() {
  const now = Date.now();
  let changed = false;
  for (const [token, row] of tokens) {
    if (row.expiresAt <= now) {
      tokens.delete(token);
      changed = true;
    }
  }
  if (changed) persistTokens();
}

function createToken(payload) {
  purgeExpired();
  const token = crypto.randomBytes(24).toString('hex');
  const row = {
    token,
    ...payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  };
  tokens.set(token, row);
  persistTokens();
  return row;
}

function takeToken(token) {
  purgeExpired();
  const row = tokens.get(token);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    tokens.delete(token);
    persistTokens();
    return null;
  }
  return row;
}

function consumeToken(token) {
  const row = takeToken(token);
  if (!row) return null;
  tokens.delete(token);
  persistTokens();
  return row;
}

function resetLink(token) {
  return `${PUBLIC_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendResetMail({ to, link, kindLabel }) {
  const subject = `איפוס סיסמה — screensmart (${kindLabel})`;
  const text = [
    `נתבקש איפוס סיסמה עבור ${kindLabel}.`,
    '',
    'הקישור תקף ל־5 דקות בלבד:',
    link,
    '',
    'אם לא ביקשתם איפוס — התעלמו מהמייל.',
  ].join('\n');
  const html = `
    <div dir="rtl" style="font-family:Heebo,Arial,sans-serif;line-height:1.5;color:#122033">
      <p>נתבקש איפוס סיסמה עבור <strong>${escapeHtml(kindLabel)}</strong>.</p>
      <p>הקישור תקף ל־<strong>5 דקות</strong> בלבד:</p>
      <p style="margin:1.2rem 0">
        <a href="${escapeHtml(link)}"
           style="display:inline-block;padding:0.75rem 1.2rem;background:#c9a227;color:#061225;text-decoration:none;border-radius:10px;font-weight:700">
          איפוס סיסמה
        </a>
      </p>
      <p style="font-size:0.85rem;color:#5a6b7d;word-break:break-all">${escapeHtml(link)}</p>
      <p style="font-size:0.85rem;color:#5a6b7d">אם לא ביקשתם איפוס — התעלמו מהמייל.</p>
    </div>
  `;
  return sendMail({ to, subject, text, html });
}

const GENERIC_OK = {
  ok: true,
  message: 'אם הפרטים נכונים — נשלח מייל עם קישור לאיפוס (תקף 5 דקות).',
};

async function handleForgot(body) {
  if (!mailConfigured()) {
    return {
      status: 503,
      body: { ok: false, error: 'שליחת מייל לא מוגדרת בשרת (SMTP). פנו לתמיכה.' },
    };
  }

  const kind = String(body.kind || '').trim();
  const username = normalizeUsername(body.username);
  if (!username) {
    return { status: 400, body: { ok: false, error: 'נא להזין שם משתמש' } };
  }

  if (kind === 'synagogue') {
    const synagogueId = String(body.synagogueId || '').trim();
    if (!synagogueId) {
      return { status: 400, body: { ok: false, error: 'חסר מזהה מסך' } };
    }
    const bundle = await getBundle(synagogueId);
    const config = bundle?.config;
    if (!config) return { status: 200, body: GENERIC_OK };

    const members = Array.isArray(config.members) ? config.members : [];
    const member = members.find(
      (m) => normalizeUsername(m.username || m.name || '') === username,
    );
    if (!member) return { status: 200, body: GENERIC_OK };

    const to =
      String(config.contactEmail || '').trim() ||
      String(body.email || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { status: 200, body: GENERIC_OK };
    }

    const row = createToken({
      kind: 'synagogue',
      synagogueId,
      username,
      memberId: member.id,
      email: to,
    });
    try {
      await sendResetMail({
        to,
        link: resetLink(row.token),
        kindLabel: `מסך ${synagogueId}`,
      });
    } catch (err) {
      console.warn('forgot-password mail failed', err?.message || err);
      tokens.delete(row.token);
      persistTokens();
      return { status: 500, body: { ok: false, error: 'שליחת המייל נכשלה' } };
    }
    return { status: 200, body: GENERIC_OK };
  }

  if (kind === 'platform') {
    const plat = await getPlatformSettings();
    const to = String(plat.adminEmail || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { status: 200, body: GENERIC_OK };
    }
    const row = createToken({
      kind: 'platform',
      username,
      email: to,
    });
    try {
      await sendResetMail({
        to,
        link: resetLink(row.token),
        kindLabel: 'מנהל מערכת',
      });
    } catch (err) {
      console.warn('forgot-password platform mail failed', err?.message || err);
      tokens.delete(row.token);
      persistTokens();
      return { status: 500, body: { ok: false, error: 'שליחת המייל נכשלה' } };
    }
    return { status: 200, body: GENERIC_OK };
  }

  return { status: 400, body: { ok: false, error: 'סוג איפוס לא תקין' } };
}

async function handleReset(body) {
  const token = String(body.token || '').trim();
  const password = String(body.password || '');
  if (!token) return { status: 400, body: { ok: false, error: 'חסר קישור איפוס' } };
  if (password.length < 4) {
    return { status: 400, body: { ok: false, error: 'סיסמה חדשה — לפחות 4 תווים' } };
  }

  const row = consumeToken(token);
  if (!row) {
    return {
      status: 400,
      body: { ok: false, error: 'הקישור אינו תקף או שפג תוקפו (5 דקות). בקשו איפוס מחדש.' },
    };
  }

  const passwordHash = hashPassword(password);

  if (row.kind === 'synagogue') {
    const bundle = await getBundle(row.synagogueId);
    if (!bundle?.config) {
      return { status: 404, body: { ok: false, error: 'מסך לא נמצא' } };
    }
    const members = Array.isArray(bundle.config.members) ? [...bundle.config.members] : [];
    const idx = members.findIndex(
      (m) =>
        m.id === row.memberId ||
        normalizeUsername(m.username || '') === normalizeUsername(row.username),
    );
    if (idx < 0) {
      return { status: 404, body: { ok: false, error: 'משתמש לא נמצא' } };
    }
    members[idx] = { ...members[idx], passwordHash };
    const next = {
      ...bundle,
      config: {
        ...bundle.config,
        members,
        updatedAt: new Date().toISOString(),
        revision: (bundle.config.revision || 0) + 1,
      },
      syncedAt: new Date().toISOString(),
    };
    await putBundle(row.synagogueId, next);
    return {
      status: 200,
      body: {
        ok: true,
        kind: 'synagogue',
        synagogueId: row.synagogueId,
        loginPath: `/login/${encodeURIComponent(row.synagogueId)}`,
      },
    };
  }

  if (row.kind === 'platform') {
    const store = loadPlatformAccounts();
    const u = normalizeUsername(row.username);
    const idx = store.accounts.findIndex((a) => normalizeUsername(a.username) === u);
    if (idx >= 0) {
      store.accounts[idx] = { username: u, passwordHash };
    } else {
      store.accounts.push({ username: u, passwordHash });
    }
    savePlatformAccounts(store);
    return {
      status: 200,
      body: {
        ok: true,
        kind: 'platform',
        username: u,
        passwordHash,
        loginPath: '/admin',
      },
    };
  }

  return { status: 400, body: { ok: false, error: 'סוג איפוס לא תקין' } };
}

function handlePeek(token) {
  const row = takeToken(token);
  if (!row) {
    return {
      status: 400,
      body: { ok: false, error: 'הקישור אינו תקף או שפג תוקפו (5 דקות).' },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      kind: row.kind,
      synagogueId: row.synagogueId || null,
      username: row.username,
      expiresAt: row.expiresAt,
      secondsLeft: Math.max(0, Math.floor((row.expiresAt - Date.now()) / 1000)),
    },
  };
}

function handlePlatformLogin(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username || !password) {
    return { status: 400, body: { ok: false, error: 'חסרים פרטי התחברות' } };
  }
  const store = loadPlatformAccounts();
  if (!store.accounts.length) {
    return { status: 404, body: { ok: false, error: 'no-server-accounts' } };
  }
  const account = store.accounts.find((a) => normalizeUsername(a.username) === username);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return { status: 401, body: { ok: false, error: 'שם משתמש או סיסמה שגויים' } };
  }
  return { status: 200, body: { ok: true, username: account.username } };
}

export async function handlePasswordReset(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  try {
    if (url.pathname === '/api/auth/forgot-password' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = await handleForgot(body);
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/auth/reset-password' && req.method === 'GET') {
      const token = String(url.searchParams.get('token') || '').trim();
      const result = handlePeek(token);
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/auth/reset-password' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = await handleReset(body);
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/auth/platform-login' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = handlePlatformLogin(body);
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/auth/platform-accounts' && req.method === 'GET') {
      const result = handlePlatformAccountsList();
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/auth/platform-accounts' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = handlePlatformAccountCreate(body);
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/auth/platform-accounts' && req.method === 'PUT') {
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = handlePlatformAccountReset(body);
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/auth/platform-accounts' && req.method === 'DELETE') {
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = handlePlatformAccountDelete(body);
      sendJson(res, result.status, result.body);
      return true;
    }
  } catch (err) {
    console.error('password-reset api', err);
    sendJson(res, 500, { ok: false, error: String(err?.message || err) });
    return true;
  }

  return false;
}
