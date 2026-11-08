import type { MemorialPlaque } from '../types';
import { toPlainDisplayText } from '../lib/sanitizeHtml';
import './MemorialBoard.css';

type Props = {
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
};

function NeshamaCandle({ lit, flicker }: { lit: boolean; flicker?: boolean }) {
  return (
    <span
      className={`mb-candle${lit ? ' is-lit' : ''}${flicker ? ' is-flicker' : ''}`}
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
}: {
  plaque: MemorialPlaque;
  featured?: boolean;
}) {
  const lit = plaque.today || plaque.thisWeek;
  return (
    <article
      className={`mb-plaque${plaque.today ? ' is-today' : ''}${plaque.thisWeek && !plaque.today ? ' is-week' : ''}${featured ? ' is-featured' : ''}`}
    >
      <NeshamaCandle lit={lit} flicker={plaque.today} />
      <div className="mb-plaque-body">
        <span className="mb-plaque-kicker">לעילוי נשמת</span>
        <strong className="mb-plaque-name">{toPlainDisplayText(plaque.name)}</strong>
        <em className="mb-plaque-date">נפטר/ה {plaque.hebrewDate}</em>
        {plaque.note ? (
          <span className="mb-plaque-note">{toPlainDisplayText(plaque.note)}</span>
        ) : null}
        <span className="mb-plaque-tnz">ת.נ.צ.ב.ה.</span>
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
}: Props) {
  const source = plaques.length ? plaques : PLACEHOLDER_PLAQUES;
  const list = todayOnly ? source.filter((p) => p.today) : source;
  const featured = !todayOnly ? list.filter((p) => p.today) : [];
  const grid = todayOnly ? list : list.filter((p) => !p.today);

  if (!list.length && todayOnly) return null;

  return (
    <div className={`memorial-board${compact ? ' is-compact' : ''} ${className}`.trim()}>
      <div className="mb-frame">
        <header className="mb-header">
          <span className="mb-header-flame" aria-hidden />
          <h2 className="mb-title">{title}</h2>
          {dedication ? <p className="mb-dedication">{toPlainDisplayText(dedication)}</p> : null}
        </header>

        {featured.length ? (
          <div className="mb-featured">
            {featured.map((p) => (
              <PlaqueCard key={`f-${p.name}-${p.hebrewDate}`} plaque={p} featured />
            ))}
          </div>
        ) : null}

        {grid.length ? (
          <div className={`mb-grid${todayOnly ? ' is-today-only' : ''}`}>
            {grid.map((p) => (
              <PlaqueCard key={`${p.name}-${p.hebrewDate}`} plaque={p} />
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
