import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries } from './dictionaries';
import {
  LOCALE_STORAGE_KEY,
  localeDateTag,
  localeDir,
  type Dict,
  type Locale,
} from './types';

type Vars = Record<string, string | number>;

type AnyDict = Dict | (typeof dictionaries)['en'];

type I18nValue = {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  dateTag: string;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: Vars) => string;
  dict: AnyDict;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === 'he' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return 'he';
}

function lookup(dict: AnyDict, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const dir = localeDir(locale);
  const dateTag = localeDateTag(locale);
  const dict = dictionaries[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const t = useCallback(
    (path: string, vars?: Vars) => {
      const raw = lookup(dict, path) ?? lookup(dictionaries.he, path) ?? path;
      return interpolate(raw, vars);
    },
    [dict],
  );

  const value = useMemo(
    () => ({ locale, dir, dateTag, setLocale, t, dict }),
    [locale, dir, dateTag, setLocale, t, dict],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
