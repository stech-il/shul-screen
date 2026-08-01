/**
 * SUMIT recurring billing (הוראת קבע) for screen licenses.
 *
 * Flow:
 * 1. Platform admin sets monthly amount + admin email (for invoice copies).
 * 2. Synagogue enters card → browser tokenizes (SingleUseToken).
 * 3. First charge via /billing/recurring/charge/ creates a real HOK in SUMIT
 *    (monthly, continuous) and charges the first month immediately.
 * 4. Server persists history + grants a 1-month license on the cloud bundle.
 * 5. Cron syncs new SUMIT payments (HOK auto-charges) and extends licenses;
 *    only falls back to manual charge when no recurring item exists.
 *
 * Env: SUMIT_COMPANY_ID, SUMIT_API_KEY, SUMIT_API_PUBLIC_KEY
 */
import { getBundle, getRecord, listRecords, putBundle, putRecord } from './cloudStore.mjs';
import {
  assertCouponUsable,
  computeDiscountedAmount,
  discountLabel,
  getCoupon,
  listCoupons,
  normalizeCouponCode,
  previewCoupon,
  redeemCoupon,
  removeCoupon,
  saveCoupon,
} from './coupons.mjs';
import {
  requirePlatform,
  requireSynagogueAccess,
  requireWebhookSecret,
  resolveAuth,
  sendJson as authSendJson,
} from './apiAuth.mjs';

const SUMIT_BASE = 'https://api.sumit.co.il';
const COMPANY_ID = Number(process.env.SUMIT_COMPANY_ID || 0);
const API_KEY = (process.env.SUMIT_API_KEY || '').trim();
const PUBLIC_KEY = (process.env.SUMIT_API_PUBLIC_KEY || '').trim();
const PREFIX = 'billing';
const PLATFORM_ID = '_platform';
const HISTORY_MAX = 36;
const RETRY_COOLDOWN_MS = 5 * 60 * 60 * 1000;
/** Max SUMIT pull frequency per synagogue — keep under API quota (~2000/mo). */
const SUMIT_SYNC_MIN_MS = 7 * 24 * 60 * 60 * 1000;
/** Continuous monthly HOK — Recurrence 0/null = continuous per SUMIT docs. */
const HOK_RECURRENCE = 0;

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
    listAmount: 0,
    couponCode: '',
    active: false,
    status: 'none',
    customerId: null,
    recurringItemId: null,
    payerName: '',
    payerEmail: '',
    payerPhone: '',
    invoiceEmail: '',
    cardMask: '',
    paidUntil: null,
    lastChargeAt: null,
    lastError: null,
    /** ISO — last successful SUMIT pull (payments / recurring). Throttled weekly. */
    lastSumitSyncAt: null,
    updatedAt: nowIso(),
    history: [],
  };
}

