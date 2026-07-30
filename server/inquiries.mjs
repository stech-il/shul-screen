/**
 * Inquiries / support tickets with in-app reply threads.
 * Optional SMTP still notifies about new tickets / replies, but conversation stays in-app.
 */
import { getBundle, getRecord, listRecords, putRecord } from './cloudStore.mjs';
import { mailConfigured, sendMail } from './mail.mjs';

const PREFIX = 'inquiries';
const PLATFORM_ID = '_platform';
const TOPICS = new Set([
  'fault',
  'support',
  'content',
  'custom_design',
  'billing',
  'feature',
  'other',
  'general',
  'demo',
]);
const STATUSES = new Set(['new', 'read', 'done']);
const AUTHORS = new Set(['customer', 'support']);
const MAX_ATTACHMENTS = 5;

/** @type {Map<string, number[]>} */
const rateByIp = new Map();

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = 'inq') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  const max = 20;
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
    custom_design: 'עיצוב מיוחד',
    billing: 'תשלום / רישיון',
    feature: 'בקשת שיפור',
    other: 'אחר',
    general: 'פנייה כללית',
    demo: 'בקשת הדגמה',
  };
  return map[topic] || topic;
}

function normalizeAttachments(list, synagogueId = '') {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, MAX_ATTACHMENTS)) {
    const url = String(raw?.url || '').trim().slice(0, 2000);
    if (!url) continue;
    const okCloud =
      synagogueId && url.startsWith(`/api/cloud/media/${encodeURIComponent(synagogueId)}/`);
    const okCloudRaw = synagogueId && url.startsWith(`/api/cloud/media/${synagogueId}/`);
    const okHttp = /^https:\/\//i.test(url);
    if (!okCloud && !okCloudRaw && !okHttp) continue;
    out.push({
      id: String(raw?.id || uid('att')).slice(0, 64),
      name: String(raw?.name || 'קובץ').trim().slice(0, 160) || 'קובץ',
      url,
      contentType: String(raw?.contentType || '').trim().slice(0, 120),
      size: Math.max(0, Math.min(Number(raw?.size) || 0, 20 * 1024 * 1024)),
    });
  }
  return out;
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  if (synagogueId === PLATFORM_ID) {
    return { name: 'פנייה מהאתר (דף נחיתה)', email: '' };
  }
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

function normalizeMessages(rec) {
  const synagogueId = String(rec.synagogueId || '');
  if (Array.isArray(rec.messages) && rec.messages.length) {
    return rec.messages.map((m) => ({
      id: m.id || uid('msg'),
      at: m.at || rec.createdAt || nowIso(),
      author: AUTHORS.has(m.author) ? m.author : 'customer',
      name: String(m.name || '').slice(0, 120),
      text: String(m.text || '').slice(0, 4000),
      attachments: normalizeAttachments(m.attachments, synagogueId),
    }));
  }
  // Legacy tickets: first message = original body
  return [
    {
      id: uid('msg'),
      at: rec.createdAt || nowIso(),
      author: 'customer',
      name: rec.name || '',
      text: rec.message || '',
      attachments: normalizeAttachments(rec.attachments, synagogueId),
    },
  ];
}

function awaitingFromMessages(messages, status) {
  if (status === 'done') return null;
  const last = messages[messages.length - 1];
  if (!last) return 'support';
  return last.author === 'customer' ? 'support' : 'customer';
}

function messageTs(m) {
  const t = Date.parse(String(m?.at || ''));
  return Number.isFinite(t) ? t : 0;
}

/** Unread reply count for a role: messages from the other side after last seen. */
function unreadMessagesForRole(rec, role) {
  const messages = normalizeMessages(rec);
  const other = role === 'customer' ? 'support' : 'customer';
  const seenRaw = role === 'customer' ? rec.customerSeenAt : rec.supportSeenAt;
  const seenAt = Date.parse(String(seenRaw || '')) || 0;
  return messages.filter((m) => m.author === other && messageTs(m) > seenAt).length;
}

function publicInquiry(rec) {
  const messages = normalizeMessages(rec);
  const status = rec.status || 'new';
  const awaiting = rec.awaiting ?? awaitingFromMessages(messages, status);
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
    status,
    source: rec.source || 'admin',
    messages,
    attachments: normalizeAttachments(rec.attachments, rec.synagogueId || ''),
    awaiting,
    replyCount: Math.max(0, messages.length - 1),
    unreadForCustomer: unreadMessagesForRole(rec, 'customer'),
    unreadForSupport: unreadMessagesForRole(rec, 'support'),
  };
}

