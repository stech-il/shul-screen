import { Capacitor } from '@capacitor/core';
import { DEFAULT_PUBLIC_ORIGIN } from './screenId';

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
 * Native apps are locked to the public screensmart server.
 */
export function getCloudOrigin(): string {
  if (!isNativeShell()) return '';
  return DEFAULT_PUBLIC_ORIGIN;
}

/** Prefix /api/... with the cloud origin when running inside the APK. */
export function cloudUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const origin = getCloudOrigin();
  return origin ? `${origin}${p}` : p;
}
