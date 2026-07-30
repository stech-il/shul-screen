import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import { canEditContent, loadSession } from '../lib/auth';
import {
  authenticateWithBiometric,
  isBiometricAvailable,
  loadBiometricEnabled,
  loadSavedManageScreenId,
  saveManageScreenId,
  setBiometricEnabled,
} from '../lib/manageAuth';
import { markManageSession, loginPathFor, adminPathFor } from '../lib/manageApp';
import { isValidScreenId, normalizeScreenId } from '../lib/screenId';
import { useI18n, LangSwitch } from '../i18n';
import './ManageApp.css';

export function ManageHome() {
  const { t, dir, locale } = useI18n();
  const navigate = useNavigate();
  const [screenId, setScreenId] = useState('');
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [locked, setLocked] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      markManageSession();
      const saved = await loadSavedManageScreenId();
      const bioOn = await loadBiometricEnabled();
      const bioOk = await isBiometricAvailable();
      if (cancelled) return;
      if (saved) setScreenId(saved);
      setBioEnabled(bioOn);
      setBioAvailable(bioOk);

      const session = loadSession();
      const canEnter = Boolean(
        saved && session && session.synagogueId === saved && canEditContent(session.role),
      );

      if (canEnter && saved) {
        if (bioOn && bioOk) {
          setLocked(true);
          setBooting(false);
          setUnlocking(true);
          const r = await authenticateWithBiometric(t('manage.biometricReason'));
          if (cancelled) return;
          setUnlocking(false);
          if (r.ok) {
            navigate(adminPathFor(saved), { replace: true });
            return;
          }
          setError(r.error || t('manage.biometricFailed'));
          return;
        }
        navigate(adminPathFor(saved), { replace: true });
        return;
      }

      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, t]);

  async function unlockWithBiometric() {
    setError('');
    setUnlocking(true);
    const id = normalizeScreenId(screenId);
    const r = await authenticateWithBiometric(t('manage.biometricReason'));
    setUnlocking(false);
    if (!r.ok) {
      setError(r.error || t('manage.biometricFailed'));
      return;
    }
    const session = loadSession();
    if (session && session.synagogueId === id && canEditContent(session.role)) {
      navigate(adminPathFor(id), { replace: true });
      return;
    }
    setLocked(false);
    setError(t('manage.sessionExpired'));
  }

  async function go(e: FormEvent) {
    e.preventDefault();
    setError('');
    const id = normalizeScreenId(screenId);
    if (!isValidScreenId(id)) {
      setError(t('manage.invalidId'));
      return;
    }
    markManageSession();
    await saveManageScreenId(id);
    const session = loadSession();
    if (session && session.synagogueId === id && canEditContent(session.role)) {
      if (bioEnabled && bioAvailable) {
        setLocked(true);
        await unlockWithBiometric();
        return;
      }
      navigate(adminPathFor(id), { replace: true });
      return;
    }
    navigate(loginPathFor(id, true));
  }

  async function toggleBiometric(on: boolean) {
    setError('');
    if (on) {
      if (!bioAvailable) {
        setError(t('manage.biometricUnavailable'));
        return;
      }
      const r = await authenticateWithBiometric(t('manage.biometricEnableReason'));
      if (!r.ok) {
        setError(r.error || t('manage.biometricFailed'));
        return;
      }
      await setBiometricEnabled(true);
      setBioEnabled(true);
      return;
    }
    await setBiometricEnabled(false);
    setBioEnabled(false);
  }

  if (booting) {
    return (
      <div className="manage-home" dir={dir} lang={locale}>
        <main className="manage-home-card">
          <p className="manage-home-kicker">{t('manage.kicker')}</p>
          <h1>{t('manage.unlocking')}</h1>
        </main>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="manage-home" dir={dir} lang={locale}>
        <header className="manage-home-top">
          <BrandLogo size="md" />
          <LangSwitch variant="light" />
        </header>
        <main className="manage-home-card">
          <p className="manage-home-kicker">{t('manage.kicker')}</p>
          <h1>{t('manage.unlockTitle')}</h1>
          <p className="manage-home-lead">{t('manage.unlockLead')}</p>
          {error ? <p className="manage-home-error">{error}</p> : null}
          <button
            type="button"
            className="btn primary"
            disabled={unlocking}
            onClick={() => void unlockWithBiometric()}
          >
            {unlocking ? t('manage.unlocking') : t('manage.unlockBiometric')}
          </button>
          <button
            type="button"
            className="btn manage-home-secondary"
            onClick={() => {
              setLocked(false);
              setError('');
              navigate(loginPathFor(normalizeScreenId(screenId), true));
            }}
          >
            {t('manage.usePassword')}
          </button>
        </main>
        <SiteFooter />
      </div>
    );
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
        <form onSubmit={(e) => void go(e)}>
          <label>
            {t('manage.screenId')}
            <input
              value={screenId}
              onChange={(e) => setScreenId(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              style={{ textAlign: 'left' }}
              placeholder="12"
              autoFocus={!screenId}
              required
            />
          </label>
          {error ? <p className="manage-home-error">{error}</p> : null}
          <button type="submit" className="btn primary">
            {t('manage.continue')}
          </button>
        </form>
        {bioAvailable ? (
          <label className="manage-home-bio">
            <input
              type="checkbox"
              checked={bioEnabled}
              onChange={(e) => void toggleBiometric(e.target.checked)}
            />
            {t('manage.biometricToggle')}
          </label>
        ) : null}
        <p className="manage-home-note">{t('manage.note')}</p>
        <Link className="manage-home-web" to="/">
          {t('manage.backSite')}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
