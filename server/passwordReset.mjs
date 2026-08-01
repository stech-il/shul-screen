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
import {
  checkRateLimit,
  clientIp,
  createSession,
  readBodyLimited,
  requirePlatform,
  sendJson as authSendJson,
  verifyPassword as authVerifyPassword,
} from './apiAuth.mjs';
import {
  isSmsVerifiedToday,
  normalizeMobilePhone,
  smsConfigured,
  startPlatformSmsChallenge,
  verifyPlatformSmsChallenge,
} from './sms4free.mjs';

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

function sendJson(res, status, obj, req) {
  authSendJson(res, status, obj, req);
}

async function readBody(req) {
  return readBodyLimited(req);
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
  return authVerifyPassword(password, stored);
}

function ensurePlatformSeed() {
  const store = loadPlatformAccounts();
  const seedUser = normalizeUsername(process.env.PLATFORM_ADMIN_USER || '');
  const seedPhone = normalizeMobilePhone(process.env.PLATFORM_ADMIN_PHONE || '');

  // Backfill phone on the seeded admin if still empty
  if (store.accounts.length && seedUser && seedPhone) {
    let changed = false;
    for (const a of store.accounts) {
      if (normalizeUsername(a.username) === seedUser && !normalizeMobilePhone(a.phone)) {
        a.phone = seedPhone;
        changed = true;
      }
    }
    if (changed) savePlatformAccounts(store);
  }

  if (store.accounts.length) return store;
  const pass = String(process.env.PLATFORM_ADMIN_PASSWORD || '');
  if (!seedUser || pass.length < 8) return store;
  store.accounts.push({
    username: seedUser,
    passwordHash: hashPassword(pass),
    firstName: '',
    lastName: '',
    email: '',
    phone: seedPhone,
    requireSmsOtp: true,
  });
  savePlatformAccounts(store);
  console.warn(`[auth] seeded platform admin "${seedUser}" from PLATFORM_ADMIN_* env`);
  return store;
}

function accountRequiresSmsOtp(account) {
  // Explicit false disables; missing field defaults to true (secure)
  return account?.requireSmsOtp !== false;
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

function cleanProfileField(value, max = 80) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function profileFromBody(body = {}) {
  const phoneRaw = body.phone !== undefined ? String(body.phone || '') : undefined;
  const phone =
    phoneRaw === undefined ? undefined : phoneRaw.trim() ? normalizeMobilePhone(phoneRaw) : '';
  const requireSmsOtp =
    body.requireSmsOtp !== undefined ? Boolean(body.requireSmsOtp) : undefined;
  return {
    firstName: cleanProfileField(body.firstName),
    lastName: cleanProfileField(body.lastName),
    email: cleanProfileField(body.email, 120).toLowerCase(),
    phone,
    requireSmsOtp,
  };
}

function publicPlatformAccount(account) {
  return {
    username: normalizeUsername(account.username),
    firstName: cleanProfileField(account.firstName),
    lastName: cleanProfileField(account.lastName),
    email: cleanProfileField(account.email, 120).toLowerCase(),
    phone: normalizeMobilePhone(account.phone) || '',
    requireSmsOtp: accountRequiresSmsOtp(account),
  };
}

function handlePlatformAccountsList() {
  return {
    status: 200,
    body: {
      ok: true,
      accounts: loadPlatformAccounts().accounts.map(publicPlatformAccount),
    },
  };
}

function handlePlatformAccountCreate(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  const profile = profileFromBody(body);
  if (!username || username.length < 2) {
    return { status: 400, body: { ok: false, error: 'שם משתמש קצר מדי' } };
  }
  if (password.length < 8) {
    return { status: 400, body: { ok: false, error: 'סיסמה חייבת לפחות 8 תווים' } };
  }
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    return { status: 400, body: { ok: false, error: 'כתובת מייל לא תקינה' } };
  }
  if (body.phone && !profile.phone) {
    return { status: 400, body: { ok: false, error: 'מספר נייד לא תקין (05XXXXXXXX)' } };
  }
  const requireSmsOtp =
    profile.requireSmsOtp !== undefined ? profile.requireSmsOtp : true;
  if (smsConfigured() && requireSmsOtp && !profile.phone) {
    return { status: 400, body: { ok: false, error: 'חובה להזין מספר נייד למשתמש שדורש OTP' } };
  }
  const store = loadPlatformAccounts();
  if (store.accounts.some((a) => normalizeUsername(a.username) === username)) {
    return { status: 409, body: { ok: false, error: 'שם המשתמש כבר קיים' } };
  }
  store.accounts.push({
    username,
    passwordHash: hashPassword(password),
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    email: profile.email || '',
    phone: profile.phone || '',
    requireSmsOtp,
  });
  savePlatformAccounts(store);
  return {
    status: 201,
    body: { ok: true, username, ...publicPlatformAccount(store.accounts[store.accounts.length - 1]) },
  };
}

