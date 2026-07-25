import type { LicenseInfo } from '../types';
import {
  bindLicenseToScreen,
  findLicenseBinding,
  isLicenseValid,
  parseLicenseKey,
  saveGlobalLicense,
  loadGlobalLicense,
} from './license';
import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * Validate license locally + optionally against Supabase `licenses` table.
 * Binds the key to a specific synagogue (per-screen license).
 */
export async function activateLicenseKey(
  key: string,
  synagogueId: string,
): Promise<{ ok: boolean; info?: LicenseInfo; error?: string }> {
  if (!synagogueId.trim()) {
    return { ok: false, error: 'חסר מזהה מסך' };
  }

  const parsed = parseLicenseKey(key);
  if (!parsed) return { ok: false, error: 'מפתח לא תקין' };

  const isDemo = parsed.key.includes('-DEMO-');
  if (!isDemo) {
    const existing = findLicenseBinding(parsed.key);
    if (existing?.synagogueId && existing.synagogueId !== synagogueId) {
      return {
        ok: false,
        error: `המפתח כבר משויך למסך «${existing.synagogueId}»`,
        info: existing,
      };
    }
  }

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
            info: { ...parsed, locked: true, serverValidated: true, synagogueId },
          };
        }
        if (
          data.synagogue_id &&
          data.synagogue_id !== synagogueId &&
          !isDemo
        ) {
          return {
            ok: false,
            error: `המפתח כבר משויך למסך «${data.synagogue_id}»`,
          };
        }
        const info: LicenseInfo = {
          ...parsed,
          plan: (data.plan as LicenseInfo['plan']) || parsed.plan,
          expiresAt: data.expires_at || parsed.expiresAt,
          holderName: data.holder_name || parsed.holderName,
          locked: Boolean(data.locked),
          serverValidated: true,
          synagogueId,
        };
        if (!isLicenseValid(info)) return { ok: false, error: 'הרישיון פג תוקף', info };
        try {
          const bound = bindLicenseToScreen(info, synagogueId);
          saveGlobalLicense(bound);
          await sb
            .from('licenses')
            .update({ synagogue_id: synagogueId })
            .eq('key', info.key);
          return { ok: true, info: bound };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'שיוך נכשל' };
        }
      }
      // No server row — allow local / demo keys
    }
  }

  if (!isLicenseValid(parsed)) return { ok: false, error: 'הרישיון פג תוקף', info: parsed };
  try {
    const bound = bindLicenseToScreen(
      { ...parsed, synagogueId, serverValidated: false },
      synagogueId,
    );
    saveGlobalLicense(bound);
    return { ok: true, info: bound };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שיוך נכשל' };
  }
}

export function getActiveLicense(): LicenseInfo | null {
  return loadGlobalLicense();
}

export function isSynagogueLicensed(info?: LicenseInfo | null): boolean {
  return isLicenseValid(info);
}
