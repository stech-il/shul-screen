import type { CanvasWidgetType } from '../../types';
import { useI18n } from '../../i18n';

/** Elementor-like basic + shul widgets for the add panel */
const PALETTE_SECTION_DEFS: {
  id: string;
  labelKey: string;
  types: CanvasWidgetType[];
}[] = [
  {
    id: 'basic',
    labelKey: 'panels.paletteBasic',
    types: ['heading', 'text', 'image', 'video', 'button', 'divider'],
  },
  {
    id: 'main',
    labelKey: 'panels.paletteMain',
    types: ['title', 'logo', 'clock', 'hebrewDate', 'zmanim', 'zman', 'block', 'announcements'],
  },
  {
    id: 'extra',
    labelKey: 'panels.paletteExtra',
    types: ['parasha', 'dafYomi', 'omer', 'weather', 'yahrzeit', 'calendar', 'countdown'],
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
  omer: 'עֹ',
  weather: '☁',
  zmanim: '☰',
  zman: '◎',
  block: '☰',
  announcements: '✎',
  yahrzeit: 'נ',
  calendar: '📅',
  countdown: '⏳',
};

export type PaletteSectionId = 'basic' | 'main' | 'extra';

interface Props {
  onAdd: (type: CanvasWidgetType) => void;
  onExplodeZmanim?: () => void;
  /** Controlled open section — only one palette section open at a time */
  openSection?: PaletteSectionId | null;
  onOpenSection?: (id: PaletteSectionId | null) => void;
}

export function WidgetPalette({
  onAdd,
  onExplodeZmanim,
  openSection = 'basic',
  onOpenSection,
}: Props) {
  const { t, dir } = useI18n();
  const controlled = typeof onOpenSection === 'function';

  return (
    <div className="cb-el-palette" dir={dir}>
      <div className="cb-el-palette-head">
        <strong>{t('panels.canvasWidgets')}</strong>
        <em>{t('panels.canvasWidgetsHint')}</em>
      </div>
      {PALETTE_SECTION_DEFS.map((section) => {
        const id = section.id as PaletteSectionId;
        const isOpen = controlled ? openSection === id : section.id === 'basic';
        return (
          <details
            key={section.id}
            className="cb-el-palette-sec"
            {...(controlled ? { open: isOpen } : { open: section.id === 'basic' })}
            onToggle={(e) => {
              if (!onOpenSection) return;
              const nextOpen = (e.currentTarget as HTMLDetailsElement).open;
              onOpenSection(nextOpen ? id : null);
            }}
          >
            <summary className="cb-el-palette-sec-title">{t(section.labelKey)}</summary>
            <div className="cb-el-palette-grid">
              {section.types.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="cb-el-tile"
                  onClick={() => onAdd(type)}
                  title={t(`widgets.${type}`)}
                >
                  <span className="cb-el-tile-icon" aria-hidden>
                    {ICONS[type]}
                  </span>
                  <span className="cb-el-tile-label">{t(`widgets.${type}`)}</span>
                </button>
              ))}
            </div>
          </details>
        );
      })}
      {onExplodeZmanim ? (
        <button type="button" className="btn ghost cb-el-palette-extra" onClick={onExplodeZmanim}>
          {t('panels.explodeZmanim')}
        </button>
      ) : null}
    </div>
  );
}
