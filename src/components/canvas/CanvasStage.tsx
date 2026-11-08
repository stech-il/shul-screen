import { memo, type CSSProperties, type ReactNode } from 'react';
import type { CanvasLayoutConfig, CanvasWidget, CanvasWidgetType } from '../../types';
import { CANVAS_REF_WIDTH } from '../../types';
import { CanvasWidgetContent, type CanvasData } from './CanvasWidgetContent';
import { ASPECT_RATIOS } from './widgets';
import {
  normalizeRotatorTypes,
  rotatorHasContent,
  widgetTypeHasContent,
} from '../../lib/canvasRotator';
import './canvas.css';

/** Calendar / seasonal widgets that must not leave an empty box on the live screen. */
function seasonalWidgetHasContent(type: CanvasWidgetType, data: CanvasData): boolean | null {
  const day = data.day;
  switch (type) {
    case 'calendar':
      return Boolean((day.holidays?.length ?? 0) + (day.memorials?.length ?? 0));
    case 'roshChodesh':
      return Boolean(day.roshChodesh?.length);
    case 'shabbatMevarchim':
      return Boolean(day.shabbatMevarchim?.length);
    case 'molad':
      return Boolean(day.molad?.length);
    case 'specialShabbat':
      return Boolean(day.specialShabbat?.length);
    case 'omer':
      return Boolean(day.omer);
    case 'yahrzeit':
      return Boolean(day.yahrzeitNames?.length);
    case 'memorialBoard':
      return Boolean(day.memorialBoard?.length);
    default:
      return null;
  }
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Map reference-canvas px (1920-wide) to live stage size via container queries. */
function refPx(px: number): string {
  return `calc(${px} * 100cqw / ${CANVAS_REF_WIDTH})`;
}

export function widgetStyle(widget: CanvasWidget): CSSProperties {
  const fontSizePx = num(widget.fontSizePx);
  const letterSpacingPx = num(widget.letterSpacingPx);
  const titleSizePx = num(widget.titleSizePx);
  const lineHeightPx = num(widget.lineHeightPx);
  const paddingPx = num(widget.paddingPx);
  const radius = num(widget.radius);

  return {
    left: `${widget.x}%`,
    top: `${widget.y}%`,
    width: `${widget.w}%`,
    height: `${widget.h}%`,
    zIndex: widget.z,
    opacity: widget.opacity,
    borderRadius: radius != null ? refPx(radius) : undefined,
    textAlign: widget.align,
    fontFamily: widget.fontFamily
      ? `'${widget.fontFamily}', var(--font-body, sans-serif)`
      : undefined,
    fontWeight:
      widget.fontWeight === 'bold' ? 700 : widget.fontWeight === 'medium' ? 500 : 400,
    ['--cw-fs' as string]: String(widget.fontScale ?? 1),
    ['--cw-title-fs' as string]: String(widget.titleScale ?? 0.55),
    ...(fontSizePx != null && fontSizePx > 0 ? { fontSize: refPx(fontSizePx) } : {}),
    ...(letterSpacingPx != null
      ? {
          letterSpacing: refPx(letterSpacingPx),
          ['--cw-ls' as string]: refPx(letterSpacingPx),
        }
      : {}),
    ...(titleSizePx != null && titleSizePx > 0
      ? { ['--cw-title-size' as string]: refPx(titleSizePx) }
      : {}),
    ...(lineHeightPx != null && lineHeightPx > 0 ? { lineHeight: refPx(lineHeightPx) } : {}),
    ...(paddingPx != null && paddingPx >= 0 ? { padding: refPx(paddingPx) } : {}),
    ...(widget.color ? { color: widget.color } : {}),
    ...(widget.titleColor ? { ['--cw-title-color' as string]: widget.titleColor } : {}),
  };
}

/** Widgets that must re-render when the clock string changes. */
function needsClock(type: CanvasWidgetType): boolean {
  return (
    type === 'clock' ||
    type === 'rotator' ||
    type === 'dafRotator' ||
    type === 'zmanim' ||
    type === 'block' ||
    type === 'zman'
  );
}

function dataEqualForWidget(type: CanvasWidgetType, a: CanvasData, b: CanvasData): boolean {
  if (a === b) return true;
  if (
    a.day !== b.day ||
    a.zmanim !== b.zmanim ||
    a.blocks !== b.blocks ||
    a.name !== b.name ||
    a.dedication !== b.dedication ||
    a.logoSrc !== b.logoSrc ||
    a.announcement !== b.announcement ||
    a.announcementCount !== b.announcementCount ||
    a.announcementIndex !== b.announcementIndex ||
    a.weatherTemp !== b.weatherTemp ||
    a.weatherCode !== b.weatherCode ||
    a.weatherDesc !== b.weatherDesc ||
    a.itim !== b.itim ||
    a.itimLoading !== b.itimLoading ||
    a.resolveTime !== b.resolveTime ||
    a.resolveItemAt !== b.resolveItemAt
  ) {
    return false;
  }

  if (type === 'countdown') {
    if (a.countdownLabel !== b.countdownLabel) return false;
    if (a.candleBoard !== b.candleBoard) {
      const ba = a.candleBoard;
      const bb = b.candleBoard;
      if (!ba || !bb) return false;
      if (
        ba.entry !== bb.entry ||
        ba.exit !== bb.exit ||
        ba.exitRT !== bb.exitRT ||
        ba.countdownLabel !== bb.countdownLabel
      ) {
        return false;
      }
    }
  } else if (a.candleBoard !== b.candleBoard) {
    const ba = a.candleBoard;
    const bb = b.candleBoard;
    if (!ba || !bb) return ba === bb;
    // Ignore countdownLabel churn on the board for other widgets.
    if (ba.entry !== bb.entry || ba.exit !== bb.exit || ba.exitRT !== bb.exitRT) return false;
  }

  if (needsClock(type)) return a.clock === b.clock;
  return true;
}

const CanvasWidgetShell = memo(
  function CanvasWidgetShell({
    widget,
    data,
    placeholder,
  }: {
    widget: CanvasWidget;
    data: CanvasData;
    placeholder?: boolean;
  }) {
    return (
      <div
        className={[
          'canvas-widget',
          `bg-${widget.bg}`,
          widget.showBorder ? 'has-border' : 'no-border',
          widget.textShadow ? 'has-shadow' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={widgetStyle(widget)}
      >
        <CanvasWidgetContent widget={widget} data={data} placeholder={placeholder} />
      </div>
    );
  },
  (prev, next) =>
    prev.placeholder === next.placeholder &&
    prev.widget === next.widget &&
    dataEqualForWidget(prev.widget.type, prev.data, next.data),
);

interface Props {
  canvas: CanvasLayoutConfig;
  data: CanvasData;
  /** editor overlay rendered above widgets */
  children?: ReactNode;
  placeholder?: boolean;
  className?: string;
}

export function CanvasStage({ canvas, data, children, placeholder, className }: Props) {
  const ratio = ASPECT_RATIOS[canvas.aspect] ?? 16 / 9;
  const stageStyle: CSSProperties = {
    aspectRatio: String(ratio),
    ['--cv-overlay' as string]: String(canvas.overlayOpacity),
    ['--stage-ratio' as string]: String(ratio),
  };
  if (canvas.backgroundUrl) {
    stageStyle.backgroundImage = `url(${canvas.backgroundUrl})`;
    stageStyle.backgroundSize = canvas.backgroundFit;
  }

  return (
    <div className={`canvas-stage ${className ?? ''}`} style={stageStyle} dir="rtl">
      {canvas.backgroundUrl && canvas.overlayOpacity > 0 ? (
        <div className="canvas-overlay" />
      ) : null}
      {canvas.widgets
        .filter((w) => w.visible)
        .filter((w) => {
          if (placeholder) return true;
          if (w.type === 'rotator') {
            return rotatorHasContent(normalizeRotatorTypes(w.rotatorTypes), data);
          }
          if (w.type === 'dafRotator') {
            return widgetTypeHasContent('dafRotator', data);
          }
          const has = seasonalWidgetHasContent(w.type, data);
          return has === null ? true : has;
        })
        .map((w) => (
          <CanvasWidgetShell key={w.id} widget={w} data={data} placeholder={placeholder} />
        ))}
      {children}
    </div>
  );
}
