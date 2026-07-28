import type { AnalyticsEvent, ScreenHeartbeat } from '../types';
import { getSupabase, isSupabaseConfigured } from './supabase';

const EVENTS_KEY = 'shul-screen:analytics';
const HEART_PREFIX = 'shul-screen:heartbeat:';
const MAX = 200;
export const APP_VERSION = '0.3.0';

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

/** Absolute origin for cloud API — needed on Electron file:// offline shell. */
async function resolveCloudOrigin(): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.shulKiosk?.getConfig) {
      const cfg = await window.shulKiosk.getConfig();
      const url = String(cfg?.serverUrl || '').trim().replace(/\/$/, '');
      if (/^https?:\/\//i.test(url)) return url;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
      return ''; // same-origin relative paths
    }
  } catch {
    /* ignore */
  }
  return 'https://shul-screen.onrender.com';
}

async function postHeartbeatToCloud(hb: ScreenHeartbeat): Promise<void> {
  try {
    const origin = await resolveCloudOrigin();
    const url = `${origin}/api/cloud/heartbeats`;
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
export async function fetchHeartbeatsFromCloud(): Promise<ScreenHeartbeat[]> {
  try {
    const res = await fetch(`/api/cloud/heartbeats?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return listHeartbeats();
    const data = (await res.json()) as { items?: ScreenHeartbeat[] };
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) return listHeartbeats();
    return items
      .filter((h) => h?.synagogueId && h?.at)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  } catch {
    return listHeartbeats();
  }
}

export function isScreenOnline(hb: ScreenHeartbeat | null, withinMs = 90_000): boolean {
  if (!hb) return false;
  return Date.now() - Date.parse(hb.at) < withinMs;
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
