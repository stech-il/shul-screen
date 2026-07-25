import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CITIES, getCity } from '../data/cities';
import { createDefaultConfig } from '../data/defaults';
import { enterAsPlatformAdmin, hashPassword } from '../lib/auth';
import {
  DEMO_LICENSE_KEYS,
  daysLeft,
  isLicenseValid,
  issueScreenLicense,
  licenseLabel,
  loadGlobalLicense,
  parseLicenseKey,
  renewScreenLicense,
  saveGlobalLicense,
  setScreenLicenseLocked,
} from '../lib/license';
import {
  changePlatformPassword,
  clearPlatformSession,
  isPlatformAdminLoggedIn,
  loadPlatformSession,
  touchPlatformSession,
} from '../lib/platformAuth';
import { useSessionKeepAlive } from '../hooks/useSessionKeepAlive';
import { isScreenOnline, listHeartbeats } from '../lib/analytics';
import {
  deleteSynagogue,
  duplicateSynagogue,
  isSupabaseConfigured,
  listSynagogueIds,
  loadLocal,
  renameSynagogue,
  saveConfig,
  syncSynagogueIndexFromCloud,
} from '../lib/storage';
import type { LicenseInfo, SynagogueConfig } from '../types';
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

type Modal =
  | null
  | { kind: 'create' }
  | { kind: 'rename'; config: SynagogueConfig }
  | { kind: 'duplicate'; config: SynagogueConfig }
  | { kind: 'delete'; config: SynagogueConfig }
  | { kind: 'license'; config: SynagogueConfig }
  | { kind: 'resetPassword'; config: SynagogueConfig };

