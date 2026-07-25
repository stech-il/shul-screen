/**
 * Persistent login sessions with absolute expiry + idle timeout.
 * "Remember me" → localStorage (longer). Otherwise → sessionStorage + shorter TTL.
 */

export const SESSION_DEFAULT_HOURS = 12;
export const SESSION_REMEMBER_DAYS = 14;
export const SESSION_IDLE_MINUTES = 45;
/** Remembered sessions stay alive across days until absolute expiry */
export const SESSION_REMEMBER_IDLE_DAYS = 14;

export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function expiryFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function sessionTtlMs(remember: boolean): number {
  return remember
    ? SESSION_REMEMBER_DAYS * 24 * 60 * 60 * 1000
    : SESSION_DEFAULT_HOURS * 60 * 60 * 1000;
}

export function idleLimitMs(remember: boolean): number {
  return remember
    ? SESSION_REMEMBER_IDLE_DAYS * 24 * 60 * 60 * 1000
    : SESSION_IDLE_MINUTES * 60 * 1000;
}

export interface TimedSessionFields {
  token: string;
  at: string;
  expiresAt: string;
  lastActiveAt: string;
  remember?: boolean;
}

export function createTimedFields(remember: boolean): TimedSessionFields {
  const now = new Date().toISOString();
  return {
    token: newSessionToken(),
    at: now,
    expiresAt: expiryFromNow(sessionTtlMs(remember)),
    lastActiveAt: now,
    remember,
  };
}

export function isTimedSessionAlive(
  s: Pick<TimedSessionFields, 'expiresAt' | 'lastActiveAt' | 'remember'> | null | undefined,
): boolean {
  if (!s?.expiresAt) return false;
  const now = Date.now();
  if (Date.parse(s.expiresAt) <= now) return false;
  const last = Date.parse(s.lastActiveAt || s.expiresAt);
  if (!Number.isFinite(last)) return false;
  if (now - last > idleLimitMs(Boolean(s.remember))) return false;
  return true;
}

type StoreKind = 'local' | 'session';

function writeRaw(key: string, value: string, remember: boolean) {
  const primary: StoreKind = remember ? 'local' : 'session';
  const secondary: StoreKind = remember ? 'session' : 'local';
  const primaryStore = primary === 'local' ? localStorage : sessionStorage;
  const secondaryStore = secondary === 'local' ? localStorage : sessionStorage;
  primaryStore.setItem(key, value);
  secondaryStore.removeItem(key);
}

function readRaw(key: string): { raw: string; remember: boolean } | null {
  try {
    const local = localStorage.getItem(key);
    if (local) return { raw: local, remember: true };
  } catch {
    /* ignore */
  }
  try {
    const session = sessionStorage.getItem(key);
    if (session) return { raw: session, remember: false };
  } catch {
    /* ignore */
  }
  return null;
}

export function clearStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadTimedJson<T extends TimedSessionFields>(key: string): T | null {
  const found = readRaw(key);
  if (!found) return null;
  try {
    const parsed = JSON.parse(found.raw) as T;
    if (!isTimedSessionAlive(parsed)) {
      clearStored(key);
      return null;
    }
    // Prefer remember flag from payload; fall back to which store held it
    if (parsed.remember == null) parsed.remember = found.remember;
    return parsed;
  } catch {
    clearStored(key);
    return null;
  }
}

export function saveTimedJson<T extends TimedSessionFields>(key: string, value: T): void {
  const remember = Boolean(value.remember);
  writeRaw(key, JSON.stringify(value), remember);
}

/** Touch lastActiveAt; returns null if session expired */
export function touchTimedJson<T extends TimedSessionFields>(key: string): T | null {
  const current = loadTimedJson<T>(key);
  if (!current) return null;
  const next = { ...current, lastActiveAt: new Date().toISOString() };
  saveTimedJson(key, next);
  return next;
}
