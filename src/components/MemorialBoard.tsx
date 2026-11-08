import type { CSSProperties } from 'react';
import type { MemorialBoardTheme, MemorialPlaque } from '../types';
import { toPlainDisplayText } from '../lib/sanitizeHtml';
import './MemorialBoard.css';

export type MemorialBoardProps = {
  plaques: MemorialPlaque[];
  /** Optional dedication / board subtitle under the title */
  dedication?: string;
  title?: string;
  compact?: boolean;
  /** Show only today's plaques (for the small yahrzeit widget) */
  todayOnly?: boolean;
  className?: string;
  page?: number;
  pages?: number;
  theme?: MemorialBoardTheme;
  showCandles?: boolean;
  showFeatured?: boolean;
  showKicker?: boolean;
  showTnz?: boolean;
  /** Optional CSS vars / font / accent from canvas widget */
  style?: CSSProperties;
};

function NeshamaCandle({ strong }: { strong?: boolean }) {
  return (
    <span
      className={`mb-candle is-lit is-flicker${strong ? ' is-strong' : ''}`}
      aria-hidden
    >
      <span className="mb-candle-flame" />
      <span className="mb-candle-glow" />
      <span className="mb-candle-body" />
    </span>
  );
}

function PlaqueCard({
  plaque,
  featured,
  showCandles,
  showKicker,
  showTnz,
}: {
  plaque: MemorialPlaque;
  featured?: boolean;
  showCandles: boolean;
  showKicker: boolean;
  showTnz: boolean;
}) {
  return (
    <article
      className={`mb-plaque${plaque.today ? ' is-today' : ''}${plaque.thisWeek && !plaque.today ? ' is-week' : ''}${featured ? ' is-featured' : ''}`}
    >
      {showCandles ? <NeshamaCandle strong={plaque.today || featured} /> : null}
      <div className="mb-plaque-body">
        {showKicker ? <span className="mb-plaque-kicker">לעילוי נשמת</span> : null}
        <strong className="mb-plaque-name">{toPlainDisplayText(plaque.name)}</strong>
        <em className="mb-plaque-date">נפטר/ה {plaque.hebrewDate}</em>
        {plaque.note ? (
          <span className="mb-plaque-note">{toPlainDisplayText(plaque.note)}</span>
        ) : null}
        {showTnz ? <span className="mb-plaque-tnz">ת.נ.צ.ב.ה.</span> : null}
      </div>
    </article>
  );
}

const PLACEHOLDER_PLAQUES: MemorialPlaque[] = [
  {
    name: 'משה הכהן בן שרה ז״ל',
    hebrewDate: 'י׳ בכסלו',
    note: '',
    today: true,
    thisWeek: true,
  },
  {
    name: 'רחל בת אברהם ע״ה',
    hebrewDate: 'ב׳ בטבת',
    today: false,
    thisWeek: true,
  },
  {
    name: 'יעקב בן יצחק ז״ל',
    hebrewDate: 'ט״ו בשבט',
    today: false,
    thisWeek: false,
  },
];

export function MemorialBoard({
  plaques,
  dedication,
  title = 'לזכרון עולם בהיכל ה׳',
  compact = false,
  todayOnly = false,
  className = '',
  page,
  pages,
  theme = 'wood',
  showCandles = true,
  showFeatured = true,
  showKicker = true,
  showTnz = true,
  style,
}: MemorialBoardProps) {
  const source = plaques.length ? plaques : PLACEHOLDER_PLAQUES;
  const list = todayOnly ? source.filter((p) => p.today) : source;
  const featured =
    showFeatured && !todayOnly ? list.filter((p) => p.today) : [];
  const grid = showFeatured && !todayOnly ? list.filter((p) => !p.today) : list;

  if (!list.length && todayOnly) return null;

  return (
    <div
      className={`memorial-board theme-${theme}${compact ? ' is-compact' : ''} ${className}`.trim()}
      style={style}
    >
      <div className="mb-frame">
        <header className="mb-header">
          {showCandles ? <span className="mb-header-flame" aria-hidden /> : null}
          {title ? <h2 className="mb-title">{title}</h2> : null}
          {dedication ? <p className="mb-dedication">{toPlainDisplayText(dedication)}</p> : null}
        </header>

        {featured.length ? (
          <div className="mb-featured">
            {featured.map((p) => (
              <PlaqueCard
                key={`f-${p.name}-${p.hebrewDate}`}
                plaque={p}
                featured
                showCandles={showCandles}
                showKicker={showKicker}
                showTnz={showTnz}
              />
            ))}
          </div>
        ) : null}

        {grid.length ? (
          <div className={`mb-grid${todayOnly ? ' is-today-only' : ''}`}>
            {grid.map((p) => (
              <PlaqueCard
                key={`${p.name}-${p.hebrewDate}`}
                plaque={p}
                showCandles={showCandles}
                showKicker={showKicker}
                showTnz={showTnz}
              />
            ))}
          </div>
        ) : null}

        {pages && pages > 1 && page ? (
          <p className="mb-page">
            {page} / {pages}
          </p>
        ) : null}
      </div>
    </div>
  );
}
