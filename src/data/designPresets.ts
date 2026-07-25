import type { DesignPreset, DesignSettings } from '../types';

export const FONT_OPTIONS = [
  { id: 'Frank Ruhl Libre', label: 'פרנק רוהל (כותרות)' },
  { id: 'Rubik', label: 'רוביק' },
  { id: 'Heebo', label: 'היבו' },
  { id: 'Assistant', label: 'אסיסטנט' },
  { id: 'Suez One', label: 'סואז' },
  { id: 'David Libre', label: 'דוד' },
  { id: 'Miriam Libre', label: 'מרים' },
  { id: 'Secular One', label: 'סקולר' },
] as const;

export const DEFAULT_DESIGN: DesignSettings = {
  presetId: 'jerusalem-stone',
  primaryColor: '#1c3140',
  accentColor: '#a8893d',
  backgroundColor: '#e8eeea',
  backgroundColor2: '#d2ddd6',
  panelColor: 'rgba(255,255,255,0.78)',
  mutedColor: '#5a6b73',
  logoUrl: '',
  backgroundImageUrl: '',
  fontHeading: 'Frank Ruhl Libre',
  fontBody: 'Rubik',
  titleScale: 1,
  clockScale: 1,
  bodyScale: 1,
  panelStyle: 'glass',
  panelRadius: 10,
  showShadows: true,
  density: 'comfortable',
  motion: 'subtle',
  headerStyle: 'split',
  clockStyle: 'bold',
  showOrnaments: true,
  overlayOpacity: 0.35,
  accessibilityScale: 1,
  highContrast: false,
};

function preset(
  id: string,
  name: string,
  description: string,
  theme: 'light' | 'dark',
  layout: DesignPreset['layout'],
  partial: Partial<DesignSettings>,
): DesignPreset {
  return {
    id,
    name,
    description,
    theme,
    layout,
    design: { ...DEFAULT_DESIGN, presetId: id, ...partial },
  };
}

