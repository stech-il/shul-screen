import { cloudUrl } from './apiOrigin';
import { normalizeZmanKey, type ZmanKey } from '../data/zmanim';

export type ZmanimSource = 'hebcal' | 'itim';

const CACHE_PREFIX = 'shul-screen:itim-zmanim:';

/**
 * Itim LeBina zman definition ids → our Hebcal keys.
 * Printed weekly/web slots first ("מודפס ראשון"), then calculation fallbacks.
 */
export const ITIM_ZMAN_PRIORITY: ReadonlyArray<readonly [number, ZmanKey]> = [
  [435, 'sunrise'],
  [30, 'sunrise'],
  [14, 'sunrise'],
  [397, 'alotHaShachar'],
  [499, 'alotHaShachar'],
  [443, 'misheyakir'],
  [44, 'sofZmanShma'],
  [438, 'sofZmanShmaMGA'],
  [449, 'sofZmanShmaMGA19Point8'],
  [43, 'sofZmanTfilla'],
  [505, 'sofZmanTfillaMGA'],
  [563, 'sofZmanTfillaMGA19Point8'],
  [13, 'chatzot'],
  [557, 'chatzotNight'],
  [49, 'minchaGedola'],
  [75, 'minchaKetana'],
  [64, 'plagHaMincha'],
  [290, 'sunset'],
  [166, 'sunset'],
  [392, 'sunset'],
  [110, 'dusk'],
  [110, 'tzeit7083deg'],
  [61, 'tzeit85deg'],
  [57, 'tzeit72min'],
  [490, 'tzeit72min'],
  [372, 'beinHaShmashos'],
  [95, 'beinHaShmashos'],
];

export function configZmanimSource(config?: { zmanimSource?: string } | null): ZmanimSource {
  return config?.zmanimSource === 'itim' ? 'itim' : 'hebcal';
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cacheKey(cityId: string, date: Date): string {
  return `${CACHE_PREFIX}${cityId}:${dateKey(date)}`;
}

/** Map Itim's `{ zmanId: iso }` payload onto our zman keys. First hit per key wins. */
export function mapItimRawTimes(raw: Record<string, string> | null | undefined): Partial<Record<ZmanKey, Date>> {
  const times: Partial<Record<ZmanKey, Date>> = {};
  if (!raw) return times;
  for (const [id, key] of ITIM_ZMAN_PRIORITY) {
    if (times[key]) continue;
    const iso = raw[String(id)] ?? raw[id as unknown as string];
    if (!iso) continue;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) continue;
    times[key] = at;
  }
  return times;
}

type ItimResult = {
  date: string;
  times: Partial<Record<ZmanKey, Date>>;
  source: 'itim';
};

function loadCache(cityId: string, date: Date): ItimResult | null {
  try {
    const raw = localStorage.getItem(cacheKey(cityId, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date: string; times: Record<string, string> };
    const times: Partial<Record<ZmanKey, Date>> = {};
    for (const [k, v] of Object.entries(parsed.times)) {
      const key = normalizeZmanKey(k);
      if (key) times[key] = new Date(v);
    }
    return { date: parsed.date, times, source: 'itim' };
  } catch {
    return null;
  }
}

function saveCache(cityId: string, date: Date, times: Partial<Record<ZmanKey, Date>>): void {
  try {
    const serializable: Record<string, string> = {};
    for (const [k, v] of Object.entries(times)) {
      if (v) serializable[k] = v.toISOString();
    }
    localStorage.setItem(
      cacheKey(cityId, date),
      JSON.stringify({ date: dateKey(date), times: serializable }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export interface ItimZmanimApiResponse {
  ok?: boolean;
  date?: string;
  luachId?: number;
  luachName?: string;
  raw?: Record<string, string>;
  error?: string;
}

/** Fetch Itim LeBina times via our server proxy. Null if unavailable. */
export async function fetchItimZmanim(
  cityId: string,
  date = new Date(),
): Promise<ItimResult | null> {
  const cached = loadCache(cityId, date);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  if (online) {
    try {
      const params = new URLSearchParams({
        cityId,
        date: dateKey(date),
      });
      const res = await fetch(cloudUrl(`/api/itim/zmanim?${params.toString()}`), {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Itim HTTP ${res.status}`);
      const data = (await res.json()) as ItimZmanimApiResponse;
      if (!data?.raw || typeof data.raw !== 'object') throw new Error('Itim empty');
      const times = mapItimRawTimes(data.raw);
      if (!Object.keys(times).length) throw new Error('Itim unmapped');
      saveCache(cityId, date, times);
      return { date: data.date || dateKey(date), times, source: 'itim' };
    } catch {
      if (cached) return cached;
      return null;
    }
  }

  return cached;
}
