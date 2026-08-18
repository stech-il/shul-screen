import type {
  Announcement,
  ComputedZman,
  DayInfo,
  MemorialPlaque,
  ModeInfo,
  RotatingScreensSettings,
  RotatingSlideId,
  RotatingSlideSetting,
  ScheduleBlock,
  SynagogueConfig,
  WeatherInfo,
} from '../types';
import type { ItimExtras } from './itimExtras';

export const ROTATING_SLIDE_ORDER: RotatingSlideId[] = [
  'clock',
  'prayers',
  'zmanim',
  'sunrise',
  'shema',
  'parasha',
  'announcements',
  'candles',
  'holidays',
  'roshChodesh',
  'mevarchim',
  'molad',
  'specialShabbat',
  'memorials',
  'memorialBoard',
  'yahrzeit',
  'yahrzeitWeek',
  'omer',
  'dafYomi',
  'mishnaYomi',
  'hebrewDate',
  'weather',
  'itimMoon',
  'itimHalachot',
  'itimEvents',
  'itimLimud',
];

export const ROTATING_SLIDE_LABELS: Record<RotatingSlideId, string> = {
  clock: 'שעון',
  prayers: 'זמני תפילות',
  zmanim: 'זמני היום',
  sunrise: 'זריחת החמה',
  shema: 'סוף זמן קריאת שמע',
  parasha: 'פרשת השבוע',
  announcements: 'הודעות',
  candles: 'כניסה ויציאה',
  holidays: 'חגים ומועדים',
  roshChodesh: 'ראש חודש',
  mevarchim: 'שבת מברכים',
  molad: 'המולד',
  specialShabbat: 'שבתות מיוחדות',
  memorials: 'ימי זיכרון',
  memorialBoard: 'לוח הנצחה',
  yahrzeit: 'יארצייט היום',
  yahrzeitWeek: 'אזכרות השבוע',
  omer: 'ספירת העומר',
  dafYomi: 'הדף היומי',
  mishnaYomi: 'משנה יומית',
  hebrewDate: 'התאריך',
  weather: 'מזג האוויר',
  itimMoon: 'זמני ירח',
  itimHalachot: 'הלכות השבוע',
  itimEvents: 'מאורעות היום',
  itimLimud: 'הלימוד היומי',
};

const CALENDAR_SPLIT: RotatingSlideId[] = [
  'holidays',
  'roshChodesh',
  'mevarchim',
  'molad',
  'specialShabbat',
  'memorials',
];

const SHEMA_KEYS = [
  'sofZmanShma',
  'sofZmanShmaMGA',
  'sofZmanShmaBaalHatanya',
  'sofZmanShmaMGA16Point1',
] as const;

const SUNRISE_KEYS = ['sunrise'] as const;

const ITIM_SLIDES: RotatingSlideId[] = ['itimMoon', 'itimHalachot', 'itimEvents', 'itimLimud'];

export function defaultRotatingScreens(): RotatingScreensSettings {
  return {
    seconds: 10,
    slides: ROTATING_SLIDE_ORDER.map((id) => ({
      id,
      enabled: !ITIM_SLIDES.includes(id),
    })),
  };
}

export function normalizeRotatingScreens(
  raw?: Partial<RotatingScreensSettings> | null,
): RotatingScreensSettings {
  const base = defaultRotatingScreens();
  const incoming = Array.isArray(raw?.slides) ? raw!.slides : [];
  const byId = new Map<string, RotatingSlideSetting>();
  let calendarEnabled: boolean | undefined;
  for (const s of incoming as Array<{ id?: string; enabled?: boolean }>) {
    if (!s?.id) continue;
    if (s.id === 'calendar') {
      calendarEnabled = s.enabled !== false;
      continue;
    }
    if (ROTATING_SLIDE_ORDER.includes(s.id as RotatingSlideId)) {
      byId.set(s.id, { id: s.id as RotatingSlideId, enabled: s.enabled !== false });
    }
  }
  return {
    seconds: Math.max(4, Math.min(60, Number(raw?.seconds) || base.seconds)),
    slides: base.slides.map((s) => {
      const existing = byId.get(s.id);
      if (existing) return existing;
      if (calendarEnabled != null && CALENDAR_SPLIT.includes(s.id)) {
        return { id: s.id, enabled: calendarEnabled };
      }
      return s;
    }),
  };
}

export type ActiveRotatingSlide =
  | { key: string; id: RotatingSlideId }
  | { key: string; id: 'announcements'; announcement: Announcement }
  | { key: string; id: 'memorialBoard'; plaques: MemorialPlaque[]; page: number; pages: number };

const MEMORIAL_PAGE = 16;

export function pickZman(zmanim: ComputedZman[], keys: readonly string[]): ComputedZman | null {
  for (const key of keys) {
    const hit = zmanim.find((z) => z.key === key);
    if (hit) return hit;
  }
  return null;
}

export function zmanStillAhead(z: ComputedZman | null, now: Date): boolean {
  if (!z) return false;
  return z.time.getTime() + 60_000 >= now.getTime();
}