/** Many ready-made looks for synagogues */
export const DESIGN_PRESETS: DesignPreset[] = [
  preset('jerusalem-stone', 'אבן ירושלים', 'בהיר, נקי, זהב עדין', 'light', 'classic', {
    primaryColor: '#1c3140',
    accentColor: '#a8893d',
    backgroundColor: '#e8eeea',
    backgroundColor2: '#d2ddd6',
    panelStyle: 'glass',
  }),
  preset('gold-sanctuary', 'זהב מקדש', 'כהה מפואר עם זהב', 'dark', 'elegant', {
    primaryColor: '#f3ead7',
    accentColor: '#d4af37',
    backgroundColor: '#121820',
    backgroundColor2: '#1c2836',
    panelColor: 'rgba(20,28,38,0.82)',
    mutedColor: '#9aa7b0',
    panelStyle: 'soft',
    clockStyle: 'elegant',
    headerStyle: 'centered',
    showOrnaments: true,
  }),
  preset('kinneret', 'ים כנרת', 'טורקיז רך ואוויר פתוח', 'light', 'split', {
    primaryColor: '#153f4a',
    accentColor: '#2a8f8a',
    backgroundColor: '#e4f1f0',
    backgroundColor2: '#c5e0dc',
    panelStyle: 'solid',
    fontHeading: 'Heebo',
  }),
  preset('grove', 'חורשה', 'ירוק עמוק ורגוע', 'light', 'classic', {
    primaryColor: '#1e3328',
    accentColor: '#5c8a4d',
    backgroundColor: '#e7efe4',
    backgroundColor2: '#cfdcc8',
    panelStyle: 'soft',
    fontHeading: 'David Libre',
  }),
  preset('shabbat-queen', 'שבת מלכה', 'ערב שבת אלגנטי', 'dark', 'magazine', {
    primaryColor: '#f6f0e6',
    accentColor: '#c9a227',
    backgroundColor: '#0d1117',
    backgroundColor2: '#182230',
    panelColor: 'rgba(18,26,36,0.88)',
    mutedColor: '#a8b3bc',
    panelStyle: 'outlined',
    headerStyle: 'banner',
    clockStyle: 'elegant',
    motion: 'rich',
  }),
  preset('morning-light', 'אור בוקר', 'בהיר ומרווח לקריאת היום', 'light', 'minimal', {
    primaryColor: '#243038',
    accentColor: '#3d7a6a',
    backgroundColor: '#f3f6f5',
    backgroundColor2: '#e4ebe8',
    panelStyle: 'solid',
    density: 'spacious',
    clockStyle: 'minimal',
    headerStyle: 'centered',
    showOrnaments: false,
    fontBody: 'Assistant',
  }),
  preset('kotel', 'כותל', 'אבן גיר ופחם', 'light', 'board', {
    primaryColor: '#2a2a2a',
    accentColor: '#8a7350',
    backgroundColor: '#ebe6dc',
    backgroundColor2: '#d8d0c2',
    panelColor: 'rgba(255,252,247,0.9)',
    panelStyle: 'outlined',
    panelRadius: 2,
    fontHeading: 'Suez One',
    showShadows: false,
  }),
  preset('tzfat', 'אוויר צפת', 'כחול־אפור מיסטי', 'dark', 'split', {
    primaryColor: '#e8eef5',
    accentColor: '#6e9bc3',
    backgroundColor: '#141c28',
    backgroundColor2: '#1e2c3e',
    panelColor: 'rgba(22,32,48,0.85)',
    mutedColor: '#9aadc0',
    panelStyle: 'glass',
    fontHeading: 'Miriam Libre',
  }),
  preset('negev', 'נגב', 'חול וחוּם נחושת', 'light', 'classic', {
    primaryColor: '#3a2c22',
    accentColor: '#b0783a',
    backgroundColor: '#f0e6d8',
    backgroundColor2: '#e0d0ba',
    panelColor: 'rgba(255,250,243,0.88)',
    mutedColor: '#6d5c4c',
    panelStyle: 'soft',
    fontHeading: 'Secular One',
  }),
  preset('modern-ink', 'מודרני נקי', 'מינימליסטי חד', 'light', 'board', {
    primaryColor: '#111827',
    accentColor: '#2563a8',
    backgroundColor: '#f7f8fa',
    backgroundColor2: '#e8ecf1',
    panelColor: 'rgba(255,255,255,0.95)',
    panelStyle: 'solid',
    panelRadius: 14,
    showOrnaments: false,
    motion: 'off',
    fontHeading: 'Heebo',
    fontBody: 'Heebo',
    density: 'compact',
  }),
  preset('olive-scroll', 'מגילת זית', 'ירוק־זית קלאסי', 'light', 'elegant', {
    primaryColor: '#2c351f',
    accentColor: '#7a8f3d',
    backgroundColor: '#eef0e4',
    backgroundColor2: '#d9dec8',
    panelStyle: 'glass',
    headerStyle: 'centered',
    clockStyle: 'elegant',
    fontHeading: 'Frank Ruhl Libre',
  }),
  preset('night-blue', 'לילה עמוק', 'כחול־לילה לטלוויזיה', 'dark', 'classic', {
    primaryColor: '#e7eef7',
    accentColor: '#4ea1d3',
    backgroundColor: '#0a1220',
    backgroundColor2: '#122033',
    panelColor: 'rgba(12,22,38,0.86)',
    mutedColor: '#8fa3b8',
    panelStyle: 'soft',
    density: 'comfortable',
    motion: 'subtle',
  }),
];

export function getPreset(id: string): DesignPreset | undefined {
  return DESIGN_PRESETS.find((p) => p.id === id);
}

export function applyPreset(presetId: string): Pick<
  import('../types').SynagogueConfig,
  'theme' | 'layout' | 'design'
> | null {
  const p = getPreset(presetId);
  if (!p) return null;
  return { theme: p.theme, layout: p.layout, design: { ...p.design } };
}

export function designToCssVars(design: DesignSettings): Record<string, string> {
  const dens =
    design.density === 'compact' ? '0.85' : design.density === 'spacious' ? '1.2' : '1';
  const a11y = design.accessibilityScale || 1;
  return {
    '--ink': design.highContrast ? '#000000' : design.primaryColor,
    '--accent': design.highContrast ? '#8a6a00' : design.accentColor,
    '--bg1': design.highContrast ? '#ffffff' : design.backgroundColor,
    '--bg2': design.highContrast ? '#f0f0f0' : design.backgroundColor2,
    '--panel': design.highContrast ? '#ffffff' : design.panelColor,
    '--muted': design.highContrast ? '#222222' : design.mutedColor,
    '--font-heading': `'${design.fontHeading}', serif`,
    '--font-body': `'${design.fontBody}', sans-serif`,
    '--title-scale': String(design.titleScale * a11y),
    '--clock-scale': String(design.clockScale * a11y),
    '--body-scale': String(design.bodyScale * a11y),
    '--radius': `${design.panelRadius}px`,
    '--density': dens,
    '--overlay': String(design.overlayOpacity),
    '--shadow': design.showShadows ? '0 12px 40px rgba(0,0,0,0.12)' : 'none',
    '--a11y-scale': String(a11y),
  };
}
