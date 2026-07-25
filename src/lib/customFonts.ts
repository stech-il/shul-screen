import { FONT_OPTIONS } from '../data/designPresets';
import type { CustomFont } from '../types';

const STYLE_ID = 'shul-custom-fonts';

function cssEscapeFamily(family: string): string {
  return family.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function cssUrl(url: string): string {
  // Quoted url() handles data: and https:; escape embedded quotes
  return `'${url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Inject / refresh @font-face rules for uploaded fonts (Display + Admin). */
export function ensureCustomFontsLoaded(fonts: CustomFont[] | undefined | null): void {
  if (typeof document === 'undefined') return;
  const list = (fonts ?? []).filter((f) => f?.family && f?.url);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!list.length) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = list
    .map((f) => {
      const family = cssEscapeFamily(f.family);
      const src = `url(${cssUrl(f.url)})${f.format ? ` format('${f.format}')` : ''}`;
      return `@font-face{font-family:'${family}';src:${src};font-display:swap;font-style:normal;font-weight:100 900;}`;
    })
    .join('\n');
}

/** Built-in Google fonts + uploaded custom fonts for <select> lists. */
export function fontSelectOptions(customFonts?: CustomFont[] | null): { id: string; label: string }[] {
  const builtIn = FONT_OPTIONS.map((f) => ({ id: f.id, label: f.label }));
  const custom = (customFonts ?? []).map((f) => ({
    id: f.family,
    label: `${f.name} (מותאם)`,
  }));
  return [...builtIn, ...custom];
}

export function inferFontFormat(fileName: string): CustomFont['format'] | undefined {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'ttf') return 'truetype';
  if (ext === 'otf') return 'opentype';
  return undefined;
}

/** Build a safe CSS family name from a display name / file name. */
export function familyFromFontName(name: string, existing: CustomFont[]): string {
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^\w\u0590-\u05FF ]+/g, '')
      .trim()
      .replace(/\s+/g, ' ') || 'Custom Font';
  let family = base;
  let n = 2;
  const taken = new Set(existing.map((f) => f.family.toLowerCase()));
  for (const opt of FONT_OPTIONS) taken.add(opt.id.toLowerCase());
  while (taken.has(family.toLowerCase())) {
    family = `${base} ${n}`;
    n += 1;
  }
  return family;
}
