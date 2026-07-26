import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CanvasLayoutConfig,
  CanvasWidget,
  CanvasWidgetType,
  CustomFont,
  GalleryItem,
  ScheduleBlock,
  ZmanKey,
} from '../../types';
import { ZMAN_DEFS } from '../../data/zmanim';
import { fontSelectOptions } from '../../lib/customFonts';
import { MediaGalleryModal } from '../MediaPicker';
import { RichTextEditor } from '../RichTextEditor';
import { CanvasWidgetContent, type CanvasData } from './CanvasWidgetContent';
import { widgetStyle } from './CanvasStage';
import {
  ASPECT_RATIOS,
  WIDGET_LABELS,
  clamp,
  createWidget,
  createZmanWidgets,
  defaultCanvas,
  snap,
} from './widgets';
import './canvas.css';
import './builder.css';

interface Props {
  canvas: CanvasLayoutConfig;
  data: CanvasData;
  blocks: ScheduleBlock[];
  enabledZmanim?: ZmanKey[];
  synagogueId: string;
  gallery: GalleryItem[];
  customFonts?: CustomFont[];
  onChange: (canvas: CanvasLayoutConfig) => void;
  onGalleryChange: (gallery: GalleryItem[]) => void;
  onStatus?: (msg: string) => void;
  /** Called when a drag/resize gesture ends — useful for undo checkpoints */
  onInteractionEnd?: () => void;
}

type DragMode = 'move' | 'resize';
type PickerTarget = { kind: 'background' } | { kind: 'widget'; id: string };

interface DragState {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
  stage: DOMRect;
}

const PALETTE: CanvasWidgetType[] = [
  'title',
  'logo',
  'clock',
  'hebrewDate',
  'zman',
  'zmanim',
  'block',
  'announcements',
  'parasha',
  'dafYomi',
  'weather',
  'yahrzeit',
  'calendar',
  'countdown',
  'text',
  'image',
];

