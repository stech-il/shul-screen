import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';
import { KeepAwake } from '@capacitor-community/keep-awake';

const KEY_SHUL = 'screensmart.kiosk.shulId';
const KEY_SERVER = 'screensmart.kiosk.serverUrl';
export const DEFAULT_SERVER = 'https://shul-screen.onrender.com';

export function isAndroidKiosk(): boolean {
  return Capacitor.isNativePlatform();
}

export async function loadAndroidKioskConfig(): Promise<{
  shulId: string;
  serverUrl: string;
}> {
  const [shul, server] = await Promise.all([
    Preferences.get({ key: KEY_SHUL }),
    Preferences.get({ key: KEY_SERVER }),
  ]);
  return {
    shulId: String(shul.value || '').trim(),
    serverUrl: String(server.value || DEFAULT_SERVER)
      .trim()
      .replace(/\/$/, ''),
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
  await Preferences.set({ key: KEY_SHUL, value: shulId });
  await Preferences.set({ key: KEY_SERVER, value: serverUrl });
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
    /* plugin may be unavailable in browser preview */
  }
  try {
    await KeepAwake.keepAwake();
  } catch {
    /* ignore */
  }
}

/**
 * On cold start: if native + saved shulId, open live display;
 * if native + no shulId, open setup (unless already on setup).
 */
export async function bootstrapAndroidKioskRoute(): Promise<void> {
  if (!isAndroidKiosk()) return;
  await applyAndroidKioskChrome();

  const hash = window.location.hash || '';
  if (hash.includes('/kiosk-setup') || hash.includes('/display/')) return;

  const { shulId } = await loadAndroidKioskConfig();
  if (shulId) {
    window.location.replace(`/#/display/${encodeURIComponent(shulId)}?kiosk=1`);
    return;
  }
  window.location.replace('/#/kiosk-setup');
}
