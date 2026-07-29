import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import { canEditContent, loadSession } from '../lib/auth';
import { markManageSession, loginPathFor, adminPathFor } from '../lib/manageApp';
import { isValidScreenId, normalizeScreenId } from '../lib/screenId';
import { useI18n, LangSwitch } from '../i18n';
import './ManageApp.css';

export function ManageHome() {
  const { t, dir, locale } = useI18n();
  const navigate = useNavigate();
  const [screenId, setScreenId] = useState('');
  const [error, setError] = useState('');

  function go(e: FormEvent) {
    e.preventDefault();
    setError('');
    const id = normalizeScreenId(screenId);
    if (!isValidScreenId(id)) {
      setError(t('manage.invalidId'));
      return;
    }
    markManageSession();
    const session = loadSession();
    if (session && session.synagogueId === id && canEditContent(session.role)) {
      navigate(adminPathFor(id), { replace: true });
      return;
    }
    navigate(loginPathFor(id, true));
  }

  return (
    <div className="manage-home" dir={dir} lang={locale}>
      <header className="manage-home-top">
        <BrandLogo size="md" />
        <LangSwitch variant="light" />
      </header>
      <main className="manage-home-card">
        <p className="manage-home-kicker">{t('manage.kicker')}</p>
        <h1>{t('manage.title')}</h1>
        <p className="manage-home-lead">{t('manage.lead')}</p>
        <form onSubmit={go}>
          <label>
            {t('manage.screenId')}
            <input
              value={screenId}
              onChange={(e) => setScreenId(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              style={{ textAlign: 'left' }}
              placeholder="12"
              autoFocus
              required
            />
          </label>
          {error ? <p className="manage-home-error">{error}</p> : null}
          <button type="submit" className="btn primary">
            {t('manage.continue')}
          </button>
        </form>
        <p className="manage-home-note">{t('manage.note')}</p>
        <Link className="manage-home-web" to="/">
          {t('manage.backSite')}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
