import { useMemo } from 'react';

/* ── Design definitions ── */

export const DIGITAL_DESIGNS = [
  { id: 'classic', label: 'קלאסי' },
  { id: 'bold', label: 'עבה' },
  { id: 'thin', label: 'דק' },
  { id: 'mono', label: 'מונו' },
  { id: 'neon', label: 'ניאון' },
  { id: 'retro', label: 'רטרו' },
  { id: 'minimal', label: 'מינימלי' },
  { id: 'shadow', label: 'צל' },
] as const;

export const ANALOG_DESIGNS = [
  { id: 'classic', label: 'קלאסי' },
  { id: 'roman', label: 'רומי' },
  { id: 'minimal', label: 'מינימלי' },
  { id: 'modern', label: 'מודרני' },
  { id: 'gold', label: 'זהב' },
  { id: 'dark', label: 'כהה' },
  { id: 'elegant', label: 'אלגנטי' },
  { id: 'dots', label: 'נקודות' },
] as const;

export type DigitalDesign = (typeof DIGITAL_DESIGNS)[number]['id'];
export type AnalogDesign = (typeof ANALOG_DESIGNS)[number]['id'];

/* ── helpers ── */

function parseTime(timeStr: string): { h: number; m: number; s: number } {
  const parts = timeStr.replace(/[^\d:]/g, '').split(':').map(Number);
  return { h: parts[0] ?? 0, m: parts[1] ?? 0, s: parts[2] ?? 0 };
}

/* ── Digital Clock ── */

interface DigitalProps {
  time: string;
  design?: DigitalDesign;
  color?: string;
}

const digitalStyles: Record<DigitalDesign, React.CSSProperties> = {
  classic: { fontFamily: "'Secular One', 'Heebo', sans-serif", fontWeight: 700 },
  bold: { fontFamily: "'Heebo', sans-serif", fontWeight: 900, letterSpacing: '0.05em' },
  thin: { fontFamily: "'Heebo', sans-serif", fontWeight: 300, letterSpacing: '0.08em' },
  mono: { fontFamily: "'Courier New', 'Consolas', monospace", fontWeight: 700, letterSpacing: '0.06em' },
  neon: { fontFamily: "'Secular One', 'Heebo', sans-serif", fontWeight: 700, textShadow: '0 0 8px currentColor, 0 0 20px currentColor' },
  retro: { fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: '0.1em', background: 'rgba(0,0,0,0.25)', padding: '0.1em 0.25em', borderRadius: '6px' },
  minimal: { fontFamily: "'Rubik', 'Heebo', sans-serif", fontWeight: 400 },
  shadow: { fontFamily: "'Secular One', 'Heebo', sans-serif", fontWeight: 700, textShadow: '3px 3px 6px rgba(0,0,0,0.35)' },
};

export function DigitalClock({ time, design = 'classic', color }: DigitalProps) {
  const style: React.CSSProperties = {
    ...digitalStyles[design] ?? digitalStyles.classic,
    fontSize: '3.1em',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    direction: 'ltr',
    color,
  };

  return <div className="cw-clock cw-clock-digital" style={style}>{time || '00:00:00'}</div>;
}

/* ── Analog Clock (SVG) ── */

interface AnalogProps {
  time: string;
  design?: AnalogDesign;
  color?: string;
  accentColor?: string;
}

interface AnalogTheme {
  face: string;
  border: string;
  tick: string;
  hourHand: string;
  minuteHand: string;
  secondHand: string;
  center: string;
  numbers: string;
  showNumbers: boolean;
  roman: boolean;
  dotMarkers: boolean;
}

const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

function analogTheme(design: AnalogDesign): AnalogTheme {
  const base: AnalogTheme = {
    face: 'rgba(255,255,255,0.95)',
    border: '#1c3140',
    tick: '#1c3140',
    hourHand: '#1c3140',
    minuteHand: '#1c3140',
    secondHand: '#c9a227',
    center: '#c9a227',
    numbers: '#1c3140',
    showNumbers: true,
    roman: false,
    dotMarkers: false,
  };

  switch (design) {
    case 'roman':
      return { ...base, roman: true };
    case 'minimal':
      return { ...base, showNumbers: false, tick: '#888', border: '#ccc', face: 'transparent' };
    case 'modern':
      return { ...base, face: '#f0f2f5', border: '#3a4f6a', secondHand: '#e74c3c', center: '#e74c3c' };
    case 'gold':
      return { ...base, face: '#faf6ec', border: '#c9a227', tick: '#8b7020', hourHand: '#8b7020', minuteHand: '#8b7020', numbers: '#8b7020', secondHand: '#c9a227', center: '#c9a227' };
    case 'dark':
      return { ...base, face: '#1a1a2e', border: '#3a3a5c', tick: '#aaa', hourHand: '#eee', minuteHand: '#ddd', numbers: '#ccc', secondHand: '#c9a227', center: '#c9a227' };
    case 'elegant':
      return { ...base, face: '#fdfaf5', border: '#2c2c2c', tick: '#2c2c2c', hourHand: '#1a1a1a', minuteHand: '#333', roman: true, secondHand: '#8b2020', center: '#8b2020' };
    case 'dots':
      return { ...base, showNumbers: false, dotMarkers: true, tick: '#3a4f6a', border: '#3a4f6a' };
    default:
      return base;
  }
}

