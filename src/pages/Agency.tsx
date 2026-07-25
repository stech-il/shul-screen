import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CITIES } from '../data/cities';
import { createDefaultConfig } from '../data/defaults';
import {
  DEMO_LICENSE_KEYS,
  isLicenseValid,
  issueScreenLicense,
  licenseLabel,
  loadGlobalLicense,
  parseLicenseKey,
  saveGlobalLicense,
} from '../lib/license';
import {
  clearPlatformSession,
  isPlatformAdminLoggedIn,
  loadPlatformSession,
  loginPlatformAdmin,
  getPlatformAdminUsername,
} from '../lib/platformAuth';
import { listSynagogueIds, loadLocal, saveConfig } from '../lib/storage';
import { isScreenOnline, listHeartbeats } from '../lib/analytics';
import './Agency.css';

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

export function Agency() {
  const navigate = useNavigate();
  const [platformOk, setPlatformOk] = useState(() => isPlatformAdminLoggedIn());
  const [loginUser, setLoginUser] = useState(getPlatformAdminUsername());
  const [loginPass, setLoginPass] = useState('');
  const [license, setLicense] = useState(() => loadGlobalLicense());
  const [licenseKey, setLicenseKey] = useState('');
  const [name, setName] = useState('');
  const [cityId, setCityId] = useState('petah-tikva');
  const [msg, setMsg] = useState('');

  const heartbeats = useMemo(() => listHeartbeats(), [msg]);

  const shuls = useMemo(
    () =>
      listSynagogueIds()
        .map((id) => loadLocal(id)?.config)
        .filter(Boolean),
    [msg],
  );

  const agencyOk =
    platformOk &&
    license &&
    isLicenseValid(license) &&
    (license.plan === 'agency' || license.plan === 'pro');

  async function onPlatformLogin(e: FormEvent) {
    e.preventDefault();
    const result = await loginPlatformAdmin(loginUser, loginPass);
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    setPlatformOk(true);
    setLoginPass('');
    setMsg(`מחובר כמנהל מערכת: ${result.session.username}`);
  }

  function activateLicense(e: FormEvent) {
    e.preventDefault();
    if (!isPlatformAdminLoggedIn()) {
      setMsg('יש להתחבר כמנהל מערכת לפני הפעלת רישיון');
      setPlatformOk(false);
      return;
    }
    const parsed = parseLicenseKey(licenseKey);
    if (!parsed) {
      setMsg('מפתח רישיון לא תקין');
      return;
    }
    saveGlobalLicense(parsed);
    setLicense(parsed);
    setMsg(`הופעל רישיון ${licenseLabel(parsed.plan)}`);
  }

  async function issueForShul(id: string, name: string) {
    if (!isPlatformAdminLoggedIn()) {
      setMsg('נדרשת התחברות מנהל מערכת');
      setPlatformOk(false);
      return;
    }
    const local = loadLocal(id);
    if (!local?.config) {
      setMsg('בית הכנסת לא נמצא');
      return;
    }
    const plan =
      license?.plan === 'pro' || license?.plan === 'agency' ? 'pro' : 'basic';
    const next = {
      ...local.config,
      license: issueScreenLicense(id, plan, name),
    };
    await saveConfig(next, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: 'הנפקת רישיון מסך',
    });
    setMsg(`הונפק רישיון ל־${name}: ${next.license.key}`);
  }

  async function createShul(e: FormEvent) {
    e.preventDefault();
    if (!isPlatformAdminLoggedIn()) {
      setMsg('נדרשת התחברות מנהל מערכת');
      setPlatformOk(false);
      return;
    }
    if (!agencyOk) {
      setMsg('נדרש רישיון Pro / Agency');
      return;
    }
    if (!name.trim()) return;
    const id = slugify(name);
    if (listSynagogueIds().includes(id) || loadLocal(id)) {
      setMsg('מזהה בית כנסת כבר קיים');
      return;
    }
    const config = await createDefaultConfig(id, name.trim(), cityId, 'admin123', 'admin');
    const plan =
      license?.plan === 'pro' || license?.plan === 'agency' ? 'pro' : license?.plan || 'basic';
    config.license = issueScreenLicense(id, plan, name.trim());
    await saveConfig(config, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: `יצירת בית כנסת + רישיון מסך`,
    });
    setName('');
    setMsg(`נוצר: ${config.name} · רישיון: ${config.license.key}`);
    navigate(`/login/${id}`);
  }

  if (!platformOk) {
    return (
      <div className="agency" dir="rtl">
        <header className="agency-header">
          <div>
            <p className="eyebrow">דשבורד סוכנות</p>
            <h1>כניסת מנהל מערכת</h1>
            <p className="hint">יצירת בתי כנסת וניהול סוכנות מוגנים במנהל מערכת.</p>
          </div>
          <Link className="btn ghost" to="/">
            חזרה לדף הבית
          </Link>
        </header>
        <form className="panel" onSubmit={onPlatformLogin} style={{ maxWidth: 420 }}>
          <label>
            שם משתמש
            <input
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              required
              dir="ltr"
              style={{ textAlign: 'left' }}
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
            />
          </label>
          {msg ? <p className="status">{msg}</p> : null}
          <button type="submit" className="btn primary">
            התחבר
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="agency" dir="rtl" lang="he">
      <header className="agency-header">
        <div>
          <p className="eyebrow">דשבורד סוכנות</p>
          <h1>ניהול בתי כנסת</h1>
          <p className="hint">
            מנהל מערכת: {loadPlatformSession()?.username} ·{' '}
            {license && isLicenseValid(license)
              ? `רישיון: ${licenseLabel(license.plan)}`
              : 'אין רישיון פעיל'}
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              clearPlatformSession();
              setPlatformOk(false);
            }}
          >
            התנתק
          </button>
          <Link className="btn ghost" to="/">
            חזרה לדף הבית
          </Link>
        </div>
      </header>

      <div className="agency-grid">
        <form className="panel" onSubmit={activateLicense}>
          <h2>הפעלת רישיון</h2>
          <label>
            מפתח
            <input
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="SHUL-..."
              dir="ltr"
              style={{ textAlign: 'left' }}
            />
          </label>
          <p className="demo-keys">
            הדגמה:{' '}
            {DEMO_LICENSE_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => setLicenseKey(k)}>
                {k}
              </button>
            ))}
          </p>
          <button type="submit" className="btn primary">
            הפעל
          </button>
        </form>

        <form className="panel" onSubmit={createShul}>
          <h2>בית כנסת חדש</h2>
          <label>
            שם
            <input value={name} onChange={(e) => setName(e.target.value)} required />
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
          <button type="submit" className="btn primary" disabled={!agencyOk}>
            צור בית כנסת
          </button>
          {!agencyOk ? <p className="hint">נדרש רישיון Pro / Agency</p> : null}
        </form>

        <section className="panel wide">
          <h2>כל בתי הכנסת ({shuls.length})</h2>
          {msg ? <p className="status">{msg}</p> : null}
          <ul className="shul-list">
            {shuls.map((c) => {
              const hb = heartbeats.find((h) => h.synagogueId === c!.id) ?? null;
              const online = isScreenOnline(hb);
              return (
                <li key={c!.id}>
                  <div>
                    <strong>{c!.name}</strong>
                    <span>
                      {c!.id} · {online ? 'מסך מחובר' : 'מסך לא מחובר'}
                      {c!.license
                        ? ` · רישיון ${licenseLabel(c!.license.plan)}`
                        : ' · ללא רישיון'}
                      {hb ? ` · v${hb.version}` : ''}
                    </span>
                  </div>
                  <div className="row-actions">
                    <Link to={`/display/${c!.id}`}>מסך</Link>
                    <Link to={`/login/${c!.id}`}>ניהול</Link>
                    <Link to={`/display/${c!.id}?kiosk=1`}>קיוסק</Link>
                    {!c!.license || !isLicenseValid(c!.license) ? (
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => void issueForShul(c!.id, c!.name)}
                      >
                        הנפק רישיון
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel wide">
          <h2>חיוב ותמיכה</h2>
          <p className="hint">
            תוכנית נוכחית: {license ? licenseLabel(license.plan) : 'אין'} · לחיוב אמיתי חבר
            Supabase + טבלת licenses. תמיכה: שמור לוגים מ־Electron ב־kiosk.log.
          </p>
        </section>
      </div>
    </div>
  );
}
