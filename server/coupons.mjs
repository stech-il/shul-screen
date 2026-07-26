/**
 * Discount coupons for monthly license billing (הוראת קבע).
 * Managed from Agency settings; applied by the synagogue on subscribe.
 */
import { getRecord, listRecords, putRecord } from './cloudStore.mjs';

const PREFIX = 'coupons';

function nowIso() {
  return new Date().toISOString();
}

export function normalizeCouponCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
}

function defaultCoupon(code) {
  return {
    code,
    type: 'percent',
    value: 0,
    active: true,
    maxUses: 0,
    usedCount: 0,
    expiresAt: null,
    note: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function computeDiscountedAmount(listAmount, coupon) {
  const list = Math.max(0, Number(listAmount) || 0);
  if (!coupon) return list;
  const value = Math.max(0, Number(coupon.value) || 0);
  if (coupon.type === 'fixed') {
    return Math.max(0, Math.round((list - value) * 100) / 100);
  }
  const pct = Math.min(100, value);
  return Math.max(0, Math.round(list * (1 - pct / 100) * 100) / 100);
}

export function discountLabel(coupon, listAmount, discounted) {
  if (!coupon) return '';
  const saved = Math.max(0, (Number(listAmount) || 0) - (Number(discounted) || 0));
  if (coupon.type === 'fixed') {
    return `הנחה ${coupon.value}₪ (חיסכון ${saved}₪)`;
  }
  return `הנחה ${coupon.value}% (חיסכון ${saved}₪)`;
}

export async function getCoupon(code) {
  const id = normalizeCouponCode(code);
  if (!id) return null;
  const rec = await getRecord(PREFIX, id);
  if (!rec) return null;
  return { ...defaultCoupon(id), ...rec, code: id };
}

export async function listCoupons() {
  const all = await listRecords(PREFIX);
  return all
    .filter((r) => (r?.code || r?.id) && !r.deleted)
    .map((r) => {
      const code = normalizeCouponCode(r.code || r.id);
      return { ...defaultCoupon(code), ...r, code };
    })
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function saveCoupon(input) {
  const code = normalizeCouponCode(input.code);
  if (!code || code.length < 3) {
    throw new Error('קוד קופון קצר מדי (לפחות 3 תווים)');
  }
  const type = input.type === 'fixed' ? 'fixed' : 'percent';
  const value = Math.round(Number(input.value) * 100) / 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('ערך הנחה לא תקין');
  }
  if (type === 'percent' && value > 100) {
    throw new Error('אחוז הנחה לא יכול לעלות על 100');
  }
  const existing = await getCoupon(code);
  const maxUses = Math.max(0, Math.floor(Number(input.maxUses) || 0));
  let expiresAt = null;
  if (input.expiresAt) {
    const t = Date.parse(String(input.expiresAt));
    if (!Number.isFinite(t)) throw new Error('תאריך תפוגה לא תקין');
    expiresAt = new Date(t).toISOString();
  }
  const next = {
    ...(existing || defaultCoupon(code)),
    code,
    type,
    value,
    active: input.active === false ? false : true,
    maxUses,
    usedCount: existing?.usedCount || 0,
    expiresAt,
    note: String(input.note || '').trim().slice(0, 200),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await putRecord(PREFIX, code, next);
  return next;
}

export async function removeCoupon(code) {
  const coupon = await getCoupon(code);
  if (!coupon) throw new Error('קוד קופון לא נמצא');
  coupon.active = false;
  coupon.deleted = true;
  coupon.updatedAt = nowIso();
  await putRecord(PREFIX, coupon.code, coupon);
  return { ok: true, deleted: coupon.code };
}

export function assertCouponUsable(coupon) {
  if (!coupon || !coupon.active) {
    throw new Error('הקופון אינו פעיל או לא קיים');
  }
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) < Date.now()) {
    throw new Error('הקופון פג תוקף');
  }
  const max = Number(coupon.maxUses) || 0;
  if (max > 0 && (Number(coupon.usedCount) || 0) >= max) {
    throw new Error('הקופון מוצה עד תום');
  }
  return true;
}

/** Validate without consuming a use. */
export async function previewCoupon(code, listAmount) {
  const coupon = await getCoupon(code);
  if (!coupon) throw new Error('קוד קופון לא נמצא');
  assertCouponUsable(coupon);
  const list = Math.max(0, Number(listAmount) || 0);
  if (!(list > 0)) throw new Error('אין סכום בסיס להחלת הנחה');
  const amount = computeDiscountedAmount(list, coupon);
  if (!(amount >= 0) || amount >= list) {
    // allow 100% free? amount can be 0
  }
  if (amount === list && coupon.type === 'fixed' && coupon.value <= 0) {
    throw new Error('ההנחה לא משנה את הסכום');
  }
  return {
    ok: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    listAmount: list,
    amount,
    saved: Math.round((list - amount) * 100) / 100,
    label: discountLabel(coupon, list, amount),
    expiresAt: coupon.expiresAt,
  };
}

/** Consume one use after a successful application. */
export async function redeemCoupon(code) {
  const coupon = await getCoupon(code);
  if (!coupon) return null;
  coupon.usedCount = (Number(coupon.usedCount) || 0) + 1;
  coupon.updatedAt = nowIso();
  await putRecord(PREFIX, coupon.code, coupon);
  return coupon;
}
