import { getCity } from '../data/cities';
import { ZMAN_DEFS, getZmanLabel, normalizeZmanKey, type ZmanKey } from '../data/zmanim';
import { parseTimeOnDay } from './upcomingTime';
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const at = resolveScheduleItemAt(times, fixedTime, fromZman, offsetMinutes);
  return at ? formatTime(at) : fixedTime;
}

/**
 * Absolute Date for a schedule row — keeps Friday/Saturday anchors for Shabbat
 * blocks so upcoming-highlight and comparisons work across the weekend.
 */
export function resolveScheduleItemAt(
  times: Partial<Record<ZmanKey, Date>>,
  fixedTime: string,
  fromZman?: string,
  offsetMinutes = 0,
  opts?: {
    now?: Date;
    /** Friday of the active Shabbat week (from getShabbatZmanimDate with today's zmanim). */
    shabbatFriday?: Date | null;
    block?: { id: string; title: string };
  },
): Date | null {
  if (fromZman) {
    const key = normalizeZmanKey(fromZman);
    if (key && times[key]) {
      return new Date(times[key]!.getTime() + offsetMinutes * 60_000);
    }
  }
  const now = opts?.now ?? new Date();
  const block = opts?.block;
  const shabbatBlock = block ? isShabbatScheduleBlock(block) : Boolean(opts?.shabbatFriday);
  if (!shabbatBlock || !opts?.shabbatFriday) {
    return parseTimeOnDay(fixedTime, now);
  }
  const anchor = shabbatFixedTimeAnchorDay(fixedTime, opts.shabbatFriday, block);
  return parseTimeOnDay(fixedTime, anchor);
}

/** Motzei Shabbat / Saturday-night blocks. */
export function isMotzeiScheduleBlock(block: { id: string; title: string }): boolean {
  return /מוצ["״']?ש|motzei/i.test(`${block.id} ${block.title}`);
}

/**
 * Fixed Shabbat HH:MM → Friday (erev) or Saturday (day / Motzei).
 * Evening (≥15:00) defaults to Friday; Motzei titles always Saturday.
 * Used only so "upcoming" highlight knows the real calendar day.
 */
export function shabbatFixedTimeAnchorDay(
  fixedTime: string,
  friday: Date,
  block?: { id: string; title: string },
): Date {
  const saturday = new Date(friday);
  saturday.setDate(saturday.getDate() + 1);
  saturday.setHours(12, 0, 0, 0);
  if (block && isMotzeiScheduleBlock(block)) return saturday;
  const m = String(fixedTime || '')
    .trim()
    .match(/^(\d{1,2}):/);
  const hour = m ? Number(m[1]) : NaN;
  if (Number.isFinite(hour) && hour >= 15) {
    const day = new Date(friday);
    day.setHours(12, 0, 0, 0);
    return day;
  }
  return saturday;
}

export function getZmanDateFromMap(
  times: Partial<Record<ZmanKey, Date>>,
  key: string,
): Date | undefined {
  const normalized = normalizeZmanKey(key);
  return normalized ? times[normalized] : undefined;
}

/**
 * Returns the Friday whose zmanim should drive Shabbat prayer times.
 * Sunday-Friday use the upcoming Friday. During Shabbat the previous
 * Friday remains active until tzeit; afterwards the next Friday is used.
 */
export function getShabbatZmanimDate(
  now = new Date(),
  currentDayTimes: Partial<Record<ZmanKey, Date>> = {},
): Date {
  const date = new Date(now);
  const day = date.getDay();
  let daysToFriday = (5 - day + 7) % 7;

  if (day === 6) {
    const endOfSaturday = new Date(now);
    endOfSaturday.setHours(23, 59, 59, 999);
    const motzei =
      currentDayTimes.tzeit7083deg ??
      currentDayTimes.dusk ??
      currentDayTimes.tzeit42min ??
      endOfSaturday;
    daysToFriday = now.getTime() > motzei.getTime() ? 6 : -1;
  }

  date.setDate(date.getDate() + daysToFriday);
  // Midday avoids DST/midnight boundary issues when serializing API dates.
  date.setHours(12, 0, 0, 0);
  return date;
}

/** Existing installations are recognized without requiring a data migration. */
export function isShabbatScheduleBlock(block: { id: string; title: string }): boolean {
  return /שבת|מוצ["״']?ש|shabbat|shabbos/i.test(`${block.id} ${block.title}`);
}
