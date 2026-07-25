import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CITIES } from '../data/cities';
import { createDefaultConfig } from '../data/defaults';
import {
  changePlatformPassword,
  clearPlatformSession,
  getPlatformAdminUsername,
  isPlatformAdminLoggedIn,
  loadPlatformSession,
  loginPlatformAdmin,
  touchPlatformSession,
} from '../lib/platformAuth';
import { useSessionKeepAlive } from '../hooks/useSessionKeepAlive';
import { listSynagogueIds, loadLocal, saveConfig, isSupabaseConfigured } from '../lib/storage';
import { issueScreenLicense, licenseLabel } from '../lib/license';
import './Home.css';

function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\u0590-\u05FFa-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 40) || `shul-${Date.now().toString(36)}`
  );
}

export function Home() {
  const navigate = useNavigate();
  const [platformOk, setPlatformOk] = useState(() => isPlatformAdminLoggedIn());
  const [platformUser, setPlatformUser] = useState(
    () => loadPlatformSession()?.username || getPlatformAdminUsername(),
  );
  const [loginUser, setLoginUser] = useState(getPlatformAdminUsername());
  const [loginPass, setLoginPass] = useState('');
  const [loginRemember, setLoginRemember] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [name, setName] = useState('');
  const [cityId, setCityId] = useState('petah-tikva');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [createMsg, setCreateMsg] = useState('');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  const existing = listSynagogueIds()
    .map((id) => loadLocal(id)?.config)
    .filter(Boolean);

  useSessionKeepAlive(
    touchPlatformSession,
    () => {
      clearPlatformSession();
      setPlatformOk(false);
    },
    platformOk,
  );

  async function onPlatformLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    const result = await loginPlatformAdmin(loginUser, loginPass, loginRemember);
    if (!result.ok) {
      setLoginError(result.error);
      return;
    }
    setPlatformOk(true);
    setPlatformUser(result.session.username);
    setLoginPass('');
    navigate('/agency');
  }

  function onPlatformLogout() {
    clearPlatformSession();
    setPlatformOk(false);
    setCreateMsg('');
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!isPlatformAdminLoggedIn()) {
      setCreateMsg('נדרשת התחברות מנהל מערכת');
      setPlatformOk(false);
      return;
    }
    if (!name.trim()) return;
    const id = slugify(name);
    if (listSynagogueIds().includes(id) || loadLocal(id)) {
      setCreateMsg('מזהה בית כנסת כבר קיים — בחר שם אחר');
      return;
    }
    const config = await createDefaultConfig(
      id,
      name.trim(),
      cityId,
      password || 'admin123',
      username || 'admin',
    );
    config.license = issueScreenLicense(id, 'trial', name.trim());
    const result = await saveConfig(config, undefined, {
      by: `platform:${platformUser}`,
      summary: `יצירת בית כנסת + רישיון ${licenseLabel(config.license.plan)}`,
    });
    if (!result.ok) {
      setCreateMsg(result.error ?? 'יצירה נכשלה');
      return;
    }
    setCreateMsg('בית הכנסת נוצר — הפעלת תוקף מתבצעת בניהול הראשי');
    navigate(`/login/${id}`);
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwdMsg('');
    const result = await changePlatformPassword(curPass, newPass);
    if (!result.ok) {
      setPwdMsg(result.error);
      return;
    }
    setCurPass('');
    setNewPass('');
    setPwdMsg('סיסמת מנהל מערכת עודכנה');
  }

  return (
    <div className="home" dir="rtl" lang="he">
      <section className="hero">
        <p className="eyebrow">מסך בית כנסת</p>
        <h1>מסך אחד. הרבה בתי כנסת.</h1>
        <p className="lead">
          תצוגה במסך מלא, ניהול עם הרשאות, סנכרון ענן עם גיבוי מקומי, זמנים מ־Hebcal, תבניות
          ומיתוג לכל קהילה. ניהול מלא של בתי כנסת — יצירה, מחיקה ושכפול — בלחיצה אחת.
        </p>
        <p className="lead cloud-note">
          ענן:{' '}
          {isSupabaseConfigured
            ? 'Supabase מחובר'
            : 'מצב הדגמה — חבר Supabase דרך .env.local'}
        </p>
        {platformOk ? (
          <p className="hero-cta-row">
            <Link className="btn primary hero-agency-cta" to="/agency">
              פאנל ניהול בתי כנסת — מחיקה · שכפול · רישיונות
            </Link>
          </p>
        ) : (
          <p className="hero-cta-row">
            <Link className="btn ghost hero-agency-cta" to="/agency">
              כניסה לפאנל ניהול בתי כנסת
            </Link>
          </p>
        )}
      </section>

      <div className="home-grid">
        {!platformOk ? (
          <form className="panel" onSubmit={onPlatformLogin}>
            <h2>כניסת מנהל מערכת</h2>
            <p className="hint">
              אחרי התחברות תועבר לפאנל המלא — יצירה, מחיקה, שכפול והנפקת רישיונות. או פתח ישירות{' '}
              <Link to="/agency">/#/agency</Link>.
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
            {loginError ? <p className="error">{loginError}</p> : null}
            <button type="submit" className="btn primary">
              התחבר
            </button>
            <p className="note">
              ברירת מחדל: <code dir="ltr">superadmin</code> /{' '}
              <code dir="ltr">ShulAdmin2026!</code> — מומלץ להחליף אחרי הכניסה הראשונה.
            </p>
          </form>
        ) : (
          <div className="panel">
            <div className="agency-jump">
              <h2>ניהול מרכזי</h2>
              <p className="hint">
                מחיקת בתי כנסת, שכפול, שינוי שם והנפקת רישיון לפי תשלום — בפאנל אחד.
              </p>
              <Link className="btn primary" to="/agency">
                פתח פאנל ניהול בתי כנסת
              </Link>
            </div>
            <hr className="panel-sep" />
            <form onSubmit={onCreate}>
              <div className="section-head">
                <h2>הקמת בית כנסת חדש</h2>
                <button type="button" className="btn ghost" onClick={onPlatformLogout}>
                  התנתק ({platformUser})
                </button>
              </div>
              <label>
                שם בית הכנסת
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="לדוגמה: קהילת עמישב"
                  required
                />
              </label>
              <label>
                עיר
                <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                שם משתמש מנהל בית הכנסת
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                  autoComplete="username"
                />
              </label>
              <label>
                סיסמת מנהל בית הכנסת
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                  autoComplete="new-password"
                />
              </label>
              {createMsg ? <p className="error">{createMsg}</p> : null}
              <button type="submit" className="btn primary">
                צור והמשך לכניסה
              </button>
            </form>

            <hr className="panel-sep" />

            <form onSubmit={onChangePassword}>
              <h3>החלפת סיסמת מנהל מערכת</h3>
              <label>
                סיסמה נוכחית
                <input
                  type="password"
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                  required
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </label>
              <label>
                סיסמה חדשה
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  required
                  minLength={8}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </label>
              {pwdMsg ? <p className="hint">{pwdMsg}</p> : null}
              <button type="submit" className="btn ghost">
                עדכן סיסמת מערכת
              </button>
            </form>
          </div>
        )}

        <div className="panel">
          <h2>קישורים מהירים</h2>
          <ul className="links">
            <li>
              <Link to="/display/amishav">מסך הדגמה — עמישב</Link>
              <Link className="sub" to="/login/amishav">
                ניהול
              </Link>
            </li>
            <li>
              <Link to="/display/amishav?kiosk=1">מצב קיוסק</Link>
              <span className="sub">מסך מלא</span>
            </li>
            <li>
              <Link to="/agency">ניהול בתי כנסת</Link>
              <span className="sub">יצירה · מחיקה · שכפול · רישוי</span>
            </li>
            {existing
              .filter((c) => c && c.id !== 'amishav')
              .map((c) => (
                <li key={c!.id}>
                  <Link to={`/display/${c!.id}`}>{c!.name}</Link>
                  <Link className="sub" to={`/login/${c!.id}`}>
                    ניהול
                  </Link>
                </li>
              ))}
          </ul>
          <p className="note">
            Electron לקיוסק בטלוויזיה: הרץ <code>npm run dev</code> ואז{' '}
            <code>npm run electron:dev</code>. יציאה: Ctrl+Shift+Q + PIN קיוסק.
          </p>
        </div>
      </div>
    </div>
  );
}
