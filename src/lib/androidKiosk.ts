import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';
import { KeepAwake } from '@capacitor-community/keep-awake';

const KEY_SHUL = 'screensmart.kiosk.shulId';
const KEY_SERVER = 'screensmart.kiosk.serverUrl';
const LS_SHUL = 'screensmart.kiosk.shulId';
const LS_SERVER = 'screensmart.kiosk.serverUrl';
export const DEFAULT_SERVER = 'https://shul-screen.onrender.com';

export function isAndroidKiosk(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
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
  let serverUrl = readLocal(LS_SERVER) || DEFAULT_SERVER;

  if (isAndroidKiosk()) {
    try {
      const [shul, server] = await Promise.all([
        Preferences.get({ key: KEY_SHUL }),
        Preferences.get({ key: KEY_SERVER }),
      ]);
      if (shul.value) shulId = String(shul.value).trim();
      if (server.value) serverUrl = String(server.value).trim();
    } catch {
      /* Preferences may fail before bridge is ready — localStorage fallback */
    }
  }

  return {
    shulId,
    serverUrl: serverUrl.replace(/\/$/, '') || DEFAULT_SERVER,
  };
}

export async function saveAndroidKioskConfig(input: {
  shulId: string;
  serverUrl: string;
}): Promise<void> {
  const shulId = String(input.shulId || '').trim();
  const serverUrl = String(input.serverUrl || DEFAULT_SERVER)
    .trim()
    .replace(/\/$/, '');
  writeLocal(LS_SHUL, shulId);
  writeLocal(LS_SERVER, serverUrl);
  if (!isAndroidKiosk()) return;
  try {
    await Preferences.set({ key: KEY_SHUL, value: shulId });
    await Preferences.set({ key: KEY_SERVER, value: serverUrl });
  } catch {
    /* localStorage already saved */
  }
}

export function displayUrlFor(shulId: string, serverUrl: string): string {
  const server = String(serverUrl || DEFAULT_SERVER)
    .trim()
    .replace(/\/$/, '');
  const id = encodeURIComponent(String(shulId || '').trim());
  return `${server}/#/display/${id}?kiosk=1`;
}

export async function probeAndroidConnection(input: {
  shulId: string;
  serverUrl: string;
}): Promise<{
  server: { ok: boolean };
  config: { ok: boolean; detail: string };
}> {
  const serverUrl = String(input.serverUrl || '')
    .trim()
    .replace(/\/$/, '');
  const shulId = String(input.shulId || '').trim();
  if (!/^https?:\/\//i.test(serverUrl)) {
    return { server: { ok: false }, config: { ok: false, detail: 'bad-url' } };
  }
  if (!shulId) {
    return { server: { ok: false }, config: { ok: false, detail: 'missing-id' } };
  }

  let serverOk = false;
  try {
    const res = await fetch(`${serverUrl}/api/cloud/status?_=${Date.now()}`, {
      cache: 'no-store',
    });
    serverOk = res.ok;
  } catch {
    serverOk = false;
  }
  if (!serverOk) {
    return { server: { ok: false }, config: { ok: false, detail: 'server-down' } };
  }

  try {
    const res = await fetch(
      `${serverUrl}/api/cloud/synagogues/${encodeURIComponent(shulId)}?_=${Date.now()}`,
      { cache: 'no-store' },
    );
    if (res.status === 404) {
      return { server: { ok: true }, config: { ok: false, detail: 'not-found' } };
    }
    if (!res.ok) {
      return { server: { ok: true }, config: { ok: false, detail: `http-${res.status}` } };
    }
    const body = (await res.json()) as { config?: unknown };
    if (!body?.config) {
      return { server: { ok: true }, config: { ok: false, detail: 'empty' } };
    }
    return { server: { ok: true }, config: { ok: true, detail: 'ok' } };
  } catch {
    return { server: { ok: true }, config: { ok: false, detail: 'error' } };
  }
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
 * Cold start on native:
 * - no shulId → local /#/kiosk-setup (always available offline from APK)
 * - has shulId → live server display URL
 */
export async function bootstrapAndroidKioskRoute(): Promise<void> {
  if (!isAndroidKiosk()) return;

  void applyAndroidKioskChrome();

  const hash = window.location.hash || '';
  if (hash.includes('/kiosk-setup')) return;

  let shulId = '';
  let serverUrl = DEFAULT_SERVER;
  try {
    const cfg = await loadAndroidKioskConfig();
    shulId = cfg.shulId;
    serverUrl = cfg.serverUrl;
  } catch {
    shulId = '';
  }

  if (shulId) {
    // Already on the right live display — stay.
    if (hash.includes(`/display/${encodeURIComponent(shulId)}`) || hash.includes(`/display/${shulId}`)) {
      return;
    }
    window.location.replace(displayUrlFor(shulId, serverUrl));
    return;
  }

  window.location.replace('/#/kiosk-setup');
}

/** Open live display after successful setup (leaves local shell for remote host). */
export function goToLiveDisplay(shulId: string, serverUrl: string): void {
  window.location.replace(displayUrlFor(shulId, serverUrl));
}
