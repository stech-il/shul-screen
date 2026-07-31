import type { CanvasWidget, CanvasWidgetType, ScheduleBlock } from '../../types';
import { useI18n } from '../../i18n';
import { toPlainDisplayText } from '../../lib/sanitizeHtml';

interface Props {
  widgets: CanvasWidget[];
  blocks: ScheduleBlock[];
  selectedId: string | null;
  widgetLabel: (type: CanvasWidgetType) => string;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function layerDetail(w: CanvasWidget, blocks: ScheduleBlock[]): string {
  if (w.type === 'block') {
    const block = blocks.find((b) => b.id === w.blockId);
    const title = block?.title || w.title || '';
    return toPlainDisplayText(title).slice(0, 48);
  }
  if (w.type === 'heading' || w.type === 'text' || w.type === 'button') {
    return toPlainDisplayText(w.text || w.buttonLabel || w.title || '').slice(0, 48);
  }
  if (w.type === 'zman') {
    return toPlainDisplayText(w.title || w.zmanKey || '').slice(0, 48);
  }
  if (w.title) return toPlainDisplayText(w.title).slice(0, 48);
  return '';
}

export function LayersPanel({
  widgets,
  blocks,
  selectedId,
  widgetLabel,
  onSelect,
  onToggleVisible,
  onRemove,
  onMoveUp,
  onMoveDown,
  open,
  onOpenChange,
}: Props) {
  const { t, dir } = useI18n();
  const sorted = [...widgets].sort((a, b) => b.z - a.z || a.id.localeCompare(b.id));
  const controlled = typeof open === 'boolean';

  return (
    <details
      className="cb-layers-panel"
      dir={dir}
      {...(controlled ? { open } : {})}
      onToggle={(e) => {
        if (!onOpenChange) return;
        onOpenChange((e.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="cb-layers-head">
        <strong>
          {t('canvas.layers')}
          <span className="cb-layers-count">{widgets.length}</span>
        </strong>
        <em>{t('canvas.layersHint', { n: widgets.length })}</em>
      </summary>
      {sorted.length === 0 ? (
        <p className="cb-layers-empty">{t('canvas.noLayers')}</p>
      ) : (
        <ul className="cb-layers-list">
          {sorted.map((w, idx) => {
            const detail = layerDetail(w, blocks);
            const on = selectedId === w.id;
            return (
              <li key={w.id} className={`cb-layer-row${on ? ' on' : ''}${w.visible ? '' : ' is-hidden'}`}>
                <button
                  type="button"
                  className="cb-layer-select"
                  onClick={() => onSelect(w.id)}
                  title={widgetLabel(w.type)}
                >
                  <span className="cb-layer-type">{widgetLabel(w.type)}</span>
                  {detail ? <span className="cb-layer-detail">{detail}</span> : null}
                </button>
                <div className="cb-layer-actions">
                  <button
                    type="button"
                    className="cb-layer-btn"
                    disabled={idx === 0}
                    title={t('canvas.layerUp')}
                    aria-label={t('canvas.layerUp')}
                    onClick={() => onMoveUp(w.id)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="cb-layer-btn"
                    disabled={idx === sorted.length - 1}
                    title={t('canvas.layerDown')}
                    aria-label={t('canvas.layerDown')}
                    onClick={() => onMoveDown(w.id)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="cb-layer-btn cb-eye"
                    title={w.visible ? t('canvas.hide') : t('canvas.show')}
                    aria-label={w.visible ? t('canvas.hide') : t('canvas.show')}
                    onClick={() => onToggleVisible(w.id)}
                  >
                    {w.visible ? '👁' : '◌'}
                  </button>
                  <button
                    type="button"
                    className="cb-layer-btn danger"
                    title={t('canvas.delete')}
                    aria-label={t('canvas.delete')}
                    onClick={() => onRemove(w.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