async function notifyNewTicket(inquiry) {
  if (!mailConfigured()) {
    return { admin: { skipped: true }, submitter: { skipped: true } };
  }
  const admin = await platformAdminEmail();
  const shul = await synagogueContact(inquiry.synagogueId);
  const topic = topicLabel(inquiry.topic);
  const safeMsg = escapeHtml(inquiry.message).replace(/\n/g, '<br/>');
  const results = { admin: { skipped: true }, submitter: { skipped: true } };

  if (admin) {
    results.admin = await sendMail({
      to: admin,
      subject: `פנייה חדשה — ${topic} · ${inquiry.name}`,
      text: [
        'פנייה חדשה במערכת screensmart',
        `נושא: ${topic}`,
        `שם: ${inquiry.name}`,
        inquiry.synagogueId ? `בית כנסת: ${shul.name || inquiry.synagogueId}` : '',
        '',
        inquiry.message,
        '',
        'השיבו מתוך פאנל המנהל → פניות (לא מהמייל).',
      ]
        .filter(Boolean)
        .join('\n'),
      html: wrapHtml(
        'פנייה חדשה',
        `<p><strong>נושא:</strong> ${escapeHtml(topic)}</p>
         <p><strong>שם:</strong> ${escapeHtml(inquiry.name)}
         ${inquiry.synagogueId ? `<br/><strong>בית כנסת:</strong> ${escapeHtml(shul.name || inquiry.synagogueId)}` : ''}
         </p>
         <div style="margin-top:16px;padding:14px;background:#f7f4ee;border-radius:8px">${safeMsg}</div>
         <p style="margin-top:14px;color:#6b7a80">השיבו מתוך פאנל המנהל ← פניות.</p>`,
      ),
    });
  }

  if (inquiry.email) {
    results.submitter = await sendMail({
      to: inquiry.email,
      subject: 'screensmart — קיבלנו את פנייתך',
      text: `שלום ${inquiry.name},\n\nקיבלנו את פנייתך. המענה יופיע במערכת — ניהול המסך ← פניות.\n`,
      html: wrapHtml(
        'קיבלנו את פנייתך',
        `<p>שלום ${escapeHtml(inquiry.name)},</p>
         <p>קיבלנו את פנייתך. <strong>התשובה תופיע במערכת</strong> תחת ניהול המסך ← פניות.</p>`,
      ),
    });
  }
  return results;
}

