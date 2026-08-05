import { BrandLogo } from './BrandLogo';
import { useI18n } from '../i18n';
import { APP_VERSION } from '../lib/appVersion';

/** Persistent credit / support line at the bottom of management screens. */
export function SiteFooter() {
  const { t, dir, locale } = useI18n();
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
    </footer>
  );
}
