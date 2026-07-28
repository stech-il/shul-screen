import { useI18n } from '../i18n';
import './ScreenIdBadge.css';

interface Props {
  id: string;
  /** compact = pill in headers; large = login / hero */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Show copy button */
  copyable?: boolean;
}

export function ScreenIdBadge({
  id,
  size = 'md',
  className = '',
  copyable = false,
}: Props) {
  const { t } = useI18n();
  const value = String(id || '').trim();
  if (!value) return null;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`screen-id-badge size-${size}${className ? ` ${className}` : ''}`}
      title={t('common.screenIdTitle', { id: value })}
    >
      <span className="screen-id-label">{t('common.screenId')}</span>
      <span className="screen-id-value" dir="ltr">
        {value}
      </span>
      {copyable ? (
        <button type="button" className="screen-id-copy" onClick={() => void onCopy()}>
          {t('common.copy')}
        </button>
      ) : null}
    </div>
  );
}
