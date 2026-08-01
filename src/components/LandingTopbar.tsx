import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { LangSwitch, useI18n } from '../i18n';
import { fetchPublicSynagogues } from '../lib/publicDirectory';
import { isLandingCampaignActive } from '../lib/landingCampaign';
import '../pages/Landing.css';

const WHATSAPP = 'https://wa.me/972524521527';
const PHONE_TEL = 'tel:0524521527';
const PHONE_LABEL = '052-4521527';

type Props = {
  /** On the home page use in-page hashes; elsewhere link back to home sections. */
  onHomePage?: boolean;
};

export function LandingTopbar({ onHomePage = false }: Props) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginShulId, setLoginShulId] = useState('');
  const [showConnected, setShowConnected] = useState(false);
  const campaignOn = isLandingCampaignActive();

  const section = (id: string) => (onHomePage ? `#${id}` : `/#${id}`);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicSynagogues()
      .then((items) => {
        if (!cancelled) setShowConnected(items.length > 0);
      })
      .catch(() => {
        if (!cancelled) setShowConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onScreenLogin(e: FormEvent) {
    e.preventDefault();
    const id = loginShulId.trim();
    if (id.length < 2) return;
    setLoginOpen(false);
    navigate(`/login/${encodeURIComponent(id)}`);
  }

  return (
    <header className="landing-topbar">
      {onHomePage ? (
        <a className="landing-topbar-brand" href="#top" aria-label={t('landing.brandAria')}>
          <BrandLogo size="sm" withWordmark />
        </a>
      ) : (
        <Link className="landing-topbar-brand" to="/" aria-label={t('landing.brandAria')}>
          <BrandLogo size="sm" withWordmark />
        </Link>
      )}
      <nav className="landing-topbar-nav" aria-label={locale === 'he' ? 'ניווט ראשי' : 'Main navigation'}>
        <a href={section('about')}>{t('landing.navAbout')}</a>
        <a href={section('features')}>{t('landing.navFeatures')}</a>
        <a href={section('congregant')}>{t('landing.navCongregant')}</a>
        {showConnected ? <a href={section('connected')}>{t('landing.navConnected')}</a> : null}
        <a href={section('screens')}>{t('landing.navScreens')}</a>
        <a href={section('preview')}>{t('landing.navPreview')}</a>
        <a href={section('manage')}>{t('landing.navSystem')}</a>
        <a href={section('pricing')}>
          {campaignOn ? t('landing.navCampaign') : t('landing.navPricing')}
        </a>
        <a href={section('trial')}>{t('landing.navTrial')}</a>
        <Link to="/guide">{t('landing.navGuide')}</Link>
      </nav>
      <div className="landing-topbar-actions">
        <LangSwitch variant="dark" />
        <a className="landing-topbar-phone" href={PHONE_TEL} dir="ltr">
          {PHONE_LABEL}
        </a>
        <div className="landing-login-wrap">
          <button
            type="button"
            className={`landing-btn ghost-light compact${loginOpen ? ' on' : ''}`}
            aria-expanded={loginOpen}
            aria-controls="landing-login-panel"
            onClick={() => setLoginOpen((v) => !v)}
          >
            {t('landing.screenLogin')}
          </button>
          {loginOpen ? (
            <form
              id="landing-login-panel"
              className="landing-login-panel"
              onSubmit={onScreenLogin}
            >
              <label>
                {t('landing.screenLoginId')}
                <input
                  value={loginShulId}
                  onChange={(e) => setLoginShulId(e.target.value.trim())}
                  placeholder={t('landing.screenLoginPlaceholder')}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  required
                  minLength={1}
                  maxLength={12}
                  pattern="[0-9]*"
                />
              </label>
              <button type="submit" className="landing-btn primary compact">
                {t('landing.screenLoginGo')}
              </button>
              <p className="landing-login-hint">{t('landing.screenLoginHint')}</p>
            </form>
          ) : null}
        </div>
        <a className="landing-btn primary compact" href={WHATSAPP} target="_blank" rel="noreferrer">
          {t('landing.orderNow')}
        </a>
      </div>
    </header>
  );
}
