import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import { LangSwitch, useI18n } from '../i18n';
import {
  applyPlatformPasswordHash,
  completePasswordReset,
  peekPasswordResetToken,
} from '../lib/passwordReset';
import { syncConfig } from '../lib/storage';
import { createDefaultConfig } from '../data/defaults';
import './Admin.css';

export function ResetPassword() {
  const { t, dir, locale } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = String(params.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{
    kind?: string;
    username?: string;
    synagogueId?: string | null;
    secondsLeft?: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [donePath, setDonePath] = useState('');

  useEffect(() => {
    document.title = t('reset.seoTitle');
  }, [t, locale]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setError(t('reset.missingToken'));
        setLoading(false);
        return;
      }
      try {
        const data = await peekPasswordResetToken(token);
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error || t('reset.invalidToken'));
          setMeta(null);
        } else {
          setMeta({
            kind: data.kind,
            username: data.username,
            synagogueId: data.synagogueId,
            secondsLeft: data.secondsLeft,
          });
        }
      } catch (ex) {
        if (!cancelled) setError(ex instanceof Error ? ex.message : t('reset.invalidToken'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 4) {
      setError(t('reset.passShort'));
      return;
    }
    if (password !== password2) {
      setError(t('reset.passMismatch'));
      return;
    }
    setBusy(true);
    try {
      const result = await completePasswordReset(token, password);
      if (result.kind === 'platform' && result.username && result.passwordHash) {
        applyPlatformPasswordHash(result.username, result.passwordHash);
      }
      if (result.kind === 'synagogue' && result.synagogueId) {
        try {
          const fallback = await createDefaultConfig(result.synagogueId, t('login.defaultShul'));
          await syncConfig(result.synagogueId, fallback, { preferCloud: true });
        } catch {
          /* ignore — login will refresh */
        }
      }
      const path = result.loginPath || '/';
      setDonePath(path);
      window.setTimeout(() => {
        const clean = path.startsWith('/#/') ? path.replace(/^\/#/, '') || '/' : path;
        if (clean.startsWith('/')) {
          navigate(clean, { replace: true });
        } else {
          window.location.assign(clean);
        }
      }, 1200);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : t('reset.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin" dir={dir} lang={locale}>
      <div className="login-card" style={{ margin: '3rem auto', maxWidth: 420 }}>
        <BrandLogo size="md" className="login-brand-logo" />
        <div
          className="login-card-head"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <p className="eyebrow">{t('reset.title')}</p>
          <LangSwitch />
        </div>

        {loading ? <p className="hint">{t('reset.checking')}</p> : null}

        {!loading && error && !meta ? (
          <>
            <p className="status warn">{error}</p>
            <p className="hint">{t('reset.requestAgain')}</p>
            <Link className="btn ghost" to="/">
              {t('reset.backHome')}
            </Link>
          </>
        ) : null}

        {!loading && meta && !donePath ? (
          <form onSubmit={(e) => void onSubmit(e)} className="login-form">
            <p className="hint">
              {t('reset.forUser', { user: meta.username || '—' })}
              {meta.secondsLeft != null
                ? ` · ${t('reset.expiresIn', { sec: String(meta.secondsLeft) })}`
                : ''}
            </p>
            <label>
              {t('reset.newPassword')}
              <input
                type="password"
                autoComplete="new-password"
                dir="ltr"
                style={{ textAlign: 'left' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
              />
            </label>
            <label>
              {t('reset.confirmPassword')}
              <input
                type="password"
                autoComplete="new-password"
                dir="ltr"
                style={{ textAlign: 'left' }}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                minLength={4}
              />
            </label>
            {error ? <p className="status warn">{error}</p> : null}
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? t('reset.saving') : t('reset.submit')}
            </button>
          </form>
        ) : null}

        {donePath ? (
          <p className="status ok">{t('reset.success')}</p>
        ) : null}
      </div>
      <SiteFooter />
    </div>
  );
}