export function CanvasBuilder({
  canvas,
  data,
  blocks,
  enabledZmanim = [],
  synagogueId,
  gallery,
  customFonts = [],
  onChange,
  onGalleryChange,
  onStatus,
  onInteractionEnd,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const fontOptions = fontSelectOptions(customFonts);

  const selected = canvas.widgets.find((w) => w.id === selectedId) ?? null;

  const patchWidget = useCallback(
    (id: string, patch: Partial<CanvasWidget>) => {
      onChange({
        ...canvas,
        widgets: canvas.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      });
    },
    [canvas, onChange],
  );

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dxPct = ((e.clientX - drag.startX) / drag.stage.width) * 100;
      const dyPct = ((e.clientY - drag.startY) / drag.stage.height) * 100;
      const grid = e.altKey ? 0 : canvas.gridSize;

      if (drag.mode === 'move') {
        patchWidget(drag.id, {
          x: clamp(snap(drag.origin.x + dxPct, grid), -10, 100),
          y: clamp(snap(drag.origin.y + dyPct, grid), -10, 100),
        });
      } else {
        patchWidget(drag.id, {
          w: clamp(snap(drag.origin.w + dxPct, grid), 5, 110),
          h: clamp(snap(drag.origin.h + dyPct, grid), 4, 110),
        });
      }
    }

    function onUp() {
      dragRef.current = null;
      setDragging(false);
      onInteractionEnd?.();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, canvas.gridSize, patchWidget, onInteractionEnd]);

  function startDrag(e: React.PointerEvent, widget: CanvasWidget, mode: DragMode) {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(widget.id);
    dragRef.current = {
      id: widget.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
      stage,
    };
    setDragging(true);
  }

  function onStageKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const step = e.shiftKey ? 5 : canvas.gridSize || 1;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key]!;
      patchWidget(selected.id, {
        x: clamp(selected.x + dx, -10, 100),
        y: clamp(selected.y + dy, -10, 100),
      });
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeWidget(selected.id);
    }
  }

  function addWidget(type: CanvasWidgetType) {
    const maxZ = canvas.widgets.reduce((m, w) => Math.max(m, w.z), 0);
    const widget = createWidget(type, maxZ + 1);
    if (type === 'block') widget.blockId = blocks[0]?.id;
    if (type === 'zman') {
      widget.zmanKey = (enabledZmanim[0] as ZmanKey) || 'sunrise';
      const def = ZMAN_DEFS.find((d) => d.key === widget.zmanKey);
      if (def) widget.title = def.label;
    }
    onChange({ ...canvas, widgets: [...canvas.widgets, widget] });
    setSelectedId(widget.id);
    onStatus?.(`נוסף ווידג׳ט: ${WIDGET_LABELS[type]}`);
  }

  function explodeZmanim() {
    const keys =
      enabledZmanim.length > 0
        ? enabledZmanim
        : (ZMAN_DEFS.slice(0, 6).map((d) => d.key) as ZmanKey[]);
    const maxZ = canvas.widgets.reduce((m, w) => Math.max(m, w.z), 0);
    const created = createZmanWidgets(keys, maxZ + 1);
    const withoutList = canvas.widgets.filter((w) => w.type !== 'zmanim' && w.type !== 'zman');
    onChange({ ...canvas, widgets: [...withoutList, ...created] });
    setSelectedId(created[0]?.id ?? null);
    onStatus?.(`פוצלו ${created.length} זמנים לבלוקים נפרדים`);
  }

  function removeWidget(id: string) {
    onChange({ ...canvas, widgets: canvas.widgets.filter((w) => w.id !== id) });
    setSelectedId(null);
    setMenu(null);
  }

  function duplicateWidget(widget: CanvasWidget) {
    const maxZ = canvas.widgets.reduce((m, w) => Math.max(m, w.z), 0);
    const copy: CanvasWidget = {
      ...widget,
      id: `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      x: clamp(widget.x + 3, -10, 100),
      y: clamp(widget.y + 3, -10, 100),
      z: maxZ + 1,
    };
    onChange({ ...canvas, widgets: [...canvas.widgets, copy] });
    setSelectedId(copy.id);
  }

  function bringToFront(id: string) {
    const maxZ = canvas.widgets.reduce((m, w) => Math.max(m, w.z), 0);
    patchWidget(id, { z: maxZ + 1 });
  }

  function sendToBack(id: string) {
    const minZ = canvas.widgets.reduce((m, w) => Math.min(m, w.z), 0);
    patchWidget(id, { z: minZ - 1 });
  }

  function openMenu(e: React.MouseEvent, widget: CanvasWidget) {
    e.preventDefault();
    e.stopPropagation();
    const stage = stageRef.current?.getBoundingClientRect();
    setSelectedId(widget.id);
    setMenu({
      id: widget.id,
      x: e.clientX - (stage?.left ?? 0),
      y: e.clientY - (stage?.top ?? 0),
    });
  }

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const menuWidget = menu ? canvas.widgets.find((w) => w.id === menu.id) ?? null : null;

  function alignSelected(kind: 'h-center' | 'v-center' | 'right' | 'left' | 'top' | 'bottom') {
    if (!selected) return;
    const patch: Partial<CanvasWidget> = {};
    if (kind === 'h-center') patch.x = (100 - selected.w) / 2;
    if (kind === 'v-center') patch.y = (100 - selected.h) / 2;
    if (kind === 'right') patch.x = 100 - selected.w - 2;
    if (kind === 'left') patch.x = 2;
    if (kind === 'top') patch.y = 2;
    if (kind === 'bottom') patch.y = 100 - selected.h - 2;
    patchWidget(selected.id, patch);
  }

  function onPickMedia(url: string) {
    if (!picker) return;
    // Gallery already updated by MediaGalleryModal via onGalleryChange
    if (picker.kind === 'background') {
      onChange({ ...canvas, backgroundUrl: url });
    } else {
      patchWidget(picker.id, { imageUrl: url });
    }
    setPicker(null);
  }

  const ratio = ASPECT_RATIOS[canvas.aspect] ?? 16 / 9;

  return (
    <div className="canvas-builder">
      <div className="cb-toolbar">
        <div className="cb-palette">
          <span className="cb-label">הוסף:</span>
          {PALETTE.map((type) => (
            <button key={type} type="button" className="cb-chip" onClick={() => addWidget(type)}>
              + {WIDGET_LABELS[type]}
            </button>
          ))}
          <button type="button" className="cb-chip accent" onClick={explodeZmanim}>
            פצל זמנים לבלוקים
          </button>
        </div>

        <div className="cb-stage-settings">
          <label>
            יחס מסך
            <select
              value={canvas.aspect}
              onChange={(e) =>
                onChange({ ...canvas, aspect: e.target.value as CanvasLayoutConfig['aspect'] })
              }
            >
              <option value="16:9">16:9</option>
              <option value="16:10">16:10</option>
              <option value="4:3">4:3</option>
              <option value="21:9">21:9</option>
            </select>
          </label>
          <label>
            רשת הצמדה
            <select
              value={canvas.gridSize}
              onChange={(e) => onChange({ ...canvas, gridSize: Number(e.target.value) })}
            >
              <option value={0}>ללא</option>
              <option value={0.5}>0.5%</option>
              <option value={1}>1%</option>
              <option value={2}>2%</option>
              <option value={5}>5%</option>
            </select>
          </label>
          <label>
            כהות רקע ({canvas.overlayOpacity.toFixed(2)})
            <input
              type="range"
              min={0}
              max={0.85}
              step={0.05}
              value={canvas.overlayOpacity}
              onChange={(e) => onChange({ ...canvas, overlayOpacity: Number(e.target.value) })}
            />
          </label>
          <label>
            התאמת רקע
            <select
              value={canvas.backgroundFit}
              onChange={(e) =>
                onChange({
                  ...canvas,
                  backgroundFit: e.target.value as CanvasLayoutConfig['backgroundFit'],
                })
              }
            >
              <option value="cover">מילוי</option>
              <option value="contain">התאמה מלאה</option>
            </select>
          </label>
          <div className="cb-stage-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setPicker({ kind: 'background' })}
            >
              רקע מהגלריה / העלה
            </button>
            {canvas.backgroundUrl ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => onChange({ ...canvas, backgroundUrl: '' })}
              >
                הסר רקע
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                onChange(defaultCanvas());
                setSelectedId(null);
                onStatus?.('הפריסה אופסה לברירת מחדל');
              }}
            >
              אפס פריסה
            </button>
          </div>
        </div>
      </div>

      <div className="cb-workspace">
        <div
          ref={stageRef}
          className={`canvas-stage cb-stage ${dragging ? 'is-dragging' : ''}`}
          style={{
            aspectRatio: String(ratio),
            ['--cv-overlay' as string]: String(canvas.overlayOpacity),
            ...(canvas.backgroundUrl
              ? {
                  backgroundImage: `url(${canvas.backgroundUrl})`,
                  backgroundSize: canvas.backgroundFit,
                }
              : {}),
          }}
          dir="rtl"
          tabIndex={0}
          onKeyDown={onStageKeyDown}
          onPointerDown={() => setSelectedId(null)}
        >
          {canvas.backgroundUrl && canvas.overlayOpacity > 0 ? (
            <div className="canvas-overlay" />
          ) : null}

          {canvas.gridSize > 0 ? <div className="cb-grid" /> : null}

          {canvas.widgets.map((w) => (
            <div
              key={w.id}
              className={`canvas-widget bg-${w.bg} ${w.showBorder ? 'has-border' : 'no-border'} ${
                w.textShadow ? 'has-shadow' : ''
              } cb-widget ${selectedId === w.id ? 'selected' : ''} ${
                w.visible ? '' : 'hidden-widget'
              }`}
              style={widgetStyle(w)}
              onPointerDown={(e) => startDrag(e, w, 'move')}
              onContextMenu={(e) => openMenu(e, w)}
            >
              <CanvasWidgetContent widget={w} data={data} placeholder />
              <span className="cb-tag">{WIDGET_LABELS[w.type]}</span>
              <span
                className="cb-resize"
                onPointerDown={(e) => startDrag(e, w, 'resize')}
                role="presentation"
              />
            </div>
          ))}

          {menu && menuWidget ? (
            <div
              className="cb-context-menu"
              style={{ left: menu.x, top: menu.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="cb-context-title">{WIDGET_LABELS[menuWidget.type]}</div>
              <button type="button" onClick={() => { setSelectedId(menuWidget.id); setMenu(null); }}>
                ערוך מאפיינים
              </button>
              <button type="button" onClick={() => { duplicateWidget(menuWidget); setMenu(null); }}>
                שכפל
              </button>
              <button
                type="button"
                onClick={() => { patchWidget(menuWidget.id, { visible: !menuWidget.visible }); setMenu(null); }}
              >
                {menuWidget.visible ? 'הסתר' : 'הצג'}
              </button>
              <button type="button" onClick={() => { bringToFront(menuWidget.id); setMenu(null); }}>
                הבא לחזית
              </button>
              <button type="button" onClick={() => { sendToBack(menuWidget.id); setMenu(null); }}>
                שלח לרקע
              </button>
              {menuWidget.showTitle !== undefined ? (
                <button
                  type="button"
                  onClick={() => { patchWidget(menuWidget.id, { showTitle: !menuWidget.showTitle }); setMenu(null); }}
                >
                  {menuWidget.showTitle ? 'הסתר כותרת' : 'הצג כותרת'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => { patchWidget(menuWidget.id, { bg: 'none', showBorder: false }); setMenu(null); }}
              >
                רקע שקוף ללא מסגרת
              </button>
              <div className="cb-context-sep" />
              <button type="button" className="danger" onClick={() => removeWidget(menuWidget.id)}>
                מחק אלמנט
              </button>
            </div>
          ) : null}
        </div>

        <aside className="cb-inspector">
          {selected ? (
            <>
              <div className="cb-inspector-head">
                <h3>{WIDGET_LABELS[selected.type]}</h3>
                <div className="cb-row-actions">
                  <button type="button" className="btn ghost" onClick={() => duplicateWidget(selected)}>
                    שכפל
                  </button>
                  <button type="button" className="btn danger" onClick={() => removeWidget(selected.id)}>
                    מחק
                  </button>
                </div>
              </div>

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

              <div className="cb-grid-fields">
                <label>
                  X %
                  <input
                    type="number"
                    value={Math.round(selected.x * 10) / 10}
                    onChange={(e) => patchWidget(selected.id, { x: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Y %
                  <input
                    type="number"
                    value={Math.round(selected.y * 10) / 10}
                    onChange={(e) => patchWidget(selected.id, { y: Number(e.target.value) })}
                  />
                </label>
                <label>
                  רוחב %
                  <input
                    type="number"
                    value={Math.round(selected.w * 10) / 10}
                    onChange={(e) => patchWidget(selected.id, { w: Number(e.target.value) })}
                  />
                </label>
                <label>
                  גובה %
                  <input
                    type="number"
                    value={Math.round(selected.h * 10) / 10}
                    onChange={(e) => patchWidget(selected.id, { h: Number(e.target.value) })}
                  />
                </label>
              </div>

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
                  <div className="cb-label">טקסט חופשי — עיצוב</div>
                  <RichTextEditor
                    value={selected.text ?? ''}
                    onChange={(html) => patchWidget(selected.id, { text: html })}
                    placeholder="כתוב טקסט חופשי עם עיצוב…"
                  />
                </div>
              ) : null}

              {selected.type === 'image' ? (
                <div className="mg-field">
                  <div className="mg-field-label">תמונה</div>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => setPicker({ kind: 'widget', id: selected.id })}
                  >
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
                  <option value="none">שקוף לגמרי (בלי מסגרת)</option>
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
                צל טקסט (לקריאות על רקע)
              </label>

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
                גודל פונט (px)
                <input
                  type="number"
                  min={8}
                  max={200}
                  step={1}
                  placeholder="אוטומטי"
                  value={selected.fontSizePx ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      patchWidget(selected.id, { fontSizePx: undefined });
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return;
                    patchWidget(selected.id, {
                      fontSizePx: Math.min(200, Math.max(8, Math.round(n))),
                    });
                  }}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </label>

              <label>
                מרווח בין אותיות (px)
                <input
                  type="number"
                  min={-5}
                  max={40}
                  step={0.5}
                  placeholder="0"
                  value={selected.letterSpacingPx ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      patchWidget(selected.id, { letterSpacingPx: undefined });
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return;
                    patchWidget(selected.id, {
                      letterSpacingPx: Math.min(40, Math.max(-5, n)),
                    });
                  }}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
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

              <label>
                עיגול פינות ({selected.radius}px)
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={selected.radius}
                  onChange={(e) => patchWidget(selected.id, { radius: Number(e.target.value) })}
                />
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

              <div className="cb-row-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() =>
                    patchWidget(selected.id, {
                      z: canvas.widgets.reduce((m, w) => Math.max(m, w.z), 0) + 1,
                    })
                  }
                >
                  הבא לחזית
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => patchWidget(selected.id, { z: 0 })}
                >
                  שלח לרקע
                </button>
              </div>
            </>
          ) : (
            <div className="cb-empty-inspector">
              <h3>בונה המסך</h3>
              <p>לחץ על ווידג׳ט כדי לערוך, גרור להזזה, ופינה שמאלית תחתונה לשינוי גודל.</p>
              <ul>
                <li>חיצים — הזזה מדויקת</li>
                <li>Shift + חיצים — קפיצה של 5%</li>
                <li>Alt בזמן גרירה — בלי הצמדה לרשת</li>
                <li>קליק ימני — תפריט מחיקה ואפשרויות</li>
                <li>Delete — מחיקת ווידג׳ט</li>
              </ul>
              <p className="cb-note">
                כדי שהמסך יציג את הפריסה — בחר בלשונית «עיצוב» מבנה מסך «בונה חופשי».
              </p>
            </div>
          )}
        </aside>
      </div>

      <ul className="cb-layers">
        {[...canvas.widgets]
          .sort((a, b) => b.z - a.z)
          .map((w) => (
            <li key={w.id} className={selectedId === w.id ? 'on' : ''}>
              <button type="button" onClick={() => setSelectedId(w.id)}>
                {WIDGET_LABELS[w.type]}
                {w.type === 'zman' && w.zmanKey
                  ? ` — ${w.title || ZMAN_DEFS.find((d) => d.key === w.zmanKey)?.label || w.zmanKey}`
                  : w.title
                    ? ` — ${w.title}`
                    : ''}
              </button>
              <button
                type="button"
                className="cb-eye"
                onClick={() => patchWidget(w.id, { visible: !w.visible })}
                title={w.visible ? 'הסתר' : 'הצג'}
              >
                {w.visible ? 'מוצג' : 'מוסתר'}
              </button>
            </li>
          ))}
      </ul>

      <MediaGalleryModal
        open={Boolean(picker)}
        title={picker?.kind === 'widget' ? 'תמונת ווידג׳ט' : 'רקע המסך'}
        synagogueId={synagogueId}
        gallery={gallery}
        kind="image"
        currentUrl={
          picker?.kind === 'background'
            ? canvas.backgroundUrl
            : picker?.kind === 'widget'
              ? canvas.widgets.find((w) => w.id === picker.id)?.imageUrl
              : undefined
        }
        onClose={() => setPicker(null)}
        onSelect={onPickMedia}
        onGalleryChange={onGalleryChange}
        onStatus={onStatus}
      />
    </div>
  );
}