function handlePlatformAccountReset(body) {
  const username = normalizeUsername(body.username);
  const password = body.password != null ? String(body.password || '') : null;
  const profile = profileFromBody(body);
  const hasProfilePatch =
    body.firstName !== undefined ||
    body.lastName !== undefined ||
    body.email !== undefined ||
    body.phone !== undefined ||
    body.requireSmsOtp !== undefined;
  if (!username) return { status: 400, body: { ok: false, error: 'חסר שם משתמש' } };
  if (password != null && password.length > 0 && password.length < 8) {
    return { status: 400, body: { ok: false, error: 'סיסמה חייבת לפחות 8 תווים' } };
  }
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    return { status: 400, body: { ok: false, error: 'כתובת מייל לא תקינה' } };
  }
  if (body.phone !== undefined && String(body.phone || '').trim() && !profile.phone) {
    return { status: 400, body: { ok: false, error: 'מספר נייד לא תקין (05XXXXXXXX)' } };
  }
  const store = loadPlatformAccounts();
  const idx = store.accounts.findIndex((a) => normalizeUsername(a.username) === username);
  if (idx < 0) {
    if (!password) {
      return { status: 404, body: { ok: false, error: 'משתמש לא נמצא' } };
    }
    const requireSmsOtp =
      profile.requireSmsOtp !== undefined ? profile.requireSmsOtp : true;
    store.accounts.push({
      username,
      passwordHash: hashPassword(password),
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: profile.email || '',
      phone: profile.phone || '',
      requireSmsOtp,
    });
  } else {
    const cur = store.accounts[idx];
    const nextRequire =
      hasProfilePatch && body.requireSmsOtp !== undefined
        ? profile.requireSmsOtp
        : accountRequiresSmsOtp(cur);
    const nextPhone =
      hasProfilePatch && body.phone !== undefined ? profile.phone || '' : cur.phone || '';
    if (smsConfigured() && nextRequire && !normalizeMobilePhone(nextPhone)) {
      return {
        status: 400,
        body: { ok: false, error: 'למשתמש שדורש OTP חובה מספר נייד תקין' },
      };
    }
    store.accounts[idx] = {
      username,
      passwordHash: password ? hashPassword(password) : cur.passwordHash,
      firstName:
        hasProfilePatch && body.firstName !== undefined ? profile.firstName : cur.firstName || '',
      lastName:
        hasProfilePatch && body.lastName !== undefined ? profile.lastName : cur.lastName || '',
      email: hasProfilePatch && body.email !== undefined ? profile.email : cur.email || '',
      phone: nextPhone,
      requireSmsOtp: nextRequire,
    };
  }
  savePlatformAccounts(store);
  return {
    status: 200,
    body: {
      ok: true,
      username,
      ...publicPlatformAccount(
        store.accounts.find((a) => normalizeUsername(a.username) === username) || { username },
      ),
    },
  };
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

    // Only synagogue contactEmail — never trust body.email (account takeover)
    const to = String(config.contactEmail || member.email || '').trim();
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
    const store = ensurePlatformSeed();
    const account = store.accounts.find((a) => normalizeUsername(a.username) === username);
    if (!account) return { status: 200, body: GENERIC_OK };
    const plat = await getPlatformSettings();
    const to = String(account.email || plat.adminEmail || '').trim();
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

function platformSessionBody(account) {
  const session = createSession({
    kind: 'platform',
    username: normalizeUsername(account.username),
  });
  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    username: account.username,
    firstName: cleanProfileField(account.firstName),
    lastName: cleanProfileField(account.lastName),
    email: cleanProfileField(account.email, 120).toLowerCase(),
  };
}

