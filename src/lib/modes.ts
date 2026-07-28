import { HDate, HebrewCalendar, Location, Zmanim, flags } from '@hebcal/core';
import { getCity } from '../data/cities';
import type { CandleBoard, DayMode, ModeInfo, ModeSettings } from '../types';

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

function formatHm(d: Date): string {
  return d.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Friday noon of the Shabbat week that `now` belongs to (Thu noon → Motzei Shabbat). */
function fridayOfWeek(now: Date): Date {
  const friday = new Date(now);
  const day = friday.getDay();
  // Sun=0 … Fri=5 Sat=6 — go back/forward to Friday
  const add = (5 - day + 7) % 7;
  friday.setDate(friday.getDate() + add);
  friday.setHours(12, 0, 0, 0);
  return friday;
}

function buildCandleBoard(
  cityId: string,
  modes: ModeSettings,
  now: Date,
): { candleLighting?: Date; candleBoard: CandleBoard | null; countdownLabel?: string } {
  try {
    const city = getCity(cityId);
    const loc = new Location(city.lat, city.lng, true, city.tzid, city.name, 'IL');
    const friday = fridayOfWeek(now);
    const saturday = new Date(friday);
    saturday.setDate(saturday.getDate() + 1);

    const zFri = new Zmanim(loc, friday, true);
    const zSat = new Zmanim(loc, saturday, true);
    const sunset = zFri.sunset();
    const candleLighting = new Date(sunset.getTime() - modes.candleOffsetMin * 60_000);
    const exit =
      zSat.tzeit(7.083) ?? zSat.tzeit() ?? zSat.sunsetOffset(30, false) ?? zSat.dusk();
    const exitRT =
      zSat.tzeit(8.5) ?? zSat.sunsetOffset(72, false) ?? exit;

    if (!candleLighting || !exit || !exitRT) {
      return { candleBoard: null };
    }

    let countdownLabel: string | undefined;
    const dow = now.getDay();
    if (modes.showCandleCountdown && (dow === 5 || (dow === 4 && now.getHours() >= 12))) {
      if (candleLighting.getTime() > now.getTime()) {
        countdownLabel = `הדלקת נרות בעוד ${formatCountdown(candleLighting.getTime() - now.getTime())}`;
      } else if (dow === 5) {
        countdownLabel = 'זמן הדלקת נרות עבר';
      }
    }

    const candleBoard: CandleBoard = {
      entry: formatHm(candleLighting),
      exit: formatHm(exit),
      exitRT: formatHm(exitRT),
      entryLabel: 'כניסה',
      exitLabel: 'יציאה',
      exitRTLabel: 'יציאה ר״ת',
      countdownLabel,
    };

    return { candleLighting, candleBoard, countdownLabel };
  } catch {
    return { candleBoard: null };
  }
}

/** Detect weekday / erev shabbat / shabbat / holiday + candle board */
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

  const { candleLighting, candleBoard, countdownLabel: boardCountdown } = buildCandleBoard(
    cityId,
    modes,
    now,
  );

  let countdownLabel = boardCountdown;
  if (mode === 'shabbat' && !countdownLabel) {
    countdownLabel = 'שבת שלום';
    if (candleBoard && !candleBoard.countdownLabel) {
      candleBoard.countdownLabel = countdownLabel;
    }
  }

  // Attach live countdown onto the board when present
  if (candleBoard && boardCountdown) {
    candleBoard.countdownLabel = boardCountdown;
  }

  void city;

  return {
    mode,
    label,
    holidayName,
    candleLighting,
    countdownLabel,
    candleBoard,
  };
}
