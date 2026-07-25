/**
 * Platform / super-admin gate — required to create new synagogues.
 * Credentials from env (preferred) or defaults for first setup.
 */

import { hashPassword, normalizeUsername, verifyPassword } from './auth';
import {
  clearStored,
  createTimedFields,
  loadTimedJson,
  saveTimedJson,
  touchTimedJson,
  type TimedSessionFields,
} from './sessionStore';

const SESSION_KEY = 'shul-screen:platform-session';
const CREDS_KEY = 'shul-screen:platform-creds';

export interface PlatformSession extends TimedSessionFields {
  username: string;
}

export interface PlatformCreds {
  username: string;
  passwordHash: string;
}

const DEFAULT_USER =
  (import.meta.env.VITE_PLATFORM_ADMIN_USER as string | undefined)?.trim().toLowerCase() ||
  'superadmin';
const DEFAULT_PASS =
  (import.meta.env.VITE_PLATFORM_ADMIN_PASSWORD as string | undefined) || 'ShulAdmin2026!';

export function getPlatformAdminUsername(): string {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const c = JSON.parse(raw) as PlatformCreds;
      if (c.username) return c.username;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_USER;
}

async function loadCreds(): Promise<PlatformCreds> {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const c = JSON.parse(raw) as PlatformCreds;
      if (c.username && c.passwordHash) return c;
    }
  } catch {
    /* ignore */
  }
  // Seed defaults into storage (hashed) so password is not left as plain comparison forever
  const passwordHash = await hashPassword(DEFAULT_PASS);
  const creds: PlatformCreds = { username: DEFAULT_USER, passwordHash };
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  return creds;
}

export function loadPlatformSession(): PlatformSession | null {
  return loadTimedJson<PlatformSession>(SESSION_KEY);
}

export function isPlatformAdminLoggedIn(): boolean {
  return Boolean(loadPlatformSession());
}

export function savePlatformSession(
  username: string,
  remember = true,
): PlatformSession {
  const session: PlatformSession = {
    username: normalizeUsername(username),
    ...createTimedFields(remember),
  };
  saveTimedJson(SESSION_KEY, session);
  return session;
}

export function touchPlatformSession(): PlatformSession | null {
  return touchTimedJson<PlatformSession>(SESSION_KEY);
}

export function clearPlatformSession(): void {
  clearStored(SESSION_KEY);
}

export async function loginPlatformAdmin(
  username: string,
  password: string,
  remember = true,
): Promise<{ ok: true; session: PlatformSession } | { ok: false; error: string }> {
  const creds = await loadCreds();
  if (normalizeUsername(username) !== normalizeUsername(creds.username)) {
    return { ok: false, error: 'שם משתמש או סיסמה שגויים' };
  }
  const ok = await verifyPassword(password, creds.passwordHash);
  if (!ok) return { ok: false, error: 'שם משתמש או סיסמה שגויים' };
  return { ok: true, session: savePlatformSession(creds.username, remember) };
}

export async function changePlatformPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlatformAdminLoggedIn()) {
    return { ok: false, error: 'יש להתחבר כמנהל מערכת' };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: 'סיסמה חדשה חייבת לפחות 8 תווים' };
  }
  const creds = await loadCreds();
  if (!(await verifyPassword(currentPassword, creds.passwordHash))) {
    return { ok: false, error: 'סיסמה נוכחית שגויה' };
  }
  const passwordHash = await hashPassword(newPassword);
  localStorage.setItem(
    CREDS_KEY,
    JSON.stringify({ username: creds.username, passwordHash } satisfies PlatformCreds),
  );
  return { ok: true };
}

export function requirePlatformAdmin(): boolean {
  return isPlatformAdminLoggedIn();
}
