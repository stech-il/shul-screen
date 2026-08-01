import { cloudUrl } from './apiOrigin';
import { apiFetch, setPlatformApiToken } from './serverAuth';

async function api(path: string, init?: RequestInit) {
  const res = await apiFetch(cloudUrl(path), init);
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

export type PlatformLoginRemoteResult =
  | {
      ok: true;
      username: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      token?: string;
      smsRequired?: false;
    }
  | {
      ok: true;
      smsRequired: true;
      challengeId: string;
      phoneHint: string;
      username: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    }
  | { ok: false; error: string; missing?: boolean };

export async function platformLoginRemote(
  username: string,
  password: string,
): Promise<PlatformLoginRemoteResult> {
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
      firstName?: string;
      lastName?: string;
      email?: string;
      token?: string;
      smsRequired?: boolean;
      challengeId?: string;
      phoneHint?: string;
      error?: string;
    };
    if (res.status === 404) {
      return { ok: false, error: data.error || 'no-server-accounts', missing: true };
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error || 'שם משתמש או סיסמה שגויים') };
    }
    if (data.smsRequired && data.challengeId) {
      return {
        ok: true,
        smsRequired: true,
        challengeId: data.challengeId,
        phoneHint: String(data.phoneHint || '****'),
        username: String(data.username || username),
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
      };
    }
    if (data.token) setPlatformApiToken(data.token);
    return {
      ok: true,
      username: String(data.username || username),
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      token: data.token,
    };
  } catch {
    return { ok: false, error: 'offline', missing: true };
  }
}

export async function platformLoginSmsVerify(challengeId: string, code: string): Promise<
  | {
      ok: true;
      username: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      token?: string;
    }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(cloudUrl('/api/auth/platform-login/sms'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      username?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      token?: string;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.token) {
      return { ok: false, error: String(data.error || 'קוד שגוי') };
    }
    setPlatformApiToken(data.token);
    return {
      ok: true,
      username: String(data.username || ''),
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      token: data.token,
    };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת' };
  }
}

export async function platformLoginSmsResend(
  username: string,
  password: string,
): Promise<
  | { ok: true; challengeId: string; phoneHint: string; token?: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(cloudUrl('/api/auth/platform-login/sms-resend'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      challengeId?: string;
      phoneHint?: string;
      token?: string;
      smsRequired?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error || 'שליחה מחדש נכשלה') };
    }
    if (data.token) {
      setPlatformApiToken(data.token);
      return { ok: true, challengeId: '', phoneHint: '', token: data.token };
    }
    if (!data.challengeId) {
      return { ok: false, error: 'שליחה מחדש נכשלה' };
    }
    return {
      ok: true,
      challengeId: data.challengeId,
      phoneHint: String(data.phoneHint || '****'),
    };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת' };
  }
}

export type SmsSystemStatus = {
  ok?: boolean;
  configured: boolean;
  otpEnabled: boolean;
  ready: boolean;
  sender: string | null;
  userHint: string;
  notes: string;
};

export async function fetchSmsStatus(): Promise<SmsSystemStatus> {
  const res = await apiFetch(cloudUrl('/api/auth/sms-status'));
  const data = (await res.json().catch(() => ({}))) as SmsSystemStatus & { error?: string };
  if (!res.ok) {
    throw new Error(String(data.error || `HTTP ${res.status}`));
  }
  return {
    configured: Boolean(data.configured),
    otpEnabled: Boolean(data.otpEnabled),
    ready: Boolean(data.ready),
    sender: data.sender ?? null,
    userHint: String(data.userHint || '****'),
    notes: String(data.notes || ''),
  };
}

export async function sendSmsTest(phone?: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await apiFetch(cloudUrl('/api/auth/sms-test'), {
    method: 'POST',
    body: JSON.stringify({ phone: phone || undefined }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: String(data.error || 'בדיקת SMS נכשלה') };
  }
  return { ok: true, message: data.message || 'נשלח' };
}

export async function memberLoginRemote(
  synagogueId: string,
  username: string,
  password: string,
): Promise<
  | {
      ok: true;
      token: string;
      member: { id: string; name: string; username?: string; role: string; email?: string };
    }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(cloudUrl('/api/auth/member-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ synagogueId, username, password }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      token?: string;
      member?: { id: string; name: string; username?: string; role: string; email?: string };
      error?: string;
    };
    if (!res.ok || !data.ok || !data.token || !data.member) {
      return { ok: false, error: String(data.error || 'שם משתמש או סיסמה שגויים') };
    }
    return { ok: true, token: data.token, member: data.member };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת' };
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
