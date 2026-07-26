import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  authenticateMember,
  canEditContent,
  clearSession,
  loadSession,
  saveSession,
} from '../lib/auth';
import { createDefaultConfig } from '../data/defaults';
import { isLicenseValid } from '../lib/license';
import { syncConfig } from '../lib/storage';
import type { SynagogueConfig } from '../types';
import { SiteFooter } from '../components/SiteFooter';
import './Admin.css';

const BOOTSTRAP_USER = 'admin';
const BOOTSTRAP_PASS = 'admin123';

export function Login() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<SynagogueConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const billingQs = params.get('billing') === '1' ? '?billing=1' : '';

    const existing = loadSession();
    if (existing && existing.synagogueId === id && canEditContent(existing.role)) {
      navigate(`/admin/${id}${billingQs}`, { replace: true });
      return;
    }
    createDefaultConfig(id, 'בית כנסת').then((fallback) =>
      syncConfig(id, fallback).then((r) => {
        setConfig(r.bundle.config);
        setLoading(false);
      }),
    );
  }, [id, navigate, params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setError('');

    if (!config.members.length) {
      const ok =
        username.trim().toLowerCase() === BOOTSTRAP_USER && password === BOOTSTRAP_PASS;
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
      navigate(params.get('billing') === '1' ? `/admin/${id}?billing=1` : `/admin/${id}`);
      return;
    }

    const member = await authenticateMember(config.members, username, password);
    if (!member) {
      setError('שם משתמש או סיסמה שגויים');
      return;
    }

    saveSession({
      synagogueId: id,
      memberId: member.id,
      memberName: member.name,
      role: member.role,
      remember,
    });
    navigate(params.get('billing') === '1' ? `/admin/${id}?billing=1` : `/admin/${id}`);
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
          <button type="submit" className="btn primary">
            כניסה
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
