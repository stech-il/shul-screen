import { cloudUrl } from './apiOrigin';

export interface ItimExtraLine {
  title?: string;
  text: string;
  dateLabel?: string;
}

export interface ItimExtras {
  moon: ItimExtraLine[];
  halachot: ItimExtraLine[];
  events: ItimExtraLine[];
  limud: ItimExtraLine[];
  haftara: ItimExtraLine[];
}

export const EMPTY_ITIM_EXTRAS: ItimExtras = {
  moon: [],
  halachot: [],
  events: [],
  limud: [],
  haftara: [],
};

const CACHE_PREFIX = 'shul-screen:itim-extras:v6:';

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cacheKey(cityId: string, date: Date): string {
  return `${CACHE_PREFIX}${cityId}:${dateKey(date)}`;
}

function asLines(raw: unknown): ItimExtraLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ItimExtraLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const text = String(rec.text || '').trim();
    if (!text) continue;
    out.push({
      title: String(rec.title || '').trim() || undefined,
      text,
      dateLabel: String(rec.dateLabel || '').trim() || undefined,
    });
  }
  return out;
}

function loadCache(cityId: string, date: Date): ItimExtras | null {
  try {
    const raw = localStorage.getItem(cacheKey(cityId, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ItimExtras>;
    return {
      moon: asLines(parsed.moon),
      halachot: asLines(parsed.halachot),
      events: asLines(parsed.events),
      limud: asLines(parsed.limud),
      haftara: asLines(parsed.haftara),
    };
  } catch {
    return null;
  }
}

function saveCache(cityId: string, date: Date, extras: ItimExtras): void {
  try {
    localStorage.setItem(cacheKey(cityId, date), JSON.stringify(extras));
  } catch {
    /* ignore quota / private mode */
  }
}

function hasAny(extras: ItimExtras): boolean {
  return Boolean(
    extras.moon.length ||
      extras.halachot.length ||
      extras.events.length ||
      extras.limud.length ||
      extras.haftara.length,
  );
}

/** Fetch Itim sidebar extras via our server proxy. Empty object if unavailable. */
export async function fetchItimExtras(
  cityId: string,
  date = new Date(),
): Promise<ItimExtras> {
  const cached = loadCache(cityId, date);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  if (online) {
    try {
      const params = new URLSearchParams({
        cityId,
        date: dateKey(date),
      });
      const res = await fetch(cloudUrl(`/api/itim/extras?${params.toString()}`), {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Itim extras HTTP ${res.status}`);
      const data = (await res.json()) as Partial<ItimExtras> & { ok?: boolean };
      const extras: ItimExtras = {
        moon: asLines(data.moon),
        halachot: asLines(data.halachot),
        events: asLines(data.events),
        limud: asLines(data.limud),
        haftara: asLines(data.haftara),
      };
      if (hasAny(extras)) saveCache(cityId, date, extras);
      return extras;
    } catch {
      if (cached) return cached;
      return EMPTY_ITIM_EXTRAS;
    }
  }

  return cached ?? EMPTY_ITIM_EXTRAS;
}
