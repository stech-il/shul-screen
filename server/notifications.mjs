/**
 * License / billing email notifications.
 * Tracks what was already sent (disk) so we don't spam.
 */
import { getBundle, getRecord, listBundles, listRecords, putRecord } from './cloudStore.mjs';
import { mailConfigured, mailStatus, sendMail, verifySmtp } from './mail.mjs';

const PREFIX = 'notify-log';
const PLATFORM_ID = '_platform';
const TRIAL_DAYS = 7;

function nowIso() {
  return new Date().toISOString();
}

function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((Date.parse(iso) - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatDateHe(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

async function loadLog(synagogueId) {
  const rec = await getRecord(PREFIX, synagogueId);
  return rec && typeof rec === 'object'
    ? { synagogueId, sent: rec.sent || {}, updatedAt: rec.updatedAt }
    : { synagogueId, sent: {}, updatedAt: null };
}

async function markSent(synagogueId, key) {
  const log = await loadLog(synagogueId);
  log.sent[key] = nowIso();
  log.updatedAt = nowIso();
  await putRecord(PREFIX, synagogueId, log);
}

function alreadySent(log, key) {
  return Boolean(log.sent?.[key]);
}

async function platformAdminEmail() {
  try {
    const plat = await getRecord('billing', PLATFORM_ID);
    return (plat?.adminEmail || '').trim();
  } catch {
    return '';
  }
}

async function resolveRecipient(synagogueId) {
  const bundle = await getBundle(synagogueId);
  const config = bundle?.config;
  const billing = await getRecord('billing', synagogueId).catch(() => null);
  const contact =
    (config?.contactEmail || '').trim() ||
    (billing?.invoiceEmail || '').trim() ||
    (billing?.payerEmail || '').trim();
  const admin = await platformAdminEmail();
  return {
    to: contact,
    admin,
    name: config?.name || synagogueId,
    config,
    billing,
    license: config?.license || null,
  };
}

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f7f5f0;color:#1c3140;padding:24px;direction:rtl;text-align:right">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e1d8">
    <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;color:#a8893d">screensmart</p>
    <h1 style="margin:0 0 16px;font-size:22px">${title}</h1>
    ${bodyHtml}
    <p style="margin:28px 0 0;font-size:12px;color:#8a97a0">הודעה אוטומטית ממערכת screensmart</p>
  </div>
</body></html>`;
}

async function dispatch(synagogueId, key, { subject, text, html, alsoAdmin = true, toOverride = '' }) {
  if (!mailConfigured()) {
    return { ok: false, skipped: true, error: 'SMTP לא מוגדר' };
  }
  const log = await loadLog(synagogueId);
  if (alreadySent(log, key)) {
    return { ok: true, skipped: true, reason: 'already-sent' };
  }
  const { to, admin, name } = await resolveRecipient(synagogueId);
  const recipients = [];
  const primary = String(toOverride || to || '').trim();
  if (primary) recipients.push(primary);
  if (alsoAdmin && admin && admin !== primary) recipients.push(admin);
  if (!recipients.length) {
    return { ok: false, skipped: true, error: 'אין כתובת מייל ללקוח או למנהל' };
  }
  const result = await sendMail({
    to: recipients[0],
    bcc: recipients.slice(1),
    subject: subject.replace('{name}', name),
    text,
    html,
  });
  if (result.ok) await markSent(synagogueId, key);
  return { ...result, to: recipients };
}

export async function notifyTrialStarted(synagogueId, opts = {}) {
  const { name, license } = await resolveRecipient(synagogueId);
  const until = formatDateHe(license?.expiresAt);
  const username = String(opts.username || '').trim();
  const password = String(opts.password || '').trim();
  const loginUrl = String(opts.loginUrl || '').trim();
  const displayUrl = String(opts.displayUrl || '').trim();
  const hasCreds = Boolean(username && password);

  const subject = hasCreds
    ? `ברוכים הבאים ל־screensmart — פרטי הכניסה של ${name}`
    : `תקופת ניסיון התחילה — ${name}`;

  const credsText = hasCreds
    ? `\nפרטי כניסה לניהול המסך:\nשם משתמש: ${username}\nסיסמה: ${password}\nקישור לניהול: ${loginUrl || '—'}\nקישור למסך החי: ${displayUrl || '—'}\n`
    : '';

  const text = `שלום,\n\nבית הכנסת «${name}» נפתח במערכת screensmart עם תקופת ניסיון של ${TRIAL_DAYS} ימים.\nהניסיון בתוקף עד ${until}.\n${credsText}\nלאחר תקופת הניסיון יש להפעיל מנוי כדי שהמסך ימשיך לפעול.\n`;

  const credsHtml = hasCreds
    ? `<div style="margin:20px 0;padding:18px;background:#f4f8f6;border:1px solid #d5e5dc;border-radius:10px">
         <p style="margin:0 0 10px;font-weight:700;color:#1c5c3e">פרטי הכניסה לניהול</p>
         <table style="width:100%;border-collapse:collapse;font-size:15px">
           <tr><td style="padding:6px 0;color:#6b7a80;width:110px">שם משתמש</td><td style="padding:6px 0;font-family:Consolas,monospace;font-weight:700;direction:ltr;text-align:left">${escapeHtml(username)}</td></tr>
           <tr><td style="padding:6px 0;color:#6b7a80">סיסמה</td><td style="padding:6px 0;font-family:Consolas,monospace;font-weight:700;direction:ltr;text-align:left">${escapeHtml(password)}</td></tr>
         </table>
         <p style="margin:14px 0 6px">
           <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#163038;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">כניסה לניהול המסך</a>
         </p>
         ${displayUrl ? `<p style="margin:8px 0 0;font-size:13px"><a href="${escapeHtml(displayUrl)}" style="color:#163038">פתיחת המסך החי</a></p>` : ''}
       </div>`
    : '';

  const html = wrapHtml(
    hasCreds ? 'המערכת מוכנה — פרטי הכניסה' : 'תקופת ניסיון התחילה',
    `<p>שלום,</p>
     <p>בית הכנסת <strong>«${escapeHtml(name)}»</strong> נפתח במערכת <strong>screensmart</strong>.</p>
     <p>תקופת ניסיון של <strong>${TRIAL_DAYS} ימים</strong> בתוקף עד <strong>${escapeHtml(until)}</strong>.</p>
     ${credsHtml}
     <p style="margin-top:18px;color:#5f737a;font-size:14px">בתום הניסיון יש להפעיל מנוי חודשי כדי שהמסך ימשיך לפעול.</p>`,
  );

  return dispatch(synagogueId, `trial-started:${license?.expiresAt || 'x'}`, {
    subject,
    text,
    html,
    alsoAdmin: true,
    toOverride: String(opts.to || '').trim(),
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function notifyTrialEnding(synagogueId, daysLeft) {
  const { name, license } = await resolveRecipient(synagogueId);
  const until = formatDateHe(license?.expiresAt);
  const subject =
    daysLeft <= 0
      ? `תקופת הניסיון הסתיימה — ${name}`
      : `תזכורת: הניסיון מסתיים בעוד ${daysLeft} ימים — ${name}`;
  const text =
    daysLeft <= 0
      ? `שלום,\n\nתקופת הניסיון של «${name}» הסתיימה (${until}). המסך נעול עד להפעלת מנוי.\n`
      : `שלום,\n\nתקופת הניסיון של «${name}» מסתיימת בעוד ${daysLeft} ימים (עד ${until}).\nמומלץ להפעיל מנוי חודשי לפני הנעילה.\n`;
  const html = wrapHtml(
    daysLeft <= 0 ? 'תקופת הניסיון הסתיימה' : 'הניסיון עומד להסתיים',
    daysLeft <= 0
      ? `<p>תקופת הניסיון של <strong>«${name}»</strong> הסתיימה (${until}).</p><p>המסך נעול עד להפעלת מנוי חודשי.</p>`
      : `<p>תקופת הניסיון של <strong>«${name}»</strong> מסתיימת בעוד <strong>${daysLeft} ימים</strong> (עד ${until}).</p>
         <p>מומלץ להפעיל מנוי חודשי לפני שהמסך יינעל.</p>`,
  );
  const key =
    daysLeft <= 0
      ? `trial-expired:${license?.expiresAt || 'x'}`
      : `trial-ending-${daysLeft}:${license?.expiresAt || 'x'}`;
  return dispatch(synagogueId, key, { subject, text, html });
}

export async function notifyLicenseEnding(synagogueId, daysLeft) {
  const { name, license } = await resolveRecipient(synagogueId);
  if (!license || license.plan === 'trial') return { ok: true, skipped: true };
  const until = formatDateHe(license.expiresAt);
  const subject = `הרישיון מסתיים בעוד ${daysLeft} ימים — ${name}`;
  const text = `שלום,\n\nהרישיון של «${name}» בתוקף עד ${until} (עוד ${daysLeft} ימים).\nאם יש הוראת קבע פעילה — החיוב יתחדש אוטומטית. אחרת יש לעדכן תשלום.\n`;
  const html = wrapHtml(
    'תזכורת חידוש רישיון',
    `<p>הרישיון של <strong>«${name}»</strong> בתוקף עד <strong>${until}</strong> (עוד ${daysLeft} ימים).</p>
     <p>אם יש הוראת קבע פעילה — החיוב יתחדש אוטומטית. אחרת יש לעדכן אמצעי תשלום.</p>`,
  );
  return dispatch(synagogueId, `license-ending-${daysLeft}:${license.expiresAt || 'x'}`, {
    subject,
    text,
    html,
  });
}

export async function notifyPaymentSuccess(synagogueId, { amount, paidUntil } = {}) {
  const { name } = await resolveRecipient(synagogueId);
  const until = formatDateHe(paidUntil);
  const amountLabel = amount != null ? `${amount}₪` : 'התשלום';
  // Allow one success mail per paidUntil window
  const key = `payment-ok:${paidUntil || nowIso().slice(0, 10)}`;
  const subject = `התשלום התקבל — ${name}`;
  const text = `שלום,\n\nהתשלום עבור «${name}» (${amountLabel}) התקבל בהצלחה.\nהרישיון חודש עד ${until}.\n`;
  const html = wrapHtml(
    'התשלום התקבל',
    `<p>התשלום עבור <strong>«${name}»</strong> (${amountLabel}) התקבל בהצלחה.</p>
     <p>הרישיון חודש עד <strong>${until}</strong>.</p>`,
  );
  return dispatch(synagogueId, key, { subject, text, html });
}

export async function notifyPaymentFailed(synagogueId, { error } = {}) {
  const { name } = await resolveRecipient(synagogueId);
  const day = nowIso().slice(0, 10);
  const key = `payment-fail:${day}`;
  const errText = (error || 'שגיאה לא ידועה').slice(0, 200);
  const subject = `בעיית תשלום — ${name}`;
  const text = `שלום,\n\nהחיוב החודשי עבור «${name}» נכשל.\nסיבה: ${errText}\n\nיש לעדכן כרטיס אשראי בהקדם כדי שהמסך לא יינעל.\n`;
  const html = wrapHtml(
    'בעיית תשלום',
    `<p>החיוב החודשי עבור <strong>«${name}»</strong> נכשל.</p>
     <p style="color:#a33">סיבה: ${errText}</p>
     <p>יש לעדכן כרטיס אשראי בהקדם כדי שהמסך לא יינעל.</p>`,
  );
  return dispatch(synagogueId, key, { subject, text, html, alsoAdmin: true });
}

/**
 * Scan all synagogues and send due trial/license reminders.
 */
export async function runNotificationCycle() {
  if (!mailConfigured()) return { skipped: true, reason: 'smtp-off' };
  const bundles = await listBundles();
  let sent = 0;
  let checked = 0;
  for (const b of bundles) {
    const cfg = b?.config;
    if (!cfg?.id) continue;
    checked += 1;
    const lic = cfg.license;
    if (!lic?.expiresAt) continue;
    const left = daysUntil(lic.expiresAt);
    if (left == null) continue;

    try {
      if (lic.plan === 'trial') {
        if (left <= 0) {
          const r = await notifyTrialEnding(cfg.id, 0);
          if (r.ok && !r.skipped) sent += 1;
        } else if (left <= 1) {
          const r = await notifyTrialEnding(cfg.id, 1);
          if (r.ok && !r.skipped) sent += 1;
        } else if (left <= 3) {
          const r = await notifyTrialEnding(cfg.id, 3);
          if (r.ok && !r.skipped) sent += 1;
        }
      } else if (!lic.locked) {
        if (left === 7 || left === 3 || left === 1) {
          const r = await notifyLicenseEnding(cfg.id, left);
          if (r.ok && !r.skipped) sent += 1;
        }
      }
    } catch (err) {
      console.error(`notify cycle failed for ${cfg.id}`, err);
    }
  }

  // Also surface billing failures that were stored today
  try {
    const subs = await listRecords('billing');
    for (const sub of subs) {
      if (!sub?.synagogueId || sub.synagogueId === PLATFORM_ID) continue;
      if (sub.status === 'failed' && sub.lastError) {
        const r = await notifyPaymentFailed(sub.synagogueId, { error: sub.lastError });
        if (r.ok && !r.skipped) sent += 1;
      }
    }
  } catch (err) {
    console.warn('notify billing scan failed', err);
  }

  return { ok: true, checked, sent };
}

/** ms until next 09:00 Asia/Jerusalem */
function msUntilMorning() {
  const now = new Date();
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
  const elapsed = ((h * 60 + m) * 60 + s) * 1000;
  const target = ((9 * 60) * 60) * 1000; // 09:00
  const dayMs = 24 * 60 * 60 * 1000;
  let wait = target - elapsed;
  if (wait < 60_000) wait += dayMs;
  return wait;
}

let cronTimer = null;

export function startNotificationCron() {
  if (cronTimer) return;
  if (!mailConfigured()) {
    console.log('Notifications: SMTP not configured — email alerts disabled');
    return;
  }
  const schedule = () => {
    const delay = msUntilMorning();
    console.log(
      `Notifications: next daily scan in ~${(delay / 3_600_000).toFixed(1)}h (09:00 Asia/Jerusalem)`,
    );
    cronTimer = setTimeout(() => {
      void runNotificationCycle()
        .then((r) => console.log('Notifications: daily done', r))
        .catch((err) => console.error('Notifications: daily failed', err))
        .finally(() => schedule());
    }, delay);
  };
  // Catch-up shortly after boot
  setTimeout(() => {
    void runNotificationCycle()
      .then((r) => console.log('Notifications: startup scan', r))
      .catch(() => {});
  }, 90_000);
  schedule();
}

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
  if (status === 204) {
    res.end();
    return;
  }
  res.end(JSON.stringify(obj));
}

export async function handleNotifications(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (url.pathname === '/api/notifications/status' && req.method === 'GET') {
      sendJson(res, 200, mailStatus());
      return;
    }

    if (url.pathname === '/api/notifications/verify' && req.method === 'POST') {
      const result = await verifySmtp();
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (url.pathname === '/api/notifications/test' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const to = String(body.to || '').trim();
      if (!to) {
        sendJson(res, 400, { error: 'missing to' });
        return;
      }
      const result = await sendMail({
        to,
        subject: 'screensmart — בדיקת SMTP',
        text: 'אם קיבלת מייל זה — חיבור ה־SMTP עובד.',
        html: wrapHtml(
          'בדיקת SMTP',
          '<p>אם קיבלת מייל זה — חיבור ה־SMTP עובד כראוי.</p>',
        ),
      });
      sendJson(res, result.ok ? 200 : 500, result);
      return;
    }

    if (url.pathname === '/api/notifications/run' && req.method === 'POST') {
      const result = await runNotificationCycle();
      sendJson(res, 200, result);
      return;
    }

    if (url.pathname === '/api/notifications/event' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const type = String(body.type || '');
      const synagogueId = String(body.synagogueId || '');
      if (!synagogueId) {
        sendJson(res, 400, { error: 'missing synagogueId' });
        return;
      }
      let result;
      if (type === 'trial-started') {
        result = await notifyTrialStarted(synagogueId, {
          username: body.username,
          password: body.password,
          loginUrl: body.loginUrl,
          displayUrl: body.displayUrl,
          to: body.to,
        });
      } else if (type === 'payment-failed') {
        result = await notifyPaymentFailed(synagogueId, { error: body.error });
      } else if (type === 'payment-success') {
        result = await notifyPaymentSuccess(synagogueId, {
          amount: body.amount,
          paidUntil: body.paidUntil,
        });
      } else {
        sendJson(res, 400, { error: 'unknown type' });
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('notifications api', err);
    sendJson(res, 500, { error: String(err?.message || err) });
  }
}

export { mailConfigured, mailStatus, verifySmtp, sendMail };
