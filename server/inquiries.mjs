/**
 * Public contact / inquiry inbox for platform admin (Agency).
 * Stores records under cloudStore prefix `inquiries` and emails:
 *  - platform admin (new inquiry)
 *  - submitter (auto-reply confirmation)
 *  - synagogue contactEmail when synagogueId is provided
 */
import { getBundle, getRecord, listRecords, putRecord } from './cloudStore.mjs';
import { mailConfigured, sendMail } from './mail.mjs';

const PREFIX = 'inquiries';
const PLATFORM_ID = '_platform';
const TOPICS = new Set([
  'fault',
  'support',
  'content',
  'billing',
  'feature',
  'other',
  'general',
  'demo',
]);
const STATUSES = new Set(['new', 'read', 'done']);

/** @type {Map<string, number[]>} */
const rateByIp = new Map();

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return `inq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

function rateOk(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = 8;
  const prev = (rateByIp.get(ip) || []).filter((t) => now - t < windowMs);
  if (prev.length >= max) {
    rateByIp.set(ip, prev);
    return false;
  }
  prev.push(now);
  rateByIp.set(ip, prev);
  return true;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function topicLabel(topic) {
  const map = {
    fault: 'תקלה במסך',
    support: 'תמיכה טכנית',
    content: 'תוכן / עיצוב',
    billing: 'תשלום / רישיון',
    feature: 'בקשת שיפור',
    other: 'אחר',
    general: 'פנייה כללית',
    demo: 'בקשת הדגמה',
  };
  return map[topic] || topic;
}

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f4f1ea;padding:24px;color:#1c2830">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2ddd2">
    <h1 style="margin:0 0 12px;font-size:1.35rem;color:#163038">${title}</h1>
    ${bodyHtml}
    <p style="margin:28px 0 0;font-size:12px;color:#6b7a80">screensmart · מערכת פניות</p>
  </div>
</body></html>`;
}

async function platformAdminEmail() {
  try {
    const plat = await getRecord('billing', PLATFORM_ID);
    return (plat?.adminEmail || '').trim();
  } catch {
    return '';
  }
}

