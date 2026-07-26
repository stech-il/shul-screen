import type { CanvasWidget, ScheduleBlock, ZmanKey } from '../../types';
import { ZMAN_DEFS } from '../../data/zmanim';
import { RichTextEditor } from '../RichTextEditor';
import { clamp } from './widgets';

export type ElementorTab = 'content' | 'style' | 'advanced';

type FontOption = { id: string; label: string };

function PxField({
  label,
  value,
  min,
  max,
  step = 1,
  placeholder = 'אוטומטי',
  onChange,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label>
      {label} (px)
      <input
        type="number"
        dir="ltr"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(undefined);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          onChange(clamp(step < 1 ? n : Math.round(n), min, max));
        }}
        style={{ textAlign: 'left' }}
      />
    </label>
  );
}

interface Props {
  selected: CanvasWidget;
  tab: ElementorTab;
  onTab: (tab: ElementorTab) => void;
  blocks: ScheduleBlock[];
  enabledZmanim: ZmanKey[];
  fontOptions: FontOption[];
  boxUnit: 'percent' | 'px';
  onBoxUnit: (unit: 'percent' | 'px') => void;
  refWidth: number;
  refHeight: number;
  pctToPx: (pct: number, axis: 'x' | 'y') => number;
  pxToPct: (px: number, axis: 'x' | 'y') => number;
  patchWidget: (id: string, patch: Partial<CanvasWidget>) => void;
  onPickImage: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  alignSelected: (kind: 'h-center' | 'v-center' | 'right' | 'left' | 'top' | 'bottom') => void;
  onClose: () => void;
  label: string;
}

