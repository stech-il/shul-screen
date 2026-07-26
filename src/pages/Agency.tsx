import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CITIES, getCity } from '../data/cities';
import { createDefaultConfig } from '../data/defaults';
import { enterAsPlatformAdmin, hashPassword } from '../lib/auth';
import {
  daysLeft,
  isLicenseValid,
  renewScreenLicense,
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
import { fetchHeartbeatsFromCloud, isScreenOnline } from '../lib/analytics';
import { SiteFooter } from '../components/SiteFooter';
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
import {
  cancelBilling,
  chargeBillingNow,
  fetchAllSubscriptions,
  fetchBillingConfig,
  fetchPlatformBilling,
  fetchSubscription,
  formatBillingDate,
  formatIls,
  saveBillingSettings,
  savePlatformBilling,
  type BillingSubscription,
} from '../lib/billing';
import {
  backupReasonLabel,
  createBackupNow,
  formatBackupDate,
  listBackups,
  restoreBackup,
  type BackupItem,
} from '../lib/backups';
import type { ScreenHeartbeat, SynagogueConfig } from '../types';
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
  | { kind: 'resetPassword'; config: SynagogueConfig }
  | { kind: 'billing'; config: SynagogueConfig }
  | { kind: 'backups'; config: SynagogueConfig };

export function Agency() {
  const navigate = useNavigate();
  const [platformOk, setPlatformOk] = useState(() => isPlatformAdminLoggedIn());
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
  const [licMonths, setLicMonths] = useState(12);
  const [resetMemberId, setResetMemberId] = useState('');
  const [resetPassword, setResetPassword] = useState('admin123');
  const [resetPassword2, setResetPassword2] = useState('admin123');

  const [billingConfigured, setBillingConfigured] = useState<boolean | null>(null);
  const [billingSub, setBillingSub] = useState<BillingSubscription | null>(null);
  const [billingAmount, setBillingAmount] = useState('99');
  const [billingActive, setBillingActive] = useState(true);
  const [billingInvoiceEmail, setBillingInvoiceEmail] = useState('');
  const [billingMsg, setBillingMsg] = useState('');
  const [backupItems, setBackupItems] = useState<BackupItem[]>([]);
  const [backupMsg, setBackupMsg] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminEmailMsg, setAdminEmailMsg] = useState('');
  const [subsById, setSubsById] = useState<Record<string, BillingSubscription>>({});
  const [diskStatus, setDiskStatus] = useState<{
    diskOk: boolean;
    mediaFileCount: number;
    billingRecordCount: number;
    dataDirSet: boolean;
  } | null>(null);

  const [heartbeats, setHeartbeats] = useState<ScreenHeartbeat[]>([]);

  useEffect(() => {
    if (!platformOk) return;
    let cancelled = false;
    async function refresh() {
      const items = await fetchHeartbeatsFromCloud();
      if (!cancelled) setHeartbeats(items);
    }
    void refresh();
    const id = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [platformOk, tick, msg]);

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
    void fetchPlatformBilling()
      .then((p) => setAdminEmail(p.adminEmail || ''))
      .catch(() => {});
    void fetchAllSubscriptions()
      .then((items) => {
        const map: Record<string, BillingSubscription> = {};
        for (const s of items) map[s.synagogueId] = s;
        setSubsById(map);
      })
      .catch(() => {});
    void fetch('/api/cloud/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s) =>
        setDiskStatus({
          diskOk: Boolean(s.diskOk),
          mediaFileCount: Number(s.mediaFileCount) || 0,
          billingRecordCount: Number(s.billingRecordCount) || 0,
          dataDirSet: Boolean(s.dataDirSet),
        }),
      )
      .catch(() => setDiskStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per login
  }, [platformOk]);

  async function onSaveAdminEmail(e: FormEvent) {
    e.preventDefault();
    setAdminEmailMsg('');
    setBusy(true);
    try {
      const r = await savePlatformBilling(adminEmail.trim());
      setAdminEmail(r.adminEmail || '');
      setAdminEmailMsg('מייל מנהל המערכת נשמר — חשבוניות יועתקו לשם כשזמין ב־SUMIT');
    } catch (err) {
      setAdminEmailMsg(err instanceof Error ? err.message : 'שמירת המייל נכשלה');
    } finally {
      setBusy(false);
    }
  }

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

  function refreshSubs() {
    void fetchAllSubscriptions()
      .then((items) => {
        const map: Record<string, BillingSubscription> = {};
        for (const s of items) map[s.synagogueId] = s;
        setSubsById(map);
      })
      .catch(() => {});
  }

  async function openBilling(config: SynagogueConfig) {
    setBillingMsg('');
    setBillingSub(null);
    setModal({ kind: 'billing', config });
    try {
      const cfg = await fetchBillingConfig();
      setBillingConfigured(cfg.configured);
      if (!cfg.configured) return;
      const sub = await fetchSubscription(config.id, { sync: true });
      setBillingSub(sub);
      setBillingAmount(String(sub.amount > 0 ? sub.amount : 99));
      setBillingActive(sub.amount > 0 ? sub.active : true);
      setBillingInvoiceEmail(sub.invoiceEmail || sub.payerEmail || '');
    } catch (err) {
      setBillingConfigured(false);
      setBillingMsg(err instanceof Error ? err.message : 'טעינת נתוני חיוב נכשלה');
    }
  }

  async function saveBilling(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.kind !== 'billing') return;
    const amount = Number(billingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setBillingMsg('סכום לא תקין');
      return;
    }
    const invoiceEmail = billingInvoiceEmail.trim();
    if (invoiceEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail)) {
      setBillingMsg('כתובת מייל לחשבונית לא תקינה');
      return;
    }
    setBusy(true);
    setBillingMsg('');
    try {
      const sub = await saveBillingSettings(modal.config.id, {
        amount,
        active: billingActive,
        invoiceEmail,
      });
      setBillingSub(sub);
      setBillingInvoiceEmail(sub.invoiceEmail || '');
      refreshSubs();
      setBillingMsg('הגדרות החיוב נשמרו — בית הכנסת יכול להזין כרטיס בניהול שלו');
    } catch (err) {
      setBillingMsg(err instanceof Error ? err.message : 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function billingChargeNow() {
    if (!modal || modal.kind !== 'billing') return;
    setBusy(true);
    setBillingMsg('');
    try {
      const { subscription: sub, license } = await chargeBillingNow(modal.config.id);
      setBillingSub(sub);
      refreshSubs();
      const until = license?.expiresAt
        ? formatBillingDate(license.expiresAt)
        : formatBillingDate(sub.paidUntil);
      setBillingMsg(`חויב ${formatIls(sub.amount)} — הרישיון חודש עד ${until}`);
      void reloadFromCloud();
    } catch (err) {
      setBillingMsg(err instanceof Error ? err.message : 'החיוב נכשל');
    } finally {
      setBusy(false);
    }
  }

  async function billingCancel() {
    if (!modal || modal.kind !== 'billing') return;
    if (!confirm(`לבטל את הוראת הקבע של «${modal.config.name}»?`)) return;
    setBusy(true);
    setBillingMsg('');
    try {
      const sub = await cancelBilling(modal.config.id);
      setBillingSub(sub);
      refreshSubs();
      setBillingActive(false);
      setBillingMsg('הוראת הקבע בוטלה — הרישיון יפוג בתום התקופה ששולמה');
    } catch (err) {
      setBillingMsg(err instanceof Error ? err.message : 'הביטול נכשל');
    } finally {
      setBusy(false);
    }
  }

  async function openBackups(config: SynagogueConfig) {
    setBackupMsg('');
    setBackupItems([]);
    setModal({ kind: 'backups', config });
    try {
      const r = await listBackups(config.id);
      setBackupItems(r.items);
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'טעינת גיבויים נכשלה');
    }
  }

  async function onCreateBackup() {
    if (!modal || modal.kind !== 'backups') return;
    setBusy(true);
    setBackupMsg('');
    try {
      const r = await createBackupNow(modal.config.id);
      setBackupItems(r.items ?? []);
      setBackupMsg('גיבוי נוצר בהצלחה ונשמר בדיסק לשבוע');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'יצירת גיבוי נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreBackup(backupId: string) {
    if (!modal || modal.kind !== 'backups') return;
    if (
      !confirm(
        `לשחזר את «${modal.config.name}» מגיבוי זה?\nהמצב הנוכחי יישמר אוטומטית כגיבוי לפני השחזור.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setBackupMsg('');
    try {
      await restoreBackup(modal.config.id, backupId);
      const r = await listBackups(modal.config.id);
      setBackupItems(r.items);
      await reloadFromCloud();
      setBackupMsg('השחזור הושלם — ההגדרות (ורישומי הו״ק אם היו בגיבוי) חזרו');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'השחזור נכשל');
    } finally {
      setBusy(false);
    }
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
    setLicMonths(12);
    setModal({ kind: 'license', config: local.config });
  }

  async function confirmLicense(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.kind !== 'license') return;
    setBusy(true);
    const issued = renewScreenLicense(
      modal.config.id,
      'basic',
      licMonths,
      modal.config.name,
    );
    const next = { ...modal.config, license: issued };
    await saveConfig(next, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: `הנפקת רישיון ל־${licMonths} חודשים`,
    });
    setBusy(false);
    setModal(null);
    const left = daysLeft(issued);
    refresh(
      `הופעל «${modal.config.name}» · ${left ?? licMonths * 30} ימים`,
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
    // New synagogues start without a license — activate separately (payment / manual)
    config.license = undefined;
    await saveConfig(config, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: 'יצירת בית כנסת (ללא רישיון)',
    });
    setName('');
    setBusy(false);
    setModal(null);
    refresh(`נוצר «${config.name}» — ללא רישיון. הפעל דרך «הפעל לפי תשלום» או הו״ק`);
  }

  async function removeLicense(config: SynagogueConfig) {
    if (!config.license) {
      setMsg('אין רישיון להסרה');
      return;
    }
    if (!confirm(`להסיר את הרישיון של «${config.name}»? המסך יינעל עד הפעלה מחדש.`)) return;
    setBusy(true);
    const next = { ...config, license: undefined };
    await saveConfig(next, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: 'הסרת רישיון מסך',
    });
    setBusy(false);
    refresh(`הוסר הרישיון של «${config.name}» — המסך ללא רישיון`);
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
          <p className="agency-brand">smartech</p>
          <h1>ניהול בתי כנסת</h1>
          <p className="agency-sub">{loadPlatformSession()?.username}</p>
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
                const sub = subsById[c.id];
                const licenseUntil = c.license?.expiresAt
                  ? formatBillingDate(c.license.expiresAt)
                  : null;
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
                            ? daysLeft(c.license) != null
                              ? `פעיל · ${daysLeft(c.license)} ימים`
                              : 'פעיל'
                            : 'לא הופעל'}
                      </span>
                      <span className="tag">{c.layout === 'canvas' ? 'בונה מסך' : c.layout}</span>
                      {hb ? <span className="tag">v{hb.version}</span> : null}
                    </div>

                    <p className={`shul-billing ${sub?.lastChargeAt ? (sub.status === 'failed' ? 'warn' : 'ok') : ''}`}>
                      {sub?.lastChargeAt ? (
                        <>
                          שילם {sub.payerName || 'לקוח'} · {formatBillingDate(sub.lastChargeAt)} ·{' '}
                          {formatIls(sub.amount)}
                          {licenseUntil ? ` · תוקף עד ${licenseUntil}` : ''}
                          {sub.status === 'failed' ? ' · חיוב אחרון נכשל' : ''}
                        </>
                      ) : sub && sub.amount > 0 ? (
                        <>
                          טרם שילם · מנוי {formatIls(sub.amount)}/חודש
                          {licenseUntil ? ` · תוקף עד ${licenseUntil}` : ''}
                        </>
                      ) : licenseUntil ? (
                        <>ללא הו״ק · תוקף עד {licenseUntil}</>
                      ) : (
                        <>ללא תשלום וללא רישיון</>
                      )}
                    </p>

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
                        onClick={() => void openBilling(c)}
                        title="הוראת קבע חודשית דרך SUMIT"
                      >
                        הו״ק
                      </button>
                      <button
                        type="button"
                        className="act"
                        onClick={() => void openBackups(c)}
                        title="גיבויים ושחזור מהדיסק"
                      >
                        גיבוי
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
                      {c.license ? (
                        <button
                          type="button"
                          className="act danger"
                          disabled={busy}
                          onClick={() => void removeLicense(c)}
                          title="החזרת המסך למצב ללא רישיון"
                        >
                          הסר רישיון
                        </button>
                      ) : null}
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
          <div className="side-card">
            <h2>דיסק ענן (Render)</h2>
            {diskStatus ? (
              <p className={`hint ${diskStatus.diskOk && diskStatus.dataDirSet ? '' : 'warn'}`}>
                {diskStatus.diskOk && diskStatus.dataDirSet
                  ? `פעיל · ${diskStatus.mediaFileCount} קבצי מדיה · ${diskStatus.billingRecordCount} רשומות הו״ק`
                  : 'דיסק לא מוגדר כראוי — מדיה/הו״ק עלולים להימחק בפריסה'}
              </p>
            ) : (
              <p className="hint">טוען סטטוס דיסק…</p>
            )}
          </div>

          <form className="side-card" onSubmit={(e) => void onSaveAdminEmail(e)}>
            <h2>מייל חשבונית ברירת מחדל</h2>
            <p className="hint">
              משמש כגיבוי בלבד. את מייל החשבונית לכל בית כנסת קובעים בכפתור «הו״ק»
              של אותו בית כנסת.
            </p>
            <label>
              אימייל
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                dir="ltr"
                style={{ textAlign: 'left' }}
                placeholder="admin@example.com"
              />
            </label>
            {adminEmailMsg ? <p className="hint">{adminEmailMsg}</p> : null}
            <button type="submit" className="btn ghost" disabled={busy}>
              שמור מייל
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
                <p className="hint">
                  נוצר מסך חדש <strong>ללא רישיון</strong> עם משתמש admin — הפעל רישיון
                  בנפרד («הפעל לפי תשלום» או הוראת קבע).
                </p>
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
                  «{modal.config.name}» — בחר תקופה ששולמה. הלקוח לא רואה מפתח רישיון.
                </p>
                {modal.config.license ? (
                  <p className="hint">
                    נוכחי:
                    {daysLeft(modal.config.license) != null
                      ? ` נותרו ${daysLeft(modal.config.license)} ימים`
                      : ' פעיל'}
                    {modal.config.license.expiresAt
                      ? ` · עד ${formatBillingDate(modal.config.license.expiresAt)}`
                      : ''}
                  </p>
                ) : null}
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

            {modal.kind === 'billing' ? (
              <form onSubmit={(e) => void saveBilling(e)}>
                <h2>הוראת קבע — {modal.config.name}</h2>
                {billingConfigured === false ? (
                  <p className="hint warn">
                    סליקת SUMIT לא מוגדרת בשרת. הוסף את משתני הסביבה{' '}
                    <code dir="ltr">SUMIT_COMPANY_ID</code>,{' '}
                    <code dir="ltr">SUMIT_API_KEY</code>,{' '}
                    <code dir="ltr">SUMIT_API_PUBLIC_KEY</code> ב־Render.
                  </p>
                ) : billingConfigured === null ? (
                  <p className="hint">טוען…</p>
                ) : (
                  <>
                    <p className="hint">
                      קבע סכום חודשי. בית הכנסת מזין כרטיס אשראי בפאנל הניהול שלו
                      (לשונית הגדרות), וכל חיוב מוצלח מחדש את הרישיון לחודש נוסף.
                    </p>
                    <label>
                      סכום חודשי (₪, כולל מע״מ)
                      <input
                        value={billingAmount}
                        onChange={(e) => setBillingAmount(e.target.value)}
                        inputMode="decimal"
                        required
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                      />
                    </label>
                    <label>
                      מייל לחשבונית (לבית כנסת זה)
                      <input
                        type="email"
                        value={billingInvoiceEmail}
                        onChange={(e) => setBillingInvoiceEmail(e.target.value)}
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        placeholder="name@example.com"
                      />
                      <span className="hint">
                        לכאן תישלח החשבונית מ־SUMIT עבור בית כנסת זה. אם ריק — תישלח
                        למייל שהזין בית הכנסת בעת הזנת הכרטיס.
                      </span>
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={billingActive}
                        onChange={(e) => setBillingActive(e.target.checked)}
                      />
                      חיוב חודשי אוטומטי פעיל
                    </label>
                    {billingSub ? (
                      <p className="hint">
                        סטטוס:{' '}
                        {billingSub.status === 'active'
                          ? 'פעיל'
                          : billingSub.status === 'failed'
                            ? 'חיוב נכשל'
                            : billingSub.status === 'canceled'
                              ? 'מבוטל'
                              : 'טרם הוזן כרטיס'}
                        {billingSub.hasPaymentMethod
                          ? ` · כרטיס •••• ${billingSub.cardMask || '????'}`
                          : ''}
                        {billingSub.paidUntil
                          ? ` · שולם עד ${formatBillingDate(billingSub.paidUntil)}`
                          : ''}
                        {billingSub.lastError ? ` · שגיאה: ${billingSub.lastError}` : ''}
                      </p>
                    ) : null}
                    {billingSub?.history?.length ? (
                      <div>
                        <p className="hint" style={{ marginBottom: '0.35rem' }}>
                          היסטוריית חשבוניות / חיובים
                        </p>
                        <ul className="hint" style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
                          {billingSub.history.map((h, i) => (
                            <li key={i}>
                              {formatBillingDate(h.at)} · {formatIls(h.amount)} ·{' '}
                              {h.ok ? (
                                <>
                                  הצליח
                                  {h.documentNumber ? ` · מס׳ ${h.documentNumber}` : ''}
                                  {h.documentUrl ? (
                                    <>
                                      {' · '}
                                      <a href={h.documentUrl} target="_blank" rel="noreferrer">
                                        הורדת חשבונית
                                      </a>
                                    </>
                                  ) : null}
                                </>
                              ) : (
                                `נכשל${h.error ? ` (${h.error})` : ''}`
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
                {billingMsg ? <p className="hint">{billingMsg}</p> : null}
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    סגור
                  </button>
                  {billingConfigured ? (
                    <>
                      {billingSub?.hasPaymentMethod ? (
                        <>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busy}
                            onClick={() => void billingCancel()}
                          >
                            בטל הו״ק
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busy}
                            onClick={() => void billingChargeNow()}
                          >
                            {busy ? 'מחייב…' : 'חייב עכשיו'}
                          </button>
                        </>
                      ) : null}
                      <button type="submit" className="btn primary" disabled={busy}>
                        {busy ? 'שומר…' : 'שמור הגדרות'}
                      </button>
                    </>
                  ) : null}
                </div>
              </form>
            ) : null}

            {modal.kind === 'backups' ? (
              <div>
                <h2>גיבויים — {modal.config.name}</h2>
                <p className="hint">
                  גיבוי אוטומטי כל יום בחצות (שעון ישראל). כל גיבוי נשמר בדיסק של Render למשך 7 ימים (הגדרות מלאות + הו״ק אם קיים).
                  נוצרים אוטומטית בכל שמירה (עד פעם ב־15 דקות) וגם פעם ביום.
                </p>
                <div className="modal-actions" style={{ marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void onCreateBackup()}
                  >
                    {busy ? 'שומר…' : 'צור גיבוי עכשיו'}
                  </button>
                </div>
                {backupItems.length ? (
                  <ul className="hint" style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
                    {backupItems.map((b) => (
                      <li key={b.id} style={{ marginBottom: '0.55rem' }}>
                        {formatBackupDate(b.createdAt)} · {backupReasonLabel(b.reason)}
                        {b.revision != null ? ` · rev ${b.revision}` : ''}
                        {b.hasBilling ? ' · כולל הו״ק' : ''}
                        {' · '}
                        <button
                          type="button"
                          className="act"
                          disabled={busy}
                          onClick={() => void onRestoreBackup(b.id)}
                        >
                          שחזר
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">אין גיבויים עדיין — לחץ «צור גיבוי עכשיו».</p>
                )}
                {backupMsg ? <p className="hint">{backupMsg}</p> : null}
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    סגור
                  </button>
                </div>
              </div>
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
      <SiteFooter />
    </div>
  );
}
