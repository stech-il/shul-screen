import type { CanvasHtmlTag, CanvasWidget, ScheduleBlock, ZmanKey } from '../../types';
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
    <label className="cb-el-field">
      <span>{label}</span>
      <div className="cb-el-field-ctrl">
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
        <em>px</em>
      </div>
    </label>
  );
}

function AlignGroup({
  value,
  onChange,
}: {
  value: CanvasWidget['align'];
  onChange: (v: CanvasWidget['align']) => void;
}) {
  return (
    <div className="cb-el-align" role="group" aria-label="יישור">
      {(
        [
          ['right', 'ימין'],
          ['center', 'מרכז'],
          ['left', 'שמאל'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={value === id ? 'on' : ''}
          title={label}
          onClick={() => onChange(id)}
        >
          {id === 'right' ? '▤' : id === 'center' ? '▦' : '▥'}
        </button>
      ))}
    </div>
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
  const id = selected.id;
  const patch = (p: Partial<CanvasWidget>) => patchWidget(id, p);

  return (
    <div className="cb-el-panel">
      <div className="cb-el-head">
        <button type="button" className="cb-el-back" onClick={onClose} title="חזרה לרכיבים">
          ←
        </button>
        <div className="cb-el-head-title">
          <strong>עריכת {label}</strong>
        </div>
        <div className="cb-el-head-actions">
          <button type="button" className="btn ghost" onClick={onDuplicate} title="שכפול">
            ⎘
          </button>
          <button type="button" className="btn danger" onClick={onRemove} title="מחיקה">
            ✕
          </button>
        </div>
      </div>

      <div className="cb-el-tabs" role="tablist">
        {(
          [
            ['content', 'תוכן', '✎'],
            ['style', 'סגנון', '◐'],
            ['advanced', 'מתקדם', '⚙'],
          ] as const
        ).map(([tid, text, icon]) => (
          <button
            key={tid}
            type="button"
            role="tab"
            aria-selected={tab === tid}
            className={tab === tid ? 'on' : ''}
            onClick={() => onTab(tid)}
          >
            <span aria-hidden>{icon}</span>
            {text}
          </button>
        ))}
      </div>

      <div className="cb-el-body">
        {tab === 'content' ? (
          <>
            <details className="cb-sec" open>
              <summary>{label}</summary>
              <div className="cb-sec-body">
                {selected.type === 'heading' ? (
                  <>
                    <label className="cb-el-field">
                      <span>כותרת</span>
                      <textarea
                        rows={3}
                        value={selected.text ?? selected.title ?? ''}
                        placeholder="כתבו את הכותרת כאן"
                        onChange={(e) => patch({ text: e.target.value, title: e.target.value })}
                      />
                    </label>
                    <label className="cb-el-field">
                      <span>קישור</span>
                      <input
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        value={selected.linkUrl ?? ''}
                        placeholder="https://…"
                        onChange={(e) => patch({ linkUrl: e.target.value || undefined })}
                      />
                    </label>
                    <label className="cb-el-field">
                      <span>תגית HTML</span>
                      <select
                        value={selected.htmlTag ?? 'h2'}
                        onChange={(e) => patch({ htmlTag: e.target.value as CanvasHtmlTag })}
                      >
                        {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'] as const).map((t) => (
                          <option key={t} value={t}>
                            {t.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                {selected.type === 'text' ? (
                  <div className="cb-rich-field">
                    <div className="cb-label">תוכן</div>
                    <RichTextEditor
                      value={selected.text ?? ''}
                      onChange={(html) => patch({ text: html })}
                      onFontSizePx={(px) => patch({ fontSizePx: px })}
                      placeholder="כתבו טקסט…"
                    />
                  </div>
                ) : null}

                {selected.type === 'button' ? (
                  <>
                    <label className="cb-el-field">
                      <span>טקסט הכפתור</span>
                      <input
                        value={selected.buttonLabel ?? ''}
                        placeholder="לחצו כאן"
                        onChange={(e) => patch({ buttonLabel: e.target.value })}
                      />
                    </label>
                    <label className="cb-el-field">
                      <span>קישור</span>
                      <input
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        value={selected.linkUrl ?? ''}
                        placeholder="https://…"
                        onChange={(e) => patch({ linkUrl: e.target.value || undefined })}
                      />
                    </label>
                  </>
                ) : null}

                {selected.type === 'video' ? (
                  <label className="cb-el-field">
                    <span>קישור וידאו</span>
                    <input
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                      value={selected.videoUrl ?? ''}
                      placeholder="YouTube או קובץ MP4…"
                      onChange={(e) => patch({ videoUrl: e.target.value || undefined })}
                    />
                  </label>
                ) : null}

                {selected.type === 'image' ? (
                  <div className="mg-field">
                    <div className="mg-field-label">תמונה</div>
                    <button type="button" className="btn primary" onClick={onPickImage}>
                      בחירה מהגלריה / העלאה
                    </button>
                    {selected.imageUrl ? (
                      <button type="button" className="btn ghost" onClick={() => patch({ imageUrl: '' })}>
                        הסרת תמונה
                      </button>
                    ) : null}
                    <label className="cb-el-field">
                      <span>קישור (אופציונלי)</span>
                      <input
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        value={selected.linkUrl ?? ''}
                        placeholder="https://…"
                        onChange={(e) => patch({ linkUrl: e.target.value || undefined })}
                      />
                    </label>
                  </div>
                ) : null}

                {selected.type === 'divider' ? (
                  <p className="cb-hint">מפריד אופקי — עצבו צבע ועובי בלשונית סגנון.</p>
                ) : null}

                {selected.type !== 'heading' &&
                selected.type !== 'text' &&
                selected.type !== 'button' &&
                selected.type !== 'video' &&
                selected.type !== 'image' &&
                selected.type !== 'divider' ? (
                  <label className="cb-el-field">
                    <span>כותרת מותאמת</span>
                    <input
                      value={selected.title ?? ''}
                      placeholder="ריק = ברירת מחדל"
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </label>
                ) : null}

                {selected.type === 'block' ? (
                  <label className="cb-el-field">
                    <span>בלוק תפילות</span>
                    <select
                      value={selected.blockId ?? ''}
                      onChange={(e) => patch({ blockId: e.target.value })}
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
                    <label className="cb-el-field">
                      <span>איזה זמן</span>
                      <select
                        value={selected.zmanKey ?? 'sunrise'}
                        onChange={(e) => {
                          const key = e.target.value as ZmanKey;
                          const def = ZMAN_DEFS.find((d) => d.key === key);
                          patch({
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
                      </select>
                    </label>
                    <label className="cb-el-field">
                      <span>מיקום כותרת</span>
                      <select
                        value={selected.titleLayout ?? 'above'}
                        onChange={(e) =>
                          patch({
                            titleLayout: e.target.value as CanvasWidget['titleLayout'],
                          })
                        }
                      >
                        <option value="above">מעל השעה</option>
                        <option value="below">מתחת לשעה</option>
                        <option value="side">בצד</option>
                        <option value="side-reverse">בצד הפוך</option>
                      </select>
                    </label>
                  </>
                ) : null}

                {selected.type !== 'heading' &&
                selected.type !== 'text' &&
                selected.type !== 'button' &&
                selected.type !== 'divider' &&
                selected.type !== 'video' &&
                selected.type !== 'image' ? (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selected.showTitle}
                      onChange={(e) => patch({ showTitle: e.target.checked })}
                    />
                    הצגת כותרת
                  </label>
                ) : null}

                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.visible}
                    onChange={(e) => patch({ visible: e.target.checked })}
                  />
                  מוצג במסך
                </label>
              </div>
            </details>
          </>
        ) : null}

        {tab === 'style' ? (
          <>
            <details className="cb-sec" open>
              <summary>טיפוגרפיה וצבע</summary>
              <div className="cb-sec-body">
                <div className="cb-el-field">
                  <span>יישור</span>
                  <AlignGroup value={selected.align} onChange={(align) => patch({ align })} />
                </div>

                <label className="cb-el-field">
                  <span>גופן</span>
                  <select
                    value={selected.fontFamily ?? ''}
                    onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
                  >
                    <option value="">ברירת מחדל</option>
                    {fontOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cb-el-field">
                  <span>משקל</span>
                  <select
                    value={selected.fontWeight ?? 'normal'}
                    onChange={(e) =>
                      patch({ fontWeight: e.target.value as CanvasWidget['fontWeight'] })
                    }
                  >
                    <option value="normal">רגיל</option>
                    <option value="medium">בינוני</option>
                    <option value="bold">מודגש</option>
                  </select>
                </label>

                <div className="cb-grid-fields">
                  <label className="cb-el-field">
                    <span>צבע</span>
                    <input
                      type="color"
                      value={selected.color ?? '#1c3140'}
                      onChange={(e) => patch({ color: e.target.value })}
                    />
                  </label>
                  <label className="cb-el-field">
                    <span>צבע כותרת</span>
                    <input
                      type="color"
                      value={selected.titleColor ?? '#a8893d'}
                      onChange={(e) => patch({ titleColor: e.target.value })}
                    />
                  </label>
                </div>

                <div className="cb-grid-fields">
                  <PxField
                    label="גודל פונט"
                    value={selected.fontSizePx}
                    min={8}
                    max={400}
                    onChange={(v) => patch({ fontSizePx: v })}
                  />
                  <PxField
                    label="גובה שורה"
                    value={selected.lineHeightPx}
                    min={4}
                    max={400}
                    onChange={(v) => patch({ lineHeightPx: v })}
                  />
                  <PxField
                    label="מרווח אותיות"
                    value={selected.letterSpacingPx}
                    min={-20}
                    max={80}
                    step={0.5}
                    placeholder="0"
                    onChange={(v) => patch({ letterSpacingPx: v })}
                  />
                  <PxField
                    label="גודל כותרת"
                    value={selected.titleSizePx}
                    min={6}
                    max={400}
                    onChange={(v) => patch({ titleSizePx: v })}
                  />
                </div>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.textShadow}
                    onChange={(e) => patch({ textShadow: e.target.checked })}
                  />
                  הצללת טקסט
                </label>
              </div>
            </details>

            <details className="cb-sec" open>
              <summary>רקע ומסגרת</summary>
              <div className="cb-sec-body">
                <label className="cb-el-field">
                  <span>רקע</span>
                  <select
                    value={selected.bg}
                    onChange={(e) => {
                      const bg = e.target.value as CanvasWidget['bg'];
                      patch({
                        bg,
                        showBorder:
                          bg === 'none' || bg === 'ghost' ? false : selected.showBorder,
                        textShadow: bg === 'ghost' ? true : selected.textShadow,
                      });
                    }}
                  >
                    <option value="none">שקוף</option>
                    <option value="ghost">שקוף + צל</option>
                    <option value="panel">זכוכית</option>
                    <option value="solid">לבן</option>
                    <option value="dark">כהה</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.showBorder}
                    onChange={(e) => patch({ showBorder: e.target.checked })}
                  />
                  מסגרת
                </label>
                <PxField
                  label="עיגול פינות"
                  value={selected.radius}
                  min={0}
                  max={200}
                  placeholder="0"
                  onChange={(v) => patch({ radius: v ?? 0 })}
                />
                <PxField
                  label="ריפוד פנימי"
                  value={selected.paddingPx}
                  min={0}
                  max={200}
                  onChange={(v) => patch({ paddingPx: v })}
                />
                <label className="cb-el-field">
                  <span>שקיפות ({selected.opacity.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={selected.opacity}
                    onChange={(e) => patch({ opacity: Number(e.target.value) })}
                  />
                </label>
              </div>
            </details>
          </>
        ) : null}

        {tab === 'advanced' ? (
          <>
            <details className="cb-sec" open>
              <summary>פריסה</summary>
              <div className="cb-sec-body">
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
                  <span>יחידות</span>
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
                  {(
                    [
                      ['x', 'X', 'x'],
                      ['y', 'Y', 'y'],
                      ['w', 'רוחב', 'x'],
                      ['h', 'גובה', 'y'],
                    ] as const
                  ).map(([key, lab, axis]) => (
                    <label key={key} className="cb-el-field">
                      <span>
                        {lab} {boxUnit === 'px' ? 'px' : '%'}
                      </span>
                      <input
                        type="number"
                        dir="ltr"
                        value={
                          boxUnit === 'px'
                            ? pctToPx(selected[key], axis)
                            : Math.round(selected[key] * 10) / 10
                        }
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          patch({ [key]: boxUnit === 'px' ? pxToPct(n, axis) : n });
                        }}
                      />
                    </label>
                  ))}
                </div>
                {boxUnit === 'px' ? (
                  <p className="cb-hint">
                    יחסית למסך {refWidth}×{refHeight}
                  </p>
                ) : null}
              </div>
            </details>

            <details className="cb-sec">
              <summary>שכבות</summary>
              <div className="cb-sec-body">
                <div className="cb-row-actions">
                  <button type="button" className="btn ghost" onClick={onBringFront}>
                    לחזית
                  </button>
                  <button type="button" className="btn ghost" onClick={onSendBack}>
                    לרקע
                  </button>
                </div>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </div>
  );
}
