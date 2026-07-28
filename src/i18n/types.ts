export type Locale = 'he' | 'en';

export const LOCALE_STORAGE_KEY = 'screensmart:lang';

export function localeDir(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'he' ? 'rtl' : 'ltr';
}

export function localeDateTag(locale: Locale): string {
  return locale === 'he' ? 'he-IL' : 'en-US';
}

export type Dict = typeof import('./dictionaries/he').he;
