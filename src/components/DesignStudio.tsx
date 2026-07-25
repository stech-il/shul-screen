import { useEffect, useState } from 'react';
import {
  DESIGN_PRESETS,
  FONT_OPTIONS,
  applyPreset,
} from '../data/designPresets';
import {
  applyDesignTemplate,
  deleteDesignTemplate,
  loadDesignTemplates,
  saveDesignTemplate,
} from '../lib/designTemplates';
import type {
  DesignSettings,
  SavedDesignTemplate,
  ScreenLayout,
  SynagogueConfig,
} from '../types';

interface Props {
  config: SynagogueConfig;
  onChange: (patch: Partial<SynagogueConfig>) => void;
  onDesign: (patch: Partial<DesignSettings>) => void;
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

export function DesignStudio({ config, onChange, onDesign, onStatus }: Props) {
  const d = config.design;
  const [saved, setSaved] = useState<SavedDesignTemplate[]>([]);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');

  useEffect(() => {
    setSaved(loadDesignTemplates());
  }, []);

  function pickPreset(id: string) {
    const applied = applyPreset(id);
    if (!applied) return;
    onChange(applied);
  }

  function pickSaved(template: SavedDesignTemplate) {
    onChange(applyDesignTemplate(template));
    onStatus?.(`הוחלה התבנית «${template.name}»`);
  }

  function onSaveTemplate() {
    const template = saveDesignTemplate({
      name: tplName || `עיצוב ${new Date().toLocaleDateString('he-IL')}`,
      description: tplDesc,
      theme: config.theme,
      layout: config.layout,
      design: config.design,
      canvas: config.canvas,
    });
    setSaved(loadDesignTemplates());
    setTplName('');
    setTplDesc('');
    onStatus?.(`נשמרה תבנית «${template.name}»`);
  }

  function onDeleteTemplate(id: string, name: string) {
    if (!confirm(`למחוק את התבנית «${name}»?`)) return;
    deleteDesignTemplate(id);
    setSaved(loadDesignTemplates());
    onStatus?.(`נמחקה התבנית «${name}»`);
  }

  return (
    <div className="design-studio">
      <section className="card wide">
        <h2>שמירה כתבנית</h2>
        <p className="hint">
          שמור את העיצוב הנוכחי (צבעים, פריסה ובונה מסך) כדי להחיל אותו שוב מאוחר יותר
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
          <button type="button" className="btn primary" onClick={onSaveTemplate}>
            שמור כתבנית
          </button>
        </div>

        {saved.length ? (
          <>
            <h3 className="tpl-subtitle">התבניות שלי</h3>
            <div className="preset-grid">
              {saved.map((t) => (
                <div
                  key={t.id}
                  className={`preset-card saved-tpl ${d.presetId === t.design.presetId ? 'active' : ''}`}
                  style={{
                    ['--p1' as string]: t.design.primaryColor,
                    ['--p2' as string]: t.design.accentColor,
                    ['--pb' as string]: t.design.backgroundColor,
                  }}
                >
                  <button type="button" className="preset-card-main" onClick={() => pickSaved(t)}>
                    <span className="preset-swatch" />
                    <strong>{t.name}</strong>
                    <em>
                      {t.description}
                      {t.layout === 'canvas' ? ' · כולל בונה מסך' : ''}
                    </em>
                  </button>
                  <button
                    type="button"
                    className="tpl-delete"
                    onClick={() => onDeleteTemplate(t.id, t.name)}
                  >
                    מחק
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="hint">עדיין אין תבניות שמורות — בנה עיצוב ולחץ «שמור כתבנית»</p>
        )}
      </section>

      <section className="card wide">
        <h2>תבניות עיצוב מוכנות</h2>
        <p className="hint">לחץ על תבנית כדי להחיל מיד — אפשר לכוון אחר כך ידנית</p>
        <div className="preset-grid">
          {DESIGN_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`preset-card ${d.presetId === p.id ? 'active' : ''}`}
              onClick={() => pickPreset(p.id)}
              style={{
                ['--p1' as string]: p.design.primaryColor,
                ['--p2' as string]: p.design.accentColor,
                ['--pb' as string]: p.design.backgroundColor,
              }}
            >
              <span className="preset-swatch" />
              <strong>{p.name}</strong>
              <em>{p.description}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>פריסה</h2>
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
      </section>

      <section className="card">
        <h2>צבעים</h2>
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
        <label>
          צבע פאנל (כולל שקיפות אפשרית כטקסט)
          <input
            value={d.panelColor}
            onChange={(e) => onDesign({ panelColor: e.target.value })}
            placeholder="rgba(255,255,255,0.8)"
            dir="ltr"
            style={{ textAlign: 'left' }}
          />
        </label>
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
      </section>

      <section className="card">
        <h2>טיפוגרפיה וגודל</h2>
        <label>
          גופן כותרות
          <select
            value={d.fontHeading}
            onChange={(e) => onDesign({ fontHeading: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          גופן גוף
          <select value={d.fontBody} onChange={(e) => onDesign({ fontBody: e.target.value })}>
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
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
      </section>

      <section className="card">
        <h2>לוגו ורקע</h2>
        <label>
          לוגו (URL)
          <input
            value={d.logoUrl}
            onChange={(e) => onDesign({ logoUrl: e.target.value })}
            placeholder="https://..."
            dir="ltr"
            style={{ textAlign: 'left' }}
          />
        </label>
        <label>
          תמונת רקע (URL)
          <input
            value={d.backgroundImageUrl}
            onChange={(e) => onDesign({ backgroundImageUrl: e.target.value })}
            placeholder="https://..."
            dir="ltr"
            style={{ textAlign: 'left' }}
          />
        </label>
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
      </section>

      <section className="card">
        <h2>אווירה ופרטים</h2>
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
      </section>
    </div>
  );
}