export function ElementorWidgetPanel({
  selected,
  tab,
  onTab,
  blocks,
  enabledZmanim,
  fontOptions,
  boxUnit,
  onBoxUnit,
  refWidth,
  refHeight,
  pctToPx,
  pxToPct,
  patchWidget,
  onPickImage,
  onDuplicate,
  onRemove,
  onBringFront,
  onSendBack,
  alignSelected,
  onClose,
  label,
}: Props) {
  return (
    <div className="cb-el-panel">
      <div className="cb-el-head">
        <div>
          <strong>{label}</strong>
          <em>עריכת רכיב</em>
        </div>
        <div className="cb-el-head-actions">
          <button type="button" className="btn ghost" onClick={onDuplicate}>
            שכפל
          </button>
          <button type="button" className="btn danger" onClick={onRemove}>
            מחק
          </button>
          <button type="button" className="btn ghost" onClick={onClose} title="סגור">
            ✕
          </button>
        </div>
      </div>

      <div className="cb-el-tabs" role="tablist">
        {(
          [
            ['content', 'תוכן'],
            ['style', 'עיצוב'],
            ['advanced', 'מתקדם'],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => onTab(id)}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="cb-el-body">
        {tab === 'content' ? (
          <>
            <label>
              כותרת מותאמת
              <input
                value={selected.title ?? ''}
                placeholder="ריק = ברירת מחדל"
                onChange={(e) => patchWidget(selected.id, { title: e.target.value })}
              />
            </label>

            {selected.type === 'text' ? (
              <div className="cb-rich-field">
                <div className="cb-label">טקסט חופשי</div>
                <RichTextEditor
                  value={selected.text ?? ''}
                  onChange={(html) => patchWidget(selected.id, { text: html })}
                  onFontSizePx={(px) => patchWidget(selected.id, { fontSizePx: px })}
                  placeholder="כתוב טקסט חופשי עם עיצוב…"
                />
              </div>
            ) : null}

            {selected.type === 'image' ? (
              <div className="mg-field">
                <div className="mg-field-label">תמונה</div>
                <button type="button" className="btn primary" onClick={onPickImage}>
                  בחר מהגלריה / העלה
                </button>
                {selected.imageUrl ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => patchWidget(selected.id, { imageUrl: '' })}
                  >
                    נקה תמונה
                  </button>
                ) : null}
              </div>
            ) : null}

            {selected.type === 'block' ? (
              <label>
                בלוק
                <select
                  value={selected.blockId ?? ''}
                  onChange={(e) => patchWidget(selected.id, { blockId: e.target.value })}
                >
                  <option value="">ראשון פעיל</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {selected.type === 'zman' ? (
              <>
                <label>
                  איזה זמן
                  <select
                    value={selected.zmanKey ?? 'sunrise'}
                    onChange={(e) => {
                      const key = e.target.value as ZmanKey;
                      const def = ZMAN_DEFS.find((d) => d.key === key);
                      patchWidget(selected.id, {
                        zmanKey: key,
                        title: selected.title?.trim() ? selected.title : def?.label,
                      });
                    }}
                  >
                    {(enabledZmanim.length
                      ? ZMAN_DEFS.filter((d) => enabledZmanim.includes(d.key))
                      : ZMAN_DEFS
                    ).map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                    {selected.zmanKey &&
                    !enabledZmanim.includes(selected.zmanKey) &&
                    enabledZmanim.length > 0 ? (
                      <option value={selected.zmanKey}>
                        {ZMAN_DEFS.find((d) => d.key === selected.zmanKey)?.label ??
                          selected.zmanKey}
                      </option>
                    ) : null}
                  </select>
                </label>
                <label>
                  מיקום כותרת
                  <select
                    value={selected.titleLayout ?? 'above'}
                    onChange={(e) =>
                      patchWidget(selected.id, {
                        titleLayout: e.target.value as CanvasWidget['titleLayout'],
                      })
                    }
                  >
                    <option value="above">מעל השעה</option>
                    <option value="below">מתחת לשעה</option>
                    <option value="side">בצד (כותרת | שעה)</option>
                    <option value="side-reverse">בצד הפוך (שעה | כותרת)</option>
                  </select>
                </label>
              </>
            ) : null}

            <label className="check">
              <input
                type="checkbox"
                checked={selected.showTitle}
                onChange={(e) => patchWidget(selected.id, { showTitle: e.target.checked })}
              />
              הצג כותרת
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={selected.visible}
                onChange={(e) => patchWidget(selected.id, { visible: e.target.checked })}
              />
              מוצג במסך
            </label>
          </>
        ) : null}

        {tab === 'style' ? (
          <>
            <div className="cb-el-quick-size">
              <span className="cb-label">גודל מהיר</span>
              <div className="cb-float-group">
                {(['S', 'M', 'L', 'XL'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      patchWidget(selected.id, {
                        fontScale: id === 'S' ? 0.75 : id === 'M' ? 1 : id === 'L' ? 1.35 : 1.8,
                        fontSizePx: undefined,
                      })
                    }
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>

            <label>
              רקע
              <select
                value={selected.bg}
                onChange={(e) => {
                  const bg = e.target.value as CanvasWidget['bg'];
                  patchWidget(selected.id, {
                    bg,
                    showBorder: bg === 'none' || bg === 'ghost' ? false : selected.showBorder,
                    textShadow: bg === 'ghost' ? true : selected.textShadow,
                  });
                }}
              >
                <option value="none">שקוף לגמרי</option>
                <option value="ghost">שקוף עם צל טקסט</option>
                <option value="panel">פאנל זכוכית</option>
                <option value="solid">לבן מלא</option>
                <option value="dark">כהה</option>
              </select>
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={selected.showBorder}
                onChange={(e) => patchWidget(selected.id, { showBorder: e.target.checked })}
              />
              מסגרת
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={selected.textShadow}
                onChange={(e) => patchWidget(selected.id, { textShadow: e.target.checked })}
              />
              צל טקסט
            </label>

            <div className="cb-grid-fields">
              <label>
                צבע תוכן
                <input
                  type="color"
                  value={selected.color ?? '#1c3140'}
                  onChange={(e) => patchWidget(selected.id, { color: e.target.value })}
                />
              </label>
              <label>
                צבע כותרת
                <input
                  type="color"
                  value={selected.titleColor ?? '#a8893d'}
                  onChange={(e) => patchWidget(selected.id, { titleColor: e.target.value })}
                />
              </label>
            </div>

            <label>
              גופן
              <select
                value={selected.fontFamily ?? ''}
                onChange={(e) =>
                  patchWidget(selected.id, {
                    fontFamily: e.target.value || undefined,
                  })
                }
              >
                <option value="">ברירת מחדל של העיצוב</option>
                {fontOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              משקל גופן
              <select
                value={selected.fontWeight ?? 'normal'}
                onChange={(e) =>
                  patchWidget(selected.id, {
                    fontWeight: e.target.value as CanvasWidget['fontWeight'],
                  })
                }
              >
                <option value="normal">רגיל</option>
                <option value="medium">בינוני</option>
                <option value="bold">מודגש</option>
              </select>
            </label>

            <label>
              יישור טקסט
              <select
                value={selected.align}
                onChange={(e) =>
                  patchWidget(selected.id, { align: e.target.value as CanvasWidget['align'] })
                }
              >
                <option value="right">ימין</option>
                <option value="center">מרכז</option>
                <option value="left">שמאל</option>
              </select>
            </label>

            <div className="cb-grid-fields">
              <PxField
                label="גודל פונט"
                value={selected.fontSizePx}
                min={8}
                max={400}
                onChange={(v) => patchWidget(selected.id, { fontSizePx: v })}
              />
              <PxField
                label="גודל כותרת"
                value={selected.titleSizePx}
                min={6}
                max={400}
                onChange={(v) => patchWidget(selected.id, { titleSizePx: v })}
              />
              <PxField
                label="מרווח אותיות"
                value={selected.letterSpacingPx}
                min={-20}
                max={80}
                step={0.5}
                placeholder="0"
                onChange={(v) => patchWidget(selected.id, { letterSpacingPx: v })}
              />
              <PxField
                label="גובה שורה"
                value={selected.lineHeightPx}
                min={4}
                max={400}
                onChange={(v) => patchWidget(selected.id, { lineHeightPx: v })}
              />
              <PxField
                label="ריפוד פנימי"
                value={selected.paddingPx}
                min={0}
                max={200}
                onChange={(v) => patchWidget(selected.id, { paddingPx: v })}
              />
              <PxField
                label="עיגול פינות"
                value={selected.radius}
                min={0}
                max={200}
                placeholder="0"
                onChange={(v) => patchWidget(selected.id, { radius: v ?? 0 })}
              />
            </div>
            <p className="cb-hint">שדה ריק = אוטומטי לפי גודל המסך.</p>

            <label>
              קנה מידה יחסי ({selected.fontScale.toFixed(2)}×)
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={selected.fontScale}
                disabled={Boolean(selected.fontSizePx)}
                onChange={(e) => patchWidget(selected.id, { fontScale: Number(e.target.value) })}
              />
            </label>

            <label>
              גודל כותרת ({(selected.titleScale ?? 0.55).toFixed(2)}×)
              <input
                type="range"
                min={0.3}
                max={1.5}
                step={0.05}
                value={selected.titleScale ?? 0.55}
                disabled={Boolean(selected.titleSizePx)}
                onChange={(e) => patchWidget(selected.id, { titleScale: Number(e.target.value) })}
              />
            </label>

            <label>
              שקיפות ({selected.opacity.toFixed(2)})
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={selected.opacity}
                onChange={(e) => patchWidget(selected.id, { opacity: Number(e.target.value) })}
              />
            </label>
          </>
        ) : null}

        {tab === 'advanced' ? (
          <>
            <div className="cb-align">
              <button type="button" onClick={() => alignSelected('right')}>
                ימין
              </button>
              <button type="button" onClick={() => alignSelected('h-center')}>
                מרכז ↔
              </button>
              <button type="button" onClick={() => alignSelected('left')}>
                שמאל
              </button>
              <button type="button" onClick={() => alignSelected('top')}>
                למעלה
              </button>
              <button type="button" onClick={() => alignSelected('v-center')}>
                מרכז ↕
              </button>
              <button type="button" onClick={() => alignSelected('bottom')}>
                למטה
              </button>
            </div>

            <div className="cb-unit-switch">
              <span>יחידות מיקום</span>
              <div className="cb-unit-buttons">
                <button
                  type="button"
                  className={boxUnit === 'px' ? 'on' : ''}
                  onClick={() => onBoxUnit('px')}
                >
                  px
                </button>
                <button
                  type="button"
                  className={boxUnit === 'percent' ? 'on' : ''}
                  onClick={() => onBoxUnit('percent')}
                >
                  %
                </button>
              </div>
            </div>

            <div className="cb-grid-fields">
              <label>
                X {boxUnit === 'px' ? 'px' : '%'}
                <input
                  type="number"
                  dir="ltr"
                  value={
                    boxUnit === 'px'
                      ? pctToPx(selected.x, 'x')
                      : Math.round(selected.x * 10) / 10
                  }
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    patchWidget(selected.id, { x: boxUnit === 'px' ? pxToPct(n, 'x') : n });
                  }}
                />
              </label>
              <label>
                Y {boxUnit === 'px' ? 'px' : '%'}
                <input
                  type="number"
                  dir="ltr"
                  value={
                    boxUnit === 'px'
                      ? pctToPx(selected.y, 'y')
                      : Math.round(selected.y * 10) / 10
                  }
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    patchWidget(selected.id, { y: boxUnit === 'px' ? pxToPct(n, 'y') : n });
                  }}
                />
              </label>
              <label>
                רוחב {boxUnit === 'px' ? 'px' : '%'}
                <input
                  type="number"
                  dir="ltr"
                  value={
                    boxUnit === 'px'
                      ? pctToPx(selected.w, 'x')
                      : Math.round(selected.w * 10) / 10
                  }
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    patchWidget(selected.id, { w: boxUnit === 'px' ? pxToPct(n, 'x') : n });
                  }}
                />
              </label>
              <label>
                גובה {boxUnit === 'px' ? 'px' : '%'}
                <input
                  type="number"
                  dir="ltr"
                  value={
                    boxUnit === 'px'
                      ? pctToPx(selected.h, 'y')
                      : Math.round(selected.h * 10) / 10
                  }
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    patchWidget(selected.id, { h: boxUnit === 'px' ? pxToPct(n, 'y') : n });
                  }}
                />
              </label>
            </div>
            {boxUnit === 'px' ? (
              <p className="cb-hint">
                פיקסלים ביחס למסך {refWidth}×{refHeight} — מותאם אוטומטית לכל גודל מסך.
              </p>
            ) : null}

            <div className="cb-row-actions">
              <button type="button" className="btn ghost" onClick={onBringFront}>
                הבא לחזית
              </button>
              <button type="button" className="btn ghost" onClick={onSendBack}>
                שלח לרקע
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