async function handlePlatformLogin(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username || !password) {
    return { status: 400, body: { ok: false, error: 'חסרים פרטי התחברות' } };
  }
  const store = ensurePlatformSeed();
  if (!store.accounts.length) {
    return { status: 404, body: { ok: false, error: 'no-server-accounts' } };
  }
  const account = store.accounts.find((a) => normalizeUsername(a.username) === username);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return { status: 401, body: { ok: false, error: 'שם משתמש או סיסמה שגויים' } };
  }

  // SMS OTP once per Jerusalem day — only for accounts marked requireSmsOtp
  if (smsConfigured() && accountRequiresSmsOtp(account)) {
    if (!isSmsVerifiedToday(account.username)) {
      const phone = normalizeMobilePhone(account.phone);
      if (!phone) {
        return {
          status: 403,
          body: {
            ok: false,
            error:
              'לא הוגדר נייד לחשבון זה. עדכנו מספר טלפון בפרופיל מנהל המערכת (או PLATFORM_ADMIN_PHONE ב־seed).',
          },
        };
      }
      const challenge = await startPlatformSmsChallenge(account.username, phone);
      if (!challenge.ok) {
        return { status: 503, body: { ok: false, error: challenge.error } };
      }
      return {
        status: 200,
        body: {
          ok: true,
          smsRequired: true,
          challengeId: challenge.challengeId,
          phoneHint: challenge.phoneHint,
          expiresAt: challenge.expiresAt,
          username: account.username,
          firstName: cleanProfileField(account.firstName),
          lastName: cleanProfileField(account.lastName),
          email: cleanProfileField(account.email, 120).toLowerCase(),
        },
      };
    }
  }

  return { status: 200, body: platformSessionBody(account) };
}

function handlePlatformSmsVerify(body) {
  const challengeId = String(body.challengeId || '').trim();
  const code = String(body.code || '').trim();
  if (!challengeId || !code) {
    return { status: 400, body: { ok: false, error: 'חסר קוד אימות' } };
  }
  const verified = verifyPlatformSmsChallenge(challengeId, code);
  if (!verified.ok) {
    return { status: 401, body: { ok: false, error: verified.error } };
  }
  const store = ensurePlatformSeed();
  const account = store.accounts.find(
    (a) => normalizeUsername(a.username) === normalizeUsername(verified.username),
  );
  if (!account) {
    return { status: 404, body: { ok: false, error: 'משתמש לא נמצא' } };
  }
  return { status: 200, body: platformSessionBody(account) };
}

async function handlePlatformSmsResend(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username || !password) {
    return { status: 400, body: { ok: false, error: 'חסרים פרטי התחברות' } };
  }
  if (!smsConfigured()) {
    return { status: 503, body: { ok: false, error: 'SMS לא מוגדר בשרת' } };
  }
  const store = ensurePlatformSeed();
  const account = store.accounts.find((a) => normalizeUsername(a.username) === username);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return { status: 401, body: { ok: false, error: 'שם משתמש או סיסמה שגויים' } };
  }
  if (!accountRequiresSmsOtp(account) || isSmsVerifiedToday(account.username)) {
    return { status: 200, body: platformSessionBody(account) };
  }
  const phone = normalizeMobilePhone(account.phone);
  if (!phone) {
    return {
      status: 403,
      body: { ok: false, error: 'לא הוגדר נייד לחשבון זה — עדכנו טלפון בפרופיל' },
    };
  }
  const challenge = await startPlatformSmsChallenge(account.username, phone);
  if (!challenge.ok) {
    return { status: 503, body: { ok: false, error: challenge.error } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      smsRequired: true,
      challengeId: challenge.challengeId,
      phoneHint: challenge.phoneHint,
      expiresAt: challenge.expiresAt,
    },
  };
}

async function handleMemberLogin(body) {
  const synagogueId = String(body.synagogueId || '').trim();
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!synagogueId || !username || !password) {
    return { status: 400, body: { ok: false, error: 'חסרים פרטי התחברות' } };
  }
  const bundle = await getBundle(synagogueId);
  const config = bundle?.config;
  if (!config) {
    return { status: 404, body: { ok: false, error: 'בית כנסת לא נמצא' } };
  }
  const members = Array.isArray(config.members) ? config.members : [];
  if (!members.length) {
    const bootUser = 'admin';
    const bootPass = 'admin123';
    if (username === bootUser && password === bootPass) {
      const session = createSession({
        kind: 'member',
        synagogueId,
        memberId: 'bootstrap',
        role: 'owner',
        username: bootUser,
        memberName: 'מנהל',
      });
      return {
        status: 200,
        body: {
          ok: true,
          token: session.token,
          expiresAt: session.expiresAt,
          member: { id: 'bootstrap', name: 'מנהל', username: bootUser, role: 'owner' },
        },
      };
    }
    return { status: 401, body: { ok: false, error: 'שם משתמש או סיסמה שגויים' } };
  }
  const member = members.find((m) => normalizeUsername(m.username || m.name || '') === username);
  if (!member || !verifyPassword(password, member.passwordHash || member.pinHash || '')) {
    return { status: 401, body: { ok: false, error: 'שם משתמש או סיסמה שגויים' } };
  }
  const session = createSession({
    kind: 'member',
    synagogueId,
    memberId: member.id,
    role: member.role || 'editor',
    username: normalizeUsername(member.username || member.name),
    memberName: member.name || member.username,
  });
  return {
    status: 200,
    body: {
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      member: {
        id: member.id,
        name: member.name,
        username: member.username,
        role: member.role,
        email: member.email || '',
      },
    },
  };
}

