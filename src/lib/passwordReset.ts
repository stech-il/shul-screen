import { cloudUrl } from './apiOrigin';

async function api(path: string, init?: RequestInit) {
  const res = await fetch(cloudUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error || `HTTP ${res.status}`));
  }
  return data;
}

export function requestPasswordReset(input: {
  kind: 'synagogue' | 'platform';
  username: string;
  synagogueId?: string;
  email?: string;
}) {
  return api('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<{ ok: boolean; message?: string; error?: string }>;
}

export function peekPasswordResetToken(token: string) {
  return api(`/api/auth/reset-password?token=${encodeURIComponent(token)}`) as Promise<{
    ok: boolean;
    kind?: 'synagogue' | 'platform';
    synagogueId?: string | null;
    username?: string;
    expiresAt?: number;
    secondsLeft?: number;
    error?: string;
  }>;
}

export function completePasswordReset(token: string, password: string) {
  return api('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  }) as Promise<{
    ok: boolean;
    kind?: 'synagogue' | 'platform';
    synagogueId?: string;
    username?: string;
    passwordHash?: string;
    loginPath?: string;
    error?: string;
  }>;
}

export async function platformLoginRemote(
  username: string,
  password: string,
): Promise<{ ok: true; username: string } | { ok: false; error: string; missing?: boolean }> {
  try {
    const res = await fetch(cloudUrl('/api/auth/platform-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      username?: string;
      error?: string;
    };
    if (res.status === 404) {
      return { ok: false, error: data.error || 'no-server-accounts', missing: true };
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error || 'שם משתמש או סיסמה שגויים') };
    }
    return { ok: true, username: String(data.username || username) };
  } catch {
    return { ok: false, error: 'offline', missing: true };
  }
}

/** Apply server-issued platform password hash into local credential store. */
export function applyPlatformPasswordHash(username: string, passwordHash: string): void {
  const CREDS_KEY = 'shul-screen:platform-creds';
  const u = username.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    let accounts: { username: string; passwordHash: string }[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as
        | { accounts?: { username: string; passwordHash: string }[] }
        | { username: string; passwordHash: string };
      if (Array.isArray((parsed as { accounts?: unknown }).accounts)) {
        accounts = (parsed as { accounts: { username: string; passwordHash: string }[] }).accounts;
      } else if ((parsed as { username?: string }).username) {
        accounts = [parsed as { username: string; passwordHash: string }];
      }
    }
    const idx = accounts.findIndex((a) => a.username.trim().toLowerCase() === u);
    if (idx >= 0) accounts[idx] = { username: u, passwordHash };
    else accounts.push({ username: u, passwordHash });
    localStorage.setItem(CREDS_KEY, JSON.stringify({ accounts }));
  } catch {
    localStorage.setItem(
      CREDS_KEY,
      JSON.stringify({ accounts: [{ username: u, passwordHash }] }),
    );
  }
}
