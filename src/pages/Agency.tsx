import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CITIES } from '../data/cities';
import { createDefaultConfig } from '../data/defaults';
import {
  DEMO_LICENSE_KEYS,
  isLicenseValid,
  licenseLabel,
  loadGlobalLicense,
  parseLicenseKey,
  saveGlobalLicense,
} from '../lib/license';
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
    license && isLicenseValid(license) && (license.plan === 'agency' || license.plan === 'pro');

  function activateLicense(e: FormEvent) {
    e.preventDefault();
    const parsed = parseLicenseKey(licenseKey);
    if (!parsed) {
      setMsg('מפתח רישיון לא תקין');
      return;
    }
    saveGlobalLicense(parsed);
    setLicense(parsed);
    setMsg(`הופעל רישיון ${licenseLabel(parsed.plan)}`);
  }

  async function createShul(e: FormEvent) {
    e.preventDefault();
    if (!agencyOk) {
      setMsg('נדרש רישיון Pro / Agency');
      return;
    }
    if (!name.trim()) return;
    const id = slugify(name);
    const config = await createDefaultConfig(id, name.trim(), cityId, 'admin123', 'admin');
    config.license = license ?? undefined;
    await saveConfig(config, undefined, { by: 'סוכנות', summary: 'יצירת בית כנסת' });
    setName('');
    setMsg(`נוצר: ${config.name}`);
    navigate(`/login/${id}`);
  }

  return (
    <div className="agency" dir="rtl" lang="he">
      <header className="agency-header">
        <div>
          <p className="eyebrow">דשבורד סוכנות</p>
          <h1>ניהול בתי כנסת</h1>
          <p className="hint">
            {license && isLicenseValid(license)
              ? `רישיון: ${licenseLabel(license.plan)} · ${license.key}`
              : 'אין רישיון פעיל — ניתן להפעיל מפתח הדגמה'}
          </p>
        </div>
        <Link className="btn ghost" to="/">
          חזרה לדף הבית
        </Link>
      </header>

      <div className="agency-grid">
        <form className="panel" onSubmit={activateLicense}>
          <h2>הפעלת רישיון</h2>
          <label>
            מפתח
            <input
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="SHUL-AGENCY-DEMO-0001"
              dir="ltr"
              style={{ textAlign: 'left' }}
            />
          </label>
          <button type="submit" className="btn primary">
            הפעל
          </button>
          <p className="hint">מפתחות הדגמה:</p>
          <ul className="demo-keys">
            {DEMO_LICENSE_KEYS.map((k) => (
              <li key={k}>
                <button type="button" className="linkish" onClick={() => setLicenseKey(k)}>
                  {k}
                </button>
              </li>
            ))}
          </ul>
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
            צור לקוח
          </button>
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
                      {hb ? ` · v${hb.version}` : ''}
                    </span>
                  </div>
                  <div className="row-actions">
                    <Link to={`/display/${c!.id}`}>מסך</Link>
                    <Link to={`/login/${c!.id}`}>ניהול</Link>
                    <Link to={`/display/${c!.id}?kiosk=1`}>קיוסק</Link>
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
