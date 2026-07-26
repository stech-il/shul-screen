import type { CSSProperties, ReactNode } from 'react';
import type { CanvasLayoutConfig, CanvasWidget } from '../../types';
import { CANVAS_REF_WIDTH } from '../../types';
import { CanvasWidgetContent, type CanvasData } from './CanvasWidgetContent';
import { ASPECT_RATIOS } from './widgets';
import './canvas.css';

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
        .map((w) => (
          <div
            key={w.id}
            className={[
              'canvas-widget',
              `bg-${w.bg}`,
              w.showBorder ? 'has-border' : 'no-border',
              w.textShadow ? 'has-shadow' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={widgetStyle(w)}
          >
            <CanvasWidgetContent widget={w} data={data} placeholder={placeholder} />
          </div>
        ))}
      {children}
    </div>
  );
}
