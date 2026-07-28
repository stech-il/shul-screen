import type { CanvasHtmlTag, CanvasWidget, ScheduleBlock, ZmanKey } from '../../types';
import { ZMAN_DEFS } from '../../data/zmanim';
import { useI18n } from '../../i18n';
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
  placeholder,
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
  const { t } = useI18n();
  const ph = placeholder ?? t('canvas.auto');
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
          placeholder={ph}
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
  const { t } = useI18n();
  return (
    <div className="cb-el-align" role="group" aria-label={t('canvas.alignAria')}>
      {(
        [
          ['right', 'canvas.alignRight'],
          ['center', 'canvas.alignCenter'],
          ['left', 'canvas.alignLeft'],
        ] as const
      ).map(([id, labelKey]) => (
        <button
          key={id}
          type="button"
          className={value === id ? 'on' : ''}
          title={t(labelKey)}
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
  const { t } = useI18n();
  const id = selected.id;
  const patch = (p: Partial<CanvasWidget>) => patchWidget(id, p);

  return (
    <div className="cb-el-panel">
      <div className="cb-el-head">
        <button type="button" className="cb-el-back" onClick={onClose} title={t('panels.canvasBack')}>
          ←
        </button>
        <div className="cb-el-head-title">
          <strong>{t('panels.canvasEdit', { label })}</strong>
        </div>
        <div className="cb-el-head-actions">
          <button type="button" className="btn ghost" onClick={onDuplicate} title={t('canvas.duplicateTitle')}>
            ⎘
          </button>
          <button type="button" className="btn danger" onClick={onRemove} title={t('canvas.deleteTitle')}>
            ✕
          </button>
        </div>
      </div>

      <div className="cb-el-tabs" role="tablist">
        {(
          [
            ['content', 'canvas.tabContent', '✎'],
            ['style', 'canvas.styleTab', '◐'],
            ['advanced', 'canvas.tabAdvanced', '⚙'],
          ] as const
        ).map(([tid, labelKey, icon]) => (
          <button
            key={tid}
            type="button"
            role="tab"
            aria-selected={tab === tid}
            className={tab === tid ? 'on' : ''}
            onClick={() => onTab(tid)}
          >
            <span aria-hidden>{icon}</span>
            {t(labelKey)}
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
                      <span>{t('canvas.heading')}</span>
                      <textarea
                        rows={3}
                        value={selected.text ?? selected.title ?? ''}
                        placeholder={t('canvas.headingPh')}
                        onChange={(e) => patch({ text: e.target.value, title: e.target.value })}
                      />
                    </label>
                    <label className="cb-el-field">
                      <span>{t('canvas.link')}</span>
                      <input
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        value={selected.linkUrl ?? ''}
                        placeholder="https://…"
                        onChange={(e) => patch({ linkUrl: e.target.value || undefined })}
                      />
                    </label>
                    <label className="cb-el-field">
                      <span>{t('canvas.htmlTag')}</span>
                      <select
                        value={selected.htmlTag ?? 'h2'}
                        onChange={(e) => patch({ htmlTag: e.target.value as CanvasHtmlTag })}
                      >
                        {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'] as const).map((tag) => (
                          <option key={tag} value={tag}>
                            {tag.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                {selected.type === 'text' ? (
                  <div className="cb-rich-field">
                    <div className="cb-label">{t('canvas.content')}</div>
                    <RichTextEditor
                      value={selected.text ?? ''}
                      onChange={(html) => patch({ text: html })}
                      onFontSizePx={(px) => patch({ fontSizePx: px })}
                      placeholder={t('canvas.textPh')}
                    />
                  </div>
                ) : null}

                {selected.type === 'button' ? (
                  <>
                    <label className="cb-el-field">
                      <span>{t('canvas.buttonText')}</span>
                      <input
                        value={selected.buttonLabel ?? ''}
                        placeholder={t('canvas.buttonPh')}
                        onChange={(e) => patch({ buttonLabel: e.target.value })}
                      />
                    </label>
                    <label className="cb-el-field">
                      <span>{t('canvas.link')}</span>
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
                    <span>{t('canvas.videoUrl')}</span>
                    <input
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                      value={selected.videoUrl ?? ''}
                      placeholder={t('canvas.videoPh')}
                      onChange={(e) => patch({ videoUrl: e.target.value || undefined })}
                    />
                  </label>
                ) : null}

                {selected.type === 'image' ? (
                  <div className="mg-field">
                    <div className="mg-field-label">{t('canvas.image')}</div>
                    <button type="button" className="btn primary" onClick={onPickImage}>
                      {t('canvas.pickImage')}
                    </button>
                    {selected.imageUrl ? (
                      <button type="button" className="btn ghost" onClick={() => patch({ imageUrl: '' })}>
                        {t('canvas.removeImage')}
                      </button>
                    ) : null}
                    <label className="cb-el-field">
                      <span>{t('canvas.linkOptional')}</span>
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
                  <p className="cb-hint">{t('canvas.dividerHint')}</p>
                ) : null}

                {selected.type !== 'heading' &&
                selected.type !== 'text' &&
                selected.type !== 'button' &&
                selected.type !== 'video' &&
                selected.type !== 'image' &&
                selected.type !== 'divider' ? (
                  <label className="cb-el-field">
                    <span>{t('canvas.customTitle')}</span>
                    <input
                      value={selected.title ?? ''}
                      placeholder={t('canvas.customTitlePh')}
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </label>
                ) : null}

                {selected.type === 'block' ? (
                  <label className="cb-el-field">
                    <span>{t('canvas.prayerBlock')}</span>
                    <select
                      value={selected.blockId ?? ''}
                      onChange={(e) => patch({ blockId: e.target.value })}
                    >
                      <option value="">{t('canvas.firstActive')}</option>
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
                      <span>{t('canvas.whichZman')}</span>
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
                      <span>{t('canvas.titlePosition')}</span>
                      <select
                        value={selected.titleLayout ?? 'above'}
                        onChange={(e) =>
                          patch({
                            titleLayout: e.target.value as CanvasWidget['titleLayout'],
                          })
                        }
                      >
                        <option value="above">{t('canvas.titleAbove')}</option>
                        <option value="below">{t('canvas.titleBelow')}</option>
                        <option value="side">{t('canvas.titleSide')}</option>
                        <option value="side-reverse">{t('canvas.titleSideRev')}</option>
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
                    {t('canvas.showTitle')}
                  </label>
                ) : null}

                {selected.type === 'countdown' ? (
                  <>
                    <p className="cb-hint">{t('canvas.candleBoardHint')}</p>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={selected.showCandles !== false}
                        onChange={(e) => patch({ showCandles: e.target.checked })}
                      />
                      {t('canvas.showCandles')}
                    </label>
                  </>
                ) : null}

                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.visible}
                    onChange={(e) => patch({ visible: e.target.checked })}
                  />
                  {t('canvas.visibleOnScreen')}
                </label>
              </div>
            </details>
          </>
        ) : null}

        {tab === 'style' ? (
          <>
            <details className="cb-sec" open>
              <summary>{t('canvas.typographyColor')}</summary>
              <div className="cb-sec-body">
                <div className="cb-el-field">
                  <span>{t('canvas.alignment')}</span>
                  <AlignGroup value={selected.align} onChange={(align) => patch({ align })} />
                </div>

                <label className="cb-el-field">
                  <span>{t('canvas.font')}</span>
                  <select
                    value={selected.fontFamily ?? ''}
                    onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
                  >
                    <option value="">{t('canvas.fontDefault')}</option>
                    {fontOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cb-el-field">
                  <span>{t('canvas.weight')}</span>
                  <select
                    value={selected.fontWeight ?? 'normal'}
                    onChange={(e) =>
                      patch({ fontWeight: e.target.value as CanvasWidget['fontWeight'] })
                    }
                  >
                    <option value="normal">{t('canvas.weightNormal')}</option>
                    <option value="medium">{t('canvas.weightMedium')}</option>
                    <option value="bold">{t('canvas.weightBold')}</option>
                  </select>
                </label>

                <div className="cb-grid-fields">
                  <label className="cb-el-field">
                    <span>{t('canvas.color')}</span>
                    <input
                      type="color"
                      value={selected.color ?? '#1c3140'}
                      onChange={(e) => patch({ color: e.target.value })}
                    />
                  </label>
                  <label className="cb-el-field">
                    <span>{t('canvas.titleColor')}</span>
                    <input
                      type="color"
                      value={selected.titleColor ?? '#a8893d'}
                      onChange={(e) => patch({ titleColor: e.target.value })}
                    />
                  </label>
                </div>

                <div className="cb-grid-fields">
                  <PxField
                    label={t('canvas.fontSize')}
                    value={selected.fontSizePx}
                    min={8}
                    max={400}
                    onChange={(v) => patch({ fontSizePx: v })}
                  />
                  <PxField
                    label={t('canvas.lineHeight')}
                    value={selected.lineHeightPx}
                    min={4}
                    max={400}
                    onChange={(v) => patch({ lineHeightPx: v })}
                  />
                  <PxField
                    label={t('canvas.letterSpacing')}
                    value={selected.letterSpacingPx}
                    min={-20}
                    max={80}
                    step={0.5}
                    placeholder="0"
                    onChange={(v) => patch({ letterSpacingPx: v })}
                  />
                  <PxField
                    label={t('canvas.titleSize')}
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
                  {t('canvas.textShadow')}
                </label>
              </div>
            </details>

            <details className="cb-sec" open>
              <summary>{t('canvas.bgBorder')}</summary>
              <div className="cb-sec-body">
                <label className="cb-el-field">
                                      <span>{t('canvas.background')}</span>
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
                    <option value="none">{t('canvas.bgNone')}</option>
                    <option value="ghost">{t('canvas.bgGhost')}</option>
                    <option value="panel">{t('canvas.bgPanel')}</option>
                    <option value="solid">{t('canvas.bgSolid')}</option>
                    <option value="dark">{t('canvas.bgDark')}</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.showBorder}
                    onChange={(e) => patch({ showBorder: e.target.checked })}
                  />
                  {t('canvas.border')}
                </label>
                <PxField
                  label={t('canvas.radius')}
                  value={selected.radius}
                  min={0}
                  max={200}
                  placeholder="0"
                  onChange={(v) => patch({ radius: v ?? 0 })}
                />
                <PxField
                  label={t('canvas.padding')}
                  value={selected.paddingPx}
                  min={0}
                  max={200}
                  onChange={(v) => patch({ paddingPx: v })}
                />
                <label className="cb-el-field">
                  <span>{t('canvas.opacity', { n: selected.opacity.toFixed(2) })}</span>
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
              <summary>{t('canvas.layout')}</summary>
              <div className="cb-sec-body">
                <div className="cb-align">
                  <button type="button" onClick={() => alignSelected('right')}>
                    {t('canvas.alignRight')}
                  </button>
                  <button type="button" onClick={() => alignSelected('h-center')}>
                    {t('canvas.alignCenter')} ↔
                  </button>
                  <button type="button" onClick={() => alignSelected('left')}>
                    {t('canvas.alignLeft')}
                  </button>
                  <button type="button" onClick={() => alignSelected('top')}>
                    {t('canvas.alignTop')}
                  </button>
                  <button type="button" onClick={() => alignSelected('v-center')}>
                    {t('canvas.alignCenter')} ↕
                  </button>
                  <button type="button" onClick={() => alignSelected('bottom')}>
                    {t('canvas.alignBottom')}
                  </button>
                </div>

                <div className="cb-unit-switch">
                  <span>{t('canvas.units')}</span>
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
                      ['w', 'canvas.width', 'x'],
                      ['h', 'canvas.height', 'y'],
                    ] as const
                  ).map(([key, lab, axis]) => (
                    <label key={key} className="cb-el-field">
                      <span>
                        {lab.startsWith('canvas.') ? t(lab) : lab} {boxUnit === 'px' ? 'px' : '%'}
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
                    {t('canvas.relativeTo', { w: refWidth, h: refHeight })}
                  </p>
                ) : null}
              </div>
            </details>

            <details className="cb-sec">
              <summary>{t('canvas.layers')}</summary>
              <div className="cb-sec-body">
                <div className="cb-row-actions">
                  <button type="button" className="btn ghost" onClick={onBringFront}>
                    {t('canvas.toFront')}
                  </button>
                  <button type="button" className="btn ghost" onClick={onSendBack}>
                    {t('canvas.toBack')}
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
