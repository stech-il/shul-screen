/**
 * Public self-serve trial signup from the landing page.
 * POST /api/signup/trial
 *
 * Creates a synagogue with a 7-day trial, emails credentials,
 * and (via notification cron) sends a daily reminder until paid.
 * Expired landing trials are purged automatically.
 */
import crypto from 'node:crypto';
import { getBundle, listBundles, putBundle, putRecord, purgeSynagogueData } from './cloudStore.mjs';
import { getPlatformSettings } from './billing.mjs';
import { notifyTrialStarted, notifyAdminNewSignup, mailConfigured } from './notifications.mjs';
import { recordLandingSignup } from './landingAnalytics.mjs';

const TRIAL_DAYS = 7;
const PLATFORM_ID = '_platform';
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_IP = 3;
const MAX_PER_EMAIL = 1;

/** In-memory rate limits (resets on process restart — good enough for abuse brake). */
const rateByIp = new Map();
const rateByEmail = new Map();

const CITY_IDS = new Set([
  'jerusalem',
  'tel-aviv',
  'bnei-brak',
  'petah-tikva',
  'haifa',
  'beersheba',
  'ashdod',
  'ashkelon',
  'netanya',
  'rishon',
  'rehovot',
  'modiin',
  'modiin-illit',
  'beit-shemesh',
  'tiberias',
  'safed',
  'eilat',
  'ariel',
  'kiryat-gat',
  'lod',
  'ramla',
  'herzliya',
  'raanana',
  'kfar-saba',
  'holon',
  'bat-yam',
]);

const ENABLED_ZMANIM = [
  'alotHaShachar',
  'sunrise',
  'sofZmanShmaMGA',
  'sofZmanShma',
  'sofZmanTfillaMGA',
  'sofZmanTfilla',
  'chatzot',
  'minchaGedola',
  'plagHaMincha',
  'sunset',
  'beinHaShmashos',
  'tzeit7083deg',
];