async function synagogueContact(synagogueId) {
  if (!synagogueId) return { name: '', email: '' };
  try {
    const bundle = await getBundle(synagogueId);
    const config = bundle?.config;
    const billing = await getRecord('billing', synagogueId).catch(() => null);
    const email =
      (config?.contactEmail || '').trim() ||
      (billing?.invoiceEmail || '').trim() ||
      (billing?.payerEmail || '').trim();
    return { name: config?.name || synagogueId, email };
  } catch {
    return { name: synagogueId, email: '' };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function notifyEmails(inquiry) {
  if (!mailConfigured()) {
    return { admin: { skipped: true }, submitter: { skipped: true }, synagogue: { skipped: true } };
  }

  const admin = await platformAdminEmail();
  const shul = await synagogueContact(inquiry.synagogueId);
  const topic = topicLabel(inquiry.topic);
  const safeMsg = escapeHtml(inquiry.message).replace(/\n/g, '<br/>');

  const results = {
    admin: { skipped: true },
    submitter: { skipped: true },
    synagogue: { skipped: true },
  };

  if (admin) {
    results.admin = await sendMail({
      to: admin,
      replyTo: inquiry.email,
      subject: `פנייה חדשה — ${topic} · ${inquiry.name}`,
      text: [
        `פנייה חדשה ב־screensmart`,
        `נושא: ${topic}`,
        `שם: ${inquiry.name}`,
        `מייל: ${inquiry.email}`,
        inquiry.phone ? `טלפון: ${inquiry.phone}` : '',
        inquiry.synagogueId ? `בית כנסת: ${shul.name || inquiry.synagogueId}` : '',
        '',
        inquiry.message,
        '',
        `מזהה: ${inquiry.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
      html: wrapHtml(
        'פנייה חדשה',
        `<p><strong>נושא:</strong> ${escapeHtml(topic)}</p>
         <p><strong>שם:</strong> ${escapeHtml(inquiry.name)}<br/>
         <strong>מייל:</strong> <a href="mailto:${escapeHtml(inquiry.email)}">${escapeHtml(inquiry.email)}</a>
         ${inquiry.phone ? `<br/><strong>טלפון:</strong> ${escapeHtml(inquiry.phone)}` : ''}
         ${inquiry.synagogueId ? `<br/><strong>בית כנסת:</strong> ${escapeHtml(shul.name || inquiry.synagogueId)}` : ''}
         </p>
         <div style="margin-top:16px;padding:14px;background:#f7f4ee;border-radius:8px">${safeMsg}</div>
         <p style="font-size:12px;color:#6b7a80;margin-top:16px">מזהה: ${escapeHtml(inquiry.id)}</p>`,
      ),
    });
  }

  if (inquiry.email) {
    results.submitter = await sendMail({
      to: inquiry.email,
      subject: 'screensmart — קיבלנו את פנייתך',
      text: [
        `שלום ${inquiry.name},`,
        '',
        'קיבלנו את פנייתך ונחזור אליך בהקדם.',
        `נושא: ${topic}`,
        '',
        '— צוות screensmart',
      ].join('\n'),
      html: wrapHtml(
        'קיבלנו את פנייתך',
        `<p>שלום ${escapeHtml(inquiry.name)},</p>
         <p>קיבלנו את פנייתך בנושא <strong>${escapeHtml(topic)}</strong> ונחזור אליך בהקדם.</p>
         <p style="color:#6b7a80">אין צורך להשיב למייל זה.</p>`,
      ),
    });
  }

  if (shul.email && shul.email.toLowerCase() !== admin.toLowerCase()) {
    results.synagogue = await sendMail({
      to: shul.email,
      replyTo: inquiry.email,
      subject: `פנייה חדשה לגבי ${shul.name || 'בית הכנסת'}`,
      text: [
        `התקבלה פנייה לגבי ${shul.name || inquiry.synagogueId}`,
        `מאת: ${inquiry.name} <${inquiry.email}>`,
        inquiry.phone ? `טלפון: ${inquiry.phone}` : '',
        '',
        inquiry.message,
      ]
        .filter(Boolean)
        .join('\n'),
      html: wrapHtml(
        'פנייה לגבי בית הכנסת',
        `<p>התקבלה פנייה לגבי <strong>${escapeHtml(shul.name || inquiry.synagogueId)}</strong>.</p>
         <p>מאת: ${escapeHtml(inquiry.name)} · <a href="mailto:${escapeHtml(inquiry.email)}">${escapeHtml(inquiry.email)}</a></p>
         <div style="margin-top:16px;padding:14px;background:#f7f4ee;border-radius:8px">${safeMsg}</div>`,
      ),
    });
  }

  return results;
}

function publicInquiry(rec) {
  return {
    id: rec.id,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    name: rec.name,
    email: rec.email,
    phone: rec.phone || '',
    topic: rec.topic,
    message: rec.message,
    synagogueId: rec.synagogueId || '',
    status: rec.status || 'new',
    source: rec.source || 'landing',
  };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 */
export async function handleInquiries(req, res, url) {
  // CORS for public form (same-origin usually; keep simple)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    if (url.pathname === '/api/inquiries' && req.method === 'POST') {
      if (!rateOk(clientIp(req))) {
        sendJson(res, 429, { error: 'נשלחו יותר מדי פניות — נסו שוב בעוד שעה' });
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const name = String(body.name || '').trim().slice(0, 120);
      const email = String(body.email || '').trim().slice(0, 160).toLowerCase();
      const phone = String(body.phone || '').trim().slice(0, 40);
      const message = String(body.message || '').trim().slice(0, 4000);
      const topicRaw = String(body.topic || 'fault').trim();
      const topic = TOPICS.has(topicRaw) ? topicRaw : 'fault';
      const synagogueId = String(body.synagogueId || '')
        .trim()
        .slice(0, 64);
      const source = String(body.source || 'admin').trim().slice(0, 40) || 'admin';

      if (!synagogueId && source === 'admin') {
        sendJson(res, 400, { error: 'חסר מזהה בית כנסת' });
        return;
      }
      if (!name || name.length < 2) {
        sendJson(res, 400, { error: 'נא להזין שם' });
        return;
      }
      if (!isEmail(email)) {
        sendJson(res, 400, { error: 'כתובת מייל לא תקינה' });
        return;
      }
      if (!message || message.length < 5) {
        sendJson(res, 400, { error: 'נא לכתוב הודעה קצרה' });
        return;
      }

      const id = uid();
      const inquiry = {
        id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        name,
        email,
        phone,
        topic,
        message,
        synagogueId,
        status: 'new',
        source,
        ip: clientIp(req).slice(0, 80),
      };
      await putRecord(PREFIX, id, inquiry);
      const mail = await notifyEmails(inquiry).catch((err) => ({
        error: String(err?.message || err),
      }));
      sendJson(res, 201, {
        ok: true,
        id,
        mailConfigured: mailConfigured(),
        mail,
      });
      return;
    }

    if (url.pathname === '/api/inquiries' && req.method === 'GET') {
      const statusFilter = String(url.searchParams.get('status') || '').trim();
      const synagogueFilter = String(url.searchParams.get('synagogueId') || '').trim();
      const items = (await listRecords(PREFIX))
        .map(publicInquiry)
        .filter((i) => (statusFilter && STATUSES.has(statusFilter) ? i.status === statusFilter : true))
        .filter((i) => (synagogueFilter ? i.synagogueId === synagogueFilter : true))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const unread = items.filter((i) => i.status === 'new').length;
      sendJson(res, 200, { items, unread, total: items.length });
      return;
    }

    const patchMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)$/);
    if (patchMatch && req.method === 'PATCH') {
      const id = decodeURIComponent(patchMatch[1]);
      const existing = await getRecord(PREFIX, id);
      if (!existing) {
        sendJson(res, 404, { error: 'פנייה לא נמצאה' });
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const nextStatus = String(body.status || '').trim();
      if (!STATUSES.has(nextStatus)) {
        sendJson(res, 400, { error: 'סטטוס לא תקין' });
        return;
      }
      const updated = {
        ...existing,
        status: nextStatus,
        updatedAt: nowIso(),
      };
      await putRecord(PREFIX, id, updated);
      sendJson(res, 200, { ok: true, item: publicInquiry(updated) });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('inquiries api', err);
    sendJson(res, 500, { error: String(err?.message || err) });
  }
}
