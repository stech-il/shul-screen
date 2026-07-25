import type { LicenseInfo, SynagogueConfig } from '../types';

const LICENSE_STORE = 'shul-screen:licenses';
const REGISTRY_KEY = 'shul-screen:license-registry';

/** Simple professional license keys: SHUL-PLAN-XXXX-XXXX */
const PLANS: Record<string, LicenseInfo['plan']> = {
  TRIAL: 'trial',
  BASIC: 'basic',
  PRO: 'pro',
  AGENCY: 'agency',
  SCREEN: 'basic',
};

function normalize(key: string): string {
  return key.trim().toUpperCase().replace(/\s+/g, '');
}

function randomSeg(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(4));
  for (const b of buf) s += chars[b % chars.length];
  return s;
}

function expiresForPlan(plan: LicenseInfo['plan']): string {
  const expires = new Date();
  if (plan === 'trial') {
    expires.setDate(expires.getDate() + 30);
  } else {
    expires.setFullYear(expires.getFullYear() + 1);
  }
  return expires.toISOString();
}

/** Expiry from paid period (months). */
export function expiresAfterMonths(months: number): string {
  const expires = new Date();
  const safe = Math.max(1, Math.min(120, Math.round(months)));
  expires.setMonth(expires.getMonth() + safe);
  return expires.toISOString();
}

export function expiresAfterDays(days: number): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + Math.max(1, Math.round(days)));
  return expires.toISOString();
}

export function parseLicenseKey(key: string): LicenseInfo | null {
  const k = normalize(key);
  // Accept demo keys and structured keys
  const demo: Record<string, LicenseInfo['plan']> = {
    'SHUL-TRIAL-DEMO-0001': 'trial',
    'SHUL-BASIC-DEMO-0001': 'basic',
    'SHUL-PRO-DEMO-0001': 'pro',
    'SHUL-AGENCY-DEMO-0001': 'agency',
    'SHUL-SCREEN-DEMO-0001': 'basic',
  };
  if (demo[k]) {
    const plan = demo[k]!;
    return {
      key: k,
      plan,
      activatedAt: new Date().toISOString(),
      expiresAt: expiresForPlan(plan),
      holderName: 'Demo',
    };
  }

  const m = /^SHUL-(TRIAL|BASIC|PRO|AGENCY|SCREEN)-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(k);
  if (!m) return null;
  const plan = PLANS[m[1]!];
  if (!plan) return null;
  const body = `${m[1]}-${m[2]}-${m[3]}`;
  const sum = [...body].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (sum % 7 !== 0 && m[2] !== 'DEMO' && m[2] !== 'FREE') {
    if (sum % 3 !== 0) return null;
  }
  return {
    key: k,
    plan,
    activatedAt: new Date().toISOString(),
    expiresAt: expiresForPlan(plan),
  };
}

/** True only when license object exists, not locked, and not expired */
export function isLicenseValid(info?: LicenseInfo | null): boolean {
  if (!info) return false;
  if (info.locked) return false;
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

export function daysLeft(info?: LicenseInfo | null): number | null {
  if (!info?.expiresAt) return null;
  const ms = Date.parse(info.expiresAt) - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export interface ScreenLicenseStatus {
  ok: boolean;
  reason?: string;
  license?: LicenseInfo | null;
}

/** Per-screen license gate for display */
export function getScreenLicenseStatus(config: SynagogueConfig): ScreenLicenseStatus {
  const lic = config.license;
  if (!lic) {
    return {
      ok: false,
      reason: 'אין רישיון פעיל למסך זה — פנה לספק המערכת',
      license: null,
    };
  }
  if (lic.locked) {
    return {
      ok: false,
      reason: 'המסך ננעל. פנה לספק המערכת או עדכן כרטיס אשראי.',
      license: lic,
    };
  }
  if (lic.synagogueId && lic.synagogueId !== config.id) {
    return {
      ok: false,
      reason: 'אין רישיון פעיל למסך זה — פנה לספק המערכת',
      license: lic,
    };
  }
  if (!isLicenseValid(lic)) {
    return {
      ok: false,
      reason: 'אין רישיון פעיל למסך זה — פנה לספק המערכת',
      license: lic,
    };
  }
  return { ok: true, license: lic };
}

export function isScreenLicensed(config: SynagogueConfig): boolean {
  return getScreenLicenseStatus(config).ok;
}

// —— Registry (prevents reusing a non-demo key on another screen) ——

type Registry = Record<string, LicenseInfo>;

function loadRegistry(): Registry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as Registry) : {};
  } catch {
    return {};
  }
}