function defaultPlatform() {
  return {
    synagogueId: PLATFORM_ID,
    adminEmail: '',
    /** Default monthly HO"K amount applied to newly created screens */
    defaultAmount: 99,
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

function paymentOk(payment) {
  if (!payment) return false;
  if (payment.ValidPayment === false) return false;
  if (payment.ValidPayment === true) return true;
  const st = String(payment.Status ?? '');
  return st === '000' || st === '0';
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

function extractRecurringIds(data) {
  const raw =
    data?.RecurringCustomerItemIDs ||
    data?.RecurringItemIDs ||
    data?.RecurringItems ||
    [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === 'object' ? x?.ID ?? x?.Id : x))
      .filter((x) => x != null && x !== '');
  }
  return [];
}

/**
 * Create / charge a real SUMIT standing order (הוראת קבע).
 * With token: creates HOK + first charge.
 * Without token: one-off charge against saved customer (manual / legacy).
 */
async function sumitCharge(rec, shulName, singleUseToken, adminEmail) {
  // Invoice recipient priority: per-synagogue invoice email → payer email → platform default
  const invoiceTo = rec.invoiceEmail || rec.payerEmail || adminEmail || undefined;
  const customerBase = {
    Name: rec.payerName || shulName || rec.synagogueId,
    EmailAddress: invoiceTo,
    Phone: rec.payerPhone || undefined,
  };

  const itemName = `רישיון מסך — ${shulName || rec.synagogueId}`;
  const itemDesc = 'מנוי חודשי (הוראת קבע)';

  let resp;
  if (singleUseToken) {
    // Match SUMIT swagger: Duration_Months on Item only; Recurrence on line.
    // Recurrence 0 = continuous monthly standing order.
    resp = await sumitPost('/billing/recurring/charge/', {
      Customer: {
        ...customerBase,
        ExternalIdentifier: rec.synagogueId,
        SearchMode: 2,
      },
      SingleUseToken: singleUseToken,
      Items: [
        {
          Item: {
            Name: itemName,
            Description: itemDesc,
            Duration_Months: 1,
          },
          Quantity: 1,
          UnitPrice: rec.amount,
          Currency: 0,
          Recurrence: HOK_RECURRENCE,
        },
      ],
      VATIncluded: true,
      OnlyDocument: false,
      PreventStandingOrder: false,
      UpdateCustomerByEmail: true,
      UpdateCustomerByEmail_AttachDocument: true,
      SendCopyToOrganization: true,
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
      UpdateCustomerByEmail: true,
      UpdateCustomerByEmail_AttachDocument: true,
      SendCopyToOrganization: true,
      SendDocumentByEmail: true,
    });
  }

  const data = resp?.Data || {};
  const payment = data.Payment || data.payment || null;
  const recurringIds = extractRecurringIds(data);

  if (!sumitEnvelopeOk(resp) || !paymentOk(payment)) {
    console.error(
      'SUMIT charge failed',
      JSON.stringify({
        Status: resp?.Status,
        UserErrorMessage: resp?.UserErrorMessage,
        TechnicalErrorDetails: resp?.TechnicalErrorDetails,
        PaymentStatus: payment?.Status,
        ValidPayment: payment?.ValidPayment,
        RecurringIds: recurringIds,
      }),
    );
    throw new Error(sumitError(resp));
  }

  if (singleUseToken && recurringIds.length === 0) {
    console.error(
      'SUMIT charge OK but no RecurringCustomerItemIDs — HOK was not created',
      JSON.stringify({ CustomerID: data.CustomerID, PaymentID: payment?.ID, DataKeys: Object.keys(data || {}) }),
    );
    // Payment already cleared — still return success so we grant license + history,
    // but flag missing HOK for the UI / retry.
    return {
      paymentId: payment?.ID ?? data.PaymentID ?? null,
      customerId: data.CustomerID ?? payment?.CustomerID ?? rec.customerId ?? null,
      recurringItemId: null,
      documentId: data.DocumentID ?? payment?.DocumentID ?? null,
      documentUrl: extractDocumentUrl(data, payment),
      documentNumber: data.DocumentNumber ?? null,
      cardMask: extractCardMask(payment, data) || rec.cardMask,
      amount: Number(payment?.Amount ?? rec.amount) || rec.amount,
      missingStandingOrder: true,
    };
  }

  return {
    paymentId: payment?.ID ?? data.PaymentID ?? null,
    customerId: data.CustomerID ?? payment?.CustomerID ?? rec.customerId ?? null,
    recurringItemId: recurringIds[0] ?? rec.recurringItemId ?? null,
    documentId: data.DocumentID ?? payment?.DocumentID ?? null,
    documentUrl: extractDocumentUrl(data, payment),
    documentNumber: data.DocumentNumber ?? null,
    cardMask: extractCardMask(payment, data) || rec.cardMask,
    amount: Number(payment?.Amount ?? rec.amount) || rec.amount,
    missingStandingOrder: false,
  };
}

/** Fetch recent valid payments from SUMIT and merge into local history. */
async function syncPaymentsFromSumit(rec) {
  if (!rec.customerId) return rec;
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 18);
  let resp;
  try {
    resp = await sumitPost('/billing/payments/list/', {
      Date_From: from.toISOString(),
      Date_To: to.toISOString(),
      Valid: true,
    });
  } catch (err) {
    console.warn('SUMIT payments/list failed', err);
    return rec;
  }
  if (!sumitEnvelopeOk(resp)) return rec;

  const list =
    resp?.Data?.Payments ||
    resp?.Data?.Items ||
    resp?.Data?.List ||
    (Array.isArray(resp?.Data) ? resp.Data : []) ||
    [];

  const mine = list.filter((p) => {
    const cid = p?.CustomerID ?? p?.Customer?.ID;
    return cid != null && String(cid) === String(rec.customerId);
  });

  const known = new Set(
    (rec.history || [])
      .map((h) => (h.paymentId != null ? String(h.paymentId) : ''))
      .filter(Boolean),
  );

  let added = 0;
  const nextHistory = [...(rec.history || [])];
  for (const p of mine) {
    const pid = p?.ID ?? p?.PaymentID;
    if (pid != null && known.has(String(pid))) continue;
    const ok =
      p?.ValidPayment === true ||
      String(p?.Status ?? '') === '000' ||
      String(p?.Status ?? '') === '0';
    if (!ok) continue;
    const at =
      p?.Date ||
      p?.PaymentDate ||
      p?.CreatedDate ||
      p?.Timestamp ||
      nowIso();
    nextHistory.push({
      at: typeof at === 'string' ? at : nowIso(),
      amount: Number(p?.Amount ?? rec.amount) || rec.amount,
      ok: true,
      paymentId: pid ?? null,
      documentId: p?.DocumentID ?? null,
      documentUrl: p?.DocumentDownloadURL ?? null,
      documentNumber: p?.DocumentNumber ?? null,
      source: 'sumit-sync',
    });
    known.add(pid != null ? String(pid) : '');
    added += 1;
  }

  if (added === 0) return rec;

  nextHistory.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  rec.history = nextHistory.slice(-HISTORY_MAX);

  const lastOk = [...rec.history].reverse().find((h) => h.ok);
  if (lastOk) {
    rec.lastChargeAt = lastOk.at;
    rec.lastError = null;
    if (rec.status !== 'canceled') rec.status = 'active';
    // Extend paidUntil to cover each newly discovered payment beyond current
    const okCount = rec.history.filter((h) => h.ok).length;
    if (!rec.paidUntil || Date.parse(rec.paidUntil) < Date.now()) {
      // Catch up: set paidUntil from last charge + 1 month
      rec.paidUntil = addMonths(lastOk.at, 1);
    }
    void okCount;
  }
  return rec;
}

