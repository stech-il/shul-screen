import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  CanvasLayoutConfig,
  CanvasWidget,
  CanvasWidgetType,
  CustomFont,
  GalleryItem,
  ScheduleBlock,
  ZmanKey,
} from '../../types';
import { CANVAS_REF_WIDTH } from '../../types';
import { ZMAN_DEFS } from '../../data/zmanim';
import { fontSelectOptions } from '../../lib/customFonts';
import { useI18n } from '../../i18n';
import { useAppNotice } from '../AppNotice';
import { MediaGalleryModal } from '../MediaPicker';
import { CanvasWidgetContent, type CanvasData } from './CanvasWidgetContent';
import { ElementorWidgetPanel, type ElementorTab } from './ElementorWidgetPanel';
import { LayersPanel } from './LayersPanel';
import { WidgetPalette } from './WidgetPalette';
import { widgetStyle } from './CanvasStage';
import {
  ASPECT_RATIOS,
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

const SIZE_PRESETS = [
  { id: 'S', fontScale: 0.75, boxMult: 0.72 },
  { id: 'M', fontScale: 1, boxMult: 1 },
  { id: 'L', fontScale: 1.35, boxMult: 1.28 },
  { id: 'XL', fontScale: 1.8, boxMult: 1.55 },
] as const;

type SizePresetId = (typeof SIZE_PRESETS)[number]['id'];

const BOX_SIZE_TYPES: CanvasWidgetType[] = ['image', 'logo', 'video'];

function detectSizePreset(w: CanvasWidget): SizePresetId | null {
  if (BOX_SIZE_TYPES.includes(w.type)) {
    const m = detectNearestBoxMult(w);
    let best: SizePresetId = 'M';
    let bestDiff = Infinity;
    for (const p of SIZE_PRESETS) {
      const d = Math.abs(p.boxMult - m);
      if (d < bestDiff) {
        bestDiff = d;
        best = p.id;
      }
    }
    return bestDiff <= 0.15 ? best : null;
  }
  if (w.fontSizePx != null) return null;
  let best: SizePresetId = 'M';
  let bestDiff = Infinity;
  for (const p of SIZE_PRESETS) {
    const d = Math.abs(p.fontScale - w.fontScale);
    if (d < bestDiff) {
      bestDiff = d;
      best = p.id;
    }
  }
  return bestDiff <= 0.12 ? best : null;
}

function sizePresetPatch(w: CanvasWidget, presetId: SizePresetId): Partial<CanvasWidget> {
  const preset = SIZE_PRESETS.find((p) => p.id === presetId)!;
  if (BOX_SIZE_TYPES.includes(w.type)) {
    const baseW = w.w / (detectNearestBoxMult(w) || 1);
    const baseH = w.h / (detectNearestBoxMult(w) || 1);
    return {
      w: clamp(baseW * preset.boxMult, 5, 110),
      h: clamp(baseH * preset.boxMult, 4, 110),
    };
  }
  return { fontScale: preset.fontScale, fontSizePx: undefined };
}

function detectNearestBoxMult(w: CanvasWidget): number {
  const defaults: Partial<Record<CanvasWidgetType, { w: number; h: number }>> = {
    image: { w: 24, h: 24 },
    logo: { w: 12, h: 16 },
    video: { w: 36, h: 28 },
  };
  const base = defaults[w.type];
  if (!base) return 1;
  const m = (w.w / base.w + w.h / base.h) / 2;
  return Number.isFinite(m) && m > 0.2 ? m : 1;
}

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
  const { t, dir } = useI18n();
  const { confirm: askConfirm } = useAppNotice();
  const widgetLabel = (type: CanvasWidgetType) => t(`widgets.${type}`);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [boxUnit, setBoxUnit] = useState<'percent' | 'px'>('px');
  const [editTab, setEditTab] = useState<ElementorTab>('content');
  const [fitLabel, setFitLabel] = useState('');
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  /** When layers is open, hide the widget palette so they don't stack/overlap */
  const [layersOpen, setLayersOpen] = useState(false);
  const fontOptions = fontSelectOptions(customFonts);

  const selected = canvas.widgets.find((w) => w.id === selectedId) ?? null;

  useEffect(() => {
    setEditTab('content');
  }, [selectedId]);

  // Reference canvas for px fields in the inspector (TV scales via cqw from this).
  const ratio = ASPECT_RATIOS[canvas.aspect] ?? 16 / 9;
  const refWidth = CANVAS_REF_WIDTH;
  const refHeight = Math.round(CANVAS_REF_WIDTH / ratio);
  const pctToPx = (pct: number, axis: 'x' | 'y') =>
    Math.round((pct / 100) * (axis === 'x' ? refWidth : refHeight));
  const pxToPct = (px: number, axis: 'x' | 'y') =>
    (px / (axis === 'x' ? refWidth : refHeight)) * 100;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let raf = 0;

    function fit() {
      const el = frameRef.current;
      if (!el) return;
      const pad = 8;
      const fw = Math.max(0, el.clientWidth - pad);
      const fh = Math.max(0, el.clientHeight - pad);
      if (fw < 40 || fh < 40) {
        // Layout not ready yet — retry next frame
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(fit);
        return;
      }
      // Largest 16:9 (etc.) rectangle that fits the frame
      let w = fw;
      let h = w / ratio;
      if (h > fh) {
        h = fh;
        w = h * ratio;
      }
      const next = { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
      setStageBox((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
      const pct = Math.round((next.w / refWidth) * 100);
      setFitLabel(t('canvas.fitPreview', { refW: refWidth, refH: refHeight, w: next.w, h: next.h, pct }));
    }

    fit();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    ro.observe(frame);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [ratio, refWidth, refHeight, t]);

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
    onStatus?.(t('canvas.addedWidget', { label: widgetLabel(type) }));
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
    onStatus?.(t('canvas.explodedZmanim', { n: created.length }));
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

  function moveLayer(id: string, direction: 'up' | 'down') {
    const sorted = [...canvas.widgets].sort((a, b) => b.z - a.z || a.id.localeCompare(b.id));
    const idx = sorted.findIndex((w) => w.id === id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return;
    const next = [...sorted];
    const tmp = next[idx]!;
    next[idx] = next[swapWith]!;
    next[swapWith] = tmp;
    const zById = new Map(next.map((w, i) => [w.id, next.length - i]));
    onChange({
      ...canvas,
      widgets: canvas.widgets.map((w) => ({ ...w, z: zById.get(w.id) ?? w.z })),
    });
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

  return (
    <div className="canvas-builder">
      <div className="cb-toolbar">
        <div className="cb-toolbar-row">
          <Link
            className="cb-chip ghost"
            to={`/display/${synagogueId}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('panels.liveScreen')}
          </Link>
          <Link
            className="cb-chip ghost"
            to={`/times/${synagogueId}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('panels.congregantTimes')}
          </Link>
          <span className="cb-fit-meta" title={t('canvas.fitTitle')}>
            {fitLabel || `${refWidth}×${refHeight}`}
          </span>
        </div>

        <details className="cb-stage-settings-wrap">
          <summary>{t('panels.screenBgSettings')}</summary>
          <div className="cb-stage-settings">
          <label>
            {t('canvas.aspect')}
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
            {t('canvas.snapGrid')}
            <select
              value={canvas.gridSize}
              onChange={(e) => onChange({ ...canvas, gridSize: Number(e.target.value) })}
            >
              <option value={0}>{t('canvas.none')}</option>
              <option value={0.5}>0.5%</option>
              <option value={1}>1%</option>
              <option value={2}>2%</option>
              <option value={5}>5%</option>
            </select>
          </label>
          <label>
            {t('canvas.overlayDarkness', { n: canvas.overlayOpacity.toFixed(2) })}
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
            {t('canvas.bgFit')}
            <select
              value={canvas.backgroundFit}
              onChange={(e) =>
                onChange({
                  ...canvas,
                  backgroundFit: e.target.value as CanvasLayoutConfig['backgroundFit'],
                })
              }
            >
              <option value="cover">{t('canvas.bgCover')}</option>
              <option value="contain">{t('canvas.bgContain')}</option>
            </select>
          </label>
          <div className="cb-stage-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setPicker({ kind: 'background' })}
            >
              {t('canvas.bgFromGallery')}
            </button>
            {canvas.backgroundUrl ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => onChange({ ...canvas, backgroundUrl: '' })}
              >
                {t('canvas.removeBg')}
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                void (async () => {
                  if (!(await askConfirm(t('canvas.confirmReset')))) return;
                  onChange(defaultCanvas());
                  setSelectedId(null);
                  onStatus?.(t('canvas.resetDone'));
                })();
              }}
            >
              {t('canvas.resetLayout')}
            </button>
          </div>
          </div>
        </details>
      </div>

      <div className="cb-workspace is-editing">
        <div className="cb-stage-col">
        <div className="cb-stage-frame" ref={frameRef}>
        <div
          ref={stageRef}
          className={`canvas-stage cb-stage ${dragging ? 'is-dragging' : ''}`}
          style={{
            width: stageBox.w || undefined,
            height: stageBox.h || undefined,
            aspectRatio: stageBox.w ? undefined : String(ratio),
            ['--cb-aspect' as string]: String(ratio),
            ['--stage-ratio' as string]: String(ratio),
            ['--cv-overlay' as string]: String(canvas.overlayOpacity),
            ...(canvas.backgroundUrl
              ? {
                  backgroundImage: `url(${canvas.backgroundUrl})`,
                  backgroundSize: canvas.backgroundFit,
                }
              : {}),
          }}
          dir={dir}
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
              <span className="cb-tag">{widgetLabel(w.type)}</span>
              <span
                className="cb-resize"
                onPointerDown={(e) => startDrag(e, w, 'resize')}
                role="presentation"
              />
            </div>
          ))}

          {selected && !dragging ? (
            <div
              className={`cb-float-bar ${selected.y < 14 ? 'below' : 'above'}`}
              style={{
                left: `${clamp(selected.x + selected.w / 2, 8, 92)}%`,
                top: selected.y < 14 ? `${selected.y + selected.h}%` : `${selected.y}%`,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="cb-float-label">{widgetLabel(selected.type)}</span>
              <div className="cb-float-group" title={t('canvas.size')}>
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={detectSizePreset(selected) === p.id ? 'on' : ''}
                    onClick={() => patchWidget(selected.id, sizePresetPatch(selected, p.id))}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`cb-float-action ${editTab === 'content' ? 'on' : ''}`}
                onClick={() => setEditTab('content')}
              >
                {t('canvas.tabContent')}
              </button>
              <button
                type="button"
                className={`cb-float-action ${editTab === 'style' ? 'on' : ''}`}
                onClick={() => setEditTab('style')}
              >
                {t('canvas.tabStyle')}
              </button>
              <button
                type="button"
                className={`cb-float-action ${editTab === 'advanced' ? 'on' : ''}`}
                onClick={() => setEditTab('advanced')}
              >
                {t('canvas.tabAdvanced')}
              </button>
              <button
                type="button"
                className="cb-float-action"
                title={t('canvas.duplicate')}
                onClick={() => duplicateWidget(selected)}
              >
                {t('canvas.duplicate')}
              </button>
              <button
                type="button"
                className="cb-float-action danger"
                title={t('canvas.delete')}
                onClick={() => removeWidget(selected.id)}
              >
                {t('canvas.delete')}
              </button>
            </div>
          ) : null}

          {menu && menuWidget ? (
            <div
              className="cb-context-menu"
              style={{ left: menu.x, top: menu.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="cb-context-title">{widgetLabel(menuWidget.type)}</div>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(menuWidget.id);
                  setEditTab('content');
                  setMenu(null);
                }}
              >
                {t('canvas.editWidget')}
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicateWidget(menuWidget);
                  setMenu(null);
                }}
              >
                {t('canvas.duplicate')}
              </button>
              <button
                type="button"
                onClick={() => {
                  patchWidget(menuWidget.id, { visible: !menuWidget.visible });
                  setMenu(null);
                }}
              >
                {menuWidget.visible ? t('canvas.hide') : t('canvas.show')}
              </button>
              <button
                type="button"
                onClick={() => {
                  bringToFront(menuWidget.id);
                  setMenu(null);
                }}
              >
                {t('canvas.bringFront')}
              </button>
              <button
                type="button"
                onClick={() => {
                  sendToBack(menuWidget.id);
                  setMenu(null);
                }}
              >
                {t('canvas.sendBack')}
              </button>
              <div className="cb-context-sep" />
              <button type="button" className="danger" onClick={() => removeWidget(menuWidget.id)}>
                {t('canvas.deleteElement')}
              </button>
            </div>
          ) : null}
        </div>
        </div>
        </div>

        <aside className="cb-inspector cb-inspector-el" dir={dir}>
          <LayersPanel
            widgets={canvas.widgets}
            blocks={blocks}
            selectedId={selectedId}
            widgetLabel={widgetLabel}
            open={layersOpen}
            onOpenChange={setLayersOpen}
            onSelect={setSelectedId}
            onToggleVisible={(id) => {
              const w = canvas.widgets.find((x) => x.id === id);
              if (w) patchWidget(id, { visible: !w.visible });
            }}
            onRemove={removeWidget}
            onMoveUp={(id) => moveLayer(id, 'up')}
            onMoveDown={(id) => moveLayer(id, 'down')}
          />
          {selected ? (
            <ElementorWidgetPanel
              selected={selected}
              tab={editTab}
              onTab={setEditTab}
              blocks={blocks}
              enabledZmanim={enabledZmanim}
              fontOptions={fontOptions}
              boxUnit={boxUnit}
              onBoxUnit={setBoxUnit}
              refWidth={refWidth}
              refHeight={refHeight}
              pctToPx={pctToPx}
              pxToPct={pxToPct}
              patchWidget={patchWidget}
              onPickImage={() => setPicker({ kind: 'widget', id: selected.id })}
              onDuplicate={() => duplicateWidget(selected)}
              onRemove={() => removeWidget(selected.id)}
              onBringFront={() => bringToFront(selected.id)}
              onSendBack={() => sendToBack(selected.id)}
              alignSelected={alignSelected}
              onClose={() => setSelectedId(null)}
              label={widgetLabel(selected.type)}
            />
          ) : layersOpen ? null : (
            <WidgetPalette onAdd={addWidget} onExplodeZmanim={explodeZmanim} />
          )}
        </aside>
      </div>

      <MediaGalleryModal
        open={Boolean(picker)}
        title={picker?.kind === 'widget' ? t('canvas.pickWidgetImage') : t('canvas.pickScreenBg')}
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
