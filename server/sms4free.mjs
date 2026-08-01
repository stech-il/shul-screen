/**
 * sms4free.co.il SMS + platform daily OTP helpers.
 * Credentials never leave the server.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DAILY_FILE = path.join(ROOT_DIR, 'platform-sms-daily.json');
const CHALLENGES_FILE = path.join(ROOT_DIR, 'platform-sms-challenges.json');

const API_URL = 'https://api.sms4free.co.il/ApiSMS/v2/SendSMS';
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LEN = 6;

/** @type {Map<string, object>} */
const challenges = new Map();
/** @type {Record<string, { day: string; at: string }>} */
let dailyVerified = {};

function ensureRoot() {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
}

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function persistDaily() {
  try {
    ensureRoot();
    fs.writeFileSync(DAILY_FILE, JSON.stringify(dailyVerified, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

function persistChallenges() {
  try {
    ensureRoot();
    const now = Date.now();
    const rows = [...challenges.values()].filter((c) => c.expiresAt > now);
    fs.writeFileSync(CHALLENGES_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

function loadState() {
  dailyVerified = loadJson(DAILY_FILE, {}) || {};
  const rows = loadJson(CHALLENGES_FILE, []);
  const now = Date.now();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.id && row.expiresAt > now) challenges.set(row.id, row);
  }
}

loadState();

export function smsConfigured() {
  return Boolean(
    String(process.env.SMS4FREE_KEY || '').trim() &&
      String(process.env.SMS4FREE_USER || '').trim() &&
      String(process.env.SMS4FREE_PASS || '').trim(),
  );
}

/**
 * Master switch — OTP at login is OFF unless explicitly enabled.
 * Set PLATFORM_SMS_OTP_ENABLED=true in Render only after sms4free sender is verified.
 */
export function smsOtpEnforcementEnabled() {
  const v = String(process.env.PLATFORM_SMS_OTP_ENABLED || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function smsSender() {
  return String(process.env.SMS4FREE_SENDER || process.env.SMS4FREE_USER || '')
    .trim()
    .slice(0, 11);
}

/** Normalize Israeli mobile to 05xxxxxxxx (digits only). */
export function normalizeMobilePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`;
  if (!/^05\d{8}$/.test(d)) return '';
  return d;
}

export function phoneHint(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (p.length < 4) return '****';
  return `***${p.slice(-4)}`;
}

export function smsStatusPublic() {
  const configured = smsConfigured();
  const otpEnabled = smsOtpEnforcementEnabled();
  const sender = smsSender();
  const user = String(process.env.SMS4FREE_USER || '').trim();
  const ready = configured && otpEnabled && Boolean(sender);
  return {
    configured,
    otpEnabled,
    ready,
    sender: sender || null,
    userHint: phoneHint(user),
    notes: !configured
      ? 'חסרים SMS4FREE_KEY / SMS4FREE_USER / SMS4FREE_PASS ב־Render'
      : !otpEnabled
        ? 'אימות SMS בכניסה כבוי (PLATFORM_SMS_OTP_ENABLED לא מופעל) — ניתן להיכנס עם סיסמה'
        : !sender
          ? 'חסר SMS4FREE_SENDER'
          : 'מוכן — ודאו שמספר השולח אומת באתר sms4free',
  };
}

/** Asia/Jerusalem calendar day YYYY-MM-DD */
export function jerusalemDayKey(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function isSmsVerifiedToday(username) {
  const u = String(username || '')
    .trim()
    .toLowerCase();
  if (!u) return false;
  const row = dailyVerified[u];
  return Boolean(row && row.day === jerusalemDayKey());
}

export function markSmsVerifiedToday(username) {
  const u = String(username || '')
    .trim()
    .toLowerCase();
  if (!u) return;
  dailyVerified[u] = { day: jerusalemDayKey(), at: new Date().toISOString() };
  persistDaily();
}

/**
 * @returns {Promise<{ ok: true; status: number; message: string } | { ok: false; status: number; message: string; error: string }>}
 */
export async function sendSms({ recipient, msg }) {
  if (!smsConfigured()) {
    return { ok: false, status: 0, message: 'SMS not configured', error: 'SMS לא מוגדר בשרת' };
  }
  const to = String(recipient || '').trim();
  const text = String(msg || '').trim();
  if (!to) {
    return { ok: false, status: -3, message: 'no recipients', error: 'לא נמצאו נמענים' };
  }
  if (!text) {
    return { ok: false, status: -5, message: 'bad message', error: 'הודעה לא מתאימה' };
  }

  const payload = {
    key: String(process.env.SMS4FREE_KEY || '').trim(),
    user: String(process.env.SMS4FREE_USER || '').trim(),
    pass: String(process.env.SMS4FREE_PASS || '').trim(),
    sender: smsSender(),
    recipient: to,
    msg: text,
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) || {};
    const status = Number(data.status);
    const message = String(data.message || '');
    if (Number.isFinite(status) && status > 0) {
      return { ok: true, status, message };
    }
    const errMap = {
      0: 'שגיאה כללית בשליחת SMS',
      [-1]: 'מפתח, שם משתמש או סיסמת SMS שגויים',
      [-2]: 'שם או מספר שולח ההודעה שגוי',
      [-3]: 'לא נמצאו נמענים',
      [-4]: 'יתרת הודעות SMS נמוכה',
      [-5]: 'הודעה לא מתאימה',
      [-6]: 'יש לאמת מספר שולח ב־sms4free',
    };
    return {
      ok: false,
      status: Number.isFinite(status) ? status : 0,
      message,
      error: errMap[status] || message || 'שליחת SMS נכשלה',
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: String(err?.message || err),
      error: 'שגיאת רשת בשליחת SMS',
    };
  }
}

function genOtp() {
  const n = crypto.randomInt(0, 10 ** OTP_LEN);
  return String(n).padStart(OTP_LEN, '0');
}

/**
 * Create OTP challenge and send SMS to the given mobile.
 * @param {string} username
 * @param {string} phoneRaw — per-account mobile (required)
 * @returns {Promise<{ ok: true; challengeId: string; phoneHint: string; expiresAt: number } | { ok: false; error: string }>}
 */
export async function startPlatformSmsChallenge(username, phoneRaw) {
  const u = String(username || '')
    .trim()
    .toLowerCase();
  const phone = normalizeMobilePhone(phoneRaw);
  if (!phone) {
    return {
      ok: false,
      error: 'לא הוגדר מספר נייד לחשבון זה — עדכנו טלפון בפרופיל מנהל המערכת',
    };
  }

  // Invalidate prior open challenges for this user
  for (const [id, row] of challenges) {
    if (row.username === u) challenges.delete(id);
  }

  const code = genOtp();
  const id = crypto.randomBytes(16).toString('base64url');
  const row = {
    id,
    username: u,
    codeHash: crypto.createHash('sha256').update(code).digest('hex'),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    createdAt: Date.now(),
  };
  challenges.set(id, row);
  persistChallenges();

  const sent = await sendSms({
    recipient: phone,
    msg: `screensmart — קוד כניסה למנהל מערכת: ${code}\nתקף ל־5 דקות.`,
  });
  if (!sent.ok) {
    challenges.delete(id);
    persistChallenges();
    return { ok: false, error: sent.error || 'שליחת SMS נכשלה' };
  }

  return {
    ok: true,
    challengeId: id,
    phoneHint: phoneHint(phone),
    expiresAt: row.expiresAt,
  };
}

/**
 * @returns {{ ok: true; username: string } | { ok: false; error: string }}
 */
export function verifyPlatformSmsChallenge(challengeId, code) {
  const id = String(challengeId || '').trim();
  const otp = String(code || '')
    .trim()
    .replace(/\s+/g, '');
  const row = challenges.get(id);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) {
      challenges.delete(id);
      persistChallenges();
    }
    return { ok: false, error: 'פג תוקף הקוד — התחברו מחדש' };
  }
  row.attempts += 1;
  if (row.attempts > 8) {
    challenges.delete(id);
    persistChallenges();
    return { ok: false, error: 'יותר מדי ניסיונות — התחברו מחדש' };
  }
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  if (hash !== row.codeHash) {
    persistChallenges();
    return { ok: false, error: 'קוד שגוי' };
  }
  challenges.delete(id);
  persistChallenges();
  markSmsVerifiedToday(row.username);
  return { ok: true, username: row.username };
}