/** Ensure customer has an active HOK in SUMIT; store recurringItemId if found. */
async function syncRecurringItem(rec) {
  if (!rec.customerId) return rec;
  try {
    const resp = await sumitPost('/billing/recurring/listforcustomer/', {
      Customer: { ID: rec.customerId, SearchMode: 0 },
      IncludeInactive: false,
    });
    if (!sumitEnvelopeOk(resp)) return rec;
    const items = resp?.Data?.RecurringItems || [];
    if (!items.length) return rec;
    const first = items[0];
    const id = first?.ID ?? first?.Id ?? null;
    if (id != null) {
      rec.recurringItemId = id;
      if (rec.status !== 'canceled') {
        rec.active = true;
        rec.status = 'active';
      }
    }
  } catch (err) {
    console.warn('SUMIT recurring/listforcustomer failed', err);
  }
  return rec;
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
    locked: false,
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

/**
 * Apply a successful payment to local subscription + license.
 * Saves subscription first so history survives even if license write fails.
 */
async function applySuccessfulPayment(rec, result, { extend = true } = {}) {
  rec.customerId = result.customerId ?? rec.customerId;
  if (result.recurringItemId) rec.recurringItemId = result.recurringItemId;
  rec.cardMask = result.cardMask || rec.cardMask;
  rec.status = 'active';
  rec.active = true;
  rec.lastChargeAt = nowIso();
  rec.lastSumitSyncAt = nowIso();
  rec.lastError = result.missingStandingOrder
    ? 'החיוב עבר והרישיון חודש, אך SUMIT לא יצר הוראת קבע. עדכן כרטיס שוב או בדוק שמודול הו״ק פעיל ב־SUMIT.'
    : null;
  rec.paidUntil = addMonths(rec.paidUntil, 1);
  const entry = {
    at: nowIso(),
    amount: result.amount ?? rec.amount,
    ok: true,
    paymentId: result.paymentId,
    documentId: result.documentId,
    documentUrl: result.documentUrl,
    documentNumber: result.documentNumber,
  };
  // de-dupe by paymentId
  if (
    result.paymentId == null ||
    !(rec.history || []).some((h) => String(h.paymentId) === String(result.paymentId))
  ) {
    rec.history = [...(rec.history || []), entry];
  }
  await saveSubscription(rec);

  let license = null;
  if (extend) {
    try {
      license = await extendLicense(rec.synagogueId, 1);
    } catch (err) {
      console.error('extendLicense failed after payment', err);
      // Payment already saved — surface soft error via lastError but don't roll back
      rec.lastError = `התשלום נשמר אך חידוש הרישיון נכשל: ${String(err?.message || err).slice(0, 160)}`;
      await saveSubscription(rec).catch(() => {});
    }
  }

  try {
    const { notifyPaymentSuccess } = await import('./notifications.mjs');
    await notifyPaymentSuccess(rec.synagogueId, {
      amount: result.amount ?? rec.amount,
      paidUntil: rec.paidUntil,
    });
  } catch (err) {
    console.warn('payment success email failed', err);
  }

  return { subscription: rec, license };
}

async function chargeAndRenew(id, options = {}) {
  let rec = await getSubscription(id);
  if (options.couponCode) {
    const applied = await applyCouponToSubscription(rec, options.couponCode, { redeem: false });
    rec = applied.rec;
    await saveSubscription(rec);
  }
  if (!(rec.amount > 0) && !(Number(rec.amount) === 0 && rec.couponCode)) {
    // allow 0 only if coupon made it free? SUMIT might not like 0 — require > 0
  }
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
    if (rec.couponCode && !rec.couponRedeemed) {
      await redeemCoupon(rec.couponCode);
      rec.couponRedeemed = true;
    }
    return await applySuccessfulPayment(rec, result, { extend: true });
  } catch (err) {
    const message = String(err?.message || err);
    rec.status = rec.customerId ? 'failed' : rec.status === 'none' ? 'none' : 'failed';
    rec.lastError = message;
    rec.history = [
      ...(rec.history || []),
      { at: nowIso(), amount: rec.amount, ok: false, error: message.slice(0, 200) },
    ];
    await saveSubscription(rec).catch(() => {});
    try {
      const { notifyPaymentFailed } = await import('./notifications.mjs');
      await notifyPaymentFailed(id, { error: message });
    } catch (mailErr) {
      console.warn('payment fail email failed', mailErr);
    }
    throw new Error(message);
  }
}