export function AnalogClock({ time, design = 'classic', color, accentColor }: AnalogProps) {
  const { h, m, s } = parseTime(time);
  const theme = useMemo(() => analogTheme(design), [design]);

  const hourDeg = ((h % 12) + m / 60) * 30;
  const minDeg = (m + s / 60) * 6;
  const secDeg = s * 6;

  const cx = 50, cy = 50, r = 44;

  const ticks: JSX.Element[] = [];
  for (let i = 0; i < 60; i++) {
    const angle = (i * 6 - 90) * (Math.PI / 180);
    const isMajor = i % 5 === 0;
    const r1 = isMajor ? r - 7 : r - 4;
    const r2 = r - 1;
    ticks.push(
      <line
        key={i}
        x1={cx + r1 * Math.cos(angle)}
        y1={cy + r1 * Math.sin(angle)}
        x2={cx + r2 * Math.cos(angle)}
        y2={cy + r2 * Math.sin(angle)}
        stroke={color || theme.tick}
        strokeWidth={isMajor ? 2 : 0.8}
        strokeLinecap="round"
      />,
    );
  }

  const numbers: JSX.Element[] = [];
  if (theme.showNumbers || theme.roman) {
    for (let i = 0; i < 12; i++) {
      const angle = (i * 30 - 60) * (Math.PI / 180);
      const nr = r - 14;
      const label = theme.roman ? ROMAN[i] : String(i === 0 ? 12 : i);
      numbers.push(
        <text
          key={i}
          x={cx + nr * Math.cos(angle)}
          y={cy + nr * Math.sin(angle)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color || theme.numbers}
          fontSize={theme.roman ? 5.5 : 7}
          fontFamily="'Secular One', 'Heebo', sans-serif"
          fontWeight={600}
        >
          {label}
        </text>,
      );
    }
  }

  if (theme.dotMarkers) {
    for (let i = 0; i < 12; i++) {
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const dr = r - 8;
      numbers.push(
        <circle
          key={`dot-${i}`}
          cx={cx + dr * Math.cos(angle)}
          cy={cy + dr * Math.sin(angle)}
          r={i % 3 === 0 ? 2.2 : 1.2}
          fill={color || theme.tick}
        />,
      );
    }
  }

  return (
    <div className="cw-clock cw-clock-analog" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio: '1' }}>
        {/* face */}
        <circle cx={cx} cy={cy} r={r} fill={theme.face} stroke={color || theme.border} strokeWidth={2} />
        {ticks}
        {numbers}
        {/* hour */}
        <line
          x1={cx} y1={cy}
          x2={cx + 22 * Math.cos((hourDeg - 90) * Math.PI / 180)}
          y2={cy + 22 * Math.sin((hourDeg - 90) * Math.PI / 180)}
          stroke={color || theme.hourHand} strokeWidth={3.2} strokeLinecap="round"
        />
        {/* minute */}
        <line
          x1={cx} y1={cy}
          x2={cx + 32 * Math.cos((minDeg - 90) * Math.PI / 180)}
          y2={cy + 32 * Math.sin((minDeg - 90) * Math.PI / 180)}
          stroke={color || theme.minuteHand} strokeWidth={2.2} strokeLinecap="round"
        />
        {/* second */}
        <line
          x1={cx} y1={cy}
          x2={cx + 35 * Math.cos((secDeg - 90) * Math.PI / 180)}
          y2={cy + 35 * Math.sin((secDeg - 90) * Math.PI / 180)}
          stroke={accentColor || theme.secondHand} strokeWidth={1} strokeLinecap="round"
        />
        {/* center dot */}
        <circle cx={cx} cy={cy} r={2.5} fill={accentColor || theme.center} />
      </svg>
    </div>
  );
}
