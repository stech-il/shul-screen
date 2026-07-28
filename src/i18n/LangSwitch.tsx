import { useI18n } from './I18nProvider';
import type { Locale } from './types';
import './LangSwitch.css';

type Props = {
  /** Visual variant for dark/light surfaces */
  variant?: 'dark' | 'light' | 'hero';
  className?: string;
};

export function LangSwitch({ variant = 'light', className = '' }: Props) {
  const { locale, setLocale, t } = useI18n();

  function pick(next: Locale) {
    if (next === locale) return;
    setLocale(next);
  }

  return (
    <div
      className={`lang-switch lang-switch--${variant} ${className}`.trim()}
      role="group"
      aria-label={t('common.language')}
    >
      <button
        type="button"
        className={locale === 'he' ? 'on' : ''}
        onClick={() => pick('he')}
        aria-pressed={locale === 'he'}
      >
        עב
      </button>
      <button
        type="button"
        className={locale === 'en' ? 'on' : ''}
        onClick={() => pick('en')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  );
}
