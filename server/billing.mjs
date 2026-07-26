/**
 * SUMIT recurring billing (הוראת קבע) for screen licenses.
 *
 * Flow:
 * 1. Platform admin sets monthly amount + admin email (for invoice copies).
 * 2. Synagogue enters card → browser tokenizes (SingleUseToken).
 * 3. First charge via /billing/recurring/charge/ (1 month) + save method.
 * 4. Server returns a fresh 1-month license; client must persist it if cloud
 *    bundle is missing. Cron re-charges due subscriptions every 6h.
 *
 * Env: SUMIT_COMPANY_ID, SUMIT_API_KEY, SUMIT_API_PUBLIC_KEY
 */
import { getBundle, getRecord, listRecords, putBundle, putRecord } from './cloudStore.mjs';

const SUMIT_BASE = 'https://api.sumit.co.il';
const COMPANY_ID = Number(process.env.SUMIT_COMPANY_ID || 0);
const API_KEY = (process.env.SUMIT_API_KEY || '').trim();
const PUBLIC_KEY = (process.env.SUMIT_API_PUBLIC_KEY || '').trim();
const PREFIX = 'billing';
const PLATFORM_ID = '_platform';
const HISTORY_MAX = 36;
const RETRY_COOLDOWN_MS = 5 * 60 * 60 * 1000;

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
    status: 'none',
    customerId: null,
    recurringItemId: null,
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