export function formatRemain(now: Date, target: Date): string {
  const ms = Math.max(0, target.getTime() - now.getTime());
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function pickShemaZman(zmanim: ComputedZman[]): ComputedZman | null {
  return pickZman(zmanim, SHEMA_KEYS);
}

export function pickSunriseZman(zmanim: ComputedZman[]): ComputedZman | null {
  return pickZman(zmanim, SUNRISE_KEYS);
}

export function buildActiveRotatingSlides(opts: {
  config: SynagogueConfig;
  day: DayInfo;
  blocks: ScheduleBlock[];
  announcements: Announcement[];
  zmanim: ComputedZman[];
  modeInfo: ModeInfo | null;
  weather: WeatherInfo | null;
  now?: Date;
  itim?: ItimExtras | null;
}): ActiveRotatingSlide[] {
  const { config, day, blocks, announcements, zmanim, modeInfo, weather } = opts;
  const itim = opts.itim;
  const now = opts.now ?? new Date();
  const settings = normalizeRotatingScreens(config.rotatingScreens);
  const enabled = new Set(settings.slides.filter((s) => s.enabled).map((s) => s.id));
  const out: ActiveRotatingSlide[] = [];

  for (const id of ROTATING_SLIDE_ORDER) {
    if (!enabled.has(id)) continue;
    switch (id) {
      case 'clock':
        if (config.showClock !== false) out.push({ key: 'clock', id });
        break;
      case 'prayers':
        if (blocks.some((b) => b.items.length)) out.push({ key: 'prayers', id });
        break;
      case 'zmanim':
        if (zmanim.length) out.push({ key: 'zmanim', id });
        break;
      case 'sunrise': {
        const z = pickSunriseZman(zmanim);
        if (zmanStillAhead(z, now)) out.push({ key: 'sunrise', id });
        break;
      }
      case 'shema': {
        const z = pickShemaZman(zmanim);
        if (zmanStillAhead(z, now)) out.push({ key: 'shema', id });
        break;
      }
      case 'parasha':
        if (config.showParasha !== false && day.parasha) out.push({ key: 'parasha', id });
        break;
      case 'announcements':
        for (const a of announcements) {
          out.push({ key: `announce-${a.id}`, id: 'announcements', announcement: a });
        }
        break;
      case 'candles':
        if (modeInfo?.candleBoard && (modeInfo.mode !== 'weekday' || modeInfo.countdownLabel)) {
          out.push({ key: 'candles', id });
        }
        break;
      case 'holidays':
        if (config.showCalendarExtras !== false && day.holidays?.length) {
          out.push({ key: 'holidays', id });
        }
        break;
      case 'roshChodesh':
        if (config.showRoshChodesh !== false && day.roshChodesh?.length) {
          out.push({ key: 'roshChodesh', id });
        }
        break;
      case 'mevarchim':
        if (config.showShabbatMevarchim !== false && day.shabbatMevarchim?.length) {
          out.push({ key: 'mevarchim', id });
        }
        break;
      case 'molad':
        if (config.showMolad !== false && day.molad?.length) {
          out.push({ key: 'molad', id });
        }
        break;
      case 'specialShabbat':
        if (config.showSpecialShabbat !== false && day.specialShabbat?.length) {
          out.push({ key: 'specialShabbat', id });
        }
        break;
      case 'memorials':
        if (config.showCalendarExtras !== false && day.memorials?.length) {
          out.push({ key: 'memorials', id });
        }
        break;
      case 'memorialBoard': {
        const plaques = day.memorialBoard ?? [];
        if (config.showYahrzeit !== false && plaques.length) {
          const pages = Math.max(1, Math.ceil(plaques.length / MEMORIAL_PAGE));
          for (let i = 0; i < pages; i++) {
            out.push({
              key: `memorialBoard-${i}`,
              id: 'memorialBoard',
              plaques: plaques.slice(i * MEMORIAL_PAGE, (i + 1) * MEMORIAL_PAGE),
              page: i + 1,
              pages,
            });
          }
        }
        break;
      }
      case 'yahrzeit':
        if (config.showYahrzeit !== false && day.yahrzeitNames?.length) {
          out.push({ key: 'yahrzeit', id });
        }
        break;
      case 'yahrzeitWeek':
        if (
          config.showYahrzeit !== false &&
          (day.yahrzeitWeek ?? []).some((x) => x.label !== 'היום')
        ) {
          out.push({ key: 'yahrzeitWeek', id });
        }
        break;
      case 'omer':
        if (config.showOmer !== false && day.omer) out.push({ key: 'omer', id });
        break;
      case 'dafYomi':
        if (config.showDafYomi !== false && day.dafYomi) out.push({ key: 'dafYomi', id });
        break;
      case 'mishnaYomi':
        if (config.showDafYomi !== false && day.mishnaYomi) out.push({ key: 'mishnaYomi', id });
        break;
      case 'hebrewDate':
        if (config.showHebrewDate !== false) out.push({ key: 'hebrewDate', id });
        break;
      case 'weather':
        if (config.showWeather !== false && weather) out.push({ key: 'weather', id });
        break;
      case 'itimMoon':
        if (itim?.moon?.length) out.push({ key: 'itimMoon', id });
        break;
      case 'itimHalachot':
        if (itim?.halachot?.length) out.push({ key: 'itimHalachot', id });
        break;
      case 'itimEvents':
        if (itim?.events?.length) out.push({ key: 'itimEvents', id });
        break;
      case 'itimLimud':
        if (itim?.limud?.length) out.push({ key: 'itimLimud', id });
        break;
      default:
        break;
    }
  }

  return out;
}
