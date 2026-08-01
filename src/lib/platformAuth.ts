/**
 * Platform / super-admin gate — required to create new synagogues.
 * Credentials from env (preferred) or defaults for first setup.
 * Supports multiple platform usernames with profile fields.
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
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface PlatformCreds {
  username: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/** Public account row (no password hash). */
export interface PlatformAccountPublic {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** Multi-account store (migrated from single PlatformCreds). */
interface PlatformCredsStore {
  accounts: PlatformCreds[];
}

export type PlatformProfileInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
};

const DEFAULT_USER =
  (import.meta.env.VITE_PLATFORM_ADMIN_USER as string | undefined)?.trim().toLowerCase() ||
  'superadmin';
const DEFAULT_PASS =
  (import.meta.env.VITE_PLATFORM_ADMIN_PASSWORD as string | undefined) || 'ShulAdmin2026!';

/** Optional extra local seed — only in Vite DEV (never ship hardcoded prod passwords). */
const EXTRA_USER = (import.meta.env.VITE_PLATFORM_EXTRA_USER as string | undefined)?.trim() || '';
const EXTRA_PASS = (import.meta.env.VITE_PLATFORM_EXTRA_PASSWORD as string | undefined) || '';

function builtinSeeds(): { username: string; password: string }[] {
  if (!import.meta.env.DEV) return [];
  const seeds = [{ username: DEFAULT_USER, password: DEFAULT_PASS }];
  if (
    EXTRA_USER &&
    EXTRA_PASS &&
    normalizeUsername(EXTRA_USER) !== normalizeUsername(DEFAULT_USER)
  ) {
    seeds.push({ username: EXTRA_USER, password: EXTRA_PASS });
  }
  return seeds;
}

