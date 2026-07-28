import type { CanvasWidgetType } from '../../types';
import { WIDGET_LABELS } from './widgets';

/** Elementor-like basic + shul widgets for the add panel */
export const PALETTE_SECTIONS: {
  id: string;
  label: string;
  types: CanvasWidgetType[];
}[] = [
  {
    id: 'basic',
    label: 'בסיסי',
    types: ['heading', 'text', 'image', 'video', 'button', 'divider'],
  },
  {
    id: 'main',
    label: 'מסך בית כנסת',
    types: ['title', 'logo', 'clock', 'hebrewDate', 'zmanim', 'zman', 'block', 'announcements'],
  },
  {
    id: 'extra',
    label: 'נוסף',
    types: ['parasha', 'dafYomi', 'weather', 'yahrzeit', 'calendar', 'countdown'],
  },
];

const ICONS: Record<CanvasWidgetType, string> = {
  heading: 'T',
  text: '¶',
  image: '▣',
  video: '▶',
  button: '▢',
  divider: '—',
  title: '✡',
  logo: '◎',
  clock: '◷',
  hebrewDate: 'ד',
  parasha: 'ס',
  dafYomi: 'ע',
  weather: '☁',
  zmanim: '☰',
  zman: '◎',
  block: '☰',
  announcements: '✎',
  yahrzeit: 'נ',
  calendar: '📅',
  countdown: '⏳',
};

interface Props {
  onAdd: (type: CanvasWidgetType) => void;
  onExplodeZmanim?: () => void;
}

export function WidgetPalette({ onAdd, onExplodeZmanim }: Props) {
  return (
    <div className="cb-el-palette" dir="rtl">
      <div className="cb-el-palette-head">
        <strong>רכיבים</strong>
        <em>לחצו להוספה למסך</em>
      </div>
      {PALETTE_SECTIONS.map((section) => (
        <div key={section.id} className="cb-el-palette-sec">
          <div className="cb-el-palette-sec-title">{section.label}</div>
          <div className="cb-el-palette-grid">
            {section.types.map((type) => (
              <button
                key={type}
                type="button"
                className="cb-el-tile"
                onClick={() => onAdd(type)}
                title={WIDGET_LABELS[type]}
              >
                <span className="cb-el-tile-icon" aria-hidden>
                  {ICONS[type]}
                </span>
                <span className="cb-el-tile-label">{WIDGET_LABELS[type]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {onExplodeZmanim ? (
        <button type="button" className="btn ghost cb-el-palette-extra" onClick={onExplodeZmanim}>
          פצל זמנים לבלוקים נפרדים
        </button>
      ) : null}
    </div>
  );
}
