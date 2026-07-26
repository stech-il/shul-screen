import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getPlatformAdminUsername,
  isPlatformAdminLoggedIn,
  loginPlatformAdmin,
} from '../lib/platformAuth';
import { SiteFooter } from '../components/SiteFooter';
import './Agency.css';

/**
 * Platform super-admin gate at /#/admin — after login goes straight to /agency.
 */
export function PlatformLogin() {
  const [loginUser, setLoginUser] = useState(getPlatformAdminUsername());
  const [loginPass, setLoginPass] = useState('');
  const [loginRemember, setLoginRemember] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(() => isPlatformAdminLoggedIn());

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

  return (
    <div className="agency" dir="rtl" lang="he">
      <div className="agency-login-shell">
        <div className="agency-brand-block">
          <p className="agency-brand">screensmart</p>
          <h1>ניהול על</h1>
          <p className="agency-lead">
            כניסת מנהל מערכת — ניהול בתי כנסת, רישיונות והשבתות ממקום אחד.
          </p>
        </div>
        <form className="agency-login-card" onSubmit={onSubmit}>
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
            כניסה לניהול
          </button>
        </form>
      </div>
      <SiteFooter />
    </div>
  );
}