function cleanName(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function cleanEmail(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function normalizeAccount(raw: PlatformCreds): PlatformCreds {
  return {
    username: normalizeUsername(raw.username),
    passwordHash: String(raw.passwordHash || ''),
    firstName: cleanName(raw.firstName),
    lastName: cleanName(raw.lastName),
    email: cleanEmail(raw.email),
  };
}

function toPublic(account: PlatformCreds): PlatformAccountPublic {
  const a = normalizeAccount(account);
  return {
    username: a.username,
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    email: a.email || '',
  };
}

/** Display name for greetings — prefers first+last, else username. */
export function platformDisplayName(
  account: Pick<PlatformAccountPublic, 'username' | 'firstName' | 'lastName'> | PlatformSession | null | undefined,
): string {
  if (!account) return '';
  const full = [account.firstName, account.lastName]
    .map((s) => cleanName(s))
    .filter(Boolean)
    .join(' ');
  return full || normalizeUsername(account.username) || '';
}

function saveStore(store: PlatformCredsStore): void {
  localStorage.setItem(
    CREDS_KEY,
    JSON.stringify({ accounts: store.accounts.map(normalizeAccount) }),
  );
}

async function ensureAccount(
  accounts: PlatformCreds[],
  username: string,
  password: string,
): Promise<PlatformCreds[]> {
  const u = normalizeUsername(username);
  if (accounts.some((a) => normalizeUsername(a.username) === u)) return accounts;
  const passwordHash = await hashPassword(password);
  return [...accounts, normalizeAccount({ username: u, passwordHash })];
}

async function loadStore(): Promise<PlatformCredsStore> {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlatformCredsStore | PlatformCreds;
      let accounts: PlatformCreds[] = [];
      if (Array.isArray((parsed as PlatformCredsStore).accounts)) {
        accounts = (parsed as PlatformCredsStore).accounts
          .filter((a) => a?.username && a?.passwordHash)
          .map(normalizeAccount);
      } else if (
        (parsed as PlatformCreds).username &&
        (parsed as PlatformCreds).passwordHash
      ) {
        accounts = [normalizeAccount(parsed as PlatformCreds)];
      }

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

function mergeProfile(account: PlatformCreds, profile?: PlatformProfileInput): PlatformCreds {
  if (!profile) return normalizeAccount(account);
  return normalizeAccount({
    ...account,
    firstName:
      profile.firstName !== undefined ? cleanName(profile.firstName) : account.firstName,
    lastName: profile.lastName !== undefined ? cleanName(profile.lastName) : account.lastName,
    email: profile.email !== undefined ? cleanEmail(profile.email) : account.email,
  });
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
  profile?: PlatformProfileInput,
): PlatformSession {
  const session: PlatformSession = {
    username: normalizeUsername(username),
    firstName: cleanName(profile?.firstName),
    lastName: cleanName(profile?.lastName),
    email: cleanEmail(profile?.email),
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
  try {
    void import('./serverAuth').then((m) => m.clearPlatformApiToken());
  } catch {
    /* ignore */
  }
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
      const profile = {
        firstName: remote.firstName,
        lastName: remote.lastName,
        email: remote.email,
      };
      if (remote.token) {
        const { setPlatformApiToken } = await import('./serverAuth');
        setPlatformApiToken(remote.token);
      }
      // Keep local profile in sync when server returns it
      const store = await loadStore();
      const idx = store.accounts.findIndex((a) => normalizeUsername(a.username) === u);
      if (idx >= 0) {
        const next = [...store.accounts];
        next[idx] = mergeProfile(next[idx], profile);
        saveStore({ accounts: next });
      }
      return { ok: true, session: savePlatformSession(remote.username, remember, profile) };
    }
    if (!remote.missing) {
      return { ok: false, error: remote.error };
    }
  } catch {
    /* fall through to local — local-only login cannot call locked APIs */
  }

  // Offline / no server accounts: allow local verify only in Vite dev
  if (!import.meta.env.DEV) {
    return { ok: false, error: 'אין חיבור לשרת — נסו שוב' };
  }

  const store = await loadStore();
  const account = store.accounts.find((a) => normalizeUsername(a.username) === u);
  if (!account) {
    return { ok: false, error: 'שם משתמש או סיסמה שגויים' };
  }
  const ok = await verifyPassword(password, account.passwordHash);
  if (!ok) return { ok: false, error: 'שם משתמש או סיסמה שגויים' };
  return {
    ok: true,
    session: savePlatformSession(account.username, remember, {
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
    }),
  };
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
  next[idx] = { ...next[idx], passwordHash };
  saveStore({ accounts: next });

  try {
    const { cloudUrl } = await import('./apiOrigin');
    const { apiFetch } = await import('./serverAuth');
    await apiFetch(cloudUrl('/api/auth/platform-accounts'), {
      method: 'PUT',
      body: JSON.stringify({ username: u, password: newPassword }),
    });
  } catch {
    /* local still updated */
  }
  return { ok: true };
}

/** List platform / super-admin accounts (local ∪ server profiles). */
export async function listPlatformAccounts(): Promise<PlatformAccountPublic[]> {
  const byUser = new Map<string, PlatformAccountPublic>();
  for (const a of (await loadStore()).accounts) {
    byUser.set(a.username, toPublic(a));
  }
  try {
    const { cloudUrl } = await import('./apiOrigin');
    const { apiFetch } = await import('./serverAuth');
    const res = await apiFetch(cloudUrl('/api/auth/platform-accounts'));
    if (res.ok) {
      const data = (await res.json()) as {
        accounts?: { username?: string; firstName?: string; lastName?: string; email?: string }[];
      };
      for (const row of data.accounts || []) {
        const u = normalizeUsername(row.username || '');
        if (!u) continue;
        const prev = byUser.get(u);
        byUser.set(u, {
          username: u,
          firstName: cleanName(row.firstName) || prev?.firstName || '',
          lastName: cleanName(row.lastName) || prev?.lastName || '',
          email: cleanEmail(row.email) || prev?.email || '',
        });
      }
    }
  } catch {
    /* offline — local only */
  }
  return [...byUser.values()].sort((a, b) => a.username.localeCompare(b.username, 'en'));
}

export async function addPlatformAccount(
  username: string,
  password: string,
  profile: PlatformProfileInput = {},
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  if (!isPlatformAdminLoggedIn()) return { ok: false, error: 'יש להתחבר כמנהל מערכת' };
  const u = normalizeUsername(username);
  if (u.length < 2) return { ok: false, error: 'שם משתמש קצר מדי' };
  if (password.length < 8) return { ok: false, error: 'סיסמה חייבת לפחות 8 תווים' };
  const email = cleanEmail(profile.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'כתובת מייל לא תקינה' };
  }

  const store = await loadStore();
  if (store.accounts.some((a) => normalizeUsername(a.username) === u)) {
    return { ok: false, error: 'שם המשתמש כבר קיים' };
  }
  const passwordHash = await hashPassword(password);
  const account = mergeProfile({ username: u, passwordHash }, profile);
  saveStore({ accounts: [...store.accounts, account] });

  try {
    const { cloudUrl } = await import('./apiOrigin');
    const { apiFetch } = await import('./serverAuth');
    await apiFetch(cloudUrl('/api/auth/platform-accounts'), {
      method: 'POST',
      body: JSON.stringify({
        username: u,
        password,
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
      }),
    });
  } catch {
    /* local still ok */
  }
  return { ok: true, username: u };
}

export async function updatePlatformAccountProfile(
  username: string,
  profile: PlatformProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlatformAdminLoggedIn()) return { ok: false, error: 'יש להתחבר כמנהל מערכת' };
  const u = normalizeUsername(username);
  const email = profile.email !== undefined ? cleanEmail(profile.email) : undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'כתובת מייל לא תקינה' };
  }

  const store = await loadStore();
  const idx = store.accounts.findIndex((a) => normalizeUsername(a.username) === u);
  if (idx >= 0) {
    const next = [...store.accounts];
    next[idx] = mergeProfile(next[idx], profile);
    saveStore({ accounts: next });

    const me = normalizeUsername(loadPlatformSession()?.username || '');
    if (me === u) {
      const cur = loadPlatformSession();
      if (cur) {
        savePlatformSession(u, Boolean(cur.remember), {
          firstName: next[idx].firstName,
          lastName: next[idx].lastName,
          email: next[idx].email,
        });
      }
    }
  }

  try {
    const { cloudUrl } = await import('./apiOrigin');
    const { apiFetch } = await import('./serverAuth');
    await apiFetch(cloudUrl('/api/auth/platform-accounts'), {
      method: 'PUT',
      body: JSON.stringify({
        username: u,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
      }),
    });
  } catch {
    /* local still ok when present */
  }
  return { ok: true };
}