export async function handlePasswordReset(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {}, req);
    return true;
  }

  try {
    const ip = clientIp(req);

    if (url.pathname === '/api/auth/forgot-password' && req.method === 'POST') {
      const rl = checkRateLimit(`forgot:${ip}`, 10, 60 * 60 * 1000);
      if (!rl.ok) {
        sendJson(res, 429, { ok: false, error: 'יותר מדי בקשות — נסו מאוחר יותר' }, req);
        return true;
      }
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = await handleForgot(body);
      sendJson(res, result.status, result.body, req);
      return true;
    }

    if (url.pathname === '/api/auth/reset-password' && req.method === 'GET') {
      const token = String(url.searchParams.get('token') || '').trim();
      const result = handlePeek(token);
      sendJson(res, result.status, result.body, req);
      return true;
    }

    if (url.pathname === '/api/auth/reset-password' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = await handleReset(body);
      sendJson(res, result.status, result.body, req);
      return true;
    }

    if (url.pathname === '/api/auth/platform-login' && req.method === 'POST') {
      const rl = checkRateLimit(`platlogin:${ip}`, 30, 15 * 60 * 1000);
      if (!rl.ok) {
        sendJson(res, 429, { ok: false, error: 'יותר מדי ניסיונות התחברות' }, req);
        return true;
      }
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = await handlePlatformLogin(body);
      sendJson(res, result.status, result.body, req);
      return true;
    }

    if (url.pathname === '/api/auth/platform-login/sms' && req.method === 'POST') {
      const rl = checkRateLimit(`platsms:${ip}`, 40, 15 * 60 * 1000);
      if (!rl.ok) {
        sendJson(res, 429, { ok: false, error: 'יותר מדי ניסיונות' }, req);
        return true;
      }
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = handlePlatformSmsVerify(body);
      sendJson(res, result.status, result.body, req);
      return true;
    }

    if (url.pathname === '/api/auth/platform-login/sms-resend' && req.method === 'POST') {
      const rl = checkRateLimit(`platsmsresend:${ip}`, 8, 15 * 60 * 1000);
      if (!rl.ok) {
        sendJson(res, 429, { ok: false, error: 'יותר מדי שליחות SMS — נסו מאוחר יותר' }, req);
        return true;
      }
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = await handlePlatformSmsResend(body);
      sendJson(res, result.status, result.body, req);
      return true;
    }

    if (url.pathname === '/api/auth/member-login' && req.method === 'POST') {
      const rl = checkRateLimit(`memlogin:${ip}`, 40, 15 * 60 * 1000);
      if (!rl.ok) {
        sendJson(res, 429, { ok: false, error: 'יותר מדי ניסיונות התחברות' }, req);
        return true;
      }
      const raw = await readBody(req);
      const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
      const result = await handleMemberLogin(body);
      sendJson(res, result.status, result.body, req);
      return true;
    }

    if (url.pathname === '/api/auth/platform-accounts') {
      if (!requirePlatform(req, res)) return true;
      if (req.method === 'GET') {
        const result = handlePlatformAccountsList();
        sendJson(res, result.status, result.body, req);
        return true;
      }
      if (req.method === 'POST') {
        const raw = await readBody(req);
        const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
        const result = handlePlatformAccountCreate(body);
        sendJson(res, result.status, result.body, req);
        return true;
      }
      if (req.method === 'PUT') {
        const raw = await readBody(req);
        const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
        const result = handlePlatformAccountReset(body);
        sendJson(res, result.status, result.body, req);
        return true;
      }
      if (req.method === 'DELETE') {
        const raw = await readBody(req);
        const body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {};
        const result = handlePlatformAccountDelete(body);
        sendJson(res, result.status, result.body, req);
        return true;
      }
    }
  } catch (err) {
    console.error('password-reset api', err);
    const status = err?.statusCode === 413 ? 413 : 500;
    sendJson(res, status, { ok: false, error: String(err?.message || err) }, req);
    return true;
  }

  return false;
}