export function Agency() {
  const navigate = useNavigate();
  const [platformOk, setPlatformOk] = useState(() => isPlatformAdminLoggedIn());
  const [license, setLicense] = useState(() => loadGlobalLicense());
  const [licenseKey, setLicenseKey] = useState('');
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'online' | 'offline' | 'unlicensed' | 'locked'
  >('all');
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  const [name, setName] = useState('');
  const [cityId, setCityId] = useState('petah-tikva');
  const [editName, setEditName] = useState('');
  const [licPlan, setLicPlan] = useState<LicenseInfo['plan']>('basic');
  const [licMonths, setLicMonths] = useState(12);
  const [resetMemberId, setResetMemberId] = useState('');
  const [resetPassword, setResetPassword] = useState('admin123');
  const [resetPassword2, setResetPassword2] = useState('admin123');

  const heartbeats = useMemo(() => listHeartbeats(), [tick, msg]);

  const shuls = useMemo(() => {
    void tick;
    return listSynagogueIds()
      .map((id) => loadLocal(id)?.config)
      .filter((c): c is SynagogueConfig => Boolean(c));
  }, [tick, msg]);

  async function reloadFromCloud(note?: string) {
    setLoadingList(true);
    const result = await syncSynagogueIndexFromCloud();
    setLoadingList(false);
    setTick((t) => t + 1);
    if (note) {
      setMsg(note);
    } else if (!result.ok) {
      setMsg(result.error ?? 'טעינת רשימה מהענן נכשלה');
    } else if (isSupabaseConfigured) {
      setMsg(`נטענו ${result.count} בתי כנסת מהענן`);
    } else {
      setMsg(`נטענו ${result.count} בתי כנסת`);
    }
  }

  useEffect(() => {
    if (!platformOk) return;
    void reloadFromCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per login
  }, [platformOk]);

  useSessionKeepAlive(
    touchPlatformSession,
    () => {
      clearPlatformSession();
      setPlatformOk(false);
      setMsg('הסשן פג — יש להתחבר מחדש');
      navigate('/admin');
    },
    platformOk,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shuls.filter((c) => {
      const hb = heartbeats.find((h) => h.synagogueId === c.id) ?? null;
      const online = isScreenOnline(hb);
      const licensed = Boolean(c.license && isLicenseValid(c.license));
      const locked = Boolean(c.license?.locked);
      if (filter === 'online' && !online) return false;
      if (filter === 'offline' && online) return false;
      if (filter === 'unlicensed' && licensed) return false;
      if (filter === 'locked' && !locked) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        getCity(c.cityId).name.includes(query.trim())
      );
    });
  }, [shuls, query, filter, heartbeats]);

  const stats = useMemo(() => {
    let online = 0;
    let licensed = 0;
    for (const c of shuls) {
      const hb = heartbeats.find((h) => h.synagogueId === c.id) ?? null;
      if (isScreenOnline(hb)) online += 1;
      if (c.license && isLicenseValid(c.license)) licensed += 1;
    }
    return { total: shuls.length, online, licensed, offline: shuls.length - online };
  }, [shuls, heartbeats]);

  function refresh(note?: string) {
    setTick((t) => t + 1);
    if (note) setMsg(note);
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

  async function toggleLicenseLock(config: SynagogueConfig) {
    if (!config.license) {
      setMsg('אין רישיון להשבתה — הפעל קודם לפי תשלום');
      return;
    }
    const locked = !config.license.locked;
    const nextLicense = setScreenLicenseLocked(config.license, locked);
    const next = { ...config, license: nextLicense };
    setBusy(true);
    await saveConfig(next, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: locked ? 'השבתת רישיון מסך' : 'ביטול השבתת רישיון מסך',
    });
    setBusy(false);
    refresh(locked ? `הושבת «${config.name}»` : `הופעל מחדש «${config.name}»`);
  }

  function openShulAdmin(config: SynagogueConfig) {
    if (!isPlatformAdminLoggedIn()) {
      setPlatformOk(false);
      navigate('/admin');
      return;
    }
    enterAsPlatformAdmin(config.id, {
      synagogueName: config.name,
      platformUsername: loadPlatformSession()?.username,
    });
    navigate(`/admin/${config.id}`);
  }

  function openResetPassword(config: SynagogueConfig) {
    const owners = config.members.filter((m) => m.role === 'owner');
    const first = owners[0] ?? config.members[0];
    setResetMemberId(first?.id ?? '');
    setResetPassword('admin123');
    setResetPassword2('admin123');
    setModal({ kind: 'resetPassword', config });
  }

  async function confirmResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.kind !== 'resetPassword') return;
    if (resetPassword.length < 4) {
      setMsg('סיסמה חדשה קצרה מדי (לפחות 4 תווים)');
      return;
    }
    if (resetPassword !== resetPassword2) {
      setMsg('הסיסמאות אינן תואמות');
      return;
    }
    setBusy(true);
    const passwordHash = await hashPassword(resetPassword);
    let members = [...(modal.config.members ?? [])];
    if (!members.length) {
      members = [
        {
          id: 'owner-1',
          name: 'מנהל',
          username: 'admin',
          role: 'owner',
          passwordHash,
        },
      ];
    } else if (resetMemberId) {
      members = members.map((m) =>
        m.id === resetMemberId ? { ...m, passwordHash } : m,
      );
    } else {
      const owner = members.find((m) => m.role === 'owner') ?? members[0];
      members = members.map((m) => (m.id === owner.id ? { ...m, passwordHash } : m));
    }
    const next = { ...modal.config, members };
    const result = await saveConfig(next, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: 'איפוס סיסמת משתמש',
    });
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error ?? 'איפוס סיסמה נכשל');
      return;
    }
    const target =
      members.find((m) => m.id === resetMemberId) ??
      members.find((m) => m.role === 'owner') ??
      members[0];
    setModal(null);
    refresh(
      `אופסה סיסמה ל־${target?.username || target?.name || 'משתמש'} ב«${modal.config.name}»`,
    );
  }

  async function issueForShul(id: string) {
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
    setLicPlan(
      license?.plan === 'pro' || license?.plan === 'agency' ? 'pro' : 'basic',
    );
    setLicMonths(12);
    setModal({ kind: 'license', config: local.config });
  }

  async function confirmLicense(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.kind !== 'license') return;
    setBusy(true);
    const issued = renewScreenLicense(
      modal.config.id,
      licPlan,
      licMonths,
      modal.config.name,
    );
    const next = { ...modal.config, license: issued };
    await saveConfig(next, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: `הנפקת רישיון ${licenseLabel(licPlan)} ל־${licMonths} חודשים`,
    });
    setBusy(false);
    setModal(null);
    const left = daysLeft(issued);
    refresh(
      `הופעל «${modal.config.name}» · ${licenseLabel(licPlan)} · ${left ?? licMonths * 30} ימים`,
    );
  }

  async function createShul(e: FormEvent) {
    e.preventDefault();
    if (!isPlatformAdminLoggedIn()) {
      setMsg('נדרשת התחברות מנהל מערכת');
      setPlatformOk(false);
      return;
    }
    if (!name.trim()) return;
    setBusy(true);
    const id = slugify(name);
    if (listSynagogueIds().includes(id) || loadLocal(id)) {
      setBusy(false);
      setMsg('מזהה בית כנסת כבר קיים — נסה שם אחר');
      return;
    }
    const config = await createDefaultConfig(id, name.trim(), cityId, 'admin123', 'admin');
    const plan =
      license?.plan === 'pro' || license?.plan === 'agency' ? 'pro' : license?.plan || 'basic';
    config.license = issueScreenLicense(id, plan, name.trim());
    await saveConfig(config, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: 'יצירת בית כנסת + רישיון מסך',
    });
    setName('');
    setBusy(false);
    setModal(null);
    refresh(`נוצר «${config.name}» · רישיון ${config.license.key}`);
  }

  async function confirmRename(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.kind !== 'rename') return;
    setBusy(true);
    const result = await renameSynagogue(
      modal.config.id,
      editName,
      `platform:${loadPlatformSession()?.username ?? 'admin'}`,
    );
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error ?? 'שינוי שם נכשל');
      return;
    }
    setModal(null);
    refresh(`השם עודכן ל־«${editName.trim()}»`);
  }

  async function confirmDuplicate(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.kind !== 'duplicate') return;
    setBusy(true);
    const result = await duplicateSynagogue(
      modal.config.id,
      editName,
      `platform:${loadPlatformSession()?.username ?? 'admin'}`,
    );
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error ?? 'שכפול נכשל');
      return;
    }
    setModal(null);
    refresh(`שוכפל ל־«${editName.trim()}»`);
  }

  async function confirmDelete() {
    if (!modal || modal.kind !== 'delete') return;
    setBusy(true);
    const result = await deleteSynagogue(modal.config.id);
    setBusy(false);
    setModal(null);
    refresh(
      result.error
        ? `נמחק «${modal.config.name}» · ${result.error}`
        : `נמחק «${modal.config.name}»`,
    );
  }

  if (!platformOk) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="agency" dir="rtl" lang="he">
      <header className="agency-top">
        <div>
          <p className="agency-brand">Shul Screen</p>
          <h1>ניהול בתי כנסת</h1>
          <p className="agency-sub">
            {loadPlatformSession()?.username}
            {' · '}
            {license && isLicenseValid(license)
              ? `רישיון ${licenseLabel(license.plan)}`
              : 'אין רישיון סוכנות פעיל'}
          </p>
        </div>
        <div className="agency-top-actions">
          <button
            type="button"
            className="btn ghost"
            disabled={loadingList}
            onClick={() => void reloadFromCloud('הרשימה רועננה מהענן')}
          >
            {loadingList ? 'טוען…' : 'רענן מהענן'}
          </button>
          <button type="button" className="btn primary" onClick={() => setModal({ kind: 'create' })}>
            בית כנסת חדש
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              clearPlatformSession();
              setPlatformOk(false);
              navigate('/admin');
            }}
          >
            התנתק
          </button>
          <Link className="btn ghost" to="/">
            דף הבית
          </Link>
        </div>
      </header>

      <section className="agency-stats" aria-label="סיכום">
        <div className="stat">
          <strong>{stats.total}</strong>
          <span>בתי כנסת</span>
        </div>
        <div className="stat online">
          <strong>{stats.online}</strong>
          <span>מסכים מחוברים</span>
        </div>
        <div className="stat">
          <strong>{stats.offline}</strong>
          <span>לא מחוברים</span>
        </div>
        <div className="stat">
          <strong>{stats.licensed}</strong>
          <span>עם רישיון</span>
        </div>
      </section>

      {msg ? <p className="agency-flash banner">{msg}</p> : null}

      <div className="agency-toolbar">
        <input
          className="agency-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, מזהה או עיר…"
        />
        <div className="agency-filters" role="group" aria-label="סינון">
          {(
            [
              ['all', 'הכל'],
              ['online', 'מחוברים'],
              ['offline', 'לא מחוברים'],
              ['unlicensed', 'בלי רישיון'],
              ['locked', 'מושבתים'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? 'on' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="agency-body">
        <section className="shul-board" aria-label="רשימת בתי כנסת">
          {loadingList && filtered.length === 0 ? (
            <div className="empty-board">
              <h2>טוען בתי כנסת…</h2>
              <p>מושך רשימה מהענן ומהמכשיר.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-board">
              <h2>אין בתי כנסת להצגה</h2>
              <p>צור בית כנסת חדש, או נקה את החיפוש והסינון.</p>
              <button type="button" className="btn primary" onClick={() => setModal({ kind: 'create' })}>
                צור בית כנסת
              </button>
            </div>
          ) : (
            <ul className="shul-cards">
              {filtered.map((c, i) => {
                const hb = heartbeats.find((h) => h.synagogueId === c.id) ?? null;
                const online = isScreenOnline(hb);
                const licensed = Boolean(c.license && isLicenseValid(c.license));
                const locked = Boolean(c.license?.locked);
                return (
                  <li
                    key={c.id}
                    className="shul-card"
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  >
                    <div className="shul-card-top">
                      <div>
                        <h2>{c.name}</h2>
                        <p className="shul-meta">
                          {getCity(c.cityId).name}
                          <span dir="ltr"> · {c.id}</span>
                        </p>
                      </div>
                      <span className={`pill ${online ? 'ok' : 'off'}`}>
                        {online ? 'מחובר' : 'לא מחובר'}
                      </span>
                    </div>

                    <div className="shul-tags">
                      <span className={`tag ${locked ? 'warn' : licensed ? 'ok' : 'warn'}`}>
                        {locked
                          ? 'מושבת'
                          : licensed
                            ? `${licenseLabel(c.license!.plan)}${
                                daysLeft(c.license) != null
                                  ? ` · ${daysLeft(c.license)} ימים`
                                  : ''
                              }`
                            : 'לא הופעל'}
                      </span>
                      <span className="tag">{c.layout === 'canvas' ? 'בונה מסך' : c.layout}</span>
                      {hb ? <span className="tag">v{hb.version}</span> : null}
                    </div>

                    <div className="shul-actions">
                      <Link className="act primary" to={`/display/${c.id}`}>
                        מסך
                      </Link>
                      <button
                        type="button"
                        className="act primary"
                        onClick={() => openShulAdmin(c)}
                        title="כניסה לניהול בלי סיסמת בית הכנסת"
                      >
                        ניהול
                      </button>
                      <Link className="act" to={`/display/${c.id}?kiosk=1`}>
                        קיוסק
                      </Link>
                      <button
                        type="button"
                        className="act"
                        onClick={() => {
                          setEditName(c.name);
                          setModal({ kind: 'rename', config: c });
                        }}
                      >
                        שנה שם
                      </button>
                      <button
                        type="button"
                        className="act"
                        onClick={() => {
                          setEditName(`${c.name} (העתק)`);
                          setModal({ kind: 'duplicate', config: c });
                        }}
                      >
                        שכפל
                      </button>
                      <button
                        type="button"
                        className="act"
                        onClick={() => void issueForShul(c.id)}
                      >
                        {licensed || locked ? 'חדש תוקף' : 'הפעל לפי תשלום'}
                      </button>
                      <button
                        type="button"
                        className="act"
                        onClick={() => openResetPassword(c)}
                      >
                        אפס סיסמה
                      </button>
                      <button
                        type="button"
                        className={`act ${locked ? '' : 'danger'}`}
                        disabled={busy || !c.license}
                        onClick={() => void toggleLicenseLock(c)}
                      >
                        {locked ? 'בטל השבתה' : 'השבת רישיון'}
                      </button>
                      <button
                        type="button"
                        className="act danger"
                        onClick={() => setModal({ kind: 'delete', config: c })}
                      >
                        מחק
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="agency-side">
          <form className="side-card" onSubmit={activateLicense}>
            <h2>רישיון סוכנות</h2>
            <p className="hint">
              {license && isLicenseValid(license)
                ? `פעיל: ${licenseLabel(license.plan)}`
                : 'הפעל מפתח כדי לנהל סוכנות'}
            </p>
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
            <div className="demo-keys">
              {DEMO_LICENSE_KEYS.map((k) => (
                <button key={k} type="button" onClick={() => setLicenseKey(k)}>
                  {k}
                </button>
              ))}
            </div>
            <button type="submit" className="btn primary">
              הפעל רישיון
            </button>
          </form>

          <form className="side-card" onSubmit={onChangePassword}>
            <h2>סיסמת מנהל מערכת</h2>
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
              עדכן סיסמה
            </button>
          </form>

          <div className="side-card tip">
            <h2>טיפים</h2>
            <ul>
              <li>כניסת ניהול על: <code dir="ltr">/#/admin</code></li>
              <li>«ניהול» נכנס ישירות בלי סיסמת בית הכנסת.</li>
              <li>«אפס סיסמה» מאפס למשתמשי בית הכנסת.</li>
              <li>הנתונים נשמרים בענן השרת — לא נמחקים בעדכון גרסה.</li>
              <li>הפעלה / חידוש / השבתת רישיון — רק כאן.</li>
              <li>הלקוח לא רואה מפתחות רישיון בניהול בית הכנסת.</li>
              <li>שכפול מעתיק עיצוב — בלי הפעלה (הפעל בנפרד).</li>
              <li>מחיקה מסירה נתונים מהמכשיר ומהענן כשמחובר.</li>
            </ul>
            <button type="button" className="btn ghost" onClick={() => navigate('/')}>
              לדף הבית
            </button>
          </div>
        </aside>
      </div>

      {modal ? (
        <div className="agency-modal-backdrop" role="presentation" onClick={() => !busy && setModal(null)}>
          <div
            className="agency-modal"
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
          >
            {modal.kind === 'create' ? (
              <form onSubmit={(e) => void createShul(e)}>
                <h2>בית כנסת חדש</h2>
                <p className="hint">יוצרים מסך חדש עם רישיון ניסיון/סוכנות ומשתמש admin.</p>
                <label>
                  שם בית הכנסת
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    placeholder="לדוגמה: קהילת נווה שלום"
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
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    ביטול
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? 'יוצר…' : 'צור בית כנסת'}
                  </button>
                </div>
              </form>
            ) : null}

            {modal.kind === 'rename' ? (
              <form onSubmit={(e) => void confirmRename(e)}>
                <h2>שינוי שם</h2>
                <p className="hint">
                  המזהה <code dir="ltr">{modal.config.id}</code> נשאר זהה.
                </p>
                <label>
                  שם חדש
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    autoFocus
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    ביטול
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? 'שומר…' : 'שמור שם'}
                  </button>
                </div>
              </form>
            ) : null}

            {modal.kind === 'duplicate' ? (
              <form onSubmit={(e) => void confirmDuplicate(e)}>
                <h2>שכפול בית כנסת</h2>
                <p className="hint">העתק של «{modal.config.name}» עם עיצוב ובונה מסך.</p>
                <label>
                  שם להעתק
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    autoFocus
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    ביטול
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? 'משכפל…' : 'שכפל'}
                  </button>
                </div>
              </form>
            ) : null}

            {modal.kind === 'delete' ? (
              <div>
                <h2>מחיקת בית כנסת</h2>
                <p className="hint warn">
                  למחוק לצמיתות את «{modal.config.name}»? הפעולה מסירה הגדרות, היסטוריה ומטמון
                  מקומי.
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    ביטול
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => void confirmDelete()}
                  >
                    {busy ? 'מוחק…' : 'מחק לצמיתות'}
                  </button>
                </div>
              </div>
            ) : null}

            {modal.kind === 'license' ? (
              <form onSubmit={(e) => void confirmLicense(e)}>
                <h2>הפעלה לפי תשלום</h2>
                <p className="hint">
                  «{modal.config.name}» — בחר מסלול ותקופה ששולמו. הלקוח לא רואה מפתח רישיון.
                </p>
                {modal.config.license ? (
                  <p className="hint">
                    נוכחי: {licenseLabel(modal.config.license.plan)}
                    {daysLeft(modal.config.license) != null
                      ? ` · נותרו ${daysLeft(modal.config.license)} ימים`
                      : ''}
                  </p>
                ) : null}
                <label>
                  מסלול
                  <select
                    value={licPlan}
                    onChange={(e) => setLicPlan(e.target.value as LicenseInfo['plan'])}
                  >
                    <option value="trial">ניסיון</option>
                    <option value="basic">בסיסי</option>
                    <option value="pro">מקצועי</option>
                  </select>
                </label>
                <label>
                  תוקף לפי תשלום
                  <select
                    value={licMonths}
                    onChange={(e) => setLicMonths(Number(e.target.value))}
                  >
                    <option value={1}>חודש אחד</option>
                    <option value={3}>3 חודשים</option>
                    <option value={6}>6 חודשים</option>
                    <option value={12}>שנה (12 חודשים)</option>
                    <option value={24}>שנתיים</option>
                  </select>
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    ביטול
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? 'מפעיל…' : 'הפעל מסך'}
                  </button>
                </div>
              </form>
            ) : null}

            {modal.kind === 'resetPassword' ? (
              <form onSubmit={(e) => void confirmResetPassword(e)}>
                <h2>איפוס סיסמת משתמש</h2>
                <p className="hint">«{modal.config.name}» — הסיסמה החדשה תחול מיד אחרי שמירה.</p>
                {modal.config.members.length ? (
                  <label>
                    משתמש
                    <select
                      value={resetMemberId}
                      onChange={(e) => setResetMemberId(e.target.value)}
                    >
                      {modal.config.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {(m.username || m.name) +
                            (m.role === 'owner' ? ' · מנהל' : ' · עורך')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="hint">אין משתמשים — ייווצר מנהל admin עם הסיסמה החדשה.</p>
                )}
                <label>
                  סיסמה חדשה
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    required
                    minLength={4}
                    autoFocus
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  אימות סיסמה
                  <input
                    type="password"
                    value={resetPassword2}
                    onChange={(e) => setResetPassword2(e.target.value)}
                    required
                    minLength={4}
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                    autoComplete="new-password"
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    ביטול
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? 'מאפס…' : 'אפס סיסמה'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
