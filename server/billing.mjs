/**
 * SUMIT recurring billing (הוראת קבע) for screen licenses.
 *
 * Flow:
 * 1. Platform admin sets a monthly amount per synagogue (Agency panel).
 * 2. Synagogue enters card details → browser tokenizes directly against SUMIT
 *    (SingleUseToken, card never touches this server).
 * 3. First charge here saves the payment method on the SUMIT customer.
 * 4. A daily cycle charges due subscriptions with the saved method; every
 *    successful charge extends the screen license by one month.
 *
 * Env: SUMIT_COMPANY_ID, SUMIT_API_KEY (secret), SUMIT_API_PUBLIC_KEY (browser).
 */
import { getBundle, getRecord, listRecords, putBundle, putRecord } from './cloudStore.mjs';

const SUMIT_BASE = 'https://api.sumit.co.il';
const COMPANY_ID = Number(process.env.SUMIT_COMPANY_ID || 0);
const API_KEY = (process.env.SUMIT_API_KEY || '').trim();
const PUBLIC_KEY = (process.env.SUMIT_API_PUBLIC_KEY || '').trim();
const PREFIX = 'billing';
const HISTORY_MAX = 24;
const RETRY_COOLDOWN_MS = 5 * 60 * 60 * 1000; // don't hammer a failing card

export function billingConfigured() {
  return Boolean(COMPANY_ID && API_KEY && PUBLIC_KEY);
}

function nowIso() {
  return new Date().toISOString();
}

function addMonths(fromIso, months) {
  const base = new Date(Math.max(Date.now(), Date.parse(fromIso || '') || 0));
  base.setMonth(base.getMonth() + months);
  return base.toISOString();
}

function defaultSubscription(id) {
  return {
    synagogueId: id,
    amount: 0,
    active: false,
    status: 'none', // none | active | failed | canceled
    customerId: null,
    payerName: '',
    payerEmail: '',
    payerPhone: '',
    cardMask: '',
    paidUntil: null,
    lastChargeAt: null,
    lastError: null,
    updatedAt: nowIso(),
    history: [],
  };
}

export async function getSubscription(id) {
  const rec = await getRecord(PREFIX, id);
  return rec ? { ...defaultSubscription(id), ...rec } : defaultSubscription(id);
}

async function saveSubscription(rec) {
  rec.updatedAt = nowIso();
  rec.history = (rec.history || []).slice(-HISTORY_MAX);
  await putRecord(PREFIX, rec.synagogueId, rec);
  return rec;
}

// —— SUMIT API ——

