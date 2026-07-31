import { useEffect, useMemo, useRef, useState } from 'react';
import { HDate } from '@hebcal/core';
import {
  daysInHebrewMonth,
  formatGregorianDate,
  formatHebrewDate,
  hebrewToGregorian,
  hebrewYearNow,
  monthsForHebrewYear,
  nextGregorianForHebrewDay,
} from '../lib/jewish';
import { useI18n } from '../i18n';
import './HebrewDatePicker.css';

export type HebrewDateValue = {
  hebrewDay: number;
  hebrewMonth: number;
};

type Props = {
  value: HebrewDateValue;
  onChange: (next: HebrewDateValue) => void;
  disabled?: boolean;
};

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function gematriyaYear(year: number): string {
  try {
    return new HDate(1, 1, year).renderGematriya(true).split(' ').pop() || String(year);
  } catch {
    return String(year);
  }
}

export function HebrewDatePicker({ value, onChange, disabled }: Props) {
  const { t, dir, locale } = useI18n();
  const dateLocale = locale === 'he' ? 'he-IL' : 'en-GB';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const todayHd = useMemo(() => new HDate(), []);
  const [viewYear, setViewYear] = useState(() => hebrewYearNow());
  const [viewMonth, setViewMonth] = useState(() => value.hebrewMonth || todayHd.getMonth());

  useEffect(() => {
    if (!open) return;
    setViewYear(hebrewYearNow());
    setViewMonth(value.hebrewMonth || todayHd.getMonth());
  }, [open, value.hebrewMonth, todayHd]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const monthOptions = monthsForHebrewYear(viewYear);
  const safeMonth = monthOptions.some((m) => m.id === viewMonth)
    ? viewMonth
    : (monthOptions[0]?.id ?? 1);
  const dayCount = daysInHebrewMonth(safeMonth, viewYear);

  const firstWeekday = useMemo(() => {
    try {
      return hebrewToGregorian(1, safeMonth, viewYear).getDay();
    } catch {
      return 0;
    }
  }, [safeMonth, viewYear]);

  const selectedLabel = formatHebrewDate(value.hebrewDay, value.hebrewMonth);
  const nextGreg = formatGregorianDate(
    nextGregorianForHebrewDay(value.hebrewDay, value.hebrewMonth),
    dateLocale,
  );

  function shiftMonth(delta: number) {
    const list = monthsForHebrewYear(viewYear);
    const idx = Math.max(0, list.findIndex((m) => m.id === safeMonth));
    const nextIdx = idx + delta;
    if (nextIdx < 0) {
      const prevYear = viewYear - 1;
      const prevMonths = monthsForHebrewYear(prevYear);
      setViewYear(prevYear);
      setViewMonth(prevMonths[prevMonths.length - 1]!.id);
      return;
    }
    if (nextIdx >= list.length) {
      const nextYear = viewYear + 1;
      const nextMonths = monthsForHebrewYear(nextYear);
      setViewYear(nextYear);
      setViewMonth(nextMonths[0]!.id);
      return;
    }
    setViewMonth(list[nextIdx]!.id);
  }

  function pickDay(day: number) {
    onChange({ hebrewDay: day, hebrewMonth: safeMonth });
    setOpen(false);
  }

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= dayCount; d++) cells.push(d);

  const popoverGreg = nextGreg;

  return (
    <div className="hdp" ref={rootRef} dir={dir}>
      <button
        type="button"
        className="hdp-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="hdp-trigger-he">{selectedLabel}</span>
        <span className="hdp-trigger-hint">{t('admin.pickHebrewDate')}</span>
      </button>
      <p className="hdp-greg-line" title={t('admin.gregorianAuto')}>
        <strong>{t('admin.gregorianLabel')}</strong> {nextGreg}
      </p>

      {open ? (
        <div className="hdp-popover" role="dialog" aria-label={t('admin.hebrewCalendar')}>
          <div className="hdp-nav">
            <button
              type="button"
              className="hdp-nav-btn"
              onClick={() => shiftMonth(-1)}
              aria-label={t('admin.prevMonth')}
            >
              ‹
            </button>
            <div className="hdp-nav-title">
              <select
                value={safeMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                aria-label={t('admin.hebrewMonth')}
              >
                {monthOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="hdp-year-row">
                <button type="button" className="hdp-nav-btn" onClick={() => setViewYear((y) => y - 1)}>
                  ‹
                </button>
                <strong>{gematriyaYear(viewYear)}</strong>
                <button type="button" className="hdp-nav-btn" onClick={() => setViewYear((y) => y + 1)}>
                  ›
                </button>
              </div>
            </div>
            <button
              type="button"
              className="hdp-nav-btn"
              onClick={() => shiftMonth(1)}
              aria-label={t('admin.nextMonth')}
            >
              ›
            </button>
          </div>

          <div className="hdp-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="hdp-grid">
            {cells.map((day, i) =>
              day == null ? (
                <span key={`e-${i}`} className="hdp-cell empty" />
              ) : (
                <button
                  key={day}
                  type="button"
                  className={[
                    'hdp-cell',
                    day === value.hebrewDay && safeMonth === value.hebrewMonth ? 'on' : '',
                    day === todayHd.getDate() &&
                    safeMonth === todayHd.getMonth() &&
                    viewYear === todayHd.getFullYear()
                      ? 'today'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pickDay(day)}
                >
                  {day}
                </button>
              ),
            )}
          </div>
          <p className="hdp-popover-greg">
            {t('admin.selectedAsGregorian')}: {popoverGreg}
          </p>
        </div>
      ) : null}
    </div>
  );
}