/**
 * For HOK-managed subs: sync SUMIT payments and extend license for each new one.
 * For legacy (customer but no HOK): charge via payments/charge when due.
 */
export async function runBillingCycle() {
  if (!billingConfigured()) return { skipped: true };
  const all = await listRecords(PREFIX);
  const now = Date.now();
  let charged = 0;
  let synced = 0;
  let skippedFresh = 0;
  let failed = 0;

  for (const raw of all) {
    if (!raw?.synagogueId || raw.synagogueId === PLATFORM_ID) continue;
    let rec = { ...defaultSubscription(raw.synagogueId), ...raw };
    if (!rec.active || !(rec.amount > 0) || !rec.customerId) continue;

    try {
      // Weekly SUMIT pull only — subscription state lives in our store between pulls
      if (!shouldSyncFromSumit(rec)) {
        skippedFresh += 1;
        // Legacy (no HOK): still charge when due without a full payments sync
        if (!rec.recurringItemId) {
          const due = !rec.paidUntil || Date.parse(rec.paidUntil) <= now;
          if (!due) continue;
          const lastAttempt = rec.history?.length
            ? Date.parse(rec.history[rec.history.length - 1].at)
            : 0;
          if (now - lastAttempt < RETRY_COOLDOWN_MS) continue;
          await chargeAndRenew(rec.synagogueId);
          charged += 1;
          console.log(`billing: charged ${rec.synagogueId} (${rec.amount}₪)`);
        }
        continue;
      }

      const beforeCount = (rec.history || []).filter((h) => h.ok).length;
      const pulled = await pullFromSumit(rec, { force: true });
      rec = pulled.rec;
      const afterCount = (rec.history || []).filter((h) => h.ok).length;
      const newPayments = afterCount - beforeCount;

      if (newPayments > 0) {
        const lastOk = [...(rec.history || [])].reverse().find((h) => h.ok);
        if (lastOk) rec.paidUntil = addMonths(lastOk.at, 1);
        await saveSubscription(rec);
        synced += newPayments;
        console.log(`billing: synced ${newPayments} payment(s) for ${rec.synagogueId}`);
        continue;
      }

      // Already has SUMIT HOK — SUMIT will charge; we only sync weekly
      if (rec.recurringItemId) continue;

      // Legacy path: no HOK — charge ourselves when due
      const due = !rec.paidUntil || Date.parse(rec.paidUntil) <= now;
      if (!due) continue;
      const lastAttempt = rec.history?.length
        ? Date.parse(rec.history[rec.history.length - 1].at)
        : 0;
      if (now - lastAttempt < RETRY_COOLDOWN_MS) continue;

      await chargeAndRenew(rec.synagogueId);
      charged += 1;
      console.log(`billing: charged ${rec.synagogueId} (${rec.amount}₪)`);
    } catch (err) {
      failed += 1;
      console.error(
        `billing: cycle failed for ${rec.synagogueId}:`,
        String(err?.message || err),
      );
    }
  }
  return { charged, synced, skippedFresh, failed, total: all.length };
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

function sendJson(res, status, obj, req) {
  authSendJson(res, status, obj, req);
}

function publicRecord(rec) {
  const listAmount =
    Number(rec.listAmount) > 0 ? Number(rec.listAmount) : Number(rec.amount) || 0;
  const amount = Number(rec.amount) || 0;
  const couponCode = rec.couponCode || '';
  return {
    synagogueId: rec.synagogueId,
    amount,
    listAmount,
    couponCode,
    discountLabel:
      couponCode && listAmount > amount
        ? `קופון ${couponCode} · חיסכון ${Math.round((listAmount - amount) * 100) / 100}₪`
        : '',
    active: rec.active,
    status: rec.status,
    hasPaymentMethod: Boolean(rec.customerId),
    hasStandingOrder: Boolean(rec.recurringItemId),
    cardMask: rec.cardMask || '',
    payerName: rec.payerName || '',
    payerEmail: rec.payerEmail || '',
    invoiceEmail: rec.invoiceEmail || '',
    paidUntil: rec.paidUntil,
    lastChargeAt: rec.lastChargeAt,
    lastError: rec.lastError,
    lastSumitSyncAt: rec.lastSumitSyncAt || null,
    history: (rec.history || []).slice(-12).reverse(),
  };
}

async function applyCouponToSubscription(rec, code, { redeem = false } = {}) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) throw new Error('קוד קופון חסר');
  const list =
    Number(rec.listAmount) > 0
      ? Number(rec.listAmount)
      : Number(rec.amount) > 0
        ? Number(rec.amount)
        : 0;
  if (!(list > 0)) throw new Error('ספק המערכת עדיין לא קבע סכום חודשי');
  const coupon = await getCoupon(normalized);
  if (!coupon) throw new Error('קוד קופון לא נמצא');
  assertCouponUsable(coupon);
  if (rec.couponCode && rec.couponCode !== normalized && rec.customerId) {
    throw new Error('כבר הוחל קופון על מנוי זה');
  }
  const amount = computeDiscountedAmount(list, coupon);
  rec.listAmount = list;
  rec.amount = amount;
  rec.couponCode = coupon.code;
  if (redeem && rec.couponCode) {
    // redeem only once per subscription binding
    if (!rec.couponRedeemed) {
      await redeemCoupon(coupon.code);
      rec.couponRedeemed = true;
    }
  }
  return {
    rec,
    preview: {
      code: coupon.code,
      listAmount: list,
      amount,
      saved: Math.round((list - amount) * 100) / 100,
      label: discountLabel(coupon, list, amount),
    },
  };
}

