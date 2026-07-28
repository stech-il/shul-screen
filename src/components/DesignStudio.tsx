import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_DESIGN } from '../data/designPresets';
import {
  isSeedTemplateId,
  mergeGalleryTemplates,
  SEED_DESIGN_TEMPLATES,
} from '../data/seedDesignTemplates';
import {
  applyDesignTemplate,
  deleteDesignTemplate,
  loadDesignTemplates,
  saveDesignTemplate,
} from '../lib/designTemplates';
import {
  ensureCustomFontsLoaded,
  familyFromFontName,
  fontSelectOptions,
  inferFontFormat,
} from '../lib/customFonts';
import { uploadFont } from '../lib/media';
import { useI18n } from '../i18n';
import { MediaPickerField } from './MediaPicker';
import type {
  CustomFont,
  DesignSettings,
  GalleryItem,
  SavedDesignTemplate,
  ScreenLayout,
  SynagogueConfig,
} from '../types';

interface Props {
  config: SynagogueConfig;
  synagogueId: string;
  onChange: (patch: Partial<SynagogueConfig>) => void;
  onDesign: (patch: Partial<DesignSettings>) => void;
  onGalleryChange: (gallery: GalleryItem[]) => void;
  onStatus?: (msg: string) => void;
  onRequestCustomDesign?: () => void;
}

const LAYOUT_KEYS: { id: ScreenLayout; labelKey: string }[] = [
  { id: 'classic', labelKey: 'design.layoutClassic' },
  { id: 'split', labelKey: 'design.layoutSplit' },
  { id: 'minimal', labelKey: 'design.layoutMinimal' },
  { id: 'magazine', labelKey: 'design.layoutMagazine' },
  { id: 'elegant', labelKey: 'design.layoutElegant' },
  { id: 'board', labelKey: 'design.layoutBoard' },
  { id: 'dual', labelKey: 'design.layoutDual' },
  { id: 'event', labelKey: 'design.layoutEvent' },
  { id: 'mourning', labelKey: 'design.layoutMourning' },
  { id: 'canvas', labelKey: 'design.layoutCanvas' },
];

const SHORT_LAYOUT_KEYS: Record<string, string> = {
  classic: 'design.shortClassic',
  split: 'design.shortSplit',
  minimal: 'design.shortMinimal',
  magazine: 'design.shortMagazine',
  elegant: 'design.shortElegant',
  board: 'design.shortBoard',
  dual: 'design.shortDual',
  event: 'design.shortEvent',
  mourning: 'design.shortMourning',
  canvas: 'design.shortCanvas',
};

function parsePanelColor(input: string): { hex: string; alpha: number } {
  const rgba = input.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i,
  );
  if (rgba) {
    const r = Number(rgba[1]);
    const g = Number(rgba[2]);
    const b = Number(rgba[3]);
    const a = rgba[4] != null ? Number(rgba[4]) : 1;
    const hex =
      '#' +
      [r, g, b]
        .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0'))
        .join('');
    return { hex, alpha: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
  }
  if (input.startsWith('#') && input.length >= 7) {
    return { hex: input.slice(0, 7), alpha: 1 };
  }
  if (input.startsWith('#') && input.length === 4) {
    const [, r, g, b] = input;
    return { hex: `#${r}${r}${g}${g}${b}${b}`, alpha: 1 };
  }
  return { hex: '#ffffff', alpha: 0.8 };
}

