import type { CSSProperties } from 'react';
import type { CandleBoard } from '../types';
import './CandleTimesBoard.css';

type Props = {
  board: CandleBoard;
  /** Decorative candles on both sides */
  showCandles?: boolean;
  title?: string;
  showTitle?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Shabbat / holiday entry & exit times with optional candle ornaments. */
export function CandleTimesBoard({
  board,
  showCandles = true,
  title,
  showTitle = true,
  className = '',
  style,
}: Props) {
  return (
    <div
      className={`candle-board${showCandles ? ' with-candles' : ''} ${className}`.trim()}
      style={style}
    >
      {showCandles ? <span className="candle-ornament left" aria-hidden="true" /> : null}
      <div className="candle-board-inner">
        {showTitle && title ? <h3 className="candle-board-title">{title}</h3> : null}
        <ul className="candle-board-rows">
          <li>
            <span>{board.entryLabel}</span>
            <strong className="time-ltr">{board.entry}</strong>
          </li>
          <li>
            <span>{board.exitLabel}</span>
            <strong className="time-ltr">{board.exit}</strong>
          </li>
          <li>
            <span>{board.exitRTLabel}</span>
            <strong className="time-ltr">{board.exitRT}</strong>
          </li>
        </ul>
        {board.countdownLabel ? (
          <p className="candle-board-countdown time-ltr">{board.countdownLabel}</p>
        ) : null}
      </div>
      {showCandles ? <span className="candle-ornament right" aria-hidden="true" /> : null}
    </div>
  );
}

/** Placeholder board for the canvas builder when live times are off-season. */
export const PLACEHOLDER_CANDLE_BOARD: CandleBoard = {
  entry: '18:42',
  exit: '19:48',
  exitRT: '20:24',
  entryLabel: 'כניסה',
  exitLabel: 'יציאה',
  exitRTLabel: 'יציאה ר״ת',
  countdownLabel: 'הדלקת נרות בעוד 02:14:00',
};
