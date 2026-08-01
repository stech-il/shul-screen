import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  authenticateMember,
  canEditContent,
  clearSession,
  loadSession,
  memberUsernameExists,
  saveSession,
} from '../lib/auth';
import {
  fetchGoogleClientConfig,
  linkGoogleAccount,
  loginWithGoogleIdToken,
  mountGoogleButton,
} from '../lib/googleAuth';
import { isLicenseValid } from '../lib/license';
import { requestPasswordReset } from '../lib/passwordReset';
import { syncConfig } from '../lib/storage';
import { adminPathFor, markManageSession, preferManageRoutes } from '../lib/manageApp';
import {
  authenticateWithBiometric,
  isBiometricAvailable,
  loadBiometricEnabled,
  saveManageScreenId,
  setBiometricEnabled,
} from '../lib/manageAuth';
import {
  fetchPasskeyStatus,
  isPasskeySupported,
  loginWithPasskey,
  registerPasskey,
} from '../lib/webauthnAuth';
import type { SynagogueConfig, UserRole } from '../types';
import { SiteFooter } from '../components/SiteFooter';
import { BrandLogo } from '../components/BrandLogo';
import { NotFoundScreen } from '../components/NotFoundScreen';
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
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioUnlockReady, setBioUnlockReady] = useState(false);
  const [altBusy, setAltBusy] = useState(false);
  const [postLoginOffer, setPostLoginOffer] = useState(false);
  const [lastCreds, setLastCreds] = useState<{ username: string; password: string } | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  function finishLogin(input: {
    memberId: string;
    memberName: string;
    role: UserRole;
    remember: boolean;
    offerExtras?: boolean;
    username?: string;
    password?: string;
  }) {
    saveSession({
      synagogueId: id,
      memberId: input.memberId,
      memberName: input.memberName,
      role: input.role,
      remember: input.remember,
    });
    void saveManageScreenId(id);
    if (input.offerExtras && input.username && input.password) {
      setLastCreds({ username: input.username, password: input.password });
      setPostLoginOffer(true);
      return;
    }
    navigate(adminPathFor(id, params.get('billing') === '1'));
  }

  useEffect(() => {
    if (manageLogin) markManageSession();

    let cancelled = false;
    setLoading(true);
    setMissing(false);
    void (async () => {
      try {
        const existing = loadSession();
        const bioOn = await loadBiometricEnabled();
        const bioOk = await isBiometricAvailable();
        if (
          existing &&
          existing.synagogueId === id &&
          canEditContent(existing.role) &&
          !(manageLogin && bioOn && bioOk)
        ) {
          await saveManageScreenId(id);
          if (!cancelled) navigate(adminPathFor(id, params.get('billing') === '1'), { replace: true });
          return;
        }
        if (existing && existing.synagogueId === id && canEditContent(existing.role) && bioOn && bioOk) {
          if (!cancelled) setBioUnlockReady(true);
        }
        if (!cancelled) {
          setBioAvailable(bioOk);
          setPasskeyAvailable(isPasskeySupported());
        }

        const r = await syncConfig(id, undefined, { preferCloud: true });
        if (cancelled) return;
        if (r.source === 'default') {
          setMissing(true);
          setConfig(null);
        } else {
          setConfig(r.bundle.config);
          setMissing(false);
        }

        const [g, pk] = await Promise.all([
          fetchGoogleClientConfig(),
          fetchPasskeyStatus(id),
        ]);
        if (cancelled) return;
        setGoogleEnabled(g.enabled);
        setGoogleClientId(g.clientId);
        setPasskeyEnabled(pk);
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
  }, [id, navigate, params, manageLogin]);

  useEffect(() => {
    if (!googleEnabled || !googleClientId || mode !== 'login' || !googleBtnRef.current) return;
    let cleanup: (() => void) | undefined;
    void mountGoogleButton(
      googleBtnRef.current,
      googleClientId,
      locale === 'he' ? 'he' : 'en',
      (idToken) => {
        void (async () => {
          setError('');
          setAltBusy(true);
          try {
            const member = await loginWithGoogleIdToken(id, idToken);
            finishLogin({
              memberId: member.id,
              memberName: member.name,
              role: member.role,
              remember: manageLogin ? true : remember,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : t('login.googleFailed'));
          } finally {
            setAltBusy(false);
          }
        })();
      },
      (msg) => setError(msg),
    ).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
    // finishLogin closes over current state — intentional for button callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEnabled, googleClientId, mode, locale, id, manageLogin, remember, t]);

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

      const { memberLoginRemote } = await import('../lib/passwordReset');
      const { setMemberApiToken } = await import('../lib/serverAuth');
      const remote = await memberLoginRemote(id, user, pass);
      if (remote.ok) {
        setMemberApiToken(remote.token);
        const canOffer =
          (passkeyAvailable || googleEnabled || bioAvailable) && Boolean(user && pass);
        finishLogin({
          memberId: remote.member.id,
          memberName: remote.member.name || t('login.manager'),
          role: (remote.member.role as UserRole) || 'owner',
          remember: staySignedIn,
          offerExtras: canOffer,
          username: user,
          password: pass,
        });
        return;
      }

      if (!latest.members.length) {
        const ok = user === BOOTSTRAP_USER && pass === BOOTSTRAP_PASS;
        if (!ok) {
          setError(remote.error || t('login.bootstrapHint', { user: BOOTSTRAP_USER, pass: BOOTSTRAP_PASS }));
          return;
        }
        // Dev / offline bootstrap only — no API token
        finishLogin({
          memberId: 'bootstrap',
          memberName: t('login.manager'),
          role: 'owner',
          remember: staySignedIn,
        });
        return;
      }

      const member = await authenticateMember(latest.members, user, pass);
      if (!member) {
        if (await memberUsernameExists(latest.members, user)) {
          setError(t('login.wrongPassword'));
        } else {
          setError(remote.error || t('login.userNotFound'));
        }
        return;
      }

      const canOffer =
        (passkeyAvailable || googleEnabled || bioAvailable) && Boolean(user && pass);
      finishLogin({
        memberId: member.id,
        memberName: member.name,
        role: member.role,
        remember: staySignedIn,
        offerExtras: canOffer,
        username: user,
        password: pass,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasskeyLogin() {
    setError('');
    setAltBusy(true);
    try {
      const member = await loginWithPasskey(id);
      finishLogin({
        memberId: member.id,
        memberName: member.name,
        role: member.role,
        remember: manageLogin ? true : remember,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.passkeyFailed'));
    } finally {
      setAltBusy(false);
    }
  }

  async function onBiometricUnlock() {
    setError('');
    setAltBusy(true);
    try {
      const r = await authenticateWithBiometric(t('manage.biometricReason'));
      if (!r.ok) {
        setError(r.error || t('manage.biometricFailed'));
        return;
      }
      const existing = loadSession();
      if (existing && existing.synagogueId === id && canEditContent(existing.role)) {
        await saveManageScreenId(id);
        navigate(adminPathFor(id, params.get('billing') === '1'));
        return;
      }
      setError(t('manage.sessionExpired'));
      setBioUnlockReady(false);
    } finally {
      setAltBusy(false);
    }
  }

  async function onRegisterPasskey() {
    if (!lastCreds) return;
    setError('');
    setAltBusy(true);
    try {
      await registerPasskey({
        synagogueId: id,
        username: lastCreds.username,
        password: lastCreds.password,
      });
      setPasskeyEnabled(true);
      setPostLoginOffer(false);
      navigate(adminPathFor(id, params.get('billing') === '1'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.passkeyRegisterFailed'));
    } finally {
      setAltBusy(false);
    }
  }

  async function onLinkGoogle() {
    if (!lastCreds || !googleClientId) return;
    setError('');
    setAltBusy(true);
    try {
      const { requestGoogleIdToken } = await import('../lib/googleAuth');
      const idToken = await requestGoogleIdToken(googleClientId);
      await linkGoogleAccount({
        synagogueId: id,
        username: lastCreds.username,
        password: lastCreds.password,
        idToken,
      });
      setPostLoginOffer(false);
      navigate(adminPathFor(id, params.get('billing') === '1'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.googleLinkFailed'));
    } finally {
      setAltBusy(false);
    }
  }

  async function onEnableBiometric() {
    setError('');
    setAltBusy(true);
    try {
      const r = await authenticateWithBiometric(t('manage.biometricEnableReason'));
      if (!r.ok) {
        setError(r.error || t('manage.biometricFailed'));
        return;
      }
      await setBiometricEnabled(true);
      setPostLoginOffer(false);
      navigate(adminPathFor(id, params.get('billing') === '1'));
    } finally {
      setAltBusy(false);
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
      <NotFoundScreen
        screenId={id}
        homeTo={manageLogin || preferManageRoutes() ? '/manage' : '/'}
      />
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
        <p className="hint">
          {postLoginOffer
            ? t('login.setupExtrasHint')
            : mode === 'forgot'
              ? t('login.forgotHint')
              : t('login.hint')}
        </p>
        {postLoginOffer ? (
          <div className="login-form login-extras">
            <p className="eyebrow">{t('login.setupExtrasTitle')}</p>
            {error ? <p className="error">{error}</p> : null}
            {passkeyAvailable ? (
              <button
                type="button"
                className="btn primary"
                disabled={altBusy}
                onClick={() => void onRegisterPasskey()}
              >
                {t('login.setupPasskey')}
              </button>
            ) : null}
            {googleEnabled ? (
              <button
                type="button"
                className="btn ghost"
                disabled={altBusy}
                onClick={() => void onLinkGoogle()}
              >
                {t('login.setupGoogle')}
              </button>
            ) : null}
            {bioAvailable ? (
              <button
                type="button"
                className="btn ghost"
                disabled={altBusy}
                onClick={() => void onEnableBiometric()}
              >
                {t('login.setupBiometric')}
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              disabled={altBusy}
              onClick={() => {
                setPostLoginOffer(false);
                setLastCreds(null);
                navigate(adminPathFor(id, params.get('billing') === '1'));
              }}
            >
              {t('login.setupSkip')}
            </button>
          </div>
        ) : mode === 'login' ? (
          <form onSubmit={(e) => void onSubmit(e)} className="login-form">
            {bioUnlockReady ? (
              <button
                type="button"
                className="btn primary"
                disabled={altBusy}
                onClick={() => void onBiometricUnlock()}
              >
                {t('login.biometricUnlock')}
              </button>
            ) : null}
            {passkeyEnabled && passkeyAvailable ? (
              <button
                type="button"
                className="btn ghost"
                disabled={altBusy || submitting}
                onClick={() => void onPasskeyLogin()}
              >
                {t('login.passkeySubmit')}
              </button>
            ) : null}
            {googleEnabled ? (
              <div className="login-google-wrap">
                <div ref={googleBtnRef} className="login-google-btn" />
              </div>
            ) : null}
            {(bioUnlockReady || passkeyEnabled || googleEnabled) && (
              <p className="login-or">{t('login.orPassword')}</p>
            )}
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
            <button type="submit" className="btn primary" disabled={submitting || altBusy}>
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