function saveRegistry(reg: Registry): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

export function findLicenseBinding(key: string): LicenseInfo | null {
  const reg = loadRegistry();
  return reg[normalize(key)] ?? null;
}

export function bindLicenseToScreen(info: LicenseInfo, synagogueId: string): LicenseInfo {
  const key = normalize(info.key);
  const isDemo = key.includes('-DEMO-');
  const reg = loadRegistry();
  const existing = reg[key];
  if (!isDemo && existing?.synagogueId && existing.synagogueId !== synagogueId) {
    throw new Error(`המפתח כבר משויך למסך «${existing.synagogueId}»`);
  }
  const bound: LicenseInfo = {
    ...info,
    key,
    synagogueId,
    activatedAt: info.activatedAt || new Date().toISOString(),
  };
  // Demo keys stored per-screen slot
  const regKey = isDemo ? `${key}::${synagogueId}` : key;
  reg[regKey] = bound;
  if (!isDemo) reg[key] = bound;
  saveRegistry(reg);
  return bound;
}

/** Issue a unique screen license and bind it to the synagogue */
export function issueScreenLicense(
  synagogueId: string,
  plan: LicenseInfo['plan'] = 'basic',
  holderName?: string,
  options?: { durationMonths?: number; durationDays?: number },
): LicenseInfo {
  // Generate until checksum soft-rules pass
  let key = '';
  for (let i = 0; i < 40; i++) {
    const a = randomSeg();
    const b = randomSeg();
    const planToken = plan === 'basic' ? 'SCREEN' : plan.toUpperCase();
    const candidate = `SHUL-${planToken}-${a}-${b}`;
    const body = `${planToken}-${a}-${b}`;
    const sum = [...body].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    if (sum % 7 === 0 || sum % 3 === 0) {
      key = candidate;
      break;
    }
  }
  if (!key) key = `SHUL-SCREEN-${randomSeg()}-FREE`;

  const effectivePlan = plan === 'agency' ? 'pro' : plan;
  let expiresAt: string;
  if (options?.durationDays != null) {
    expiresAt = expiresAfterDays(options.durationDays);
  } else if (options?.durationMonths != null) {
    expiresAt = expiresAfterMonths(options.durationMonths);
  } else {
    expiresAt = expiresForPlan(effectivePlan);
  }

  const info: LicenseInfo = {
    key,
    plan: effectivePlan,
    activatedAt: new Date().toISOString(),
    expiresAt,
    holderName: holderName || synagogueId,
    synagogueId,
  };
  return bindLicenseToScreen(info, synagogueId);
}

/** Renew / replace license on an existing screen with a paid duration. */
export function renewScreenLicense(
  synagogueId: string,
  plan: LicenseInfo['plan'],
  durationMonths: number,
  holderName?: string,
): LicenseInfo {
  return issueScreenLicense(synagogueId, plan, holderName, { durationMonths });
}

/** Disable or re-enable a screen license (locks display until unlocked). */
export function setScreenLicenseLocked(
  license: LicenseInfo | undefined,
  locked: boolean,
): LicenseInfo | undefined {
  if (!license) return undefined;
  const next: LicenseInfo = { ...license, locked };
  if (license.key) {
    const reg = loadRegistry();
    const key = normalize(license.key);
    const isDemo = key.includes('-DEMO-');
    const regKey =
      isDemo && license.synagogueId ? `${key}::${license.synagogueId}` : key;
    if (reg[regKey]) reg[regKey] = { ...reg[regKey], locked };
    if (!isDemo && reg[key]) reg[key] = { ...reg[key], locked };
    saveRegistry(reg);
  }
  return next;
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
  'SHUL-SCREEN-DEMO-0001',
  'SHUL-TRIAL-DEMO-0001',
  'SHUL-BASIC-DEMO-0001',
  'SHUL-PRO-DEMO-0001',
  'SHUL-AGENCY-DEMO-0001',
];
