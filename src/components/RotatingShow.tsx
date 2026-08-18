import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnalogClock } from './canvas/ClockWidget';
import { CandleTimesBoard } from './CandleTimesBoard';
import { RichAnnounce } from './RichAnnounce';
import {
  buildActiveRotatingSlides,
  formatRemain,
  normalizeRotatingScreens,
  pickShemaZman,
  pickSunriseZman,
} from '../lib/rotatingScreens';
import { formatGregorianDate, parashaSpecialsForConfig } from '../lib/jewish';
import { isUpcomingWithinMinutes } from '../lib/upcomingTime';
import { weatherCodeToIcon } from '../lib/weather';
import { toPlainDisplayText } from '../lib/sanitizeHtml';
import {
  isShabbatScheduleBlock,
  resolveFromZmanimMap,
  resolveScheduleItemAt,
  type HebcalZmanimResult,
} from '../lib/hebcalZmanim';
import type { ItimExtraLine, ItimExtras } from '../lib/itimExtras';
import type {
  Announcement,
  ComputedZman,
  DayInfo,
  ModeInfo,
  ScheduleBlock,
  SynagogueConfig,
  WeatherInfo,
} from '../types';
import './RotatingShow.css';

interface Props {
  config: SynagogueConfig;
  clock: string;
  day: DayInfo;
  zmanim: ComputedZman[];
  blocks: ScheduleBlock[];
  announcements: Announcement[];
  zmanimMap: HebcalZmanimResult['times'];
  shabbatZmanimMap: HebcalZmanimResult['times'];
  shabbatFriday: Date;
  now: Date;
  modeInfo: ModeInfo | null;
  weather: WeatherInfo | null;
  logoSrc?: string;
  itim?: ItimExtras | null;
}

function TimeRow({
  label,
  note,
  time,
  upcoming,
}: {
  label: string;
  note?: string;
  time?: string;
  upcoming?: boolean;
}) {
  return (
    <li className={upcoming ? 'is-upcoming' : undefined}>
      <span className="rs-row-label">
        {label}
        {note ? <em>{note}</em> : null}
      </span>
      <span className="rs-leader" aria-hidden />
      {time ? <strong className="time-ltr">{time}</strong> : null}
    </li>
  );
}

function Poster({
  kicker,
  title,
  sub,
  children,
}: {
  kicker: string;
  title?: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rs-poster">
      <p className="rs-kicker">{kicker}</p>
      {title ? <h2>{title}</h2> : null}
      {sub ? <p className="rs-sub">{sub}</p> : null}
      {children}
    </div>
  );
}

