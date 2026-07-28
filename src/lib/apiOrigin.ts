import { Capacitor } from '@capacitor/core';
import { DEFAULT_PUBLIC_ORIGIN } from './screenId';

const LS_SERVER = 'screensmart.kiosk.serverUrl';

/** True inside Capacitor Android/iOS WebView. */
export function isNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Absolute cloud API origin for the native APK (bundled assets have no /api).
 * Empty string = same-origin relative paths (browser / production website).
 */
export function getCloudOrigin(): string {
  if (!isNativeShell()) return '';
  try {
    const fromLs = String(localStorage.getItem(LS_SERVER) || '')
      .trim()
      .replace(/\/$/, '');
    if (/^https?:\/\//i.test(fromLs)) return fromLs;
  } catch {
    /* ignore */
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

/** Prefix /api/... with the cloud origin when running inside the APK. */
export function cloudUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const origin = getCloudOrigin();
  return origin ? `${origin}${p}` : p;
}