/** Whether we should hit SUMIT for this subscription (weekly throttle). */
function shouldSyncFromSumit(rec, { force = false } = {}) {
  if (force) return true;
  if (!rec?.customerId) return false;
  const last = Date.parse(rec.lastSumitSyncAt || '') || 0;
  if (!last) return true;
  return Date.now() - last >= SUMIT_SYNC_MIN_MS;
}

/**
 * Pull recurring item + payments from SUMIT into our store.
 * Skips when lastSumitSyncAt is within the weekly window (unless force).
 */
async function pullFromSumit(rec, { force = false } = {}) {
  if (!billingConfigured() || !rec.customerId) return { rec, didSync: false };
  if (!shouldSyncFromSumit(rec, { force })) {
    return { rec, didSync: false };
  }
  const before = (rec.history || []).filter((h) => h.ok).length;
  let next = await syncRecurringItem(rec);
  next = await syncPaymentsFromSumit(next);
  next.lastSumitSyncAt = nowIso();
  await saveSubscription(next);
  const after = (next.history || []).filter((h) => h.ok).length;
  if (after > before) {
    for (let i = 0; i < after - before; i += 1) {
      await extendLicense(next.synagogueId, 1).catch(() => null);
    }
  }
  return { rec: next, didSync: true, newPayments: after - before };
}

