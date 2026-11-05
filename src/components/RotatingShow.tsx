import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AnalogClock } from './canvas/ClockWidget';
import { RichAnnounce } from './RichAnnounce';
import {
  ROTATING_SLIDE_LABELS,
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
  RotatingSlideId,
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
  backgroundImage?: string;
}

function BinaTile({
  time,
  label,
  note,
  upcoming,
  wide,
}: {
  time?: string;
  label: string;
  note?: string;
  upcoming?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`rs-bina-tile${upcoming ? ' is-upcoming' : ''}${wide ? ' is-wide' : ''}`}>
      {time ? (
        <div className="rs-bina-tile-time time-ltr">{time}</div>
      ) : (
        <div className="rs-bina-tile-time rs-bina-tile-notime">{label}</div>
      )}
      {time ? (
        <div className="rs-bina-tile-label">
          {label}
          {note ? <em>{note}</em> : null}
        </div>
      ) : null}
    </div>
  );
}

function BinaSlideTitle({ children }: { children: ReactNode }) {
  return (
    <div className="rs-bina-slide-title">
      <h2>{children}</h2>
      <div className="rs-bina-title-rule" aria-hidden />
    </div>
  );
}

function slideHeading(id: RotatingSlideId | undefined, modeInfo: ModeInfo | null): string | null {
  if (!id || id === 'clock') return null;
  if (id === 'prayers') {
    return modeInfo?.mode === 'shabbat' || modeInfo?.mode === 'holiday'
      ? 'זמני תפילות לשבת'
      : 'זמני תפילות לימות החול';
  }
  if (id === 'candles') return 'שבת';
  if (id === 'zmanim') return 'זמני היום';
  if (id === 'announcements') return 'הודעות';
  return ROTATING_SLIDE_LABELS[id] ?? null;
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
  backgroundImage,
}: Props) {
  const settings = normalizeRotatingScreens(config.rotatingScreens);
  const minuteBucket = Math.floor(now.getTime() / 60_000);
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
        now: new Date(minuteBucket * 60_000),
        itim,
      }),
    [config, day, blocks, announcements, zmanim, modeInfo, weather, minuteBucket, itim],
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
  const nextSlide = slides.length > 1 ? slides[(idx + 1) % slides.length] : null;
  const heading = slideHeading(slide?.id, modeInfo);
  const specials = parashaSpecialsForConfig(day, config);
  const shemaZman = pickShemaZman(zmanim);
  const sunriseZman = pickSunriseZman(zmanim);

  const shellStyle = {
    ...(backgroundImage
      ? ({ '--rs-bina-bg-image': `url(${backgroundImage})` } as CSSProperties)
      : {}),
  };

  function namesPoster(items: string[]) {
    return (
      <div className="rs-bina-names">
        {items.map((item) => (
          <div key={item} className="rs-bina-name-tile">
            {item}
          </div>
        ))}
      </div>
    );
  }

  function itimPoster(lines: ItimExtraLine[] | undefined) {
    return (
      <ul className="rs-bina-itim">
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
    );
  }

  function countdownBody(z: typeof shemaZman) {
    if (!z) return null;
    return (
      <div className="rs-bina-countdown">
        <BinaTile time={z.formatted} label={z.label} wide />
        <p className="rs-bina-remain time-ltr">{formatRemain(now, z.time)}</p>
        <p className="rs-bina-remain-label">זמן שנותר</p>
      </div>
    );
  }

  function renderBody() {
    if (!slide) {
      return (
        <div className="rs-bina-welcome">
          <p>{toPlainDisplayText(config.name)}</p>
        </div>
      );
    }

    switch (slide.id) {
      case 'prayers':
        return (
          <div className="rs-bina-prayers">
            {blocks.map((block) => (
              <section key={block.id}>
                {blocks.length > 1 ? (
                  <h3 className="rs-bina-block-title">{toPlainDisplayText(block.title)}</h3>
                ) : null}
                <div className="rs-bina-tiles rs-bina-tiles--prayers">
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
                      <BinaTile
                        key={item.id}
                        time={timeStr || undefined}
                        label={toPlainDisplayText(item.title)}
                        note={item.note ? toPlainDisplayText(item.note) : undefined}
                        upcoming={isUpcomingWithinMinutes(at, now)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        );
      case 'zmanim':
        return (
          <div className="rs-bina-tiles rs-bina-tiles--zmanim">
            {zmanim.map((z) => (
              <BinaTile
                key={z.key}
                time={z.formatted}
                label={z.label}
                upcoming={isUpcomingWithinMinutes(z.time, now)}
              />
            ))}
          </div>
        );
      case 'parasha':
        return (
          <div className="rs-bina-parasha-tile is-hero">
            <span className="rs-bina-parasha-label">פרשת השבוע</span>
            <strong>{day.parasha}</strong>
            {specials.length ? <em>{specials.join(' · ')}</em> : null}
          </div>
        );
      case 'announcements': {
        const a = 'announcement' in slide ? slide.announcement : announcements[0];
        if (!a) return null;
        return (
          <div className="rs-bina-announce">
            <RichAnnounce html={a.text} />
          </div>
        );
      }
      case 'candles': {
        const board = modeInfo?.candleBoard;
        if (!board) return null;
        return (
          <div className="rs-bina-shabbat">
            <div className="rs-bina-tiles rs-bina-tiles--candles">
              <BinaTile time={board.entry} label={board.entryLabel} />
              <BinaTile time={board.exit} label={board.exitLabel} />
              <BinaTile time={board.exitRT} label={board.exitRTLabel} />
            </div>
            {day.parasha ? (
              <div className="rs-bina-parasha-tile">
                <span className="rs-bina-parasha-label">פרשת השבוע</span>
                <strong>{day.parasha}</strong>
              </div>
            ) : null}
            {board.countdownLabel ? (
              <p className="rs-bina-countdown-banner time-ltr">{board.countdownLabel}</p>
            ) : null}
          </div>
        );
      }
      case 'clock':
        return (
          <div className="rs-bina-main">
            {logoSrc ? <img className="rs-bina-logo" src={logoSrc} alt="" /> : null}
            <div className="rs-bina-main-clock" aria-hidden>
              <AnalogClock time={clock} design="gold" />
            </div>
            <p className="rs-bina-main-time time-ltr">{clock}</p>
            {config.showHebrewDate !== false ? (
              <p className="rs-bina-main-date">
                יום {day.weekday} · {day.hebrewDate}
              </p>
            ) : null}
            {config.dedication ? (
              <p className="rs-bina-dedication">{toPlainDisplayText(config.dedication)}</p>
            ) : null}
          </div>
        );
      case 'sunrise':
        return countdownBody(sunriseZman);
      case 'shema':
        return countdownBody(shemaZman);
      case 'hebrewDate':
        return (
          <div className="rs-bina-parasha-tile is-hero">
            <span className="rs-bina-parasha-label">יום {day.weekday}</span>
            <strong>{day.hebrewDate}</strong>
            <em>{formatGregorianDate(now)}</em>
          </div>
        );
      case 'holidays':
        return namesPoster(day.holidays ?? []);
      case 'roshChodesh':
        return namesPoster(day.roshChodesh ?? []);
      case 'mevarchim':
        return namesPoster(day.shabbatMevarchim ?? []);
      case 'molad':
        return namesPoster(day.molad ?? []);
      case 'specialShabbat':
        return namesPoster(day.specialShabbat ?? []);
      case 'memorials':
        return namesPoster(day.memorials ?? []);
      case 'memorialBoard': {
        const plaques = 'plaques' in slide ? slide.plaques : day.memorialBoard ?? [];
        const page = 'page' in slide ? slide.page : 1;
        const pages = 'pages' in slide ? slide.pages : 1;
        return (
          <div className="rs-bina-memorial">
            {config.dedication ? (
              <p className="rs-bina-dedication">{toPlainDisplayText(config.dedication)}</p>
            ) : null}
            <div className="rs-bina-plaques">
              {plaques.map((p) => (
                <article
                  key={`${p.name}-${p.hebrewDate}`}
                  className={`rs-bina-plaque${p.today ? ' is-today' : p.thisWeek ? ' is-week' : ''}`}
                >
                  <span className="rs-bina-plaque-mark">נ״ע</span>
                  <strong>{p.name}</strong>
                  <em>{p.hebrewDate}</em>
                  {p.note ? <span>{toPlainDisplayText(p.note)}</span> : null}
                </article>
              ))}
            </div>
            {pages > 1 ? (
              <p className="rs-bina-page">
                {page} / {pages}
              </p>
            ) : null}
          </div>
        );
      }
      case 'yahrzeitWeek':
        return (
          <ul className="rs-bina-yahrzeit-week">
            {(day.yahrzeitWeek ?? []).map((row) => (
              <li key={`${row.name}-${row.label}`}>
                <span>{row.name}</span>
                <em>{row.label}</em>
              </li>
            ))}
          </ul>
        );
      case 'mishnaYomi':
        return (
          <div className="rs-bina-parasha-tile is-hero">
            <span className="rs-bina-parasha-label">משנה יומית</span>
            <strong>{day.mishnaYomi ?? ''}</strong>
          </div>
        );
      case 'yahrzeit':
        return namesPoster(day.yahrzeitNames ?? []);
      case 'omer':
        return day.omer ? (
          <div className="rs-bina-omer">
            <div className="rs-bina-parasha-tile is-hero">
              <span className="rs-bina-parasha-label">ספירת העומר</span>
              <strong>{day.omer.label}</strong>
              {day.omer.todayIs ? <em className="rs-bina-omer-today">{day.omer.todayIs}</em> : null}
              {day.omer.sefira ? <em>{day.omer.sefira}</em> : null}
            </div>
          </div>
        ) : null;
      case 'dafYomi':
        return (
          <div className="rs-bina-parasha-tile is-hero">
            <span className="rs-bina-parasha-label">הדף היומי</span>
            <strong>{day.dafYomi ?? ''}</strong>
          </div>
        );
      case 'dafYerushalmi':
        return (
          <div className="rs-bina-parasha-tile is-hero">
            <span className="rs-bina-parasha-label">הדף היומי ירושלמי</span>
            <strong>{day.dafYerushalmi ?? ''}</strong>
          </div>
        );
      case 'weather': {
        if (!weather) return null;
        const h = now.getHours();
        const icon = weatherCodeToIcon(weather.weatherCode, h < 6 || h >= 20);
        return (
          <div className="rs-bina-weather">
            <p className="rs-bina-weather-temp time-ltr">
              {icon ? <span className="weather-icon">{icon}</span> : null}
              {weather.tempC}°
            </p>
            {weather.description ? <p>{weather.description}</p> : null}
          </div>
        );
      }
      case 'itimMoon':
        return itimPoster(itim?.moon);
      case 'itimHalachot':
        return itimPoster(itim?.halachot);
      case 'itimEvents':
        return itimPoster(itim?.events);
      case 'itimLimud':
        return itimPoster(itim?.limud);
      case 'itimHaftara':
        return itimPoster(itim?.haftara);
      default:
        return null;
    }
  }

  return (
    <div className="rotating-show rs-bina" data-slide={slide?.id ?? 'empty'} style={shellStyle}>
      <div className="rs-bina-bg" aria-hidden />
      <div className="rs-bina-shell">
        <header className="rs-bina-header">
          <div className="rs-bina-header-bar">
            <span className="rs-bina-weekday">יום {day.weekday}</span>
            <strong className="rs-bina-shul">{toPlainDisplayText(config.name)}</strong>
            <span className="rs-bina-date">{day.hebrewDate}</span>
          </div>
          {config.showClock !== false ? (
            <div className="rs-bina-clock-wrap" aria-hidden>
              <div className="rs-bina-clock-frame">
                <AnalogClock time={clock} design="gold" />
              </div>
            </div>
          ) : null}
        </header>

        <main key={slide?.key ?? 'empty'} className="rs-bina-stage">
          {heading ? <BinaSlideTitle>{heading}</BinaSlideTitle> : null}
          {renderBody()}
        </main>

        {slides.length > 1 ? (
          <footer className="rs-bina-footer">
            <div className="rs-bina-footer-bar">
              {nextSlide ? (
                <span className="rs-bina-next">
                  למעבר למסך הבא: {ROTATING_SLIDE_LABELS[nextSlide.id]}
                </span>
              ) : null}
              <div className="rs-bina-dots" aria-hidden>
                {slides.map((s, i) => (
                  <span key={s.key} className={i === idx % slides.length ? 'on' : ''} />
                ))}
              </div>
              <div
                className="rs-bina-progress"
                style={{ animationDuration: `${settings.seconds}s` }}
                key={`${slide?.key}-${idx}`}
              />
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
