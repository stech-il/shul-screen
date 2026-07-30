import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  authenticateMember,
  canEditContent,
  clearSession,
  loadSession,
  memberUsernameExists,
  saveSession,
} from '../lib/auth';
import { isLicenseValid } from '../lib/license';
import { requestPasswordReset } from '../lib/passwordReset';
import { syncConfig } from '../lib/storage';
import { adminPathFor, markManageSession, preferManageRoutes } from '../lib/manageApp';
import { saveManageScreenId } from '../lib/manageAuth';
import type { SynagogueConfig } from '../types';
import { SiteFooter } from '../components/SiteFooter';
import { BrandLogo } from '../components/BrandLogo';
import { ScreenIdBadge } from '../components/ScreenIdBadge';
import { useI18n, LangSwitch } from '../i18n';
import './Admin.css';

const BOOTSTRAP_USER = 'admin';
const BOOTSTRAP_PASS = 'admin123';

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function Login() {
  const { id: rawId = '' } = useParams();
  const id = decodeId(rawId);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, dir, locale, dateTag } = useI18n();
  const manageLogin = params.get('manage') === '1' || preferManageRoutes();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<SynagogueConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (manageLogin) markManageSession();

    const existing = loadSession();
    if (existing && existing.synagogueId === id && canEditContent(existing.role)) {
      void saveManageScreenId(id);
      navigate(adminPathFor(id, params.get('billing') === '1'), { replace: true });
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMissing(false);
    void (async () => {
      try {
        // No fallback — missing cloud id must not create a synagogue
        const r = await syncConfig(id, undefined, { preferCloud: true });
        if (cancelled) return;
        if (r.source === 'default') {
          setMissing(true);
          setConfig(null);
        } else {
          setConfig(r.bundle.config);
          setMissing(false);
        }
      } catch {
        if (!cancelled) {
          setMissing(true);
          setConfig(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, navigate, params, t, manageLogin]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setError('');
    setSubmitting(true);

    try {
      // Always refresh from cloud so newly created users/passwords are visible.
      let latest = config;
      try {
        const fresh = await syncConfig(id, config, { preferCloud: true });
        latest = fresh.bundle.config;
        setConfig(latest);
      } catch {
        /* use in-memory config */
      }

      const user = username.trim().toLowerCase();
      const pass = password.trim();

      const staySignedIn = manageLogin ? true : remember;

      if (!latest.members.length) {
        const ok = user === BOOTSTRAP_USER && pass === BOOTSTRAP_PASS;
        if (!ok) {
          setError(t('login.bootstrapHint', { user: BOOTSTRAP_USER, pass: BOOTSTRAP_PASS }));
          return;
        }
        saveSession({
          synagogueId: id,
          memberId: 'bootstrap',
          memberName: t('login.manager'),
          role: 'owner',
          remember: staySignedIn,
        });
        if (manageLogin) await saveManageScreenId(id);
        navigate(adminPathFor(id, params.get('billing') === '1'));
        return;
      }

      const member = await authenticateMember(latest.members, user, pass);
      if (!member) {
        if (await memberUsernameExists(latest.members, user)) {
          setError(t('login.wrongPassword'));
        } else {
          setError(t('login.userNotFound'));
        }
        return;
      }

      saveSession({
        synagogueId: id,
        memberId: member.id,
        memberName: member.name,
        role: member.role,
        remember: staySignedIn,
      });
      if (manageLogin) await saveManageScreenId(id);
      navigate(adminPathFor(id, params.get('billing') === '1'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setError('');
    setForgotMsg('');
    const user = username.trim().toLowerCase();
    if (!user) {
      setError(t('login.userNotFound'));
      return;
    }
    setForgotBusy(true);
    try {
      const result = await requestPasswordReset({
        kind: 'synagogue',
        synagogueId: id,
        username: user,
      });
      setForgotMsg(result.message || t('login.forgotSent'));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : t('login.forgotSent'));
    } finally {
      setForgotBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="admin loading" dir={dir} lang={locale}>
        {t('login.loading')}
      </div>
    );
  }

  if (missing || !config) {
    return (
      <div className="admin" dir={dir} lang={locale}>
        <div className="login-card">
          <BrandLogo size="md" className="login-brand-logo" />
          <p className="eyebrow">{t('login.title')}</p>
          <h1>{t('login.missingShul', { id })}</h1>
          <div className="admin-id-row">
            <ScreenIdBadge id={id} size="lg" copyable />
          </div>
          <p className="hint">{t('login.missingShulHint')}</p>
          <Link className="btn primary" to="/">
            {t('login.backHome')}
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const licenseOk = isLicenseValid(config.license);
  const licenseExpiry = config?.license?.expiresAt
    ? new Date(config.license.expiresAt).toLocaleDateString(dateTag, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="admin" dir={dir} lang={locale}>
      <div className="login-card">
        <BrandLogo size="md" className="login-brand-logo" />
        <div className="login-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <p className="eyebrow">{t('login.title')}</p>
          <LangSwitch variant="light" />
        </div>
        <h1>{config.name}</h1>
        <div className="admin-id-row">
          <ScreenIdBadge id={id} size="lg" copyable />
        </div>
        <p className={`license-banner ${licenseOk ? 'ok' : 'warn'}`}>
          {licenseOk ? (
            licenseExpiry ? (
              t('login.licenseUntil', { date: licenseExpiry })
            ) : (
              t('login.licenseActive')
            )
          ) : (
            <>
              {t('login.licenseMissing')}
              <strong>{t('login.updateCard')}</strong>
              {params.get('billing') === '1' ? t('login.billingRedirect') : ''}
            </>
          )}
        </p>
        <p className="hint">{mode === 'forgot' ? t('login.forgotHint') : t('login.hint')}</p>
        {mode === 'login' ? (
          <form onSubmit={(e) => void onSubmit(e)} className="login-form">
            <label>
              {t('login.username')}
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </label>
            <label>
              {t('login.password')}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </label>
            {manageLogin ? (
              <p className="hint">{t('manage.loginStaySignedIn')}</p>
            ) : (
              <label className="check remember-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                {t('login.remember')}
              </label>
            )}
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? t('login.checking') : t('login.submit')}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setMode('forgot');
                setError('');
                setForgotMsg('');
              }}
            >
              {t('login.forgot')}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void onForgot(e)} className="login-form">
            <p className="eyebrow">{t('login.forgotTitle')}</p>
            <label>
              {t('login.username')}
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            {forgotMsg ? <p className="status ok">{forgotMsg}</p> : null}
            <button type="submit" className="btn primary" disabled={forgotBusy}>
              {forgotBusy ? t('login.forgotSending') : t('login.forgotSubmit')}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setMode('login');
                setError('');
                setForgotMsg('');
              }}
            >
              {t('login.forgotBack')}
            </button>
          </form>
        )}
        <p className="hint session-hint">
          {manageLogin ? t('manage.loginSessionHint') : t('login.sessionHint')}
        </p>
        {manageLogin ? (
          <Link className="back-link" to="/manage">
            {t('manage.backToHome')}
          </Link>
        ) : (
          <Link className="back-link" to={`/display/${id}`}>
            {t('login.backToDisplay')}
          </Link>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            clearSession();
            setUsername('');
            setPassword('');
          }}
        >
          {t('login.clearSession')}
        </button>
      </div>
      <SiteFooter />
    </div>
  );
}
