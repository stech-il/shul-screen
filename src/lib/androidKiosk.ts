import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { isManageShellBuild } from './manageApp';
import { DEFAULT_PUBLIC_ORIGIN, isValidScreenId, normalizeScreenId } from './screenId';

const KEY_SHUL = 'screensmart.kiosk.shulId';
const KEY_SERVER = 'screensmart.kiosk.serverUrl';
const LS_SHUL = 'screensmart.kiosk.shulId';
const LS_SERVER = 'screensmart.kiosk.serverUrl';
export const DEFAULT_SERVER = DEFAULT_PUBLIC_ORIGIN;

/** Any Capacitor native WebView (kiosk or manage APK). */
export function isNativeCapacitorShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True inside the beit midrash kiosk APK — not the phone management app. */
export function isAndroidKiosk(): boolean {
  if (isManageShellBuild()) return false;
  return isNativeCapacitorShell();
}

function readLocal(key: string): string {
  try {
    return String(localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export async function loadAndroidKioskConfig(): Promise<{
  shulId: string;
  serverUrl: string;
}> {
  let shulId = readLocal(LS_SHUL);

  if (isAndroidKiosk()) {
    try {
      const shul = await Preferences.get({ key: KEY_SHUL });
      if (shul.value) shulId = String(shul.value).trim();
    } catch {
      /* Preferences may fail before bridge is ready — localStorage fallback */
    }
  }

  // Always locked to the public screensmart server — never read a custom URL.
  writeLocal(LS_SERVER, DEFAULT_SERVER);
  if (isAndroidKiosk()) {
    try {
      await Preferences.set({ key: KEY_SERVER, value: DEFAULT_SERVER });
    } catch {
      /* ignore */
    }
  }

  return {
    shulId,
    serverUrl: DEFAULT_SERVER,
  };
}

export async function saveAndroidKioskConfig(input: {
  shulId: string;
  serverUrl?: string;
}): Promise<void> {
  const shulId = normalizeScreenId(input.shulId);
  if (!isValidScreenId(shulId)) {
    throw new Error('מזהה מסך לא תקין — השתמשו במספר (למשל 12)');
  }
  writeLocal(LS_SHUL, shulId);
  writeLocal(LS_SERVER, DEFAULT_SERVER);
  if (!isAndroidKiosk()) return;
  try {
    await Preferences.set({ key: KEY_SHUL, value: shulId });
    await Preferences.set({ key: KEY_SERVER, value: DEFAULT_SERVER });
  } catch {
    /* localStorage already saved */
  }
}

/** In-app display path — never open an external browser. */
export function inAppDisplayPath(shulId: string): string {
  const id = encodeURIComponent(String(shulId || '').trim());
  return `/display/${id}?kiosk=1`;
}

/** @deprecated use inAppDisplayPath */
export function inAppDisplayHash(shulId: string): string {
  return inAppDisplayPath(shulId);
}

type ProbeHttpResult = {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
};

/** Native Android/iOS must use CapacitorHttp — WebView fetch is often blocked. */
async function probeHttpGet(url: string): Promise<ProbeHttpResult> {
  if (isNativeCapacitorShell()) {
    try {
      const res = await CapacitorHttp.get({
        url,
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
        connectTimeout: 20000,
        readTimeout: 20000,
      });
      const status = Number(res.status) || 0;
      return { ok: status >= 200 && status < 300, status, data: res.data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  try {
    const res = await fetch(url, { cache: 'no-store' });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function probeAndroidConnection(input: {
  shulId: string;
  serverUrl?: string;
}): Promise<{
  server: { ok: boolean };
  config: { ok: boolean; detail: string };
}> {
  const serverUrl = DEFAULT_SERVER;
  const shulId = String(input.shulId || '').trim();
  if (!shulId) {
    return { server: { ok: false }, config: { ok: false, detail: 'missing-id' } };
  }
  if (!isValidScreenId(shulId)) {
    return { server: { ok: false }, config: { ok: false, detail: 'bad-id' } };
  }

  const stamp = Date.now();
  let statusHit = await probeHttpGet(`${serverUrl}/api/cloud/status?_=${stamp}`);
  if (!statusHit.ok) {
    // Fallback: lightweight health endpoint
    statusHit = await probeHttpGet(`${serverUrl}/healthz?_=${stamp}`);
  }
  if (!statusHit.ok) {
    return { server: { ok: false }, config: { ok: false, detail: 'server-down' } };
  }

  const cfgHit = await probeHttpGet(
    `${serverUrl}/api/cloud/synagogues/${encodeURIComponent(shulId)}?_=${stamp}`,
  );
  if (cfgHit.status === 404) {
    return { server: { ok: true }, config: { ok: false, detail: 'not-found' } };
  }
  if (!cfgHit.ok) {
    return {
      server: { ok: true },
      config: { ok: false, detail: cfgHit.status ? `http-${cfgHit.status}` : 'error' },
    };
  }
  const body = cfgHit.data as { config?: unknown } | null;
  if (!body || typeof body !== 'object' || !('config' in body) || !body.config) {
    return { server: { ok: true }, config: { ok: false, detail: 'empty' } };
  }
  return { server: { ok: true }, config: { ok: true, detail: 'ok' } };
}

/** Immersive kiosk chrome: hide status bar, keep screen awake. */
export async function applyAndroidKioskChrome(): Promise<void> {
  if (!isAndroidKiosk()) return;
  try {
    await StatusBar.hide();
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* plugin may be unavailable */
  }
  try {
    await KeepAwake.keepAwake();
  } catch {
    /* ignore */
  }
}

/**
 * Cold start on native — stay inside the APK WebView (never open Chrome).
 * - no shulId → /kiosk-setup
 * - has shulId → /display/…?kiosk=1 (cloud API via saved server URL)
 */
export async function bootstrapAndroidKioskRoute(): Promise<void> {
  if (!isAndroidKiosk()) return;

  void applyAndroidKioskChrome();

  const path = window.location.pathname || '';
  if (path.includes('/kiosk-setup')) return;

  let shulId = '';
  try {
    const cfg = await loadAndroidKioskConfig();
    shulId = cfg.shulId;
  } catch {
    shulId = '';
  }

  if (shulId) {
    const enc = encodeURIComponent(shulId);
    if (path.includes(`/display/${enc}`) || path.includes(`/display/${shulId}`)) {
      return;
    }
    window.history.replaceState(null, '', inAppDisplayPath(shulId));
    return;
  }

  window.history.replaceState(null, '', '/kiosk-setup');
}

/** Open live display inside the same WebView (fullscreen app, no browser). */
export function goToLiveDisplay(shulId: string, _serverUrl?: string): void {
  void applyAndroidKioskChrome();
  window.history.replaceState(null, '', inAppDisplayPath(shulId));
  window.dispatchEvent(new PopStateEvent('popstate'));
}