function nowIso() {
  return new Date().toISOString();
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  if (status === 204) {
    res.end();
    return;
  }
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

function clean(value, max = 120) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    ?.trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

function pruneRate(map, key) {
  const now = Date.now();
  const list = (map.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  map.set(key, list);
  return list;
}

function assertRate(ip, email) {
  const ipHits = pruneRate(rateByIp, ip);
  if (ipHits.length >= MAX_PER_IP) {
    return 'יותר מדי בקשות מכתובת זו — נסו שוב מחר או פנו לשירות הלקוחות';
  }
  const emailHits = pruneRate(rateByEmail, email);
  if (emailHits.length >= MAX_PER_EMAIL) {
    return 'כבר נפתח מסך ניסיון לכתובת מייל זו לאחרונה';
  }
  return null;
}

function markRate(ip, email) {
  const now = Date.now();
  rateByIp.set(ip, [...pruneRate(rateByIp, ip), now]);
  rateByEmail.set(email, [...pruneRate(rateByEmail, email), now]);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${hash}`;
}

function randomPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function randomUsername(synagogueId, email) {
  const fromEmail = (email || '')
    .split('@')[0]
    ?.replace(/[^a-z0-9._-]/gi, '')
    .toLowerCase()
    .slice(0, 14);
  const fromId = String(synagogueId).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
  const base = (fromEmail || fromId || 'admin').replace(/^[._-]+|[._-]+$/g, '') || 'admin';
  const suffix = crypto.randomBytes(3).toString('hex').slice(0, 4);
  return `${base}_${suffix}`;
}

function licenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => {
    let s = '';
    const buf = crypto.randomBytes(4);
    for (const b of buf) s += chars[b % chars.length];
    return s;
  };
  return `SHUL-TRIAL-${seg()}-${seg()}`;
}

function expiresAfterDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, Math.round(days)));
  return d.toISOString();
}

function widget(type, z, extras = {}) {
  return {
    id: `w-${type}-${crypto.randomBytes(3).toString('hex')}`,
    type,
    x: 4,
    y: 4,
    w: 26,
    h: 14,
    z,
    visible: true,
    showTitle: ['zmanim', 'block', 'announcements'].includes(type),
    titleLayout: 'above',
    align: ['zmanim', 'block'].includes(type) ? 'right' : 'center',
    fontScale: 1,
    titleScale: 0.55,
    fontWeight: ['clock', 'title'].includes(type) ? 'bold' : 'normal',
    bg: 'panel',
    showBorder: true,
    textShadow: false,
    opacity: 1,
    radius: 12,
    ...extras,
  };
}

function defaultCanvas() {
  return {
    aspect: '16:9',
    backgroundUrl: '',
    backgroundFit: 'cover',
    overlayOpacity: 0.3,
    gridSize: 1,
    widgets: [
      { ...widget('title', 3), x: 28, y: 3, w: 44, h: 12 },
      { ...widget('clock', 3), x: 4, y: 3, w: 22, h: 12 },
      { ...widget('hebrewDate', 3), x: 74, y: 4, w: 22, h: 9 },
      { ...widget('zmanim', 2), x: 68, y: 18, w: 28, h: 56 },
      { ...widget('block', 2), x: 36, y: 18, w: 30, h: 56 },
      { ...widget('parasha', 2), x: 4, y: 18, w: 30, h: 16 },
      { ...widget('dafYomi', 2), x: 4, y: 36, w: 30, h: 16 },
      { ...widget('announcements', 2), x: 4, y: 76, w: 92, h: 20 },
    ],
  };
}

function buildConfig({ id, name, cityId, email, phone, contactName, username, passwordHash }) {
  const now = nowIso();
  return {
    id,
    name,
    cityId,
    dedication: '',
    theme: 'dark',
    layout: 'elegant',
    nusach: 'ashkenaz',
    design: {
      presetId: 'screensmart-navy',
      primaryColor: '#f5f7fa',
      accentColor: '#c9a227',
      backgroundColor: '#0b1c3a',
      backgroundColor2: '#061225',
      panelColor: 'rgba(12, 28, 52, 0.78)',
      mutedColor: '#9aa8b8',
      logoUrl: '',
      backgroundImageUrl: '',
      fontHeading: 'Frank Ruhl Libre',
      fontBody: 'Heebo',
      titleScale: 1,
      clockScale: 1,
      bodyScale: 1,
      panelStyle: 'soft',
      panelRadius: 12,
      showShadows: true,
      density: 'comfortable',
      motion: 'subtle',
      headerStyle: 'centered',
      clockStyle: 'elegant',
      showOrnaments: true,
      overlayOpacity: 0.42,
      accessibilityScale: 1,
      highContrast: false,
    },
    media: {
      logoDataUrl: '',
      backgroundDataUrl: '',
      eventImageUrl: '',
      loopVideoUrl: '',
      gallery: [],
      customFonts: [],
    },
    canvas: defaultCanvas(),
    branding: {
      primaryColor: '#f5f7fa',
      accentColor: '#c9a227',
      logoUrl: '',
    },
    enabledZmanim: [...ENABLED_ZMANIM],
    showWeather: true,
    showDafYomi: true,
    showParasha: true,
    showHebrewDate: true,
    showClock: true,
    showStatus: true,
    showOrefAlerts: true,
    showYahrzeit: true,
    showCalendarExtras: true,
    showOmer: true,
    orefAreaExtra: '',
    modes: {
      autoShabbat: true,
      autoHoliday: true,
      candleOffsetMin: 20,
      showCandleCountdown: true,
      carouselSeconds: 8,
      orefSound: true,
      muteOrefOnShabbat: true,
      specialMode: 'normal',
      eventTitle: '',
      eventSubtitle: '',
      mourningName: '',
    },
    emergency: { active: false, message: '', updatedAt: now },
    announcements: [],
    yahrzeits: [],
    members: [
      {
        id: 'owner-1',
        name: contactName || 'מנהל',
        username,
        role: 'owner',
        passwordHash,
      },
    ],
    contactEmail: email,
    contactPhone: phone,
    contactName,
    signupSource: 'landing',
    license: {
      key: licenseKey(),
      plan: 'trial',
      activatedAt: now,
      expiresAt: expiresAfterDays(TRIAL_DAYS),
      holderName: name,
      synagogueId: id,
      serverValidated: true,
    },
    updatedAt: now,
    revision: 1,
    blocks: [
      {
        id: 'weekday',
        title: 'זמני תפילות חול',
        enabled: true,
        items: [
          { id: 'w1', title: 'שחרית', time: '06:30' },
          { id: 'w2', title: 'מנחה', time: '19:00', fromZman: 'sunset', offsetMinutes: -20 },
          { id: 'w3', title: 'מעריב', time: '20:30', fromZman: 'tzeit7083deg', offsetMinutes: 15 },
        ],
      },
      {
        id: 'shabbat',
        title: 'זמני תפילות שבת',
        enabled: true,
        items: [
          { id: 's1', title: 'מנחה ערב שבת', time: '19:00', fromZman: 'sunset', offsetMinutes: -20 },
          { id: 's2', title: 'שחרית', time: '08:30' },
          { id: 's3', title: 'מנחה', time: '18:30', fromZman: 'sunset', offsetMinutes: -45 },
          { id: 's4', title: 'מעריב מוצ״ש', time: '20:15', fromZman: 'tzeit7083deg', offsetMinutes: 30 },
        ],
      },
      {
        id: 'shiurim',
        title: 'שיעורי תורה',
        enabled: true,
        items: [{ id: 'sh1', title: 'הדף היומי', time: '19:30', note: 'בימי חול' }],
      },
    ],
  };
}

async function nextScreenId() {
  const bundles = await listBundles();
  let max = 0;
  for (const b of bundles) {
    const id = String(b?.config?.id || '').trim();
    if (!/^\d+$/.test(id)) continue;
    const n = Number(id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let candidate = max + 1;
  // Avoid rare race / hole collisions
  for (let i = 0; i < 50; i += 1) {
    const id = String(candidate + i);
    const existing = await getBundle(id);
    if (!existing) return id;
  }
  return String(Date.now()).slice(-10);
}

function publicOrigin(req, bodyOrigin) {
  const fromBody = clean(bodyOrigin, 200);
  if (fromBody.startsWith('http://') || fromBody.startsWith('https://')) {
    return fromBody.replace(/\/$/, '');
  }
  const env = clean(process.env.PUBLIC_ORIGIN || process.env.APP_ORIGIN, 200);
  if (env.startsWith('http')) return env.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (host) return `${proto}://${host}`;
  return '';
}

async function seedBilling(id, email, phone, contactName) {
  try {
    const plat = await getPlatformSettings();
    const amount = Number(plat.defaultAmount) > 0 ? Number(plat.defaultAmount) : 99;
    await putRecord('billing', id, {
      synagogueId: id,
      amount,
      listAmount: amount,
      couponCode: '',
      active: true,
      status: 'none',
      customerId: null,
      recurringItemId: null,
      payerName: contactName || '',
      payerEmail: email,
      payerPhone: phone,
      invoiceEmail: email,
      cardMask: '',
      paidUntil: null,
      lastChargeAt: null,
      lastError: null,
      lastSumitSyncAt: null,
      updatedAt: nowIso(),
      history: [],
    });
  } catch (err) {
    console.warn('trial signup billing seed failed', err);
  }
}

/**
 * Purge landing-page trials that expired and never converted to a paid plan.
 * Grace: ~12h after expiresAt so the "trial ended" mail can go out first.
 */
export async function purgeExpiredLandingTrials() {
  const bundles = await listBundles();
  const graceMs = 12 * 60 * 60 * 1000;
  const purged = [];
  for (const b of bundles) {
    const cfg = b?.config;
    if (!cfg?.id) continue;
    if (cfg.signupSource !== 'landing') continue;
    const lic = cfg.license;
    if (!lic || lic.plan !== 'trial' || !lic.expiresAt) continue;
    const expires = Date.parse(lic.expiresAt);
    if (!Number.isFinite(expires)) continue;
    if (Date.now() < expires + graceMs) continue;
    try {
      await purgeSynagogueData(cfg.id);
      purged.push(cfg.id);
      console.log(`Trial signup: purged expired landing trial ${cfg.id}`);
    } catch (err) {
      console.error(`Trial signup: purge failed for ${cfg.id}`, err);
    }
  }
  return { ok: true, purged };
}

async function createTrialSignup(req, body) {
  const contactName = clean(body.contactName || body.name, 80);
  const phone = clean(body.phone, 30);
  const email = clean(body.email, 120).toLowerCase();
  const synagogueName = clean(body.synagogueName || body.name, 100);
  const cityId = clean(body.cityId, 40) || 'petah-tikva';
  const notes = clean(body.notes || body.message, 500);

  if (contactName.length < 2) return { status: 400, body: { ok: false, error: 'נא למלא שם מלא' } };
  if (phone.replace(/\D/g, '').length < 9) {
    return { status: 400, body: { ok: false, error: 'נא למלא מספר טלפון תקין' } };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { ok: false, error: 'נא למלא כתובת מייל תקינה' } };
  }
  if (synagogueName.length < 2) {
    return { status: 400, body: { ok: false, error: 'נא למלא שם בית הכנסת' } };
  }
  if (!CITY_IDS.has(cityId)) {
    return { status: 400, body: { ok: false, error: 'יש לבחור עיר מהרשימה' } };
  }

  const ip = clientIp(req);
  const rateError = assertRate(ip, email);
  if (rateError) return { status: 429, body: { ok: false, error: rateError } };

  const id = await nextScreenId();
  const username = randomUsername(id, email);
  const password = randomPassword(12);
  const passwordHash = hashPassword(password);
  const config = buildConfig({
    id,
    name: synagogueName,
    cityId,
    email,
    phone,
    contactName,
    username,
    passwordHash,
  });
  if (notes) {
    config.announcements = [
      {
        id: 'a-welcome',
        text: 'ברוכים הבאים — תקופת ניסיון פעילה. עדכנו זמני תפילה והודעות בפאנל הניהול.',
        enabled: true,
      },
    ];
  }

  await putBundle(id, {
    config,
    syncedAt: nowIso(),
    pendingSync: false,
  });
  await seedBilling(id, email, phone, contactName);
  markRate(ip, email);

  const origin = publicOrigin(req, body.origin);
  const loginUrl = origin ? `${origin}/login/${encodeURIComponent(id)}` : `/login/${encodeURIComponent(id)}`;
  const displayUrl = origin
    ? `${origin}/display/${encodeURIComponent(id)}`
    : `/display/${encodeURIComponent(id)}`;
  const billingUrl = origin
    ? `${origin}/login/${encodeURIComponent(id)}?billing=1`
    : `/login/${encodeURIComponent(id)}?billing=1`;

  let mailOk = false;
  let mailError = '';
  try {
    const mailResult = await notifyTrialStarted(id, {
      username,
      password,
      loginUrl,
      displayUrl,
      to: email,
    });
    mailOk = Boolean(mailResult?.ok && !mailResult?.skipped);
    if (mailResult?.error) mailError = String(mailResult.error);
    if (!mailConfigured()) mailError = mailError || 'SMTP לא מוגדר';
  } catch (err) {
    mailError = String(err?.message || err);
  }

  try {
    await notifyAdminNewSignup({
      name: synagogueName,
      email,
      phone,
      contactName,
      cityId,
      synagogueId: id,
      loginUrl,
      expiresAt: config.license.expiresAt,
    });
  } catch (err) {
    console.warn('admin signup notify failed', err);
  }

  try {
    await recordLandingSignup();
  } catch (err) {
    console.warn('landing signup counter failed', err);
  }

  return {
    status: 201,
    body: {
      ok: true,
      synagogueId: id,
      name: synagogueName,
      username,
      password,
      loginUrl,
      displayUrl,
      billingUrl,
      trialDays: TRIAL_DAYS,
      expiresAt: config.license.expiresAt,
      email,
      mailOk,
      mailError: mailOk ? '' : mailError,
      message: mailOk
        ? `המערכת נפתחה — פרטי הכניסה נשלחו ל־${email}`
        : 'המערכת נפתחה — שמרו את פרטי הכניסה (שליחת המייל נכשלה או SMTP כבוי)',
    },
  };
}

export async function handleTrialSignup(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  try {
    if (url.pathname === '/api/signup/trial' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const result = await createTrialSignup(req, body);
      sendJson(res, result.status, result.body);
      return true;
    }

    if (url.pathname === '/api/signup/purge-expired' && req.method === 'POST') {
      const result = await purgeExpiredLandingTrials();
      sendJson(res, 200, result);
      return true;
    }

    sendJson(res, 404, { error: 'not found' });
    return true;
  } catch (err) {
    console.error('trial signup api', err);
    sendJson(res, 500, { ok: false, error: String(err?.message || err) });
    return true;
  }
}

export { TRIAL_DAYS, PLATFORM_ID };
