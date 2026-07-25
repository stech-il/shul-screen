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

export function saveHeartbeat(hb: ScreenHeartbeat): void {
  localStorage.setItem(HEART_PREFIX + hb.synagogueId, JSON.stringify(hb));
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

export function isScreenOnline(hb: ScreenHeartbeat | null, withinMs = 90_000): boolean {
  if (!hb) return false;
  return Date.now() - Date.parse(hb.at) < withinMs;
}

/** Call from display every 30s */
export function startHeartbeat(
  synagogueId: string,
  getLayout: () => string,
  intervalMs = 30_000,
): () => void {
  function beat() {
    saveHeartbeat({
      synagogueId,
      at: new Date().toISOString(),
      version: APP_VERSION,
      online: navigator.onLine,
      layout: getLayout(),
    });
  }
  beat();
  const id = window.setInterval(beat, intervalMs);
  return () => window.clearInterval(id);
}