async function notifyReply(inquiry, reply) {
  if (!mailConfigured()) return { skipped: true };
  const topic = topicLabel(inquiry.topic);
  const safe = escapeHtml(reply.text).replace(/\n/g, '<br/>');

  if (reply.author === 'support' && inquiry.email) {
    return sendMail({
      to: inquiry.email,
      subject: `תשובה חדשה לפנייה — ${topic}`,
      text: `יש תשובה חדשה במערכת screensmart.\nניהול המסך ← פניות\n\n${reply.text}`,
      html: wrapHtml(
        'תשובה חדשה במערכת',
        `<p>התקבלה תשובה לפנייתכם. פתחו <strong>ניהול המסך ← פניות</strong> לקריאה ולהמשך שיחה.</p>
         <div style="margin-top:14px;padding:14px;background:#f7f4ee;border-radius:8px">${safe}</div>`,
      ),
    });
  }

  if (reply.author === 'customer') {
    const admin = await platformAdminEmail();
    if (!admin) return { skipped: true };
    return sendMail({
      to: admin,
      subject: `הודעה חדשה בפנייה — ${topic}`,
      text: `הודעה חדשה מ־${inquiry.name} בפנייה ${inquiry.id}.\nפאנל מנהל ← פניות\n\n${reply.text}`,
      html: wrapHtml(
        'הודעה חדשה בפנייה',
        `<p>מאת ${escapeHtml(inquiry.name)}. השיבו בפאנל המנהל ← פניות.</p>
         <div style="margin-top:14px;padding:14px;background:#f7f4ee;border-radius:8px">${safe}</div>`,
      ),
    });
  }
  return { skipped: true };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 */
export async function handleInquiries(req, res, url) {
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
      const source = String(body.source || 'admin').trim().slice(0, 40) || 'admin';
      const isLandingLead = source === 'landing' || topic === 'demo';
      let synagogueId = String(body.synagogueId || '')
        .trim()
        .slice(0, 64);
      if (!synagogueId && isLandingLead) {
        synagogueId = PLATFORM_ID;
      }

      if (!synagogueId) {
        sendJson(res, 400, { error: 'חסר מזהה בית כנסת' });
        return;
      }
      if (!name || name.length < 2) {
        sendJson(res, 400, { error: 'נא להזין שם' });
        return;
      }
      if (email) {
        if (!isEmail(email)) {
          sendJson(res, 400, { error: 'כתובת מייל לא תקינה' });
          return;
        }
      } else if (!isLandingLead) {
        sendJson(res, 400, { error: 'כתובת מייל לא תקינה' });
        return;
      } else if (!phone || phone.length < 7) {
        sendJson(res, 400, { error: 'נא להזין טלפון או מייל' });
        return;
      }
      if (!message || message.length < 5) {
        sendJson(res, 400, { error: 'נא לכתוב הודעה קצרה' });
        return;
      }

      const attachments = normalizeAttachments(body.attachments, synagogueId);
      const id = uid('inq');
      const createdAt = nowIso();
      const firstMsg = {
        id: uid('msg'),
        at: createdAt,
        author: 'customer',
        name,
        text: message,
        attachments,
      };
      const inquiry = {
        id,
        createdAt,
        updatedAt: createdAt,
        name,
        email,
        phone,
        topic,
        message,
        synagogueId,
        status: 'new',
        source,
        awaiting: 'support',
        attachments,
        messages: [firstMsg],
        ip: clientIp(req).slice(0, 80),
      };
      await putRecord(PREFIX, id, inquiry);
      const mail = await notifyNewTicket(inquiry).catch((err) => ({
        error: String(err?.message || err),
      }));
      sendJson(res, 201, {
        ok: true,
        id,
        item: publicInquiry(inquiry),
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
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));

      const unreadSupport = items.filter((i) => i.awaiting === 'support' || i.status === 'new').length;
      const unreadCustomer = items.filter((i) => i.awaiting === 'customer').length;
      const unreadMessagesCustomer = items.reduce((n, i) => n + (i.unreadForCustomer || 0), 0);
      const unreadMessagesSupport = items.reduce((n, i) => n + (i.unreadForSupport || 0), 0);
      sendJson(res, 200, {
        items,
        unread: unreadSupport,
        unreadCustomer,
        unreadMessages: unreadMessagesSupport,
        unreadMessagesCustomer,
        total: items.length,
      });
      return;
    }

    if (url.pathname === '/api/inquiries/seen' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const role = String(body.role || '').trim();
      const synagogueId = String(body.synagogueId || '').trim();
      const inquiryId = String(body.id || '').trim();
      if (role !== 'customer' && role !== 'support') {
        sendJson(res, 400, { error: 'תפקיד לא תקין' });
        return;
      }
      if (role === 'customer' && !synagogueId && !inquiryId) {
        sendJson(res, 400, { error: 'חסר מזהה בית כנסת' });
        return;
      }

      const now = nowIso();
      const seenKey = role === 'customer' ? 'customerSeenAt' : 'supportSeenAt';
      let records = await listRecords(PREFIX);
      if (inquiryId) {
        records = records.filter((r) => r.id === inquiryId);
      } else if (synagogueId) {
        records = records.filter((r) => String(r.synagogueId || '') === synagogueId);
      }

      let updatedCount = 0;
      for (const existing of records) {
        if (role === 'customer' && synagogueId && String(existing.synagogueId || '') !== synagogueId) {
          continue;
        }
        if (unreadMessagesForRole(existing, role) <= 0) continue;
        const updated = { ...existing, [seenKey]: now, updatedAt: existing.updatedAt || now };
        await putRecord(PREFIX, existing.id, updated);
        updatedCount += 1;
      }
      sendJson(res, 200, { ok: true, updated: updatedCount });
      return;
    }

    const replyMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/replies$/);
    if (replyMatch && req.method === 'POST') {
      if (!rateOk(clientIp(req))) {
        sendJson(res, 429, { error: 'נשלחו יותר מדי הודעות — נסו שוב בעוד שעה' });
        return;
      }
      const id = decodeURIComponent(replyMatch[1]);
      const existing = await getRecord(PREFIX, id);
      if (!existing) {
        sendJson(res, 404, { error: 'פנייה לא נמצאה' });
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const text = String(body.text || '').trim().slice(0, 4000);
      const authorRaw = String(body.author || '').trim();
      const author = AUTHORS.has(authorRaw) ? authorRaw : '';
      const name = String(body.name || (author === 'support' ? 'תמיכה' : existing.name) || '')
        .trim()
        .slice(0, 120);

      if (!author) {
        sendJson(res, 400, { error: 'חסר מחבר הודעה' });
        return;
      }

      const synagogueId = String(existing.synagogueId || '');
      const attachments = normalizeAttachments(body.attachments, synagogueId);
      if ((!text || text.length < 1) && !attachments.length) {
        sendJson(res, 400, { error: 'נא לכתוב תשובה או לצרף קובץ' });
        return;
      }
      const messages = normalizeMessages(existing);
      const reply = {
        id: uid('msg'),
        at: nowIso(),
        author,
        name: name || (author === 'support' ? 'תמיכה' : 'לקוח'),
        text: text || (attachments.length ? '📎 קבצים מצורפים' : ''),
        attachments,
      };
      messages.push(reply);

      let status = existing.status || 'new';
      if (author === 'support') {
        status = status === 'done' ? 'read' : status === 'new' ? 'read' : status;
      } else if (status === 'done') {
        status = 'read';
      } else if (status === 'read') {
        status = 'new';
      }

      const updated = {
        ...existing,
        messages,
        status,
        awaiting: author === 'support' ? 'customer' : 'support',
        updatedAt: nowIso(),
      };
      await putRecord(PREFIX, id, updated);
      void notifyReply(updated, reply).catch(() => {});
      sendJson(res, 201, { ok: true, item: publicInquiry(updated), reply });
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
      const messages = normalizeMessages(existing);
      const updated = {
        ...existing,
        messages,
        status: nextStatus,
        awaiting: nextStatus === 'done' ? null : awaitingFromMessages(messages, nextStatus),
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
