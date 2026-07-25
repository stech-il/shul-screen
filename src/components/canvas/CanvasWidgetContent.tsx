import type {
  Announcement,
  CanvasWidget,
  ComputedZman,
  DayInfo,
  ScheduleBlock,
  ScheduleItem,
} from '../../types';
import { sanitizeRichHtml } from '../../lib/sanitizeHtml';
import { WIDGET_LABELS } from './widgets';

export interface CanvasData {
  name: string;
  dedication?: string;
  logoSrc?: string;
  clock: string;
  day: DayInfo;
  zmanim: ComputedZman[];
  blocks: ScheduleBlock[];
  resolveTime: (item: ScheduleItem) => string;
  announcement?: Announcement | null;
  announcementCount: number;
  announcementIndex: number;
  weatherTemp?: number | null;
  countdownLabel?: string;
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
      return <div className="cw-clock time-ltr">{data.clock || '00:00:00'}</div>;

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

    case 'weather':
      return data.weatherTemp != null ? (
        <div className="cw-stat">
          {widget.showTitle ? <h3>{title || 'מזג האוויר'}</h3> : null}
          <p className="time-ltr">{data.weatherTemp}°C</p>
        </div>
      ) : (
        <Placeholder label="מזג אוויר" />
      );

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
              <li key={z.key}>
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
      return (
        <div className={`cw-zman layout-${layout}`}>
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
              const timeStr = item.noTime ? '' : data.resolveTime(item);
              if (item.noTime || !timeStr) {
                return (
                  <li key={item.id} className="cw-heading-row">
                    <span>
                      {item.title}
                      {item.note ? <em>{item.note}</em> : null}
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <span>
                    {item.title}
                    {item.note ? <em>{item.note}</em> : null}
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
            <p key={data.announcement.id}>{data.announcement.text}</p>
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

    case 'countdown':
      return data.countdownLabel ? (
        <div className="cw-stat">
          {widget.showTitle ? <h3>{title || 'הדלקת נרות'}</h3> : null}
          <p className="time-ltr">{data.countdownLabel}</p>
        </div>
      ) : (
        <Placeholder label="ספירה להדלקת נרות" />
      );

    case 'text': {
      const raw = widget.text?.trim();
      if (!raw) {
        return placeholder ? <div className="cw-text cw-text-placeholder">טקסט חופשי</div> : null;
      }
      return (
        <div
          className="cw-text"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(raw) }}
        />
      );
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
