/**
 * SUMIT billing client — recurring monthly license payments (הוראת קבע).
 * Card details are tokenized in the browser directly against SUMIT;
 * only a SingleUseToken reaches our server.
 */

import type { LicenseInfo } from '../types';

export interface BillingHistoryItem {
  at: string;
  amount: number;
  ok: boolean;
  error?: string;
  paymentId?: number | string | null;
  documentId?: number | string | null;
  documentUrl?: string | null;
  documentNumber?: string | number | null;
}

export interface BillingSubscription {
  synagogueId: string;
  amount: number;
  /** Original monthly price before coupon */
  listAmount?: number;
  couponCode?: string;
  discountLabel?: string;
  active: boolean;
  status: 'none' | 'active' | 'failed' | 'canceled';
  hasPaymentMethod: boolean;
  /** True when SUMIT created a standing order (הוראת קבע) */
  hasStandingOrder?: boolean;
  cardMask: string;
  payerName: string;
  payerEmail: string;
  /** Per-synagogue email that receives the invoice (set by platform admin) */
  invoiceEmail: string;
  paidUntil: string | null;
  lastChargeAt: string | null;
  lastError: string | null;
  history: BillingHistoryItem[];
}

export interface BillingConfig {
  configured: boolean;
  companyId: number | null;
  publicKey: string | null;
  adminEmail?: string;
}

export interface SubscribeResult {
  subscription: BillingSubscription;
  license: LicenseInfo | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body?.error || `שגיאת שרת ${res.status}`);
  }
  return body;
}

export function fetchBillingConfig(): Promise<BillingConfig> {
  return api<BillingConfig>('/api/billing/config');
}

export function fetchPlatformBilling(): Promise<{
  adminEmail: string;
  defaultAmount: number;
  configured: boolean;
}> {
  return api('/api/billing/platform');
}

export function savePlatformBilling(input: {
  adminEmail: string;
  defaultAmount?: number;
}): Promise<{ adminEmail: string; defaultAmount: number }> {
  return api('/api/billing/platform', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function fetchSubscription(
  id: string,
  opts?: { sync?: boolean },
): Promise<BillingSubscription> {
  const q = opts?.sync ? '?sync=1' : '';
  return api<BillingSubscription>(
    `/api/billing/subscriptions/${encodeURIComponent(id)}${q}`,
  );
}

/** Pull latest invoices / HOK status from SUMIT into our store. */
export function syncSubscription(id: string): Promise<BillingSubscription> {
  return api<BillingSubscription>(
    `/api/billing/subscriptions/${encodeURIComponent(id)}/sync`,
    { method: 'POST', body: '{}' },
  );
}

export function fetchAllSubscriptions(): Promise<BillingSubscription[]> {
  return api<{ items: BillingSubscription[] }>('/api/billing/subscriptions').then(
    (r) => r.items ?? [],
  );
}

export function saveBillingSettings(
  id: string,
  settings: { amount?: number; active?: boolean; invoiceEmail?: string },
): Promise<BillingSubscription> {
  return api<BillingSubscription>(
    `/api/billing/subscriptions/${encodeURIComponent(id)}/settings`,
    { method: 'PUT', body: JSON.stringify(settings) },
  );
}

export function subscribeBilling(
  id: string,
  payload: {
    singleUseToken: string;
    name?: string;
    email?: string;
    phone?: string;
    couponCode?: string;
  },
): Promise<SubscribeResult> {
  return api<{ ok: boolean; subscription: BillingSubscription; license?: LicenseInfo }>(
    `/api/billing/subscriptions/${encodeURIComponent(id)}/subscribe`,
    { method: 'POST', body: JSON.stringify(payload) },
  ).then((r) => ({ subscription: r.subscription, license: r.license ?? null }));
}

export function applyBillingCoupon(
  id: string,
  code: string,
): Promise<{
  subscription: BillingSubscription;
  preview: {
    code: string;
    listAmount: number;
    amount: number;
    saved: number;
    label: string;
  };
}> {
  return api(
    `/api/billing/subscriptions/${encodeURIComponent(id)}/coupon`,
    { method: 'POST', body: JSON.stringify({ code }) },
  );
}

export interface BillingCoupon {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  active: boolean;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  note: string;
  createdAt?: string;
}

export function fetchCoupons(): Promise<BillingCoupon[]> {
  return api<{ items: BillingCoupon[] }>('/api/billing/coupons').then((r) => r.items ?? []);
}

export function saveCoupon(input: {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  maxUses?: number;
  expiresAt?: string | null;
  note?: string;
  active?: boolean;
}): Promise<BillingCoupon> {
  return api<{ item: BillingCoupon }>('/api/billing/coupons', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.item);
}

export function deleteCoupon(code: string): Promise<void> {
  return api(`/api/billing/coupons/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  }).then(() => undefined);
}

export function chargeBillingNow(id: string): Promise<SubscribeResult> {
  return api<{ ok: boolean; subscription: BillingSubscription; license?: LicenseInfo }>(
    `/api/billing/subscriptions/${encodeURIComponent(id)}/charge`,
    { method: 'POST', body: '{}' },
  ).then((r) => ({ subscription: r.subscription, license: r.license ?? null }));
}

export function cancelBilling(id: string): Promise<BillingSubscription> {
  return api<BillingSubscription>(
    `/api/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
    { method: 'POST', body: '{}' },
  );
}

export interface CardDetails {
  cardNumber: string;
  expMonth: string;
  expYear: string;
  /** Optional — not required for tokenization / recurring setup */
  cvv?: string;
  citizenId: string;
}

/**
 * Tokenize card in the browser against SUMIT (same endpoint their official
 * payments.js uses). Returns a SingleUseToken — the card never reaches our server.
 */
export async function tokenizeCard(
  config: BillingConfig,
  card: CardDetails,
): Promise<string> {
  if (!config.configured || !config.companyId || !config.publicKey) {
    throw new Error('סליקה לא מוגדרת בשרת');
  }
  const params = new URLSearchParams();
  params.set('Credentials[CompanyID]', String(config.companyId));
  params.set('Credentials[APIPublicKey]', config.publicKey);
  params.set('CardNumber', card.cardNumber.replace(/\s+/g, ''));
  params.set('ExpirationMonth', card.expMonth);
  params.set('ExpirationYear', card.expYear.length === 2 ? `20${card.expYear}` : card.expYear);
  if (card.cvv?.trim()) params.set('CVV', card.cvv.trim());
  params.set('CitizenID', card.citizenId);

  const res = await fetch('https://api.sumit.co.il/creditguy/vault/tokenizesingleuse/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Language': 'he',
    },
    body: params.toString(),
  });
  const body = (await res.json().catch(() => null)) as {
    Status?: number;
    UserErrorMessage?: string | null;
    TechnicalErrorDetails?: string | null;
    Data?: { SingleUseToken?: string };
  } | null;
  if (!body) throw new Error('שגיאת תקשורת מול SUMIT');
  if (body.Status !== 0 || !body.Data?.SingleUseToken) {
    throw new Error(body.UserErrorMessage || body.TechnicalErrorDetails || 'אימות הכרטיס נכשל');
  }
  return body.Data.SingleUseToken;
}

export function formatIls(amount: number): string {
  return `${amount.toLocaleString('he-IL')} ₪`;
}

export function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}
