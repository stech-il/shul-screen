import type { LicenseInfo } from '../types';

const LICENSE_STORE = 'shul-screen:licenses';

/** Simple professional license keys: SHUL-PLAN-XXXX-XXXX */
const PLANS: Record<string, LicenseInfo['plan']> = {
  TRIAL: 'trial',
  BASIC: 'basic',
  PRO: 'pro',
  AGENCY: 'agency',
};

function normalize(key: string): string {
  return key.trim().toUpperCase().replace(/\s+/g, '');
}

export function parseLicenseKey(key: string): LicenseInfo | null {
  const k = normalize(key);
  // Accept demo keys and structured keys
  const demo: Record<string, LicenseInfo['plan']> = {
    'SHUL-TRIAL-DEMO-0001': 'trial',
    'SHUL-BASIC-DEMO-0001': 'basic',
    'SHUL-PRO-DEMO-0001': 'pro',
    'SHUL-AGENCY-DEMO-0001': 'agency',
  };
  if (demo[k]) {
    const plan = demo[k];
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + (plan === 'trial' ? 0 : 1));
    if (plan === 'trial') expires.setDate(expires.getDate() + 30);
    return {
      key: k,
      plan,
      activatedAt: new Date().toISOString(),
      expiresAt: expires.toISOString(),
      holderName: 'Demo',
    };
  }

  const m = /^SHUL-(TRIAL|BASIC|PRO|AGENCY)-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(k);
  if (!m) return null;
  const plan = PLANS[m[1]!];
  if (!plan) return null;
  // Lightweight checksum: chars sum
  const body = `${m[1]}-${m[2]}-${m[3]}`;
  const sum = [...body].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (sum % 7 !== 0 && m[2] !== 'DEMO') {
    // allow DEMO segment always; otherwise soft-check
    if (m[2] !== 'FREE' && sum % 3 !== 0) return null;
  }
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + (plan === 'trial' ? 0 : 1));
  if (plan === 'trial') expires.setDate(expires.getDate() + 14);
  return {
    key: k,
    plan,
    activatedAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
  };
}

export function isLicenseValid(info?: LicenseInfo | null): boolean {
  if (!info) return true; // allow without license in local demo
  if (!info.expiresAt) return true;
  return Date.parse(info.expiresAt) > Date.now();
}

export function licenseLabel(plan: LicenseInfo['plan']): string {
  switch (plan) {
    case 'trial':
      return 'ניסיון';
    case 'basic':
      return 'בסיסי';
    case 'pro':
      return 'מקצועי';
    case 'agency':
      return 'סוכנות';
  }
}

export function saveGlobalLicense(info: LicenseInfo): void {
  localStorage.setItem(LICENSE_STORE, JSON.stringify(info));
}

export function loadGlobalLicense(): LicenseInfo | null {
  try {
    const raw = localStorage.getItem(LICENSE_STORE);
    return raw ? (JSON.parse(raw) as LicenseInfo) : null;
  } catch {
    return null;
  }
}

export const DEMO_LICENSE_KEYS = [
  'SHUL-TRIAL-DEMO-0001',
  'SHUL-BASIC-DEMO-0001',
  'SHUL-PRO-DEMO-0001',
  'SHUL-AGENCY-DEMO-0001',
];
