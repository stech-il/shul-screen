import { cloudUrl } from './apiOrigin';

export type GoogleAuthMember = {
  id: string;
  name: string;
  username: string;
  role: 'owner' | 'editor' | 'agency';
  email?: string;
};

type GisCredentialResponse = { credential?: string };

type GisAccountsId = {
  initialize: (cfg: {
    client_id: string;
    callback: (res: GisCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  prompt: (cb?: (n: { momentType: string }) => void) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: string;
      size?: string;
      shape?: string;
      text?: string;
      width?: number;
      locale?: string;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GisAccountsId } };
  }
}

let gisLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-gis]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google script failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.dataset.googleGis = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('לא ניתן לטעון Google Sign-In'));
    document.head.appendChild(s);
  });
  return gisLoadPromise;
}

export async function fetchGoogleClientConfig(): Promise<{ enabled: boolean; clientId: string }> {
  try {
    const res = await fetch(cloudUrl('/api/auth/google-config'), { cache: 'no-store' });
    if (!res.ok) return { enabled: false, clientId: '' };
    const data = (await res.json()) as { enabled?: boolean; clientId?: string };
    const fromEnv = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const clientId = String(data.clientId || fromEnv || '').trim();
    return { enabled: Boolean(data.enabled && clientId), clientId };
  } catch {
    const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    return { enabled: Boolean(clientId), clientId };
  }
}

/** Opens Google One Tap / prompt and returns an ID token. */
export async function requestGoogleIdToken(clientId: string): Promise<string> {
  await loadGisScript();
  const gis = window.google?.accounts?.id;
  if (!gis) throw new Error('Google Sign-In לא זמין');
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('פג תוקף בחירת חשבון Google'));
      }
    }, 120_000);
    gis.initialize({
      client_id: clientId,
      callback: (res) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const token = String(res.credential || '').trim();
        if (!token) reject(new Error('לא התקבל אסימון Google'));
        else resolve(token);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    gis.prompt((notification) => {
      if (settled) return;
      if (notification?.momentType === 'skipped' || notification?.momentType === 'dismissed') {
        // User may still use a rendered button — don't reject yet if we render one.
      }
    });
  });
}

/** Render official Google button into a container; resolves with idToken on click. */
export async function mountGoogleButton(
  container: HTMLElement,
  clientId: string,
  locale: 'he' | 'en',
  onToken: (idToken: string) => void,
  onError: (msg: string) => void,
): Promise<() => void> {
  await loadGisScript();
  const gis = window.google?.accounts?.id;
  if (!gis) {
    onError('Google Sign-In לא זמין');
    return () => undefined;
  }
  container.replaceChildren();
  gis.initialize({
    client_id: clientId,
    callback: (res) => {
      const token = String(res.credential || '').trim();
      if (!token) onError('לא התקבל אסימון Google');
      else onToken(token);
    },
    auto_select: false,
  });
  gis.renderButton(container, {
    theme: 'outline',
    size: 'large',
    shape: 'rectangular',
    text: 'continue_with',
    width: Math.min(320, container.clientWidth || 280),
    locale: locale === 'he' ? 'he' : 'en',
  });
  return () => {
    container.replaceChildren();
  };
}

export class GoogleLoginError extends Error {
  email?: string;
  constructor(message: string, email?: string) {
    super(message);
    this.name = 'GoogleLoginError';
    this.email = email;
  }
}

export async function loginWithGoogleIdToken(
  synagogueId: string,
  idToken: string,
): Promise<GoogleAuthMember> {
  const res = await fetch(cloudUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ synagogueId, idToken }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    email?: string;
    token?: string;
    member?: GoogleAuthMember;
  };
  if (!res.ok || !data.ok || !data.member) {
    throw new GoogleLoginError(data.error || 'התחברות Google נכשלה', data.email);
  }
  if (data.token) {
    const { setMemberApiToken } = await import('./serverAuth');
    setMemberApiToken(data.token);
  }
  return data.member;
}

export async function linkGoogleAccount(input: {
  synagogueId: string;
  username: string;
  password: string;
  idToken: string;
}): Promise<GoogleAuthMember> {
  const res = await fetch(cloudUrl('/api/auth/google-link'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    token?: string;
    member?: GoogleAuthMember;
  };
  if (!res.ok || !data.ok || !data.member) {
    throw new Error(data.error || 'קישור Google נכשל');
  }
  if (data.token) {
    const { setMemberApiToken } = await import('./serverAuth');
    setMemberApiToken(data.token);
  }
  return data.member;
}
