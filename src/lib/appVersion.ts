import { DEFAULT_PUBLIC_ORIGIN } from './screenId';
import { isNativeCapacitorShell } from './androidKiosk';

/** Injected at build time from package.json — keep in sync with version-history.json */
export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : '0.3.4';

export type AppVersionInfo = {
  version: string;
  at?: string;
  history?: { version: string; at: string; notes?: string }[];
};

/** Compare semver-ish strings. Returns >0 if a newer than b. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function isOlderVersion(local: string, remote: string): boolean {
  return compareVersions(local, remote) < 0;
}

async function resolveVersionUrl(): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.shulKiosk?.getConfig) {
      const cfg = await window.shulKiosk.getConfig();
      const origin = String(cfg?.serverUrl || '').trim().replace(/\/$/, '');
      if (/^https?:\/\//i.test(origin)) return `${origin}/api/app-version`;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `${window.location.origin}/api/app-version`;
      }
    }
  } catch {
    /* ignore */
  }
  return `${DEFAULT_PUBLIC_ORIGIN}/api/app-version`;
}

export async function fetchRemoteAppVersion(): Promise<AppVersionInfo | null> {
  try {
    const url = `${await resolveVersionUrl()}?_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as AppVersionInfo;
    if (!data?.version) return null;
    return data;
  } catch {
    return null;
  }
}

async function applyPendingServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || isNativeCapacitorShell()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.update();
    const waiting = reg.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    }
    return Boolean(reg.installing || reg.waiting);
  } catch {
    return false;
  }
}

/**
 * Poll the server version and soft-reload when the deployed build is newer.
 * Native Capacitor shells skip auto-pull (APK is the update channel).
 */
export function startAppVersionWatch(intervalMs = 15 * 60_000): () => void {
  if (typeof window === 'undefined') return () => {};
  if (isNativeCapacitorShell()) return () => {};

  let stopped = false;
  let reloading = false;

  async function check() {
    if (stopped || reloading) return;
    const remote = await fetchRemoteAppVersion();
    if (!remote?.version || !isOlderVersion(APP_VERSION, remote.version)) return;
    reloading = true;
    try {
      await applyPendingServiceWorker();
    } catch {
      /* ignore */
    }
    // Give SW a moment to activate, then pull the new build.
    window.setTimeout(() => {
      if (stopped) return;
      window.location.reload();
    }, 1200);
  }

  void check();
  const timer = window.setInterval(() => void check(), intervalMs);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
