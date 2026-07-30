import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getPlatformAdminUsername,
  isPlatformAdminLoggedIn,
  loginPlatformAdmin,
} from '../lib/platformAuth';
import { requestPasswordReset } from '../lib/passwordReset';
import { BrandLogo } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import './Agency.css';

/**
 * Platform super-admin gate at /admin — after login goes straight to /agency.
 */
export function PlatformLogin() {
  const [loginUser, setLoginUser] = useState(getPlatformAdminUsername());
  const [loginPass, setLoginPass] = useState('');
  const [loginRemember, setLoginRemember] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(() => isPlatformAdminLoggedIn());
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  if (ok || isPlatformAdminLoggedIn()) {
    return <Navigate to="/agency" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const result = await loginPlatformAdmin(loginUser, loginPass, loginRemember);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOk(true);
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setError('');
    setForgotMsg('');
    if (!loginUser.trim()) {
      setError('נא להזין שם משתמש');
      return;
    }
    setForgotBusy(true);
    try {
      const result = await requestPasswordReset({
        kind: 'platform',
        username: loginUser.trim(),
      });
      setForgotMsg(
        result.message ||
          'אם הפרטים נכונים — נשלח מייל עם קישור לאיפוס (תקף 5 דקות).',
      );
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'שליחה נכשלה');
    } finally {
      setForgotBusy(false);
    }
  }

  return (
    <div className="agency" dir="rtl" lang="he">
      <div className="agency-login-shell">
        <div className="agency-brand-block">
          <BrandLogo size="lg" className="agency-brand-logo" />
          <h1>ניהול על</h1>
          <p className="agency-lead">
            כניסת מנהל מערכת — ניהול בתי כנסת, רישיונות והשבתות ממקום אחד.
          </p>
        </div>
        {mode === 'login' ? (
          <form className="agency-login-card" onSubmit={(e) => void onSubmit(e)}>
            <h2>כניסה</h2>
            <label>
              שם משתמש
              <input
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="username"
              />
            </label>
            <label>
              סיסמה
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="current-password"
              />
            </label>
            <label className="check remember-check">
              <input
                type="checkbox"
                checked={loginRemember}
                onChange={(e) => setLoginRemember(e.target.checked)}
              />
              שמור התחברות במכשיר זה (14 יום)
            </label>
            {error ? <p className="agency-flash">{error}</p> : null}
            <button type="submit" className="btn primary">
              כניסה
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
              שכחתי סיסמה
            </button>
          </form>
        ) : (
          <form className="agency-login-card" onSubmit={(e) => void onForgot(e)}>
            <h2>איפוס סיסמה</h2>
            <p className="hint">
              הזינו שם משתמש של מנהל המערכת. אם הוגדר מייל מנהל בסוכנות — יישלח קישור תקף ל־5
              דקות.
            </p>
            <label>
              שם משתמש
              <input
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="username"
              />
            </label>
            {error ? <p className="agency-flash">{error}</p> : null}
            {forgotMsg ? <p className="agency-flash ok">{forgotMsg}</p> : null}
            <button type="submit" className="btn primary" disabled={forgotBusy}>
              {forgotBusy ? 'שולח…' : 'שלח קישור לאיפוס'}
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
              חזרה להתחברות
            </button>
          </form>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
