/**
 * Pikud HaOref (Home Front Command) alerts — poll + city match.
 * Official feed: https://www.oref.org.il/WarningMessages/alert/alerts.json
 * Browser: use Vite proxy /api/oref/*
 * Electron: fetch via main process (no CORS).
 */

export interface OrefAlert {
  id: string;
  cat: string;
  title: string;
  data: string[];
  desc: string;
}

export interface MatchedOrefAlert {
  alert: OrefAlert;
  matchedAreas: string[];
  fetchedAt: string;
}

const OREF_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const PROXY_URL = '/api/oref/alerts';

const CAT_LABELS: Record<string, string> = {
  '1': 'ירי רקטות וטילים',
  '2': 'איום לא קונבנציונלי',
  '3': 'רעידת אדמה',
  '4': 'אירוע חומרים מסוכנים',
  '5': 'צונאמי',
  '6': 'חדירת כלי טיס עוין',
  '7': 'חומרים מסוכנים',
  '8': 'התראה מוקדמת',
  '10': 'התראה',
  '13': 'חדירת מחבלים',
};

export function categoryLabel(cat: string, title?: string): string {
  return title?.trim() || CAT_LABELS[cat] || 'התראת פיקוד העורף';
}

function normalizeArea(s: string): string {
  return s
    .trim()
    .replace(/\u05f4/g, '"')
    .replace(/['׳״"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/־/g, '-')
    .replace(/תקוה/g, 'תקווה');
}

/** True if oref area matches any of our city names / aliases */
export function areaMatchesCity(area: string, names: string[]): boolean {
  const a = normalizeArea(area);
  if (!a) return false;
  return names.some((raw) => {
    const n = normalizeArea(raw);
    if (!n) return false;
    if (a === n) return true;
    // "פתח תקווה - מערב" / "פתח תקווה והסביבה"
    if (a.startsWith(n + ' ') || a.startsWith(n + '-') || a.startsWith(n + '–')) return true;
    if (a.includes(n) && n.length >= 3) return true;
    return false;
  });
}

export function parseOrefPayload(text: string): OrefAlert[] {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return (parsed as Partial<OrefAlert>[])
      .map((item) => normalizeAlert(item))
      .filter((a): a is OrefAlert => Boolean(a));
  }

  if (parsed && typeof parsed === 'object') {
    const one = normalizeAlert(parsed as Partial<OrefAlert>);
    return one ? [one] : [];
  }

  return [];
}

function normalizeAlert(raw: Partial<OrefAlert> & { data?: string[] | string }): OrefAlert | null {
  const data = Array.isArray(raw.data)
    ? raw.data.map(String)
    : typeof raw.data === 'string'
      ? [raw.data]
      : [];
  if (!data.length && !raw.title) return null;
  return {
    id: String(raw.id ?? `${Date.now()}`),
    cat: String(raw.cat ?? '1'),
    title: String(raw.title ?? ''),
    data,
    desc: String(raw.desc ?? ''),
  };
}

async function fetchViaElectron(): Promise<string | null> {
  const fn = window.shulKiosk?.fetchOrefAlerts;
  if (!fn) return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function fetchText(): Promise<string> {
  const fromElectron = await fetchViaElectron();
  if (fromElectron != null) return fromElectron;

  const headers: HeadersInit = {
    Accept: 'application/json',
  };

  // Prefer same-origin proxy (Vite / nginx)
  try {
    const res = await fetch(PROXY_URL, { headers, cache: 'no-store' });
    if (res.ok) return await res.text();
  } catch {
    /* fall through */
  }

  // Direct (works only without CORS / from Israeli IP server-side)
  const res = await fetch(OREF_URL, {
    headers: {
      ...headers,
      Referer: 'https://www.oref.org.il/',
      'X-Requested-With': 'XMLHttpRequest',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`oref HTTP ${res.status}`);
  return res.text();
}

export async function fetchOrefAlerts(): Promise<OrefAlert[]> {
  const text = await fetchText();
  return parseOrefPayload(text);
}

export function matchAlertsForCity(
  alerts: OrefAlert[],
  cityNames: string[],
): MatchedOrefAlert | null {
  const names = cityNames.filter(Boolean);
  if (!names.length) return null;

  for (const alert of alerts) {
    const matchedAreas = alert.data.filter((area) => areaMatchesCity(area, names));
    if (matchedAreas.length) {
      return {
        alert,
        matchedAreas,
        fetchedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

export type OrefListener = (match: MatchedOrefAlert | null, err?: string) => void;

/** Poll oref every `intervalMs` and notify when city is in an active alert */
export function subscribeOrefAlerts(
  cityNames: string[],
  onUpdate: OrefListener,
  intervalMs = 3000,
): () => void {
  let stopped = false;
  let timer: number | undefined;

  async function tick() {
    if (stopped) return;
    try {
      const alerts = await fetchOrefAlerts();
      if (stopped) return;
      onUpdate(matchAlertsForCity(alerts, cityNames));
    } catch (e) {
      if (!stopped) onUpdate(null, e instanceof Error ? e.message : 'שגיאת רשת');
    } finally {
      if (!stopped) timer = window.setTimeout(tick, intervalMs);
    }
  }

  tick();
  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
  };
}
