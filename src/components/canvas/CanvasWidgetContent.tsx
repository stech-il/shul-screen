import type { ReactNode } from 'react';
import type {
  Announcement,
  CandleBoard,
  CanvasWidget,
  ComputedZman,
  DayInfo,
  ScheduleBlock,
  ScheduleItem,
} from '../../types';
import { sanitizeRichHtml, toPlainDisplayText } from '../../lib/sanitizeHtml';
import { isUpcomingWithinMinutes } from '../../lib/upcomingTime';
import { weatherCodeToIcon } from '../../lib/weather';
import { CandleTimesBoard, PLACEHOLDER_CANDLE_BOARD } from '../CandleTimesBoard';
import { RichAnnounce } from '../RichAnnounce';
import { AnalogClock, DigitalClock } from './ClockWidget';
import { WIDGET_LABELS } from './widgets';

export interface CanvasData {
  name: string;
  dedication?: string;
  logoSrc?: string;
  clock: string;
  day: DayInfo;
  zmanim: ComputedZman[];
  blocks: ScheduleBlock[];
  resolveTime: (item: ScheduleItem, block?: ScheduleBlock) => string;
  /** Absolute time for upcoming highlight (weekday vs Shabbat-aware). */
  resolveItemAt?: (item: ScheduleItem, block?: ScheduleBlock) => Date | null;
  announcement?: Announcement | null;
  announcementCount: number;
  announcementIndex: number;
  weatherTemp?: number | null;
  weatherCode?: number;
  weatherDesc?: string;
  countdownLabel?: string;
  candleBoard?: CandleBoard | null;
}

interface Props {
  widget: CanvasWidget;
  data: CanvasData;
  placeholder?: boolean;
}

function Placeholder({ label }: { label: string }) {
  return <p className="cw-empty">{label}</p>;
}