async function sumitPost(apiPath, body) {
  const res = await fetch(`${SUMIT_BASE}${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
    body: JSON.stringify({
      Credentials: { CompanyID: COMPANY_ID, APIKey: API_KEY },
      ...body,
    }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`SUMIT ${res.status}: ${text.slice(0, 160)}`);
  }
  return json;
}

function sumitEnvelopeOk(resp) {
  const s = resp?.Status;
  return s === 0 || s === '0' || s === 'Success' || s === 'success';
}

function sumitError(resp) {
  return (
    resp?.UserErrorMessage ||
    resp?.TechnicalErrorDetails ||
    'שגיאה לא ידועה מ־SUMIT'
  );
}

function paymentOk(payment) {
  if (!payment) return false;
  if (payment.ValidPayment === true) return true;
  const st = String(payment.Status ?? '');
  return st === '000' || st === '0';
}

function extractCardMask(payment) {
  const pm = payment?.PaymentMethod || {};
  const digits =
    pm.CreditCard_LastDigits || pm.LastDigits || pm.CardMask || pm.CreditCard_CardMask;
  return digits ? String(digits).slice(-4) : '';
}

/**
 * Charge a subscription. When singleUseToken is given the payment method is
 * saved on the SUMIT customer for future recurring charges.
 */
async function sumitCharge(rec, shulName, singleUseToken) {
  const customer = singleUseToken
    ? {
        ExternalIdentifier: rec.synagogueId,
        SearchMode: 2,
        Name: rec.payerName || shulName || rec.synagogueId,
        EmailAddress: rec.payerEmail || undefined,
        Phone: rec.payerPhone || undefined,
      }
    : rec.customerId
      ? { ID: rec.customerId, SearchMode: 0 }
      : { ExternalIdentifier: rec.synagogueId, SearchMode: 2, Name: shulName || rec.synagogueId };

  const body = {
    Customer: customer,
    Items: [
      {
        Item: {
          Name: `רישיון מסך — ${shulName || rec.synagogueId}`,
          Description: 'מנוי חודשי (הוראת קבע)',
        },
        Quantity: 1,
        UnitPrice: rec.amount,
        Currency: 0, // ILS
      },
    ],
    VATIncluded: true,
  };
  if (singleUseToken) {
    body.SingleUseToken = singleUseToken;
    body.SavePaymentMethod = true;
    body.UpdateCustomerOnSuccess = true;
  }

  const resp = await sumitPost('/billing/payments/charge/', body);
  const data = resp?.Data || {};
  const payment = data.Payment || data.payment || null;

  if (!sumitEnvelopeOk(resp) || !paymentOk(payment)) {
    const msg = paymentOk(payment) ? sumitError(resp) : sumitError(resp);
    throw new Error(msg);
  }

  return {
    paymentId: payment?.ID ?? data.PaymentID ?? null,
    customerId: data.CustomerID ?? payment?.CustomerID ?? rec.customerId ?? null,
    documentId: data.DocumentID ?? null,
    cardMask: extractCardMask(payment) || rec.cardMask,
  };
}

/** Extend the synagogue's screen license by one month (server-authoritative). */
async function extendLicense(id, months = 1) {
  const bundle = await getBundle(id);
  if (!bundle?.config) return false;
  const config = bundle.config;
  const prev = config.license || null;
  const expiresAt = addMonths(prev?.expiresAt, months);
  config.license = {
    key: prev?.key || `SHUL-SCREEN-SUMIT-${id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'AUTO'}`,
    plan: prev?.plan && prev.plan !== 'trial' ? prev.plan : 'basic',
    activatedAt: prev?.activatedAt || nowIso(),
    expiresAt,
    holderName: prev?.holderName || config.name,
    synagogueId: id,
    locked: prev?.locked ?? false,
    serverValidated: true,
  };
  config.revision = (Number(config.revision) || 0) + 1;
  config.updatedAt = nowIso();
  await putBundle(id, { ...bundle, config, syncedAt: nowIso(), pendingSync: false });
  return true;
}

async function chargeAndRenew(id, options = {}) {
  const rec = await getSubscription(id);
  if (!(rec.amount > 0)) {
    throw new Error('מנהל המערכת טרם קבע סכום חודשי לבית כנסת זה');
  }

  const bundle = await getBundle(id);
  const shulName = bundle?.config?.name || id;

  if (options.payer) {
    rec.payerName = options.payer.name || rec.payerName;
    rec.payerEmail = options.payer.email || rec.payerEmail;
    rec.payerPhone = options.payer.phone || rec.payerPhone;
  }

  try {
    const result = await sumitCharge(rec, shulName, options.singleUseToken);
    rec.customerId = result.customerId;
    rec.cardMask = result.cardMask || rec.cardMask;
    rec.status = 'active';
    rec.active = true;
    rec.lastChargeAt = nowIso();
    rec.lastError = null;
    rec.paidUntil = addMonths(rec.paidUntil, 1);
    rec.history = [
      ...(rec.history || []),
      { at: nowIso(), amount: rec.amount, ok: true, paymentId: result.paymentId, documentId: result.documentId },
    ];
    await saveSubscription(rec);
    await extendLicense(id, 1);
    return rec;
  } catch (err) {
    const message = String(err?.message || err);
    rec.status = rec.customerId ? 'failed' : rec.status === 'none' ? 'none' : 'failed';
    rec.lastError = message;
    rec.history = [
      ...(rec.history || []),
      { at: nowIso(), amount: rec.amount, ok: false, error: message.slice(0, 200) },
    ];
    await saveSubscription(rec);
    throw new Error(message);
  }
}

/** Charge every active, due subscription. Returns summary for logs. */
export async function runBillingCycle() {
  if (!billingConfigured()) return { skipped: true };
  const all = await listRecords(PREFIX);
  const now = Date.now();
  let charged = 0;
  let failed = 0;
  for (const raw of all) {
    const rec = { ...defaultSubscription(raw.synagogueId || ''), ...raw };
    if (!rec.synagogueId || !rec.active || !(rec.amount > 0) || !rec.customerId) continue;
    const due = !rec.paidUntil || Date.parse(rec.paidUntil) <= now;
    if (!due) continue;
    const lastAttempt = rec.history?.length ? Date.parse(rec.history[rec.history.length - 1].at) : 0;
    if (now - lastAttempt < RETRY_COOLDOWN_MS) continue;
    try {
      await chargeAndRenew(rec.synagogueId);
      charged += 1;
      console.log(`billing: charged ${rec.synagogueId} (${rec.amount}₪)`);
    } catch (err) {
      failed += 1;
      console.error(`billing: charge failed for ${rec.synagogueId}:`, String(err?.message || err));
    }
  }
  return { charged, failed, total: all.length };
}

let cronTimer = null;

export function startBillingCron() {
  if (cronTimer || !billingConfigured()) return;
  // First pass shortly after boot, then every 6 hours
  setTimeout(() => void runBillingCycle().catch(() => {}), 30_000);
  cronTimer = setInterval(() => void runBillingCycle().catch(() => {}), 6 * 60 * 60 * 1000);
}

// —— HTTP handler (shared by server.mjs and vite dev plugin) ——

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
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

function publicRecord(rec) {
  return {
    synagogueId: rec.synagogueId,
    amount: rec.amount,
    active: rec.active,
    status: rec.status,
    hasPaymentMethod: Boolean(rec.customerId),
    cardMask: rec.cardMask || '',
    payerName: rec.payerName || '',
    payerEmail: rec.payerEmail || '',
    paidUntil: rec.paidUntil,
    lastChargeAt: rec.lastChargeAt,
    lastError: rec.lastError,
    history: (rec.history || []).slice(-8),
  };
}

export async function handleBilling(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname === '/api/billing/config') {
    sendJson(res, 200, {
      configured: billingConfigured(),
      companyId: billingConfigured() ? COMPANY_ID : null,
      publicKey: billingConfigured() ? PUBLIC_KEY : null,
    });
    return;
  }

  if (!billingConfigured()) {
    sendJson(res, 503, { error: 'סליקה לא מוגדרת בשרת (SUMIT_COMPANY_ID / SUMIT_API_KEY / SUMIT_API_PUBLIC_KEY)' });
    return;
  }

  try {
    if (url.pathname === '/api/billing/subscriptions' && req.method === 'GET') {
      const all = await listRecords(PREFIX);
      sendJson(res, 200, {
        items: all
          .filter((r) => r?.synagogueId)
          .map((r) => publicRecord({ ...defaultSubscription(r.synagogueId), ...r })),
      });
      return;
    }

    const m = url.pathname.match(/^\/api\/billing\/subscriptions\/([^/]+)(?:\/([a-z]+))?$/);
    if (!m) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    const id = decodeURIComponent(m[1]);
    const action = m[2] || '';

    if (req.method === 'GET' && !action) {
      sendJson(res, 200, publicRecord(await getSubscription(id)));
      return;
    }

    if (req.method === 'PUT' && action === 'settings') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const rec = await getSubscription(id);
      if (typeof body.amount === 'number' && body.amount >= 0) {
        rec.amount = Math.round(body.amount * 100) / 100;
      }
      if (typeof body.active === 'boolean') {
        rec.active = body.active;
        if (!body.active && rec.status === 'active') rec.status = 'canceled';
        if (body.active && rec.status === 'canceled') rec.status = rec.customerId ? 'active' : 'none';
      }
      await saveSubscription(rec);
      sendJson(res, 200, publicRecord(rec));
      return;
    }

    if (req.method === 'POST' && action === 'subscribe') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (!body.singleUseToken) {
        sendJson(res, 400, { error: 'missing singleUseToken' });
        return;
      }
      const rec = await chargeAndRenew(id, {
        singleUseToken: String(body.singleUseToken),
        payer: { name: body.name, email: body.email, phone: body.phone },
      });
      sendJson(res, 200, { ok: true, subscription: publicRecord(rec) });
      return;
    }

    if (req.method === 'POST' && action === 'charge') {
      const rec = await chargeAndRenew(id);
      sendJson(res, 200, { ok: true, subscription: publicRecord(rec) });
      return;
    }

    if (req.method === 'POST' && action === 'cancel') {
      const rec = await getSubscription(id);
      rec.active = false;
      rec.status = 'canceled';
      await saveSubscription(rec);
      sendJson(res, 200, publicRecord(rec));
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error('billing api', err);
    sendJson(res, 500, { error: String(err?.message || err) });
  }
}