export async function resetPlatformAccountPassword(
  username: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlatformAdminLoggedIn()) return { ok: false, error: 'יש להתחבר כמנהל מערכת' };
  const u = normalizeUsername(username);
  if (newPassword.length < 8) return { ok: false, error: 'סיסמה חייבת לפחות 8 תווים' };

  const store = await loadStore();
  const idx = store.accounts.findIndex((a) => normalizeUsername(a.username) === u);
  const passwordHash = await hashPassword(newPassword);
  if (idx >= 0) {
    const next = [...store.accounts];
    next[idx] = { ...next[idx], passwordHash };
    saveStore({ accounts: next });
  } else {
    saveStore({ accounts: [...store.accounts, normalizeAccount({ username: u, passwordHash })] });
  }

  try {
    const { cloudUrl } = await import('./apiOrigin');
    const { apiFetch } = await import('./serverAuth');
    await apiFetch(cloudUrl('/api/auth/platform-accounts'), {
      method: 'PUT',
      body: JSON.stringify({ username: u, password: newPassword }),
    });
  } catch {
    /* local still ok */
  }
  return { ok: true };
}

export async function deletePlatformAccount(
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlatformAdminLoggedIn()) return { ok: false, error: 'יש להתחבר כמנהל מערכת' };
  const u = normalizeUsername(username);
  const me = normalizeUsername(loadPlatformSession()?.username || '');
  if (u && me && u === me) return { ok: false, error: 'אי אפשר למחוק את המשתמש שאיתו התחברת' };

  const store = await loadStore();
  if (store.accounts.length <= 1) {
    return { ok: false, error: 'לא ניתן למחוק את המשתמש האחרון' };
  }
  const next = store.accounts.filter((a) => normalizeUsername(a.username) !== u);
  if (next.length !== store.accounts.length) {
    saveStore({ accounts: next });
  }

  try {
    const { cloudUrl } = await import('./apiOrigin');
    const { apiFetch } = await import('./serverAuth');
    const res = await apiFetch(cloudUrl('/api/auth/platform-accounts'), {
      method: 'DELETE',
      body: JSON.stringify({ username: u }),
    });
    if (!res.ok && res.status !== 404) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (data.error) return { ok: false, error: String(data.error) };
    }
  } catch {
    /* local already updated when possible */
  }
  return { ok: true };
}

export function requirePlatformAdmin(): boolean {
  return isPlatformAdminLoggedIn();
}
