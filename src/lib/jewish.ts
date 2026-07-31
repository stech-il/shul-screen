import { HDate, HebrewCalendar, months, flags } from '@hebcal/core';
import { DafYomi } from '@hebcal/learning';
import type { DayInfo, YahrzeitEntry } from '../types';

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const HEBREW_MONTHS = [
  { id: months.NISAN, name: 'ניסן' },
  { id: months.IYYAR, name: 'אייר' },
  { id: months.SIVAN, name: 'סיון' },
  { id: months.TAMUZ, name: 'תמוז' },
  { id: months.AV, name: 'אב' },
  { id: months.ELUL, name: 'אלול' },
  { id: months.TISHREI, name: 'תשרי' },
  { id: months.CHESHVAN, name: 'חשוון' },
  { id: months.KISLEV, name: 'כסלו' },
  { id: months.TEVET, name: 'טבת' },
  { id: months.SHVAT, name: 'שבט' },
  { id: months.ADAR_I, name: 'אדר א׳' },
  { id: months.ADAR_II, name: 'אדר ב׳' },
];

export function hebrewYearNow(date = new Date()): number {
  return new HDate(date).getFullYear();
}

/** Months available in a given Hebrew year (Adar א׳/ב׳ only in leap years). */
export function monthsForHebrewYear(year: number): { id: number; name: string }[] {
  if (HDate.isLeapYear(year)) return HEBREW_MONTHS;
  return HEBREW_MONTHS.filter((m) => m.id !== months.ADAR_II).map((m) =>
    m.id === months.ADAR_I ? { id: m.id, name: 'אדר' } : m,
  );
}

export function daysInHebrewMonth(month: number, year: number): number {
  try {
    return new HDate(1, month, year).daysInMonth();
  } catch {
    return 30;
  }
}

export function hebrewToGregorian(day: number, month: number, year: number): Date {
  return new HDate(day, month, year).greg();
}

export function formatHebrewDate(day: number, month: number, year?: number): string {
  const y = year ?? hebrewYearNow();
  try {
    return new HDate(day, month, y).renderGematriya(true);
  } catch {
    const m = HEBREW_MONTHS.find((x) => x.id === month)?.name ?? String(month);
    return `${day} ${m}`;
  }
}

export function formatGregorianDate(date: Date, locale = 'he-IL'): string {
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Next Gregorian occurrence of a Hebrew month/day (for display in admin). */
export function nextGregorianForHebrewDay(
  day: number,
  month: number,
  from = new Date(),
): Date {
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let year = hebrewYearNow(from);
  for (let i = 0; i < 3; i++) {
    try {
      const maxDay = daysInHebrewMonth(month, year);
      const safeDay = Math.min(Math.max(1, day), maxDay);
      const g = hebrewToGregorian(safeDay, month, year);
      const gDay = new Date(g.getFullYear(), g.getMonth(), g.getDate());
      if (gDay >= startOfToday) return g;
    } catch {
      /* month missing in this year (e.g. Adar II) — try next */
    }
    year += 1;
  }
  return hebrewToGregorian(Math.min(day, 29), month, hebrewYearNow(from));
}

export function getDayInfo(date = new Date(), yahrzeits: YahrzeitEntry[] = []): DayInfo {
  const hd = new HDate(date);
  const events = HebrewCalendar.calendar({
    start: hd,
    end: hd,
    sedrot: true,
    omer: true,
    il: true,
  });

  const parashaEvent = events.find((e) => e.getDesc().startsWith('Parashat'));
  let parasha = '';
  if (parashaEvent) {
    parasha = parashaEvent.render('he').replace(/^פרשת\s*/, '');
  } else {
    const daysUntilShabbat = (6 - date.getDay() + 7) % 7 || 7;
    const shabbat = new Date(date);
    shabbat.setDate(shabbat.getDate() + (date.getDay() === 6 ? 0 : daysUntilShabbat));
    const shHd = new HDate(shabbat);
    const shEvents = HebrewCalendar.calendar({
      start: shHd,
      end: shHd,
      sedrot: true,
      il: true,
    });
    const pe = shEvents.find((e) => e.getDesc().startsWith('Parashat'));
    if (pe) parasha = pe.render('he').replace(/^פרשת\s*/, '');
  }

  let dafYomi = '';
  try {
    dafYomi = new DafYomi(date).render('he');
  } catch {
    dafYomi = '';
  }

  const holidays: string[] = [];
  const memorials: string[] = [];
  let omer: DayInfo['omer'] = null;
  for (const e of events) {
    const desc = e.getDesc();
    if (desc.startsWith('Omer') && typeof (e as { getTodayIs?: (l: string) => string }).getTodayIs === 'function') {
      const oe = e as unknown as {
        render: (l: string) => string;
        renderBrief: (l: string) => string;
        getTodayIs: (l: string) => string;
        sefira: (l: string) => string;
        getWeeks: () => number;
        getDaysWithinWeeks: () => number;
      };
      const dayMatch = /^Omer\s+(\d+)/i.exec(desc);
      const day = dayMatch ? Number(dayMatch[1]) : oe.getWeeks() * 7 + oe.getDaysWithinWeeks();
      omer = {
        day,
        label: oe.renderBrief('he') || oe.render('he'),
        todayIs: oe.getTodayIs('he'),
        sefira: oe.sefira('he'),
      };
      continue;
    }
    const f = e.getFlags();
    let label = '';
    try {
      label = e.render('he');
    } catch {
      label = desc;
    }
    if (!label || label.startsWith('פרשת') || desc.startsWith('Parashat')) continue;
    if (f & flags.MAJOR_FAST || /יזכור|זכרון|שואה|צה״ל|צה\"ל|חללי/.test(label)) {
      memorials.push(label);
    } else if (
      f & flags.CHAG ||
      f & flags.MINOR_HOLIDAY ||
      f & flags.ROSH_CHODESH ||
      f & flags.SPECIAL_SHABBAT
    ) {
      holidays.push(label);
    }
  }

  const month = hd.getMonth();
  const day = hd.getDate();
  const yahrzeitNames = yahrzeits
    .filter((y) => y.enabled && y.hebrewMonth === month && y.hebrewDay === day)
    .map((y) => y.name);

  return {
    hebrewDate: hd.renderGematriya(true),
    weekday: WEEKDAYS[date.getDay()]!,
    parasha,
    dafYomi,
    holidays,
    memorials,
    yahrzeitNames,
    omer,
  };
}
