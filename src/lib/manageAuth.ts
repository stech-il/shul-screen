/**
 * Persistent manage-app preferences: last screen ID + optional biometric unlock.
 */
import { Preferences } from '@capacitor/preferences';
import {
  AndroidBiometryStrength,
  BiometricAuth,
  BiometryError,
  BiometryType,
} from '@aparajita/capacitor-biometric-auth';
import { isNativeCapacitorShell } from './androidKiosk';
import { isManageShellBuild, preferManageRoutes } from './manageApp';

const KEY_SCREEN = 'screensmart.manage.screenId';
const KEY_BIOMETRIC = 'screensmart.manage.biometric';
const LS_SCREEN = 'screensmart.manage.screenId';
const LS_BIOMETRIC = 'screensmart.manage.biometric';

function readLs(key: string): string {
  try {
    return String(localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function clearLs(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isManageAuthContext(): boolean {
  return isManageShellBuild() || preferManageRoutes();
}

export async function loadSavedManageScreenId(): Promise<string> {
  let id = readLs(LS_SCREEN);
  if (isNativeCapacitorShell()) {
    try {
      const { value } = await Preferences.get({ key: KEY_SCREEN });
      if (value?.trim()) id = value.trim();
    } catch {
      /* ignore */
    }
  }
  return id;
}

export async function saveManageScreenId(screenId: string): Promise<void> {
  const id = String(screenId || '').trim();
  writeLs(LS_SCREEN, id);
  if (!isNativeCapacitorShell()) return;
  try {
    if (id) await Preferences.set({ key: KEY_SCREEN, value: id });
    else await Preferences.remove({ key: KEY_SCREEN });
  } catch {
    /* ignore */
  }
}

export async function loadBiometricEnabled(): Promise<boolean> {
  if (readLs(LS_BIOMETRIC) === '1') return true;
  if (!isNativeCapacitorShell()) return false;
  try {
    const { value } = await Preferences.get({ key: KEY_BIOMETRIC });
    return value === '1';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  writeLs(LS_BIOMETRIC, on ? '1' : '0');
  if (!isNativeCapacitorShell()) return;
  try {
    if (on) await Preferences.set({ key: KEY_BIOMETRIC, value: '1' });
    else await Preferences.remove({ key: KEY_BIOMETRIC });
  } catch {
    /* ignore */
  }
}

export async function clearManageAuthPrefs(): Promise<void> {
  clearLs(LS_SCREEN);
  clearLs(LS_BIOMETRIC);
  if (!isNativeCapacitorShell()) return;
  try {
    await Preferences.remove({ key: KEY_SCREEN });
    await Preferences.remove({ key: KEY_BIOMETRIC });
  } catch {
    /* ignore */
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNativeCapacitorShell() && !isManageShellBuild()) {
    // Web simulate still works via plugin — allow for manage shell testing
  }
  try {
    const { isAvailable, biometryType } = await BiometricAuth.checkBiometry();
    return Boolean(isAvailable && biometryType !== BiometryType.none);
  } catch {
    return false;
  }
}

export async function authenticateWithBiometric(reason: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'ביטול',
      allowDeviceCredential: true,
      androidTitle: 'screensmart ניהול',
      androidSubtitle: reason,
      androidBiometryStrength: AndroidBiometryStrength.weak,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof BiometryError) {
      return { ok: false, error: err.message || String(err.code) };
    }
    if (err && typeof err === 'object' && 'message' in err) {
      return { ok: false, error: String((err as { message: unknown }).message) };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'ביטול' };
  }
}