export function RotatingShow({
  config,
  clock,
  day,
  zmanim,
  blocks,
  announcements,
  zmanimMap,
  shabbatZmanimMap,
  shabbatFriday,
  now,
  modeInfo,
  weather,
  logoSrc,
  itim,
}: Props) {
  const settings = normalizeRotatingScreens(config.rotatingScreens);
  const slides = useMemo(
    () =>
      buildActiveRotatingSlides({
        config,
        day,
        blocks,
        announcements,
        zmanim,
        modeInfo,
        weather,
        now,
        itim,
      }),
    [config, day, blocks, announcements, zmanim, modeInfo, weather, now, itim],
  );
  const [idx, setIdx] = useState(0);
  const slideKey = slides.map((s) => s.key).join('|');

  useEffect(() => {
    setIdx(0);
  }, [slideKey]);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
    }, settings.seconds * 1000);
    return () => window.clearInterval(t);
  }, [slides.length, settings.seconds, slideKey]);

  const slide = slides[slides.length ? idx % slides.length : 0];
  const specials = parashaSpecialsForConfig(day, config);
  const shemaZman = pickShemaZman(zmanim);
  const sunriseZman = pickSunriseZman(zmanim);

  function namesPoster(kicker: string, items: string[]) {
    return (
      <Poster kicker={kicker}>
        <ul className="rs-names">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Poster>
    );
  }

  function itimPoster(kicker: string, lines: ItimExtraLine[] | undefined) {
    return (
      <Poster kicker={kicker}>
        <ul className="rs-itim">
          {(lines ?? []).map((line, i) => {
            const label = [line.dateLabel, line.title].filter(Boolean).join(' · ');
            return (
              <li key={`${label}-${i}`}>
                {label ? <strong>{label}</strong> : null}
                <span>{toPlainDisplayText(line.text)}</span>
              </li>
            );
          })}
        </ul>
      </Poster>
    );
  }

  function countdownPoster(kicker: string, z: typeof shemaZman) {
    if (!z) return null;
    return (
      <Poster kicker={kicker} title={z.formatted} sub={z.label}>
        <p className="rs-remain time-ltr">{formatRemain(now, z.time)}</p>
        <p className="rs-sub">זמן שנותר</p>
      </Poster>
    );
  }

  function renderBody() {
    if (!slide) {
      return <Poster kicker="ברוכים הבאים" title={toPlainDisplayText(config.name)} />;
    }

    switch (slide.id) {
      case 'prayers':
        return (
          <div className={`rs-prayers cols-${Math.min(blocks.length || 1, 4)}`}>
            {blocks.map((block) => (
              <section key={block.id} className="rs-block">
                <h3>{toPlainDisplayText(block.title)}</h3>
                <ul>
                  {block.items.map((item) => {
                    const map = isShabbatScheduleBlock(block) ? shabbatZmanimMap : zmanimMap;
                    const timeStr = item.noTime
                      ? ''
                      : resolveFromZmanimMap(map, item.time, item.fromZman, item.offsetMinutes ?? 0);
                    const at = item.noTime
                      ? null
                      : resolveScheduleItemAt(map, item.time, item.fromZman, item.offsetMinutes ?? 0, {
                          now,
                          shabbatFriday: isShabbatScheduleBlock(block) ? shabbatFriday : null,
                          block,
                        });
                    return (
                      <TimeRow
                        key={item.id}
                        label={toPlainDisplayText(item.title)}
                        note={item.note ? toPlainDisplayText(item.note) : undefined}
                        time={timeStr || undefined}
                        upcoming={isUpcomingWithinMinutes(at, now)}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        );
      case 'zmanim':
        return (
          <div className="rs-zmanim-wrap">
            <ul className="rs-zmanim">
              {zmanim.map((z) => (
                <TimeRow
                  key={z.key}
                  label={z.label}
                  time={z.formatted}
                  upcoming={isUpcomingWithinMinutes(z.time, now)}
                />
              ))}
            </ul>
          </div>
        );
      case 'parasha':
        return (
          <div className="rs-parasha">
            <p className="rs-kicker">פרשת השבוע</p>
            <h2>{day.parasha}</h2>
            {specials.length ? <p className="rs-sub">{specials.join(' · ')}</p> : null}
          </div>
        );
      case 'announcements': {
        const a = 'announcement' in slide ? slide.announcement : announcements[0];
        if (!a) return null;
        return (
          <div className="rs-announce">
            <p className="rs-kicker">הודעות בית הכנסת</p>
            <div className="rs-announce-body">
              <RichAnnounce html={a.text} />
            </div>
          </div>
        );
      }
      case 'candles':
        return modeInfo?.candleBoard ? (
          <div className="rs-poster rs-candles">
            <p className="rs-kicker">{modeInfo.label || 'כניסה ויציאה'}</p>
            <CandleTimesBoard board={modeInfo.candleBoard} showCandles showTitle={false} />
            {modeInfo.countdownLabel ? <p className="rs-sub">{modeInfo.countdownLabel}</p> : null}
          </div>
        ) : null;
      case 'clock':
        return (
          <div className="rs-clock-hero">
            <div className="rs-analog-hero" aria-hidden>
              <AnalogClock time={clock} design="gold" />
            </div>
            <p className="rs-clock-hero-time time-ltr">{clock}</p>
            {config.showHebrewDate !== false ? (
              <p className="rs-sub">
                יום {day.weekday} · {day.hebrewDate}
              </p>
            ) : null}
          </div>
        );
      case 'sunrise':
        return countdownPoster('זריחת החמה', sunriseZman);
      case 'shema':
        return countdownPoster('סוף זמן קריאת שמע', shemaZman);
      case 'hebrewDate':
        return (
          <Poster kicker={`יום ${day.weekday}`} title={day.hebrewDate} sub={formatGregorianDate(now)} />
        );
      case 'holidays':
        return namesPoster('חגים ומועדים', day.holidays ?? []);
      case 'roshChodesh':
        return namesPoster('ראש חודש', day.roshChodesh ?? []);
      case 'mevarchim':
        return namesPoster('שבת מברכים', day.shabbatMevarchim ?? []);
      case 'molad':
        return namesPoster('המולד', day.molad ?? []);
      case 'specialShabbat':
        return namesPoster('שבתות מיוחדות', day.specialShabbat ?? []);
      case 'memorials':
        return namesPoster('ימי זיכרון', day.memorials ?? []);
      case 'memorialBoard': {
        const plaques = 'plaques' in slide ? slide.plaques : day.memorialBoard ?? [];
        const page = 'page' in slide ? slide.page : 1;
        const pages = 'pages' in slide ? slide.pages : 1;
        return (
          <div className="rs-memorial">
            <p className="rs-kicker">לעילוי נשמת</p>
            <h2 className="rs-memorial-title">לוח הנצחה</h2>
            {config.dedication ? (
              <p className="rs-sub">{toPlainDisplayText(config.dedication)}</p>
            ) : null}
            <div className="rs-plaques">
              {plaques.map((p) => (
                <article
                  key={`${p.name}-${p.hebrewDate}`}
                  className={`rs-plaque${p.today ? ' is-today' : p.thisWeek ? ' is-week' : ''}`}
                >
                  <span className="rs-plaque-mark">נ״ע</span>
                  <strong>{p.name}</strong>
                  <em>{p.hebrewDate}</em>
                  {p.today ? <b>היום</b> : p.thisWeek ? <b>השבוע</b> : null}
                  {p.note ? <span className="rs-plaque-note">{toPlainDisplayText(p.note)}</span> : null}
                </article>
              ))}
            </div>
            {pages > 1 ? (
              <p className="rs-page">
                {page} / {pages}
              </p>
            ) : null}
          </div>
        );
      }
      case 'yahrzeitWeek':
        return (
          <Poster kicker="אזכרות השבוע">
            <ul className="rs-names rs-week">
              {(day.yahrzeitWeek ?? []).map((row) => (
                <li key={`${row.name}-${row.label}`}>
                  <span>{row.name}</span>
                  <em>{row.label}</em>
                </li>
              ))}
            </ul>
          </Poster>
        );
      case 'mishnaYomi':
        return <Poster kicker="משנה יומית" title={day.mishnaYomi ?? ''} />;
      case 'yahrzeit':
        return (
          <Poster kicker="יארצייט היום">
            <ul className="rs-names">
              {(day.yahrzeitNames ?? []).map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </Poster>
        );
      case 'omer':
        return day.omer ? (
          <div className="rs-omer">
            <p className="rs-kicker">ספירת העומר</p>
            <p className="rs-omer-num">{day.omer.day}</p>
            <h2>{day.omer.label}</h2>
            <p className="rs-sub">
              {[day.omer.todayIs, day.omer.sefira].filter(Boolean).join(' · ')}
            </p>
          </div>
        ) : null;
      case 'dafYomi':
        return <Poster kicker="הדף היומי" title={day.dafYomi ?? ''} />;
      case 'weather': {
        if (!weather) return null;
        const h = now.getHours();
        const icon = weatherCodeToIcon(weather.weatherCode, h < 6 || h >= 20);
        return (
          <Poster kicker="מזג האוויר" sub={weather.description || undefined}>
            <h2 className="time-ltr rs-weather-temp">
              {icon ? <span className="weather-icon">{icon}</span> : null}
              {weather.tempC}°
            </h2>
          </Poster>
        );
      }
      case 'itimMoon':
        return itimPoster('זמני ירח', itim?.moon);
      case 'itimHalachot':
        return itimPoster('הלכות השבוע', itim?.halachot);
      case 'itimEvents':
        return itimPoster('מאורעות היום', itim?.events);
      case 'itimLimud':
        return itimPoster('הלימוד היומי', itim?.limud);
      default:
        return null;
    }
  }

  return (
    <div className="rotating-show" data-slide={slide?.id ?? 'empty'}>
      <div className="rs-frame">
        <header className="rs-top">
          <div className="rs-brand">
            {logoSrc ? <img src={logoSrc} alt="" /> : null}
            <div>
              <strong>{toPlainDisplayText(config.name)}</strong>
              {config.showHebrewDate !== false ? (
                <span>
                  יום {day.weekday} · {day.hebrewDate}
                </span>
              ) : null}
            </div>
          </div>
          {config.showClock !== false ? (
            <div className="rs-clock-cluster">
              <div className="rs-analog" aria-hidden>
                <AnalogClock time={clock} design="gold" />
              </div>
              <p className="rs-clock time-ltr">{clock}</p>
            </div>
          ) : null}
        </header>

        <div key={slide?.key ?? 'empty'} className="rs-stage">
          {renderBody()}
        </div>

        {slides.length > 1 ? (
          <footer className="rs-dots" aria-hidden>
            <div
              className="rs-progress"
              style={{ animationDuration: `${settings.seconds}s` }}
              key={`${slide?.key}-${idx}`}
            />
            <div className="rs-dot-row">
              {slides.map((s, i) => (
                <span key={s.key} className={i === idx % slides.length ? 'on' : ''} />
              ))}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