function defaultPlatform() {
  return {
    synagogueId: PLATFORM_ID,
    adminEmail: '',
    updatedAt: nowIso(),
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

export async function getPlatformSettings() {
  const rec = await getRecord(PREFIX, PLATFORM_ID);
  return rec ? { ...defaultPlatform(), ...rec } : defaultPlatform();
}

async function savePlatformSettings(patch) {
  const cur = await getPlatformSettings();
  const next = {
    ...cur,
    ...patch,
    synagogueId: PLATFORM_ID,
    updatedAt: nowIso(),
  };
  await putRecord(PREFIX, PLATFORM_ID, next);
  return next;
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

function paymentOk(payment, data) {
  if (payment) {
    if (payment.ValidPayment === true) return true;
    const st = String(payment.Status ?? '');
    if (st === '000' || st === '0') return true;
  }
  // Some successful envelopes expose IDs without a nested Payment object
  if (data?.CustomerID || data?.PaymentID || data?.DocumentID) return true;
  return false;
}

function extractCardMask(payment, data) {
  const pm = payment?.PaymentMethod || data?.PaymentMethod || {};
  const digits =
    pm.CreditCard_LastDigits ||
    pm.LastDigits ||
    pm.CardMask ||
    pm.CreditCard_CardMask ||
    payment?.CreditCard_LastDigits;
  return digits ? String(digits).slice(-4) : '';
}

function extractDocumentUrl(data, payment) {
  return (
    data?.DocumentDownloadURL ||
    data?.DocumentUrl ||
    payment?.DocumentDownloadURL ||
    null
  );
}

/**
 * Charge. First time: SingleUseToken via recurring/charge (1 month HOK).
 * Renewals: payments/charge against saved customer.
 */
async function sumitCharge(rec, shulName, singleUseToken, adminEmail) {
  const customerBase = {
    Name: rec.payerName || shulName || rec.synagogueId,
    EmailAddress: rec.payerEmail || adminEmail || undefined,
    Phone: rec.payerPhone || undefined,
  };

  const itemName = `רישיון מסך — ${shulName || rec.synagogueId}`;
  const itemDesc = 'מנוי חודשי (הוראת קבע)';

  let resp;
  if (singleUseToken) {
    // Create / renew recurring item for 1 month and charge now
    resp = await sumitPost('/billing/recurring/charge/', {
      Customer: {
        ...customerBase,
        ExternalIdentifier: rec.synagogueId,
        SearchMode: 2,
      },
      SingleUseToken: singleUseToken,
      Items: [
        {
          Item: { Name: itemName, Description: itemDesc, Duration_Months: 1 },
          Quantity: 1,
          UnitPrice: rec.amount,
          Currency: 0,
          Duration_Months: 1,
          Recurrence: 0,
        },
      ],
      VATIncluded: true,
      OnlyDocument: false,
    });
  } else {
    const customer = rec.customerId
      ? { ID: rec.customerId, SearchMode: 0, ...customerBase }
      : { ExternalIdentifier: rec.synagogueId, SearchMode: 2, ...customerBase };
    resp = await sumitPost('/billing/payments/charge/', {
      Customer: customer,
      Items: [
        {
          Item: { Name: itemName, Description: itemDesc },
          Quantity: 1,
          UnitPrice: rec.amount,
          Currency: 0,
        },
      ],
      VATIncluded: true,
      OnlyDocument: false,
    });
  }

  const data = resp?.Data || {};
  const payment = data.Payment || data.payment || null;

  if (!sumitEnvelopeOk(resp) || !paymentOk(payment, data)) {
    console.error('SUMIT charge failed', JSON.stringify({
      Status: resp?.Status,
      UserErrorMessage: resp?.UserErrorMessage,
      TechnicalErrorDetails: resp?.TechnicalErrorDetails,
      PaymentStatus: payment?.Status,
      ValidPayment: payment?.ValidPayment,
    }));
    throw new Error(sumitError(resp));
  }

  const recurringIds = data.RecurringCustomerItemIDs || [];
  return {
    paymentId: payment?.ID ?? data.PaymentID ?? null,
    customerId: data.CustomerID ?? payment?.CustomerID ?? rec.customerId ?? null,
    recurringItemId: recurringIds[0] ?? rec.recurringItemId ?? null,
    documentId: data.DocumentID ?? payment?.DocumentID ?? null,
    documentUrl: extractDocumentUrl(data, payment),
    documentNumber: data.DocumentNumber ?? null,
    cardMask: extractCardMask(payment, data) || rec.cardMask,
  };
}

/** Build / extend a 1-month screen license. Always returns the license object. */
async function extendLicense(id, months = 1) {
  const bundle = await getBundle(id);
  const prev = bundle?.config?.license || null;
  const expiresAt = addMonths(prev?.expiresAt, months);
  const license = {
    key:
      prev?.key ||
      `SHUL-SCREEN-SUMIT-${id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'AUTO'}`,
    plan: prev?.plan && prev.plan !== 'trial' ? prev.plan : 'basic',
    activatedAt: prev?.activatedAt || nowIso(),
    expiresAt,
    holderName: prev?.holderName || bundle?.config?.name || id,
    synagogueId: id,
    locked: false, // successful payment unlocks
    serverValidated: true,
  };

  if (bundle?.config) {
    const config = {
      ...bundle.config,
      license,
      revision: (Number(bundle.config.revision) || 0) + 1,
      updatedAt: nowIso(),
    };
    await putBundle(id, { ...bundle, config, syncedAt: nowIso(), pendingSync: false });
  } else {
    console.warn(`billing: no cloud bundle for ${id} — license returned for client to save`);
  }
  return license;
}

async function chargeAndRenew(id, options = {}) {
  const rec = await getSubscription(id);
  if (!(rec.amount > 0)) {
    throw new Error('מנהל המערכת טרם קבע סכום חודשי לבית כנסת זה');
  }

  const bundle = await getBundle(id);
  const shulName = bundle?.config?.name || id;
  const platform = await getPlatformSettings();

  if (options.payer) {
    rec.payerName = options.payer.name || rec.payerName;
    rec.payerEmail = options.payer.email || rec.payerEmail;
    rec.payerPhone = options.payer.phone || rec.payerPhone;
  }

  try {
    const result = await sumitCharge(
      rec,
      shulName,
      options.singleUseToken,
      platform.adminEmail || undefined,
    );
    rec.customerId = result.customerId;
    rec.recurringItemId = result.recurringItemId || rec.recurringItemId;
    rec.cardMask = result.cardMask || rec.cardMask;
    rec.status = 'active';
    rec.active = true;
    rec.lastChargeAt = nowIso();
    rec.lastError = null;
    rec.paidUntil = addMonths(rec.paidUntil, 1);
    rec.history = [
      ...(rec.history || []),
      {
        at: nowIso(),
        amount: rec.amount,
        ok: true,
        paymentId: result.paymentId,
        documentId: result.documentId,
        documentUrl: result.documentUrl,
        documentNumber: result.documentNumber,
      },
    ];
    await saveSubscription(rec);
    const license = await extendLicense(id, 1);
    return { subscription: rec, license };
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

export async function runBillingCycle() {
  if (!billingConfigured()) return { skipped: true };
  const all = await listRecords(PREFIX);
  const now = Date.now();
  let charged = 0;
  let failed = 0;
  for (const raw of all) {
    if (!raw?.synagogueId || raw.synagogueId === PLATFORM_ID) continue;
    const rec = { ...defaultSubscription(raw.synagogueId), ...raw };
    if (!rec.active || !(rec.amount > 0) || !rec.customerId) continue;
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
  setTimeout(() => void runBillingCycle().catch(() => {}), 30_000);
  cronTimer = setInterval(() => void runBillingCycle().catch(() => {}), 6 * 60 * 60 * 1000);
}

// —— HTTP ——

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
    history: (rec.history || []).slice(-12).reverse(),
  };
}

export async function handleBilling(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname === '/api/billing/config') {
    const platform = billingConfigured() ? await getPlatformSettings().catch(() => defaultPlatform()) : defaultPlatform();
    sendJson(res, 200, {
      configured: billingConfigured(),
      companyId: billingConfigured() ? COMPANY_ID : null,
      publicKey: billingConfigured() ? PUBLIC_KEY : null,
      adminEmail: platform.adminEmail || '',
    });
    return;
  }

  if (url.pathname === '/api/billing/platform' && req.method === 'GET') {
    if (!billingConfigured()) {
      sendJson(res, 200, { adminEmail: '', configured: false });
      return;
    }
    const platform = await getPlatformSettings();
    sendJson(res, 200, { adminEmail: platform.adminEmail || '', configured: true });
    return;
  }

  if (url.pathname === '/api/billing/platform' && req.method === 'PUT') {
    if (!billingConfigured()) {
      sendJson(res, 503, { error: 'סליקה לא מוגדרת בשרת' });
      return;
    }
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const email = String(body.adminEmail || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: 'כתובת מייל לא תקינה' });
      return;
    }
    const platform = await savePlatformSettings({ adminEmail: email });
    sendJson(res, 200, { adminEmail: platform.adminEmail || '', configured: true });
    return;
  }

  if (!billingConfigured()) {
    sendJson(res, 503, {
      error: 'סליקה לא מוגדרת בשרת (SUMIT_COMPANY_ID / SUMIT_API_KEY / SUMIT_API_PUBLIC_KEY)',
    });
    return;
  }

  try {
    if (url.pathname === '/api/billing/subscriptions' && req.method === 'GET') {
      const all = await listRecords(PREFIX);
      sendJson(res, 200, {
        items: all
          .filter((r) => r?.synagogueId && r.synagogueId !== PLATFORM_ID)
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
    if (id === PLATFORM_ID) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
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
      const { subscription, license } = await chargeAndRenew(id, {
        singleUseToken: String(body.singleUseToken),
        payer: { name: body.name, email: body.email, phone: body.phone },
      });
      sendJson(res, 200, {
        ok: true,
        subscription: publicRecord(subscription),
        license,
      });
      return;
    }

    if (req.method === 'POST' && action === 'charge') {
      const { subscription, license } = await chargeAndRenew(id);
      sendJson(res, 200, {
        ok: true,
        subscription: publicRecord(subscription),
        license,
      });
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
