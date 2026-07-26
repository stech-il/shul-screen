import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_DESIGN, layoutLabel } from '../data/designPresets';
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
}

const LAYOUTS: { id: ScreenLayout; label: string }[] = [
  { id: 'classic', label: 'קלאסי — 3 עמודות' },
  { id: 'split', label: 'מפוצל' },
  { id: 'minimal', label: 'מינימלי' },
  { id: 'magazine', label: 'מגזין' },
  { id: 'elegant', label: 'אלגנטי' },
  { id: 'board', label: 'לוח מודעות' },
  { id: 'dual', label: 'מסך כפול' },
  { id: 'event', label: 'אירוע / חתונה' },
  { id: 'mourning', label: 'אבל / לע״נ' },
  { id: 'canvas', label: 'בונה חופשי (גרירה)' },
];

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
}: Props) {
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
    void loadDesignTemplates().then(setSaved);
  }, []);

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
        fontLabel.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'פונט מותאם';
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
          ? `הפונט «${displayName}» נוסף — ${uploaded.warning}`
          : `הפונט «${displayName}» הועלה — בחר אותו בכותרות/גוף ולחץ שמור`,
      );
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : 'העלאת הפונט נכשלה');
    } finally {
      setFontBusy(false);
      if (fontInputRef.current) fontInputRef.current.value = '';
    }
  }

  function onRemoveFont(font: CustomFont) {
    if (!confirm(`למחוק את הפונט «${font.name}»?`)) return;
    const next = customFonts.filter((f) => f.id !== font.id);
    setCustomFonts(next);
    const patch: Partial<DesignSettings> = {};
    if (d.fontHeading === font.family) patch.fontHeading = DEFAULT_DESIGN.fontHeading;
    if (d.fontBody === font.family) patch.fontBody = DEFAULT_DESIGN.fontBody;
    if (Object.keys(patch).length) onDesign(patch);
    onStatus?.(`הפונט «${font.name}» הוסר`);
  }

  async function pickSaved(template: SavedDesignTemplate) {
    const applied = await applyDesignTemplate(template);
    onChange(applied);
    onStatus?.(`הוחלה התבנית «${template.name}» — לחץ שמור לעדכון המסך`);
  }

  async function onSaveTemplate() {
    const result = await saveDesignTemplate({
      name: tplName || `עיצוב ${new Date().toLocaleDateString('he-IL')}`,
      description: tplDesc,
      theme: config.theme,
      layout: config.layout,
      design: config.design,
      canvas: config.canvas,
    });
    if (!result.ok || !result.template) {
      onStatus?.(result.error ?? 'שמירת התבנית נכשלה');
      return;
    }
    setSaved(await loadDesignTemplates());
    setTplName('');
    setTplDesc('');
    onStatus?.(
      result.warning
        ? `נשמרה תבנית «${result.template.name}» — ${result.warning}`
        : `נשמרה תבנית «${result.template.name}» בענן`,
    );
  }

  async function onDeleteTemplate(id: string, name: string) {
    if (isSeedTemplateId(id)) {
      onStatus?.('לא ניתן למחוק תבנית מובנית');
      return;
    }
    if (!confirm(`למחוק את התבנית «${name}»?`)) return;
    await deleteDesignTemplate(id);
    setSaved(await loadDesignTemplates());
    onStatus?.(`נמחקה התבנית «${name}»`);
  }

  const templateGallery = useMemo(() => mergeGalleryTemplates(saved), [saved]);

  const filteredGallery = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templateGallery;
    return templateGallery.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        layoutLabel(t.layout).includes(query.trim()),
    );
  }, [templateGallery, query]);

  const filteredSeeds = useMemo(
    () => filteredGallery.filter((t) => isSeedTemplateId(t.id)),
    [filteredGallery],
  );
  const filteredUser = useMemo(
    () => filteredGallery.filter((t) => !isSeedTemplateId(t.id)),
    [filteredGallery],
  );

  function renderTemplateCard(t: SavedDesignTemplate, opts?: { seed?: boolean }) {
    const active = d.presetId === t.design.presetId;
    const seed = opts?.seed ?? isSeedTemplateId(t.id);
    return (
      <div
        key={t.id}
        className={`preset-card saved-tpl tpl-card ${active ? 'active' : ''} ${seed ? 'is-seed' : ''}`}
        style={{
          ['--p1' as string]: t.design.primaryColor,
          ['--p2' as string]: t.design.accentColor,
          ['--pb' as string]: t.design.backgroundColor,
        }}
      >
        <button type="button" className="preset-card-main" onClick={() => void pickSaved(t)}>
          <TemplatePreview template={t} />
          <div className="tpl-card-body">
            <strong>
              {t.name}
              {seed ? <span className="tpl-badge">מובנית</span> : null}
            </strong>
            <em>
              {t.description}
              {t.layout === 'canvas' ? ' · כולל בונה מסך' : ''}
            </em>
            <span className="tpl-meta">{layoutLabel(t.layout)}</span>
            <span className="tpl-apply">{active ? 'פעילה כעת' : 'החל תבנית'}</span>
          </div>
        </button>
        {!seed ? (
          <button
            type="button"
            className="tpl-delete"
            onClick={() => void onDeleteTemplate(t.id, t.name)}
          >
            מחק
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
            <strong>רוצים עיצוב מיוחד לבית הכנסת?</strong>
            <p>אפשר להזמין תבנית מותאמת אישית — אנא צרו קשר ונשמח לעזור.</p>
          </div>
          <a
            className="btn primary"
            href="https://wa.me/972524521527?text=%D7%A9%D7%9C%D7%95%D7%9D%2C%20%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%94%D7%96%D7%9E%D7%99%D7%9F%20%D7%A2%D7%99%D7%A6%D7%95%D7%91%20%D7%9E%D7%99%D7%95%D7%97%D7%93%20%D7%9C%D7%9E%D7%A1%D7%9A"
            target="_blank"
            rel="noreferrer"
          >
            צרו קשר בוואטסאפ
          </a>
        </div>
        <div className="tpl-gallery-head">
          <div>
            <h2>תבניות ({SEED_DESIGN_TEMPLATES.length + saved.length})</h2>
            <p className="hint">
              {SEED_DESIGN_TEMPLATES.length} תבניות מוכנות עם תצוגה מקדימה — לחצו להחלה. התבניות שלכם
              נשמרות בענן.
            </p>
          </div>
          <input
            className="tpl-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש תבנית…"
          />
        </div>

        {filteredGallery.length === 0 ? (
          <p className="hint">לא נמצאו תבניות לחיפוש הנוכחי.</p>
        ) : (
          <>
            {filteredSeeds.length > 0 ? (
              <div className="tpl-group">
                <h3 className="tpl-group-title">תבניות מוכנות ({filteredSeeds.length})</h3>
                <div className="preset-grid tpl-grid">
                  {filteredSeeds.map((t) => renderTemplateCard(t, { seed: true }))}
                </div>
              </div>
            ) : null}
            <div className="tpl-group">
              <h3 className="tpl-group-title">התבניות שלי ({filteredUser.length})</h3>
              {filteredUser.length === 0 ? (
                <p className="hint">
                  עדיין אין תבניות שמורות — כוונו עיצוב ושמרו אותו למטה כתבנית.
                </p>
              ) : (
                <div className="preset-grid tpl-grid">
                  {filteredUser.map((t) => renderTemplateCard(t, { seed: false }))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card wide">
        <h2>שמירה כתבנית שלי</h2>
        <p className="hint">
          כוונו עיצוב במסך הזה ושמרו אותו — התבנית נשמרת בענן ואפשר להחיל אותה על כל מסך
        </p>
        <div className="tpl-save-row">
          <label>
            שם התבנית
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="לדוגמה: עיצוב שבת / חתונה"
            />
          </label>
          <label>
            תיאור (אופציונלי)
            <input
              value={tplDesc}
              onChange={(e) => setTplDesc(e.target.value)}
              placeholder="מה מיוחד בתבנית הזו"
            />
          </label>
          <button type="button" className="btn primary" onClick={() => void onSaveTemplate()}>
            שמור כתבנית
          </button>
        </div>
      </section>

      <StudioSection title="פריסה">
        <label>
          מבנה מסך
          <select
            value={config.layout}
            onChange={(e) => onChange({ layout: e.target.value as ScreenLayout })}
          >
            {LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          סגנון כותרת
          <select
            value={d.headerStyle}
            onChange={(e) =>
              onDesign({ headerStyle: e.target.value as DesignSettings['headerStyle'] })
            }
          >
            <option value="split">מפוצל (שם | שעון)</option>
            <option value="centered">ממורכז</option>
            <option value="banner">באנר</option>
          </select>
        </label>
        <label>
          סגנון שעון
          <select
            value={d.clockStyle}
            onChange={(e) =>
              onDesign({ clockStyle: e.target.value as DesignSettings['clockStyle'] })
            }
          >
            <option value="bold">בולט</option>
            <option value="elegant">אלגנטי</option>
            <option value="minimal">מינימלי</option>
          </select>
        </label>
        <label>
          סגנון פאנלים
          <select
            value={d.panelStyle}
            onChange={(e) =>
              onDesign({ panelStyle: e.target.value as DesignSettings['panelStyle'] })
            }
          >
            <option value="glass">זכוכית</option>
            <option value="solid">אטום</option>
            <option value="outlined">מסגרת בלבד</option>
            <option value="soft">רך ללא מסגרת</option>
          </select>
        </label>
      </StudioSection>

      <StudioSection title="צבעים">
        <div className="color-grid">
          {(
            [
              ['primaryColor', 'טקסט ראשי'],
              ['accentColor', 'הדגשה'],
              ['backgroundColor', 'רקע 1'],
              ['backgroundColor2', 'רקע 2'],
              ['mutedColor', 'טקסט משני'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
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
            צבע פאנל
            <input
              type="color"
              value={panel.hex}
              onChange={(e) => onDesign({ panelColor: toRgba(e.target.value, panel.alpha) })}
            />
          </label>
          <label>
            שקיפות פאנל ({panel.alpha.toFixed(2)})
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
          ערכת נושא כללית
          <select
            value={config.theme}
            onChange={(e) => onChange({ theme: e.target.value as 'light' | 'dark' })}
          >
            <option value="light">בהיר</option>
            <option value="dark">כהה</option>
          </select>
        </label>
      </StudioSection>

      <StudioSection title="טיפוגרפיה וגודל">
        <label>
          גופן כותרות
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
          גופן גוף
          <select value={d.fontBody} onChange={(e) => onDesign({ fontBody: e.target.value })}>
            {fontOptions.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `'${f.id}', sans-serif` }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <div className="custom-fonts-box">
          <h3>פונטים שנרכשו</h3>
          <p className="hint">
            העלה קובץ פונט שרכשת (WOFF2 מומלץ, גם WOFF / TTF / OTF — עד 4MB) ואז בחר אותו למעלה.
          </p>
          <label>
            שם לתצוגה (אופציונלי)
            <input
              value={fontLabel}
              onChange={(e) => setFontLabel(e.target.value)}
              placeholder="למשל: פונט בית הכנסת"
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
              {fontBusy ? 'מעלה…' : 'העלה פונט'}
            </button>
          </div>
          {customFonts.length ? (
            <ul className="custom-fonts-list">
              {customFonts.map((f) => (
                <li key={f.id}>
                  <span style={{ fontFamily: `'${f.family}', sans-serif` }}>{f.name}</span>
                  <button type="button" className="btn ghost" onClick={() => onRemoveFont(f)}>
                    מחק
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">עדיין לא הועלו פונטים מותאמים.</p>
          )}
        </div>

        <label>
          גודל כותרת ({d.titleScale.toFixed(2)})
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
          גודל שעון ({d.clockScale.toFixed(2)})
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
          גודל טקסט ({d.bodyScale.toFixed(2)})
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

      <StudioSection title="לוגו ורקע">
        <MediaPickerField
          label="לוגו"
          value={d.logoUrl}
          synagogueId={synagogueId}
          gallery={gallery}
          kind="image"
          onChange={(url) => onDesign({ logoUrl: url })}
          onGalleryChange={onGalleryChange}
          onStatus={onStatus}
        />
        <MediaPickerField
          label="תמונת רקע"
          value={d.backgroundImageUrl}
          synagogueId={synagogueId}
          gallery={gallery}
          kind="image"
          onChange={(url) => onDesign({ backgroundImageUrl: url })}
          onGalleryChange={onGalleryChange}
          onStatus={onStatus}
        />
        <label>
          כהות שכבת רקע ({d.overlayOpacity.toFixed(2)})
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

      <StudioSection title="אווירה ופרטים" defaultOpen={false}>
        <label>
          צפיפות
          <select
            value={d.density}
            onChange={(e) => onDesign({ density: e.target.value as DesignSettings['density'] })}
          >
            <option value="compact">דחוס</option>
            <option value="comfortable">נוח</option>
            <option value="spacious">מרווח</option>
          </select>
        </label>
        <label>
          תנועה
          <select
            value={d.motion}
            onChange={(e) => onDesign({ motion: e.target.value as DesignSettings['motion'] })}
          >
            <option value="off">כבוי</option>
            <option value="subtle">עדין</option>
            <option value="rich">עשיר</option>
          </select>
        </label>
        <label>
          עיגול פינות ({d.panelRadius}px)
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
          צללים
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={d.showOrnaments}
            onChange={(e) => onDesign({ showOrnaments: e.target.checked })}
          />
          קו קישוט תחת הכותרת
        </label>
        <label>
          גודל לטלוויזיה ({(d.accessibilityScale ?? 1).toFixed(2)}×)
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
          ניגודיות גבוהה
        </label>
      </StudioSection>
    </div>
  );
}
