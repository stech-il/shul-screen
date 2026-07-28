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
import { createDefaultConfig } from '../data/defaults';
import { isLicenseValid } from '../lib/license';
import { syncConfig } from '../lib/storage';
import type { SynagogueConfig } from '../types';
import { SiteFooter } from '../components/SiteFooter';
import { BrandLogo } from '../components/BrandLogo';
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<SynagogueConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const billingQs = params.get('billing') === '1' ? '?billing=1' : '';

    const existing = loadSession();
    if (existing && existing.synagogueId === id && canEditContent(existing.role)) {
      navigate(`/admin/${encodeURIComponent(id)}${billingQs}`, { replace: true });
      return;
    }
    createDefaultConfig(id, 'בית כנסת').then((fallback) =>
      syncConfig(id, fallback, { preferCloud: true }).then((r) => {
        setConfig(r.bundle.config);
        setLoading(false);
      }),
    );
  }, [id, navigate, params]);

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

      if (!latest.members.length) {
        const ok = user === BOOTSTRAP_USER && pass === BOOTSTRAP_PASS;
        if (!ok) {
          setError(`כניסה ראשונית: ${BOOTSTRAP_USER} / ${BOOTSTRAP_PASS}`);
          return;
        }
        saveSession({
          synagogueId: id,
          memberId: 'bootstrap',
          memberName: 'מנהל',
          role: 'owner',
          remember,
        });
        navigate(
          params.get('billing') === '1'
            ? `/admin/${encodeURIComponent(id)}?billing=1`
            : `/admin/${encodeURIComponent(id)}`,
        );
        return;
      }

      const member = await authenticateMember(latest.members, user, pass);
      if (!member) {
        if (await memberUsernameExists(latest.members, user)) {
          setError('הסיסמה שגויה');
        } else {
          setError('שם משתמש לא נמצא במערכת זו');
        }
        return;
      }

      saveSession({
        synagogueId: id,
        memberId: member.id,
        memberName: member.name,
        role: member.role,
        remember,
      });
      navigate(
        params.get('billing') === '1'
          ? `/admin/${encodeURIComponent(id)}?billing=1`
          : `/admin/${encodeURIComponent(id)}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="admin loading" dir="rtl">
        טוען...
      </div>
    );
  }

  const licenseOk = isLicenseValid(config?.license);
  const licenseExpiry = config?.license?.expiresAt
    ? new Date(config.license.expiresAt).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="admin" dir="rtl" lang="he">
      <div className="login-card">
        <BrandLogo size="md" className="login-brand-logo" />
        <p className="eyebrow">כניסה לניהול</p>
        <h1>{config?.name ?? id}</h1>
        <p className={`license-banner ${licenseOk ? 'ok' : 'warn'}`}>
          {licenseOk ? (
            licenseExpiry ? (
              `מערכת ברישיון עד ${licenseExpiry}`
            ) : (
              'מערכת ברישיון פעיל'
            )
          ) : (
            <>
              אין רישיון פעיל למסך זה — פנה לספק המערכת · אחרי הכניסה אפשר{' '}
              <strong>לעדכן כרטיס אשראי</strong>
              {params.get('billing') === '1' ? ' (יועבר לתשלום אחרי התחברות)' : ''}
            </>
          )}
        </p>
        <p className="hint">שם משתמש וסיסמה של מנהל או עורך</p>
        <form onSubmit={onSubmit} className="login-form">
          <label>
            שם משתמש
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
            סיסמה
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
          <label className="check remember-check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            שמור התחברות במכשיר זה (14 יום)
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? 'בודק…' : 'כניסה'}
          </button>
        </form>
        <p className="hint session-hint">
          בלי סימון — הסשן נשמר עד סגירת הדפדפן / חוסר פעילות. עם סימון — נשמר גם אחרי רענון
          וסגירה.
        </p>
        <Link className="back-link" to={`/display/${id}`}>
          חזרה למסך התצוגה
        </Link>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            clearSession();
            setUsername('');
            setPassword('');
          }}
        >
          נקה סשן
        </button>
      </div>
      <SiteFooter />
    </div>
  );
}
