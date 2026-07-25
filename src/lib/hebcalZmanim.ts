import { getCity } from '../data/cities';
import { ZMAN_DEFS, getZmanLabel, normalizeZmanKey, type ZmanKey } from '../data/zmanim';
import type { City, ComputedZman } from '../types';

export interface HebcalZmanimResult {
  date: string;
  times: Partial<Record<ZmanKey, Date>>;
  source: 'hebcal' | 'cache' | 'local';
}

interface HebcalApiResponse {
  date: string;
  times: Record<string, string>;
}

const CACHE_PREFIX = 'shul-screen:hebcal-zmanim:';

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cacheKey(city: City, date: Date): string {
  const place = city.geonameid ? `g${city.geonameid}` : `${city.lat},${city.lng}`;
  return `${CACHE_PREFIX}${place}:${dateKey(date)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildUrl(city: City, date: Date): string {
  const params = new URLSearchParams({
    cfg: 'json',
    date: dateKey(date),
  });
  if (city.geonameid) {
    params.set('geonameid', String(city.geonameid));
  } else {
    params.set('latitude', String(city.lat));
    params.set('longitude', String(city.lng));
    params.set('tzid', city.tzid);
  }
  return `https://www.hebcal.com/zmanim?${params.toString()}`;
}

function parseTimes(raw: Record<string, string>): Partial<Record<ZmanKey, Date>> {
  const out: Partial<Record<ZmanKey, Date>> = {};
  for (const def of ZMAN_DEFS) {
    const iso = raw[def.key];
    if (iso) out[def.key] = new Date(iso);
  }
  return out;
}

function loadCache(city: City, date: Date): HebcalZmanimResult | null {
  try {
    const raw = localStorage.getItem(cacheKey(city, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date: string; times: Record<string, string> };
    const times: Partial<Record<ZmanKey, Date>> = {};
    for (const [k, v] of Object.entries(parsed.times)) {
      const key = normalizeZmanKey(k);
      if (key) times[key] = new Date(v);
    }
    return { date: parsed.date, times, source: 'cache' };
  } catch {
    return null;
  }
}

function saveCache(city: City, date: Date, times: Partial<Record<ZmanKey, Date>>): void {
  const serializable: Record<string, string> = {};
  for (const [k, v] of Object.entries(times)) {
    if (v) serializable[k] = v.toISOString();
  }
  localStorage.setItem(
    cacheKey(city, date),
    JSON.stringify({ date: dateKey(date), times: serializable }),
  );
}

/** Local fallback via @hebcal/core when API/cache unavailable */
async function localFallback(city: City, date: Date): Promise<HebcalZmanimResult> {
  const { Location, Zmanim } = await import('@hebcal/core');
  const loc = new Location(
    city.lat,
    city.lng,
    true,
    city.tzid,
    city.name,
    'IL',
    undefined,
    city.elevation ?? 0,
  );
  const z = new Zmanim(loc, date, true);

  const times: Partial<Record<ZmanKey, Date>> = {
    chatzotNight: z.chatzotNight(),
    alotHaShachar: z.alotHaShachar(),
    misheyakir: z.misheyakir(),
    misheyakirMachmir: z.misheyakirMachmir(),
    dawn: z.dawn(),
    sunrise: z.sunrise(),
    sofZmanShmaMGA19Point8: z.sofZmanShmaMGA19Point8(),
    sofZmanShmaMGA16Point1: z.sofZmanShmaMGA16Point1(),
    sofZmanShmaMGA: z.sofZmanShmaMGA(),
    sofZmanShma: z.sofZmanShma(),
    sofZmanTfillaMGA19Point8: z.sofZmanTfillaMGA19Point8(),
    sofZmanTfillaMGA16Point1: z.sofZmanTfillaMGA16Point1(),
    sofZmanTfillaMGA: z.sofZmanTfillaMGA(),
    sofZmanTfilla: z.sofZmanTfilla(),
    chatzot: z.chatzot(),
    minchaGedola: z.minchaGedola(),
    minchaGedolaMGA: z.minchaGedolaMGA(),
    minchaKetana: z.minchaKetana(),
    minchaKetanaMGA: z.minchaKetanaMGA(),
    plagHaMincha: z.plagHaMincha(),
    sunset: z.sunset(),
    beinHaShmashos: z.beinHaShmashos(),
    dusk: z.dusk(),
    tzeit7083deg: z.tzeit(7.083),
    tzeit85deg: z.tzeit(8.5),
    tzeit42min: z.sunsetOffset(42, false),
    tzeit50min: z.sunsetOffset(50, false),
    tzeit72min: z.sunsetOffset(72, false),
  };

  return { date: dateKey(date), times, source: 'local' };
}

/** Fetch all zmanim from Hebcal API; cache for offline; local calc as last resort */
export async function fetchHebcalZmanim(
  cityId: string,
  date = new Date(),
): Promise<HebcalZmanimResult> {
  const city = getCity(cityId);
  const cached = loadCache(city, date);

  if (navigator.onLine) {
    try {
      const res = await fetch(buildUrl(city, date));
      if (!res.ok) throw new Error(`Hebcal HTTP ${res.status}`);
      const data = (await res.json()) as HebcalApiResponse;
      const times = parseTimes(data.times);
      saveCache(city, date, times);
      return { date: data.date, times, source: 'hebcal' };
    } catch {
      if (cached) return cached;
      return localFallback(city, date);
    }
  }

  if (cached) return cached;
  return localFallback(city, date);
}

export function pickEnabledZmanim(
  result: HebcalZmanimResult,
  enabled: ZmanKey[],
): ComputedZman[] {
  return enabled
    .map((key) => {
      const normalized = normalizeZmanKey(key) ?? key;
      const time = result.times[normalized];
      if (!time) return null;
      return {
        key: normalized,
        label: getZmanLabel(normalized),
        time,
        formatted: formatTime(time),
      } satisfies ComputedZman;
    })
    .filter((z): z is ComputedZman => z !== null);
}

export function resolveFromZmanimMap(
  times: Partial<Record<ZmanKey, Date>>,
  fixedTime: string,
  fromZman?: string,
  offsetMinutes = 0,
): string {
  if (!fromZman) return fixedTime;
  const key = normalizeZmanKey(fromZman);
  if (!key || !times[key]) return fixedTime;
  const base = times[key]!;
  const resolved = new Date(base.getTime() + offsetMinutes * 60_000);
  return formatTime(resolved);
}

export function getZmanDateFromMap(
  times: Partial<Record<ZmanKey, Date>>,
  key: string,
): Date | undefined {
  const normalized = normalizeZmanKey(key);
  return normalized ? times[normalized] : undefined;
}