export function CanvasWidgetContent({ widget, data, placeholder }: Props) {
  const title = widget.title?.trim();

  switch (widget.type) {
    case 'title':
      return (
        <div className="cw-title">
          <strong>{title || data.name}</strong>
          {data.dedication ? <span className="cw-sub">{data.dedication}</span> : null}
        </div>
      );

    case 'logo':
      return data.logoSrc ? (
        <img className="cw-logo" src={data.logoSrc} alt="" />
      ) : (
        <Placeholder label="לוגו — העלה בלשונית מדיה" />
      );

    case 'clock':
      if (widget.clockMode === 'analog') {
        return <AnalogClock time={data.clock} design={(widget.clockDesign as any) || 'classic'} color={widget.color} />;
      }
      return <DigitalClock time={data.clock} design={(widget.clockDesign as any) || 'classic'} color={widget.color} />;

    case 'hebrewDate':
      return (
        <div className="cw-line">
          יום {data.day.weekday} · {data.day.hebrewDate}
        </div>
      );

    case 'parasha':
      return data.day.parasha ? (
        <div className="cw-stat">
          {widget.showTitle ? <h3>{title || 'פרשת השבוע'}</h3> : null}
          <p>{data.day.parasha}</p>
        </div>
      ) : (
        <Placeholder label="פרשת השבוע" />
      );

    case 'dafYomi':
      return data.day.dafYomi ? (
        <div className="cw-stat">
          {widget.showTitle ? <h3>{title || 'הדף היומי'}</h3> : null}
          <p>{data.day.dafYomi}</p>
        </div>
      ) : (
        <Placeholder label="הדף היומי" />
      );

    case 'omer':
      return data.day.omer ? (
        <div className="cw-stat cw-omer">
          {widget.showTitle ? <h3>{title || 'ספירת העומר'}</h3> : null}
          <p className="cw-omer-day">{data.day.omer.label}</p>
          {data.day.omer.sefira ? <p className="cw-omer-sefira">{data.day.omer.sefira}</p> : null}
        </div>
      ) : placeholder ? (
        <div className="cw-stat cw-omer">
          {widget.showTitle ? <h3>{title || 'ספירת העומר'}</h3> : null}
          <p className="cw-omer-day">עוֹמֶר יוֹם 18</p>
          <p className="cw-omer-sefira">נצח שבתיפארת</p>
        </div>
      ) : (
        <Placeholder label="ספירת העומר (רק בימי הספירה)" />
      );

    case 'weather': {
      const h = new Date().getHours();
      const wIcon = weatherCodeToIcon(data.weatherCode, h < 6 || h >= 20);
      return data.weatherTemp != null ? (
        <div className="cw-stat">
          {widget.showTitle ? <h3>{title || 'מזג האוויר'}</h3> : null}
          <p className="time-ltr">
            {wIcon ? <span className="weather-icon">{wIcon}</span> : null}
            {data.weatherTemp}°C
          </p>
          {data.weatherDesc ? (
            <p className="cw-weather-desc">{data.weatherDesc}</p>
          ) : null}
        </div>
      ) : (
        <Placeholder label="מזג אוויר" />
      );
    }

    case 'zmanim':
      return (
        <div className="cw-list-wrap">
          {widget.showTitle ? <h3>{title || 'זמני היום'}</h3> : null}
          <ul className="cw-list">
            {data.zmanim.length === 0 && placeholder ? (
              <li>
                <span>זריחה</span>
                <strong className="time-ltr">05:45</strong>
              </li>
            ) : null}
            {data.zmanim.map((z) => (
              <li
                key={z.key}
                className={isUpcomingWithinMinutes(z.time) ? 'is-upcoming' : undefined}
              >
                <span>{z.label}</span>
                <strong className="time-ltr">{z.formatted}</strong>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'zman': {
      const found = data.zmanim.find((z) => z.key === widget.zmanKey);
      const label = title || found?.label || 'זמן';
      const time = found?.formatted ?? (placeholder ? '—' : '');
      const layout = widget.titleLayout || 'above';
      const upcoming = found ? isUpcomingWithinMinutes(found.time) : false;
      return (
        <div className={`cw-zman layout-${layout}${upcoming ? ' is-upcoming' : ''}`}>
          {widget.showTitle ? <h3 className="cw-zman-title">{label}</h3> : null}
          <p className="cw-zman-time time-ltr">{time}</p>
        </div>
      );
    }

    case 'block': {
      const block =
        data.blocks.find((b) => b.id === widget.blockId) ??
        data.blocks.find((b) => b.enabled) ??
        null;
      if (!block) return <Placeholder label="בלוק תפילות — בחר בהגדרות הווידג׳ט" />;
      return (
        <div className="cw-list-wrap">
          {widget.showTitle ? <h3>{title || block.title}</h3> : null}
          <ul className="cw-list">
            {block.items.map((item) => {
              const timeStr = item.noTime ? '' : data.resolveTime(item, block);
              if (item.noTime || !timeStr) {
                return (
                  <li key={item.id} className="cw-heading-row">
                    <span>
                      {toPlainDisplayText(item.title)}
                      {item.note ? <em>{toPlainDisplayText(item.note)}</em> : null}
                    </span>
                  </li>
                );
              }
              const at = data.resolveItemAt?.(item, block) ?? null;
              const upcoming = isUpcomingWithinMinutes(at ?? timeStr);
              return (
                <li key={item.id} className={upcoming ? 'is-upcoming' : undefined}>
                  <span>
                    {toPlainDisplayText(item.title)}
                    {item.note ? <em>{toPlainDisplayText(item.note)}</em> : null}
                  </span>
                  <strong className="time-ltr">{timeStr}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    case 'announcements':
      return (
        <div className="cw-announce">
          {widget.showTitle ? <h3>{title || 'הודעות'}</h3> : null}
          {data.announcement ? (
            <RichAnnounce
              key={data.announcement.id}
              className="cw-announce-body"
              html={data.announcement.text}
            />
          ) : (
            <Placeholder label="אין הודעות פעילות" />
          )}
          {data.announcementCount > 1 ? (
            <div className="cw-dots">
              {Array.from({ length: data.announcementCount }).map((_, i) => (
                <span key={i} className={i === data.announcementIndex ? 'on' : ''} />
              ))}
            </div>
          ) : null}
        </div>
      );

    case 'yahrzeit':
      return data.day.yahrzeitNames?.length ? (
        <div className="cw-stat">
          {widget.showTitle ? <h3>{title || 'יארצייט'}</h3> : null}
          <p>{data.day.yahrzeitNames.join(' · ')}</p>
        </div>
      ) : (
        <Placeholder label="יארצייט" />
      );

    case 'calendar': {
      const items = [...(data.day.holidays ?? []), ...(data.day.memorials ?? [])];
      return items.length ? (
        <div className="cw-stat">
          {widget.showTitle ? <h3>{title || 'לוח שנה'}</h3> : null}
          <p>{items.join(' · ')}</p>
        </div>
      ) : (
        <Placeholder label="חגים וימי זיכרון" />
      );
    }

    case 'countdown': {
      const board = data.candleBoard ?? (placeholder ? PLACEHOLDER_CANDLE_BOARD : null);
      if (!board) {
        return <Placeholder label="כניסה · יציאה · יציאה ר״ת" />;
      }
      return (
        <CandleTimesBoard
          board={board}
          showCandles={widget.showCandles !== false}
          title={title || 'הדלקת נרות'}
          showTitle={widget.showTitle}
        />
      );
    }

    case 'text': {
      const raw = widget.text?.trim();
      if (!raw) {
        return placeholder ? <div className="cw-text cw-text-placeholder">עורך טקסט</div> : null;
      }
      return (
        <div
          className="cw-text"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(raw) }}
        />
      );
    }

    case 'heading': {
      const raw = (widget.text || widget.title || '').trim() || (placeholder ? 'כותרת' : '');
      if (!raw) return null;
      const tag = widget.htmlTag || 'h2';
      const className = 'cw-heading';
      let inner: ReactNode;
      switch (tag) {
        case 'h1':
          inner = <h1 className={className}>{raw}</h1>;
          break;
        case 'h3':
          inner = <h3 className={className}>{raw}</h3>;
          break;
        case 'h4':
          inner = <h4 className={className}>{raw}</h4>;
          break;
        case 'h5':
          inner = <h5 className={className}>{raw}</h5>;
          break;
        case 'h6':
          inner = <h6 className={className}>{raw}</h6>;
          break;
        case 'p':
          inner = <p className={className}>{raw}</p>;
          break;
        case 'div':
          inner = <div className={className}>{raw}</div>;
          break;
        default:
          inner = <h2 className={className}>{raw}</h2>;
      }
      if (widget.linkUrl?.trim()) {
        return (
          <a className="cw-link-wrap" href={widget.linkUrl} target="_blank" rel="noreferrer">
            {inner}
          </a>
        );
      }
      return <>{inner}</>;
    }

    case 'divider':
      return <hr className="cw-divider" />;

    case 'button': {
      const label = (widget.buttonLabel || widget.text || 'כפתור').trim();
      const el = <span className="cw-button">{label}</span>;
      if (widget.linkUrl?.trim()) {
        return (
          <a className="cw-link-wrap" href={widget.linkUrl} target="_blank" rel="noreferrer">
            {el}
          </a>
        );
      }
      return el;
    }

    case 'video': {
      const url = widget.videoUrl?.trim() || widget.imageUrl?.trim();
      if (!url) {
        return placeholder ? <Placeholder label="וידאו — הזינו קישור בהגדרות" /> : null;
      }
      const yt = youtubeEmbed(url);
      if (yt) {
        return (
          <iframe
            className="cw-video"
            src={yt}
            title="וידאו"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        );
      }
      return <video className="cw-video" src={url} controls playsInline muted={placeholder} />;
    }

    case 'image':
      return widget.imageUrl ? (
        <img className="cw-image" src={widget.imageUrl} alt="" />
      ) : (
        <Placeholder label="תמונה — העלה בהגדרות הווידג׳ט" />
      );

    default:
      return <Placeholder label={WIDGET_LABELS[widget.type] ?? ''} />;
  }
}

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      const parts = u.pathname.split('/');
      const embedIdx = parts.indexOf('embed');
      if (embedIdx >= 0 && parts[embedIdx + 1]) {
        return `https://www.youtube.com/embed/${parts[embedIdx + 1]}`;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
