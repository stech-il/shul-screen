import type { LicenseInfo } from '../types';
import {
  isLicenseValid,
  parseLicenseKey,
  saveGlobalLicense,
  loadGlobalLicense,
} from './license';
import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * Validate license locally + optionally against Supabase `licenses` table.
 * Remote lock: row.locked = true blocks the synagogue.
 */
export async function activateLicenseKey(
  key: string,
  synagogueId?: string,
): Promise<{ ok: boolean; info?: LicenseInfo; error?: string }> {
  const parsed = parseLicenseKey(key);
  if (!parsed) return { ok: false, error: 'מפתח לא תקין' };

  if (isSupabaseConfigured) {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from('licenses')
        .select('*')
        .eq('key', parsed.key)
        .maybeSingle();

      if (!error && data) {
        if (data.locked) {
          return {
            ok: false,
            error: 'הרישיון ננעל מרחוק — פנה לתמיכה',
            info: { ...parsed, locked: true, serverValidated: true },
          };
        }
        const info: LicenseInfo = {
          ...parsed,
          plan: (data.plan as LicenseInfo['plan']) || parsed.plan,
          expiresAt: data.expires_at || parsed.expiresAt,
          holderName: data.holder_name || parsed.holderName,
          locked: Boolean(data.locked),
          serverValidated: true,
        };
        if (!isLicenseValid(info)) return { ok: false, error: 'הרישיון פג תוקף', info };
        saveGlobalLicense(info);
        if (synagogueId) {
          await sb.from('licenses').update({ synagogue_id: synagogueId }).eq('key', info.key);
        }
        return { ok: true, info };
      }
      // No server row — allow demo keys locally
    }
  }

  if (!isLicenseValid(parsed)) return { ok: false, error: 'הרישיון פג תוקף', info: parsed };
  saveGlobalLicense(parsed);
  return { ok: true, info: { ...parsed, serverValidated: false } };
}

export function getActiveLicense(): LicenseInfo | null {
  return loadGlobalLicense();
}

export function isSynagogueLicensed(info?: LicenseInfo | null): boolean {
  if (!info) return true; // open demo
  if (info.locked) return false;
  return isLicenseValid(info);
}