/** Enrich subscription from SUMIT before returning to client. */
async function loadSubscriptionPublic(id, { sync = false, force = false } = {}) {
  let rec = await getSubscription(id);
  if (sync && billingConfigured() && rec.customerId) {
    try {
      const result = await pullFromSumit(rec, { force });
      rec = result.rec;
    } catch (err) {
      console.warn('subscription sync', err);
    }
  }
  return publicRecord(rec);
}

export async function handleBilling(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {}, req);
    return;
  }

  if (url.pathname === '/api/billing/config') {
    const platform = billingConfigured()
      ? await getPlatformSettings().catch(() => defaultPlatform())
      : defaultPlatform();
    sendJson(
      res,
      200,
      {
        configured: billingConfigured(),
        companyId: billingConfigured() ? COMPANY_ID : null,
        publicKey: billingConfigured() ? PUBLIC_KEY : null,
        // adminEmail is platform-only — omit from public config
      },
      req,
    );
    return;
  }

  if (url.pathname === '/api/billing/platform' && req.method === 'GET') {
    if (!requirePlatform(req, res)) return;
    if (!billingConfigured()) {
      sendJson(
        res,
        200,
        {
          adminEmail: '',
          defaultAmount: 99,
          configured: false,
        },
        req,
      );
      return;
    }
    const platform = await getPlatformSettings();
    sendJson(
      res,
      200,
      {
        adminEmail: platform.adminEmail || '',
        defaultAmount:
          Number(platform.defaultAmount) > 0 ? Number(platform.defaultAmount) : 99,
        configured: true,
      },
      req,
    );
    return;
  }

  if (url.pathname === '/api/billing/platform' && req.method === 'PUT') {
    if (!requirePlatform(req, res)) return;
    if (!billingConfigured()) {
      sendJson(res, 503, { error: 'סליקה לא מוגדרת בשרת' }, req);
      return;
    }
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const email = String(body.adminEmail || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: 'כתובת מייל לא תקינה' }, req);
      return;
    }
    const patch = { adminEmail: email };
    if (typeof body.defaultAmount === 'number') {
      const amt = Math.round(body.defaultAmount * 100) / 100;
      if (!Number.isFinite(amt) || amt < 0) {
        sendJson(res, 400, { error: 'סכום ברירת מחדל לא תקין' }, req);
        return;
      }
      patch.defaultAmount = amt;
    }
    const platform = await savePlatformSettings(patch);
    sendJson(
      res,
      200,
      {
        adminEmail: platform.adminEmail || '',
        defaultAmount:
          Number(platform.defaultAmount) > 0 ? Number(platform.defaultAmount) : 99,
        configured: true,
      },
      req,
    );
    return;
  }

  // —— Coupons ——
  if (url.pathname === '/api/billing/coupons' && req.method === 'GET') {
    if (!requirePlatform(req, res)) return;
    sendJson(res, 200, { items: await listCoupons() }, req);
    return;
  }

  if (url.pathname === '/api/billing/coupons' && req.method === 'POST') {
    if (!requirePlatform(req, res)) return;
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try {
      const item = await saveCoupon(body);
      sendJson(res, 201, { ok: true, item }, req);
    } catch (err) {
      sendJson(res, 400, { error: String(err?.message || err) }, req);
    }
    return;
  }

  if (url.pathname === '/api/billing/coupons/preview' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try {
      const id = String(body.synagogueId || '').trim();
      if (id && !requireSynagogueAccess(req, res, id)) return;
      if (!id && !requirePlatform(req, res)) return;
      const rec = id ? await getSubscription(id) : null;
      const list =
        Number(body.listAmount) > 0
          ? Number(body.listAmount)
          : Number(rec?.listAmount) > 0
            ? Number(rec.listAmount)
            : Number(rec?.amount) || 0;
      const preview = await previewCoupon(body.code, list);
      sendJson(res, 200, preview, req);
    } catch (err) {
      sendJson(res, 400, { error: String(err?.message || err) }, req);
    }
    return;
  }

  const couponMatch = url.pathname.match(/^\/api\/billing\/coupons\/([^/]+)$/);
  if (couponMatch && req.method === 'PUT') {
    if (!requirePlatform(req, res)) return;
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try {
      const item = await saveCoupon({
        ...body,
        code: decodeURIComponent(couponMatch[1]),
      });
      sendJson(res, 200, { ok: true, item }, req);
    } catch (err) {
      sendJson(res, 400, { error: String(err?.message || err) }, req);
    }
    return;
  }
  if (couponMatch && req.method === 'DELETE') {
    if (!requirePlatform(req, res)) return;
    try {
      sendJson(res, 200, await removeCoupon(decodeURIComponent(couponMatch[1])), req);
    } catch (err) {
      sendJson(res, 400, { error: String(err?.message || err) }, req);
    }
    return;
  }

  // SUMIT Trigger / webhook — extend license when HOK auto-charges
  if (url.pathname === '/api/billing/webhook' && req.method === 'POST') {
    if (!requireWebhookSecret(req, res)) return;
    try {
      const raw = (await readBody(req)).toString('utf8') || '';
      let payload = {};
      try {
        payload = JSON.parse(raw);
      } catch {
        const params = new URLSearchParams(raw);
        if (params.get('json')) {
          payload = JSON.parse(params.get('json'));
        } else {
          payload = Object.fromEntries(params.entries());
        }
      }
      // Flatten Data if present
      const data = payload?.Data && typeof payload.Data === 'object' ? payload.Data : payload;
      const externalId =
        data?.Customer?.ExternalIdentifier ||
        data?.ExternalIdentifier ||
        payload?.Customer?.ExternalIdentifier ||
        null;
      const customerId = data?.CustomerID || data?.Customer?.ID || payload?.CustomerID || null;
      const paymentId = data?.Payment?.ID || data?.PaymentID || payload?.PaymentID || null;
      const valid =
        data?.Payment?.ValidPayment === true ||
        String(data?.Payment?.Status ?? data?.Status ?? '') === '000';

      let rec = null;
      if (externalId) {
        rec = await getSubscription(String(externalId));
      } else if (customerId) {
        const all = await listRecords(PREFIX);
        const found = all.find((r) => r?.customerId != null && String(r.customerId) === String(customerId));
        if (found) rec = { ...defaultSubscription(found.synagogueId), ...found };
      }

      if (rec && valid && rec.synagogueId && rec.synagogueId !== PLATFORM_ID) {
        await applySuccessfulPayment(
          rec,
          {
            paymentId,
            customerId: customerId ?? rec.customerId,
            recurringItemId: rec.recurringItemId,
            documentId: data?.DocumentID ?? null,
            documentUrl: data?.DocumentDownloadURL ?? null,
            documentNumber: data?.DocumentNumber ?? null,
            cardMask: rec.cardMask,
            amount: Number(data?.Payment?.Amount ?? rec.amount) || rec.amount,
          },
          { extend: true },
        );
      }
      sendJson(res, 200, { ok: true }, req);
    } catch (err) {
      console.error('billing webhook', err);
      sendJson(res, 200, { ok: false }, req); // acknowledge to avoid SUMIT retries storm
    }
    return;
  }

  if (!billingConfigured()) {
    sendJson(
      res,
      503,
      {
        error: 'סליקה לא מוגדרת בשרת (SUMIT_COMPANY_ID / SUMIT_API_KEY / SUMIT_API_PUBLIC_KEY)',
      },
      req,
    );
    return;
  }

  try {
    if (url.pathname === '/api/billing/subscriptions' && req.method === 'GET') {
      if (!requirePlatform(req, res)) return;
      const all = await listRecords(PREFIX);
      sendJson(
        res,
        200,
        {
          items: all
            .filter((r) => r?.synagogueId && r.synagogueId !== PLATFORM_ID)
            .map((r) => publicRecord({ ...defaultSubscription(r.synagogueId), ...r })),
        },
        req,
      );
      return;
    }

    const m = url.pathname.match(/^\/api\/billing\/subscriptions\/([^/]+)(?:\/([a-z]+))?$/);
    if (!m) {
      sendJson(res, 404, { error: 'not found' }, req);
      return;
    }
    const id = decodeURIComponent(m[1]);
    if (id === PLATFORM_ID) {
      sendJson(res, 404, { error: 'not found' }, req);
      return;
    }
    const action = m[2] || '';
    if (!requireSynagogueAccess(req, res, id)) return;

    if (req.method === 'GET' && !action) {
      // sync=1: pull from SUMIT only if weekly cache expired (or force=1)
      const sync = url.searchParams.get('sync') === '1';
      const force = url.searchParams.get('force') === '1';
      sendJson(res, 200, await loadSubscriptionPublic(id, { sync, force }), req);
      return;
    }

    if (req.method === 'PUT' && action === 'settings') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      // Amount / active only by platform; synagogue can update invoice email
      const auth = resolveAuth(req);
      if (
        (typeof body.amount === 'number' || typeof body.active === 'boolean') &&
        auth?.kind !== 'platform'
      ) {
        sendJson(res, 403, { error: 'רק מנהל מערכת יכול לשנות סכום או סטטוס מנוי' }, req);
        return;
      }
      const rec = await getSubscription(id);
      if (typeof body.amount === 'number' && body.amount >= 0) {
        const amt = Math.round(body.amount * 100) / 100;
        rec.amount = amt;
        // Platform-set amount becomes the list price; clear prior coupon unless kept
        if (!body.keepCoupon) {
          rec.listAmount = amt;
          rec.couponCode = '';
          rec.couponRedeemed = false;
        } else if (!(Number(rec.listAmount) > 0)) {
          rec.listAmount = amt;
        }
      }
      if (typeof body.invoiceEmail === 'string') {
        const email = body.invoiceEmail.trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          sendJson(res, 400, { error: 'כתובת מייל לחשבונית לא תקינה' }, req);
          return;
        }
        rec.invoiceEmail = email;
      }
      if (typeof body.active === 'boolean') {
        rec.active = body.active;
        if (!body.active && rec.status === 'active') rec.status = 'canceled';
        if (body.active && rec.status === 'canceled') {
          rec.status = rec.customerId ? 'active' : 'none';
        }
      }
      await saveSubscription(rec);
      sendJson(res, 200, publicRecord(rec), req);
      return;
    }

    if (req.method === 'POST' && action === 'coupon') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      try {
        const rec = await getSubscription(id);
        const { rec: next, preview } = await applyCouponToSubscription(rec, body.code, {
          redeem: false,
        });
        await saveSubscription(next);
        sendJson(res, 200, { ok: true, subscription: publicRecord(next), preview }, req);
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) }, req);
      }
      return;
    }

    if (req.method === 'POST' && action === 'subscribe') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (!body.singleUseToken) {
        sendJson(res, 400, { error: 'missing singleUseToken' }, req);
        return;
      }
      const { subscription, license } = await chargeAndRenew(id, {
        singleUseToken: String(body.singleUseToken),
        payer: { name: body.name, email: body.email, phone: body.phone },
        couponCode: body.couponCode ? String(body.couponCode) : undefined,
      });
      sendJson(
        res,
        200,
        {
          ok: true,
          subscription: publicRecord(subscription),
          license,
        },
        req,
      );
      return;
    }

    if (req.method === 'POST' && action === 'charge') {
      if (!requirePlatform(req, res)) return;
      const { subscription, license } = await chargeAndRenew(id);
      sendJson(
        res,
        200,
        {
          ok: true,
          subscription: publicRecord(subscription),
          license,
        },
        req,
      );
      return;
    }

    if (req.method === 'POST' && action === 'sync') {
      // Explicit refresh — bypasses weekly throttle
      sendJson(res, 200, await loadSubscriptionPublic(id, { sync: true, force: true }), req);
      return;
    }

    if (req.method === 'POST' && action === 'cancel') {
      const rec = await getSubscription(id);
      // Best-effort cancel in SUMIT
      if (rec.recurringItemId) {
        try {
          await sumitPost('/billing/recurring/cancel/', {
            RecurringCustomerItemID: rec.recurringItemId,
          });
        } catch (err) {
          console.warn('SUMIT cancel failed', err);
        }
      }
      rec.active = false;
      rec.status = 'canceled';
      await saveSubscription(rec);
      sendJson(res, 200, publicRecord(rec), req);
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' }, req);
  } catch (err) {
    console.error('billing api', err);
    sendJson(res, 500, { error: String(err?.message || err) }, req);
  }
}
