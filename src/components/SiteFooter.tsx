import { BrandLogo } from './BrandLogo';
import { useI18n } from '../i18n';
import { APP_VERSION } from '../lib/appVersion';

type Props = {
  /** Brand credit + version — only for per-screen admin (and similar). */
  credit?: boolean;
  /** Optional status line (sync / save messages) shown under the credit. */
  note?: string;
};

/** Persistent credit / support line — opt-in via `credit` so marketing pages stay clean. */
export function SiteFooter({ credit = false, note }: Props) {
  const { t, dir, locale } = useI18n();
  if (!credit) return null;
  return (
    <footer className="site-footer" dir={dir} lang={locale}>
      <p>
        <BrandLogo size="sm" className="site-footer-logo" />
        <span>
          {`${t('footer.credit')} `}
          <a href="tel:0524521527" dir="ltr">
            052-4521527
          </a>
          <span className="site-footer-version" dir="ltr">
            {` · v${APP_VERSION}`}
          </span>
        </span>
      </p>
      {note ? <p className="site-footer-note">{note}</p> : null}
    </footer>
  );
}
