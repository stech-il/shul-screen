import { HDate, HebrewCalendar, Location, Zmanim, flags } from '@hebcal/core';
import { getCity } from '../data/cities';
import type { DayMode, ModeInfo, ModeSettings } from '../types';

const DEFAULT_MODES: ModeSettings = {
  autoShabbat: true,
  autoHoliday: true,
  candleOffsetMin: 20,
  showCandleCountdown: true,
  carouselSeconds: 8,
  orefSound: true,
  muteOrefOnShabbat: true,
  specialMode: 'normal',
  eventTitle: '',
  eventSubtitle: '',
  mourningName: '',
};

export function getDefaultModes(): ModeSettings {
  return { ...DEFAULT_MODES };
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Detect weekday / erev shabbat / shabbat / holiday + candle countdown */
export function getModeInfo(
  cityId: string,
  modes: ModeSettings = DEFAULT_MODES,
  now = new Date(),
): ModeInfo {
  const city = getCity(cityId);
  const hd = new HDate(now);
  const dow = now.getDay();

  const events = HebrewCalendar.calendar({
    start: hd,
    end: hd,
    il: true,
  });

  const yomtov = events.find((e) => {
    const f = e.getFlags();
    return Boolean(f & flags.CHAG) || Boolean(f & flags.MAJOR_FAST);
  });

  let holidayName: string | undefined;
  if (yomtov && modes.autoHoliday) {
    try {
      holidayName = yomtov.render('he');
    } catch {
      holidayName = yomtov.getDesc();
    }
  }

  let mode: DayMode = 'weekday';
  let label = 'יום חול';

  if (modes.autoHoliday && holidayName) {
    mode = 'holiday';
    label = holidayName;
  } else if (modes.autoShabbat && dow === 6) {
    mode = 'shabbat';
    label = 'שבת קודש';
  } else if (modes.autoShabbat && dow === 5) {
    mode = 'erev-shabbat';
    label = 'ערב שבת';
  }

  let candleLighting: Date | undefined;
  let countdownLabel: string | undefined;

  if (modes.showCandleCountdown && (dow === 5 || (dow === 4 && now.getHours() >= 12))) {
    try {
      const loc = new Location(city.lat, city.lng, true, city.tzid, city.name, 'IL');
      const friday = new Date(now);
      const day = friday.getDay();
      const add = (5 - day + 7) % 7;
      friday.setDate(friday.getDate() + add);
      friday.setHours(12, 0, 0, 0);
      const z = new Zmanim(loc, friday, true);
      const sunset = z.sunset();
      candleLighting = new Date(sunset.getTime() - modes.candleOffsetMin * 60_000);
      if (candleLighting.getTime() > now.getTime()) {
        countdownLabel = `הדלקת נרות בעוד ${formatCountdown(candleLighting.getTime() - now.getTime())}`;
      } else if (dow === 5) {
        countdownLabel = 'זמן הדלקת נרות עבר';
      }
    } catch {
      /* ignore */
    }
  }

  if (mode === 'shabbat' && !countdownLabel) {
    countdownLabel = 'שבת שלום';
  }

  return { mode, label, holidayName, candleLighting, countdownLabel };
}
