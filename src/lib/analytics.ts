import type { AnalyticsEvent, ScreenHeartbeat } from '../types';
import { APP_VERSION } from './appVersion';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { DEFAULT_PUBLIC_ORIGIN } from './screenId';

const EVENTS_KEY = 'shul-screen:analytics';
const HEART_PREFIX = 'shul-screen:heartbeat:';
const MAX = 200;
export { APP_VERSION } from './appVersion';

function loadLocal(): AnalyticsEvent[] {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]') as AnalyticsEvent[];
  } catch {
    return [];
  }
}

export function trackEvent(synagogueId: string, type: string, detail?: string): void {
  const event: AnalyticsEvent = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    synagogueId,
    type,
    detail,
  };
  const next = [event, ...loadLocal()].slice(0, MAX);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));

  if (isSupabaseConfigured) {
    const sb = getSupabase();
    void sb?.from('analytics_events').insert({
      id: event.id,
      synagogue_id: synagogueId,
      event_type: type,
      detail: detail ?? null,
      created_at: event.at,
    });
  }
}

export function listEvents(synagogueId?: string): AnalyticsEvent[] {
  const all = loadLocal();
  return synagogueId ? all.filter((e) => e.synagogueId === synagogueId) : all;
}

/** Absolute origin for cloud API — needed on Electron file:// / Capacitor shells. */
async function resolveCloudOrigin(): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.shulKiosk?.isElectron) {
      return DEFAULT_PUBLIC_ORIGIN;
    }
  } catch {
    /* ignore */
  }
  try {
    const { getCloudOrigin } = await import('./apiOrigin');
    const origin = getCloudOrigin();
    if (origin) return origin;
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
      const host = window.location.hostname;
      // Capacitor WebView uses https://localhost — never treat as same-origin API.
      if (host && host !== 'localhost' && host !== '127.0.0.1') return '';
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

async function postHeartbeatToCloud(hb: ScreenHeartbeat): Promise<void> {
  try {
    const origin = await resolveCloudOrigin();
    const path = '/api/cloud/heartbeats';
    const url = origin ? `${origin}${path}` : path;

    try {
      const { isNativeShell } = await import('./apiOrigin');
      if (isNativeShell()) {
        const { CapacitorHttp } = await import('@capacitor/core');
        const abs = origin ? url : `${DEFAULT_PUBLIC_ORIGIN}${path}`;
        await CapacitorHttp.post({
          url: abs,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          data: hb,
          connectTimeout: 15_000,
          readTimeout: 15_000,
        });
        return;
      }
    } catch {
      /* fall through to fetch */
    }

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hb),
      cache: 'no-store',
    });
  } catch {
    /* offline / server down — local copy still useful on same device */
  }
}

export function saveHeartbeat(hb: ScreenHeartbeat): void {
  localStorage.setItem(HEART_PREFIX + hb.synagogueId, JSON.stringify(hb));
  void postHeartbeatToCloud(hb);
  if (isSupabaseConfigured) {
    const sb = getSupabase();
    void sb?.from('screen_heartbeats').upsert({
      synagogue_id: hb.synagogueId,
      at: hb.at,
      version: hb.version,
      online: hb.online,
      layout: hb.layout,
    });
  }
}

export function loadHeartbeat(synagogueId: string): ScreenHeartbeat | null {
  try {
    const raw = localStorage.getItem(HEART_PREFIX + synagogueId);
    return raw ? (JSON.parse(raw) as ScreenHeartbeat) : null;
  } catch {
    return null;
  }
}

/** Local-only (same browser). Prefer fetchHeartbeatsFromCloud for Agency. */
export function listHeartbeats(): ScreenHeartbeat[] {
  const out: ScreenHeartbeat[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(HEART_PREFIX)) continue;
    try {
      out.push(JSON.parse(localStorage.getItem(k)!) as ScreenHeartbeat);
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Server-backed heartbeats — works across kiosk vs admin browsers. */
export async function fetchHeartbeatsFromCloud(synagogueId?: string): Promise<ScreenHeartbeat[]> {
  try {
    const { cloudUrl } = await import('./apiOrigin');
    const q = synagogueId
      ? `?synagogueId=${encodeURIComponent(normalizeSynagogueId(synagogueId))}&_=${Date.now()}`
      : `?_=${Date.now()}`;
    const path = cloudUrl(`/api/cloud/heartbeats${q}`);
    // Single-screen presence is public; agency-wide list still needs platform token.
    const res = synagogueId
      ? await fetch(path, { cache: 'no-store' })
      : await (await import('./serverAuth')).apiFetch(path);
    if (!res.ok) return synagogueId ? [] : listHeartbeats();
    const data = (await res.json()) as { items?: ScreenHeartbeat[] };
    const items = Array.isArray(data.items) ? data.items : [];
    // Empty cloud result for a specific screen means offline — don't mask with localStorage.
    if (items.length === 0) return synagogueId ? [] : listHeartbeats();
    return items
      .filter((h) => h?.synagogueId && h?.at)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  } catch {
    return synagogueId ? [] : listHeartbeats();
  }
}

/** ~2.5 min — tolerates WebView/timer throttle between 30s beats. */
export function isScreenOnline(hb: ScreenHeartbeat | null, withinMs = 150_000): boolean {
  if (!hb) return false;
  const t = Date.parse(hb.at);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < withinMs;
}

/** Normalize synagogue ids for heartbeat ↔ Agency matching (trim / decode). */
export function normalizeSynagogueId(id: string): string {
  const raw = String(id || '').trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function findHeartbeat(
  heartbeats: ScreenHeartbeat[],
  synagogueId: string,
): ScreenHeartbeat | null {
  const want = normalizeSynagogueId(synagogueId);
  return (
    heartbeats.find((h) => normalizeSynagogueId(h.synagogueId) === want) ?? null
  );
}

/** Call from display every 30s — posts to server so Agency sees online status */
export function startHeartbeat(
  synagogueId: string,
  getLayout: () => string,
  intervalMs = 30_000,
): () => void {
  const id = normalizeSynagogueId(synagogueId);
  function beat() {
    saveHeartbeat({
      synagogueId: id,
      at: new Date().toISOString(),
      version: APP_VERSION,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      layout: getLayout(),
    });
  }
  beat();
  const timer = window.setInterval(beat, intervalMs);
  return () => window.clearInterval(timer);
}