function toRgba(hex: string, alpha: number): string {
  const h = hex.startsWith('#') ? hex.slice(1, 7) : 'ffffff';
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const a = Math.round(alpha * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function StudioSection({
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="card studio-sec"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <h2>{title}</h2>
        {hint ? <p className="hint">{hint}</p> : null}
      </summary>
      <div className="studio-sec-body">{children}</div>
    </details>
  );
}

function TemplatePreview({
  template,
}: {
  template: SavedDesignTemplate;
}) {
  const { design: d, canvas, theme } = template;
  const bgImage = canvas.backgroundUrl || d.backgroundImageUrl;
  const widgets = [...(canvas.widgets ?? [])]
    .filter((w) => w.visible !== false)
    .sort((a, b) => a.z - b.z)
    .slice(0, 18);

  const wash = Math.round(Math.min(0.55, d.overlayOpacity || 0.14) * 100);
  const bgLayer = bgImage
    ? `linear-gradient(color-mix(in srgb, ${d.backgroundColor} ${wash}%, transparent), color-mix(in srgb, ${d.backgroundColor2} ${Math.round(wash * 0.65)}%, transparent)), url(${bgImage})`
    : `linear-gradient(145deg, ${d.backgroundColor}, ${d.backgroundColor2})`;

  return (
    <div
      className={`tpl-preview ${theme === 'dark' ? 'is-dark' : ''} ${bgImage ? 'has-bg' : ''}`}
      style={{
        backgroundColor: d.backgroundColor,
        backgroundImage: bgLayer,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: d.primaryColor,
      }}
      aria-hidden
    >
      <div className="tpl-preview-stage">
        {widgets.map((w) => (
          <div
            key={w.id}
            className={`tpl-preview-widget type-${w.type} bg-${w.bg || 'panel'}`}
            style={{
              left: `${w.x}%`,
              top: `${w.y}%`,
              width: `${w.w}%`,
              height: `${w.h}%`,
              zIndex: w.z,
              background:
                w.bg === 'none'
                  ? 'transparent'
                  : w.bg === 'solid'
                    ? d.primaryColor
                    : d.panelColor,
              borderColor: w.showBorder === false ? 'transparent' : d.accentColor,
              color: w.bg === 'solid' ? d.backgroundColor : d.primaryColor,
              borderRadius: w.type === 'clock' ? '50%' : undefined,
            }}
          >
            {w.type === 'clock' ? <i /> : null}
            {w.type === 'title' || w.type === 'text' ? <span className="tpl-line wide" /> : null}
            {w.type === 'block' || w.type === 'zmanim' || w.type === 'announcements' ? (
              <>
                <span className="tpl-line accent" style={{ background: d.accentColor }} />
                <span className="tpl-line" />
                <span className="tpl-line" />
                <span className="tpl-line short" />
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DesignStudio({
  config,
  synagogueId,
  onChange,
  onDesign,
  onGalleryChange,
  onStatus,
  onRequestCustomDesign,
}: Props) {
  const { t, dateTag } = useI18n();
  const d = config.design;
  const customFonts = config.media?.customFonts ?? [];
  const gallery = config.media?.gallery ?? [];
  const fontOptions = useMemo(() => fontSelectOptions(customFonts), [customFonts]);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [fontBusy, setFontBusy] = useState(false);
  const [fontLabel, setFontLabel] = useState('');
  const [saved, setSaved] = useState<SavedDesignTemplate[]>([]);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [query, setQuery] = useState('');
  const panel = useMemo(() => parsePanelColor(d.panelColor), [d.panelColor]);

  useEffect(() => {
    void loadDesignTemplates(synagogueId).then(setSaved);
  }, [synagogueId]);

  useEffect(() => {
    ensureCustomFontsLoaded(customFonts);
  }, [customFonts]);

  function setCustomFonts(next: CustomFont[]) {
    onChange({
      media: {
        ...config.media,
        gallery: config.media?.gallery ?? [],
        customFonts: next,
      },
    });
  }

  async function onUploadFont(file: File | null) {
    if (!file) return;
    setFontBusy(true);
    try {
      const uploaded = await uploadFont(config.id, file);
      const displayName =
        fontLabel.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || t('design.customFontDefault');
      const family = familyFromFontName(displayName, customFonts);
      const entry: CustomFont = {
        id: `font-${Date.now().toString(36)}`,
        name: displayName,
        family,
        url: uploaded.url,
        format: inferFontFormat(file.name),
        createdAt: new Date().toISOString(),
      };
      setCustomFonts([...customFonts, entry]);
      setFontLabel('');
      onStatus?.(
        uploaded.warning
          ? t('design.fontAddedWarn', { name: displayName, warning: uploaded.warning })
          : t('design.fontUploaded', { name: displayName }),
      );
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : t('design.fontUploadFail'));
    } finally {
      setFontBusy(false);
      if (fontInputRef.current) fontInputRef.current.value = '';
    }
  }

  function onRemoveFont(font: CustomFont) {
    if (!confirm(t('design.confirmDeleteFont', { name: font.name }))) return;
    const next = customFonts.filter((f) => f.id !== font.id);
    setCustomFonts(next);
    const patch: Partial<DesignSettings> = {};
    if (d.fontHeading === font.family) patch.fontHeading = DEFAULT_DESIGN.fontHeading;
    if (d.fontBody === font.family) patch.fontBody = DEFAULT_DESIGN.fontBody;
    if (Object.keys(patch).length) onDesign(patch);
    onStatus?.(t('design.fontRemoved', { name: font.name }));
  }

  async function pickSaved(template: SavedDesignTemplate) {
    const applied = await applyDesignTemplate(template);
    onChange(applied);
    onStatus?.(t('design.templateApplied', { name: template.name }));
  }

  async function onSaveTemplate() {
    const result = await saveDesignTemplate({
      synagogueId,
      name: tplName || t('design.templateNameDefault', { date: new Date().toLocaleDateString(dateTag) }),
      description: tplDesc,
      theme: config.theme,
      layout: config.layout,
      design: config.design,
      canvas: config.canvas,
    });
    if (!result.ok || !result.template) {
      onStatus?.(result.error ?? t('design.templateSaveFail'));
      return;
    }
    setSaved(await loadDesignTemplates(synagogueId));
    setTplName('');
    setTplDesc('');
    onStatus?.(
      result.warning
        ? t('design.templateSavedWarn', { name: result.template.name, warning: result.warning })
        : t('design.templateSavedLocal', { name: result.template.name }),
    );
  }

  async function onDeleteTemplate(id: string, name: string) {
    if (isSeedTemplateId(id)) {
      onStatus?.(t('design.cannotDeleteSeed'));
      return;
    }
    if (!confirm(t('design.confirmDeleteTemplate', { name }))) return;
    await deleteDesignTemplate(synagogueId, id);
    setSaved(await loadDesignTemplates(synagogueId));
    onStatus?.(t('design.templateDeleted', { name }));
  }

  const templateGallery = useMemo(() => mergeGalleryTemplates(saved), [saved]);

  const filteredGallery = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templateGallery;
    return templateGallery.filter((tpl) => {
      const shortKey = SHORT_LAYOUT_KEYS[tpl.layout];
      const shortLabel = shortKey ? t(shortKey) : tpl.layout;
      return (
        tpl.name.toLowerCase().includes(q) ||
        (tpl.description ?? '').toLowerCase().includes(q) ||
        shortLabel.toLowerCase().includes(q)
      );
    });
  }, [templateGallery, query, t]);

  const filteredSeeds = useMemo(
    () => filteredGallery.filter((t) => isSeedTemplateId(t.id)),
    [filteredGallery],
  );
  const filteredUser = useMemo(
    () => filteredGallery.filter((t) => !isSeedTemplateId(t.id)),
    [filteredGallery],
  );

  function renderTemplateCard(tpl: SavedDesignTemplate, opts?: { seed?: boolean }) {
    const active = d.presetId === tpl.design.presetId;
    const seed = opts?.seed ?? isSeedTemplateId(tpl.id);
    return (
      <div
        key={tpl.id}
        className={`preset-card saved-tpl tpl-card ${active ? 'active' : ''} ${seed ? 'is-seed' : ''}`}
        style={{
          ['--p1' as string]: tpl.design.primaryColor,
          ['--p2' as string]: tpl.design.accentColor,
          ['--pb' as string]: tpl.design.backgroundColor,
        }}
      >
        <button type="button" className="preset-card-main" onClick={() => void pickSaved(tpl)}>
          <TemplatePreview template={tpl} />
          <div className="tpl-card-body">
            <strong>
              {tpl.name}
              {seed ? <span className="tpl-badge">{t('design.badgeSeed')}</span> : null}
            </strong>
            <em>
              {tpl.description}
              {tpl.layout === 'canvas' ? t('design.includesCanvas') : ''}
            </em>
            <span className="tpl-meta">{t(SHORT_LAYOUT_KEYS[tpl.layout] ?? 'design.shortClassic')}</span>
            <span className="tpl-apply">{active ? t('design.activeNow') : t('design.applyTemplate')}</span>
          </div>
        </button>
        {!seed ? (
          <button
            type="button"
            className="tpl-delete"
            onClick={() => void onDeleteTemplate(tpl.id, tpl.name)}
          >
            {t('common.delete')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="design-studio">
      <section className="card wide tpl-gallery">
        <div className="tpl-custom-banner">
          <div>
            <strong>{t('design.customBannerTitle')}</strong>
            <p>{t('design.customBannerText')}</p>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => onRequestCustomDesign?.()}
          >
            {t('design.customBannerCta')}
          </button>
        </div>
        <div className="tpl-gallery-head">
          <div>
            <h2>{t('panels.designTemplates', { n: SEED_DESIGN_TEMPLATES.length + saved.length })}</h2>
            <p className="hint">
              {t('design.galleryHint', { n: SEED_DESIGN_TEMPLATES.length })}
            </p>
          </div>
          <input
            className="tpl-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('design.searchPlaceholder')}
          />
        </div>

        {filteredGallery.length === 0 ? (
          <p className="hint">{t('design.noSearchResults')}</p>
        ) : (
          <>
            {filteredSeeds.length > 0 ? (
              <div className="tpl-group">
                <h3 className="tpl-group-title">{t('design.readyTemplates', { n: filteredSeeds.length })}</h3>
                <div className="preset-grid tpl-grid">
                  {filteredSeeds.map((tpl) => renderTemplateCard(tpl, { seed: true }))}
                </div>
              </div>
            ) : null}
            <div className="tpl-group">
              <h3 className="tpl-group-title">{t('design.myTemplates', { n: filteredUser.length })}</h3>
              {filteredUser.length === 0 ? (
                <p className="hint">
                  {t('design.noSavedTemplates')}
                </p>
              ) : (
                <div className="preset-grid tpl-grid">
                  {filteredUser.map((tpl) => renderTemplateCard(tpl, { seed: false }))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card wide">
        <h2>{t('panels.designSaveAsMine')}</h2>
        <p className="hint">
          {t('design.saveHint')}
        </p>
        <div className="tpl-save-row">
          <label>
            {t('design.templateName')}
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder={t('design.templateNamePh')}
            />
          </label>
          <label>
            {t('design.templateDesc')}
            <input
              value={tplDesc}
              onChange={(e) => setTplDesc(e.target.value)}
              placeholder={t('design.templateDescPh')}
            />
          </label>
          <button type="button" className="btn primary" onClick={() => void onSaveTemplate()}>
            {t('design.saveAsTemplate')}
          </button>
        </div>
      </section>

      <StudioSection title={t('panels.designSectionLayout')}>
        <label>
          {t('design.screenLayout')}
          <select
            value={config.layout}
            onChange={(e) => onChange({ layout: e.target.value as ScreenLayout })}
          >
            {LAYOUT_KEYS.map((l) => (
              <option key={l.id} value={l.id}>
                {t(l.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('design.headerStyle')}
          <select
            value={d.headerStyle}
            onChange={(e) =>
              onDesign({ headerStyle: e.target.value as DesignSettings['headerStyle'] })
            }
          >
            <option value="split">{t('design.headerSplit')}</option>
            <option value="centered">{t('design.headerCentered')}</option>
            <option value="banner">{t('design.headerBanner')}</option>
          </select>
        </label>
        <label>
          {t('design.clockStyle')}
          <select
            value={d.clockStyle}
            onChange={(e) =>
              onDesign({ clockStyle: e.target.value as DesignSettings['clockStyle'] })
            }
          >
            <option value="bold">{t('design.styleBold')}</option>
            <option value="elegant">{t('design.styleElegant')}</option>
            <option value="minimal">{t('design.styleMinimal')}</option>
          </select>
        </label>
        <label>
          {t('design.panelStyle')}
          <select
            value={d.panelStyle}
            onChange={(e) =>
              onDesign({ panelStyle: e.target.value as DesignSettings['panelStyle'] })
            }
          >
            <option value="glass">{t('design.panelGlass')}</option>
            <option value="solid">{t('design.panelSolid')}</option>
            <option value="outlined">{t('design.panelOutlined')}</option>
            <option value="soft">{t('design.panelSoft')}</option>
          </select>
        </label>
      </StudioSection>

      <StudioSection title={t('panels.designSectionColors')}>
        <div className="color-grid">
          {(
            [
              ['primaryColor', 'design.colorPrimary'],
              ['accentColor', 'design.colorAccent'],
              ['backgroundColor', 'design.colorBg1'],
              ['backgroundColor2', 'design.colorBg2'],
              ['mutedColor', 'design.colorMuted'],
            ] as const
          ).map(([key, labelKey]) => (
            <label key={key}>
              {t(labelKey)}
              <input
                type="color"
                value={d[key].startsWith('#') ? d[key].slice(0, 7) : '#888888'}
                onChange={(e) => onDesign({ [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="panel-color-row">
          <label>
            {t('design.panelColor')}
            <input
              type="color"
              value={panel.hex}
              onChange={(e) => onDesign({ panelColor: toRgba(e.target.value, panel.alpha) })}
            />
          </label>
          <label>
            {t('design.panelOpacity', { alpha: panel.alpha.toFixed(2) })}
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={panel.alpha}
              onChange={(e) =>
                onDesign({ panelColor: toRgba(panel.hex, Number(e.target.value)) })
              }
            />
          </label>
        </div>
        <label>
          {t('design.themeOverall')}
          <select
            value={config.theme}
            onChange={(e) => onChange({ theme: e.target.value as 'light' | 'dark' })}
          >
            <option value="light">{t('design.themeLight')}</option>
            <option value="dark">{t('design.themeDark')}</option>
          </select>
        </label>
      </StudioSection>

      <StudioSection title={t('panels.designSectionType')}>
        <label>
          {t('design.fontHeading')}
          <select
            value={d.fontHeading}
            onChange={(e) => onDesign({ fontHeading: e.target.value })}
          >
            {fontOptions.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `'${f.id}', sans-serif` }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('design.fontBody')}
          <select value={d.fontBody} onChange={(e) => onDesign({ fontBody: e.target.value })}>
            {fontOptions.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `'${f.id}', sans-serif` }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <div className="custom-fonts-box">
          <h3>{t('design.purchasedFonts')}</h3>
          <p className="hint">
            {t('design.fontsHint')}
          </p>
          <label>
            {t('design.fontDisplayName')}
            <input
              value={fontLabel}
              onChange={(e) => setFontLabel(e.target.value)}
              placeholder={t('design.fontDisplayPh')}
              disabled={fontBusy}
            />
          </label>
          <div className="custom-fonts-actions">
            <input
              ref={fontInputRef}
              type="file"
              accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
              hidden
              onChange={(e) => void onUploadFont(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn primary"
              disabled={fontBusy}
              onClick={() => fontInputRef.current?.click()}
            >
              {fontBusy ? t('design.uploading') : t('design.uploadFont')}
            </button>
          </div>
          {customFonts.length ? (
            <ul className="custom-fonts-list">
              {customFonts.map((f) => (
                <li key={f.id}>
                  <span style={{ fontFamily: `'${f.family}', sans-serif` }}>{f.name}</span>
                  <button type="button" className="btn ghost" onClick={() => onRemoveFont(f)}>
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t('design.noCustomFonts')}</p>
          )}
        </div>

        <label>
          {t('design.titleScale', { n: d.titleScale.toFixed(2) })}
          <input
            type="range"
            min={0.7}
            max={1.5}
            step={0.05}
            value={d.titleScale}
            onChange={(e) => onDesign({ titleScale: Number(e.target.value) })}
          />
        </label>
        <label>
          {t('design.clockScale', { n: d.clockScale.toFixed(2) })}
          <input
            type="range"
            min={0.7}
            max={1.6}
            step={0.05}
            value={d.clockScale}
            onChange={(e) => onDesign({ clockScale: Number(e.target.value) })}
          />
        </label>
        <label>
          {t('design.bodyScale', { n: d.bodyScale.toFixed(2) })}
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.05}
            value={d.bodyScale}
            onChange={(e) => onDesign({ bodyScale: Number(e.target.value) })}
          />
        </label>
      </StudioSection>

      <StudioSection title={t('panels.designSectionLogo')}>
        <MediaPickerField
          label={t('design.logo')}
          value={d.logoUrl}
          synagogueId={synagogueId}
          gallery={gallery}
          kind="image"
          onChange={(url) => onDesign({ logoUrl: url })}
          onGalleryChange={onGalleryChange}
          onStatus={onStatus}
        />
        <MediaPickerField
          label={t('design.bgImage')}
          value={d.backgroundImageUrl}
          synagogueId={synagogueId}
          gallery={gallery}
          kind="image"
          onChange={(url) => onDesign({ backgroundImageUrl: url })}
          onGalleryChange={onGalleryChange}
          onStatus={onStatus}
        />
        <label>
          {t('design.overlayDarkness', { n: d.overlayOpacity.toFixed(2) })}
          <input
            type="range"
            min={0}
            max={0.85}
            step={0.05}
            value={d.overlayOpacity}
            onChange={(e) => onDesign({ overlayOpacity: Number(e.target.value) })}
          />
        </label>
      </StudioSection>

      <StudioSection title={t('panels.designSectionMood')} defaultOpen={false}>
        <label>
          {t('design.density')}
          <select
            value={d.density}
            onChange={(e) => onDesign({ density: e.target.value as DesignSettings['density'] })}
          >
            <option value="compact">{t('design.densityCompact')}</option>
            <option value="comfortable">{t('design.densityComfortable')}</option>
            <option value="spacious">{t('design.densitySpacious')}</option>
          </select>
        </label>
        <label>
          {t('design.motion')}
          <select
            value={d.motion}
            onChange={(e) => onDesign({ motion: e.target.value as DesignSettings['motion'] })}
          >
            <option value="off">{t('design.motionOff')}</option>
            <option value="subtle">{t('design.motionSubtle')}</option>
            <option value="rich">{t('design.motionRich')}</option>
          </select>
        </label>
        <label>
          {t('design.panelRadius', { n: d.panelRadius })}
          <input
            type="range"
            min={0}
            max={28}
            step={1}
            value={d.panelRadius}
            onChange={(e) => onDesign({ panelRadius: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={d.showShadows}
            onChange={(e) => onDesign({ showShadows: e.target.checked })}
          />
          {t('design.shadows')}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={d.showOrnaments}
            onChange={(e) => onDesign({ showOrnaments: e.target.checked })}
          />
          {t('design.ornaments')}
        </label>
        <label>
          {t('design.tvScale', { n: (d.accessibilityScale ?? 1).toFixed(2) })}
          <input
            type="range"
            min={0.85}
            max={1.6}
            step={0.05}
            value={d.accessibilityScale ?? 1}
            onChange={(e) => onDesign({ accessibilityScale: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(d.highContrast)}
            onChange={(e) => onDesign({ highContrast: e.target.checked })}
          />
          {t('design.highContrast')}
        </label>
      </StudioSection>
    </div>
  );
}
