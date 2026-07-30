import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { ScreenIdBadge } from './ScreenIdBadge';
import { SiteFooter } from './SiteFooter';
import { LangSwitch, useI18n } from '../i18n';
import { preferManageRoutes } from '../lib/manageApp';
import './NotFoundScreen.css';

const PHONE_TEL = 'tel:0524521527';
const PHONE_LABEL = '052-4521527';
const WHATSAPP = 'https://wa.me/972524521527';

type Props = {
  /** Screen / synagogue id that was requested */
  screenId?: string;
  /** Override primary back link */
  homeTo?: string;
  homeLabel?: string;
  /** If set, primary action calls this instead of navigating */
  onHomeClick?: () => void;
  /** Compact embed without footer (rare) */
  hideFooter?: boolean;
};

/**
 * Branded 404 when a screen ID does not exist in the system.
 */
export function NotFoundScreen({ screenId, homeTo, homeLabel, onHomeClick, hideFooter }: Props) {
  const { t, dir, locale } = useI18n();
  const id = String(screenId || '').trim();
  const defaultHome = preferManageRoutes() ? '/manage' : '/';
  const to = homeTo || defaultHome;
  const label =
    homeLabel ||
    (preferManageRoutes() ? t('notFound.backManage') : t('notFound.backHome'));

  return (
    <div className="nf-page" dir={dir} lang={locale}>
      <header className="nf-top">
        <BrandLogo size="sm" withWordmark />
        <LangSwitch variant="dark" />
      </header>

      <main className="nf-card" role="alert" aria-live="polite">
        <p className="nf-code" aria-hidden="true">
          404
        </p>
        <p className="nf-kicker">{t('notFound.kicker')}</p>
        <h1>{t('notFound.title')}</h1>
        {id ? (
          <div className="nf-id">
            <ScreenIdBadge id={id} size="lg" copyable />
          </div>
        ) : null}
        <p className="nf-lead">
          {id ? t('notFound.leadWithId', { id }) : t('notFound.lead')}
        </p>
        <p className="nf-hint">{t('notFound.hint')}</p>

        <div className="nf-actions">
          {onHomeClick ? (
            <button type="button" className="nf-btn primary" onClick={onHomeClick}>
              {label}
            </button>
          ) : (
            <Link className="nf-btn primary" to={to}>
              {label}
            </Link>
          )}
          <a className="nf-btn ghost" href={WHATSAPP} target="_blank" rel="noreferrer">
            {t('notFound.whatsapp')}
          </a>
        </div>

        <a className="nf-phone" href={PHONE_TEL} dir="ltr">
          {PHONE_LABEL}
        </a>
      </main>

      {hideFooter ? null : <SiteFooter />}
    </div>
  );
}
