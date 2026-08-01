/**
 * Bearer tokens for locked cloud / billing / admin APIs.
 * Member tokens live with the synagogue session; platform tokens with platform session.
 */

const MEMBER_TOKEN_KEY = 'shul-screen:api-token';
const PLATFORM_TOKEN_KEY = 'shul-screen:platform-api-token';

export function getMemberApiToken(): string {
  try {
    return String(localStorage.getItem(MEMBER_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setMemberApiToken(token: string | null | undefined): void {
  try {
    const t = String(token || '').trim();
    if (t) localStorage.setItem(MEMBER_TOKEN_KEY, t);
    else localStorage.removeItem(MEMBER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearMemberApiToken(): void {
  setMemberApiToken('');
}

export function getPlatformApiToken(): string {
  try {
    return String(localStorage.getItem(PLATFORM_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setPlatformApiToken(token: string | null | undefined): void {
  try {
    const t = String(token || '').trim();
    if (t) localStorage.setItem(PLATFORM_TOKEN_KEY, t);
    else localStorage.removeItem(PLATFORM_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearPlatformApiToken(): void {
  setPlatformApiToken('');
}

/** Prefer platform token (agency), else member token. */
export function getApiToken(): string {
  return getPlatformApiToken() || getMemberApiToken();
}

export function authHeaders(extra?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (extra) {
    const h = new Headers(extra);
    h.forEach((v, k) => {
      out[k] = v;
    });
  }
  const token = getApiToken();
  if (token) out.Authorization = `Bearer ${token}`;
  return out;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = authHeaders({
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers || {}),
  });
  return fetch(input, { ...init, headers, cache: init?.cache ?? 'no-store' });
}
