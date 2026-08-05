import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CITIES, getCity } from '../data/cities';
import { createDefaultConfig } from '../data/defaults';
import { enterAsPlatformAdmin, generateExclusiveAdminPassword, generateExclusiveAdminUsername, hashPassword } from '../lib/auth';
import {
  daysLeft,
  issueScreenLicense,
  isLicenseValid,
  renewScreenLicense,
  setScreenLicenseLocked,
  TRIAL_DAYS,
} from '../lib/license';
import { fetchMailStatus, notifyTrialStarted, sendTestMail } from '../lib/notifications';
import {
  fetchSmsStatus,
  sendSmsTest,
  type SmsSystemStatus,
} from '../lib/passwordReset';
import { fetchInquiries } from '../lib/inquiries';
import { startOrefDrill, stopOrefDrill } from '../lib/orefAlerts';
import { InquiriesPanel } from '../components/InquiriesPanel';
import { DiskFilesPanel } from '../components/DiskFilesPanel';
import { CouponsPanel } from '../components/CouponsPanel';
import {
  addPlatformAccount,
  changePlatformPassword,
  clearPlatformSession,
  deletePlatformAccount,
  isPlatformAdminLoggedIn,
  listPlatformAccounts,
  loadPlatformSession,
  platformDisplayName,
  resetPlatformAccountPassword,
  touchPlatformSession,
  updatePlatformAccountProfile,
  type PlatformAccountPublic,
} from '../lib/platformAuth';
import { useSessionKeepAlive } from '../hooks/useSessionKeepAlive';
import { fetchHeartbeatsFromCloud, findHeartbeat, isScreenOnline } from '../lib/analytics';
import { APP_VERSION, isOlderVersion } from '../lib/appVersion';
import { fetchLandingStats, type LandingStats } from '../lib/landingAnalytics';
import { BrandLogo } from '../components/BrandLogo';
import { ScreenIdBadge } from '../components/ScreenIdBadge';
import { SiteFooter } from '../components/SiteFooter';
import { useAppNotice } from '../components/AppNotice';
import {
  changeScreenId,
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
import {
  isNumericScreenId,
  isValidScreenId,
  nextNumericScreenId,
  normalizeScreenId,
} from '../lib/screenId';
import './Agency.css';

type Modal =
  | null
  | { kind: 'create' }
  | {
      kind: 'created';
      config: SynagogueConfig;
      username: string;
      password: string;
      loginUrl: string;
      displayUrl: string;
      emailSentTo: string;
      mailOk: boolean;
    }
  | { kind: 'rename'; config: SynagogueConfig }
  | { kind: 'changeId'; config: SynagogueConfig }
  | { kind: 'duplicate'; config: SynagogueConfig }
  | { kind: 'delete'; config: SynagogueConfig; step: 1 | 2 }
  | { kind: 'license'; config: SynagogueConfig }
  | { kind: 'resetPassword'; config: SynagogueConfig }
  | { kind: 'billing'; config: SynagogueConfig }
  | { kind: 'backups'; config: SynagogueConfig };

export function Agency() {
  const navigate = useNavigate();
  const { confirm: askConfirm } = useAppNotice();
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
  const [platformUsers, setPlatformUsers] = useState<PlatformAccountPublic[]>([]);
  const [platUserForm, setPlatUserForm] = useState({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    requireSmsOtp: true,
  });
  const [platUserMsg, setPlatUserMsg] = useState('');
  const [platReset, setPlatReset] = useState<{ username: string; pass: string; pass2: string } | null>(
    null,
  );
  const [platEdit, setPlatEdit] = useState<PlatformAccountPublic | null>(null);

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [name, setName] = useState('');
  const [screenId, setScreenId] = useState('');
  const [cityId, setCityId] = useState('petah-tikva');
  const [contactEmail, setContactEmail] = useState('');
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
  const [defaultBillingAmount, setDefaultBillingAmount] = useState('99');
  const [adminEmailMsg, setAdminEmailMsg] = useState('');
  const [mailStatus, setMailStatus] = useState<{
    configured: boolean;
    host: string | null;
    from: string | null;
  } | null>(null);
  const [mailTestMsg, setMailTestMsg] = useState('');
  const [smsStatus, setSmsStatus] = useState<SmsSystemStatus | null>(null);
  const [smsTestMsg, setSmsTestMsg] = useState('');
  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [subsById, setSubsById] = useState<Record<string, BillingSubscription>>({});
  const [diskStatus, setDiskStatus] = useState<{
    diskOk: boolean;
    mediaFileCount: number;
    billingRecordCount: number;
    dataDirSet: boolean;
  } | null>(null);
  const [inquiryUnread, setInquiryUnread] = useState(0);
  const [agencyView, setAgencyView] = useState<'shuls' | 'inquiries' | 'settings'>('shuls');
  const [orefTestId, setOrefTestId] = useState('');
  const [orefTestSeconds, setOrefTestSeconds] = useState('60');
  const [orefTestMsg, setOrefTestMsg] = useState('');

  const [heartbeats, setHeartbeats] = useState<ScreenHeartbeat[]>([]);
  const [landingStats, setLandingStats] = useState<LandingStats | null>(null);

  useEffect(() => {
    if (!moreOpenId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.shul-more')) return;
      setMoreOpenId(null);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [moreOpenId]);

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

  useEffect(() => {
    if (!platformOk) return;
    let cancelled = false;
    const load = () => {
      void fetchLandingStats()
        .then((s) => {
          if (!cancelled) setLandingStats(s);
        })
        .catch(() => {
          if (!cancelled) setLandingStats(null);
        });
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [platformOk, agencyView]);

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

  async function reloadInquiries() {
    try {
      const data = await fetchInquiries();
      setInquiryUnread(data.unread);
    } catch {
      /* offline / API missing */
    }
  }

  useEffect(() => {
    if (!platformOk) return;
    void reloadFromCloud();
    void reloadInquiries();
    void fetchPlatformBilling()
      .then((p) => {
        setAdminEmail(p.adminEmail || '');
        setDefaultBillingAmount(String(p.defaultAmount > 0 ? p.defaultAmount : 99));
      })
      .catch(() => {});
    void fetchMailStatus()
      .then(setMailStatus)
      .catch(() => setMailStatus({ configured: false, host: null, from: null }));
    void fetchSmsStatus()
      .then(setSmsStatus)
      .catch(() =>
        setSmsStatus({
          configured: false,
          otpEnabled: false,
          ready: false,
          sender: null,
          userHint: '****',
          notes: 'לא ניתן לטעון סטטוס SMS',
        }),
      );
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
    const poll = window.setInterval(() => void reloadInquiries(), 30_000);
    return () => window.clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per login
  }, [platformOk]);

  async function onSaveAdminEmail(e: FormEvent) {
    e.preventDefault();
    setAdminEmailMsg('');
    const amount = Number(defaultBillingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setAdminEmailMsg('סכום הו״ק ברירת מחדל לא תקין');
      return;
    }
    setBusy(true);
    try {
      const r = await savePlatformBilling({
        adminEmail: adminEmail.trim(),
        defaultAmount: amount,
      });
      setAdminEmail(r.adminEmail || '');
      setDefaultBillingAmount(String(r.defaultAmount > 0 ? r.defaultAmount : 99));
      setAdminEmailMsg('הגדרות ברירת המחדל נשמרו');
    } catch (err) {
      setAdminEmailMsg(err instanceof Error ? err.message : 'שמירה נכשלה');
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
      const hb = findHeartbeat(heartbeats, c.id);
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
      const hb = findHeartbeat(heartbeats, c.id);
      if (isScreenOnline(hb)) online += 1;
      if (c.license && isLicenseValid(c.license)) licensed += 1;
    }
    return { total: shuls.length, online, licensed, offline: shuls.length - online };
  }, [shuls, heartbeats]);

  function refresh(note?: string) {
    setTick((t) => t + 1);
    if (note) setMsg(note);
  }

  useEffect(() => {
    if (!platformOk || agencyView !== 'settings') return;
    let cancelled = false;
    void (async () => {
      try {
        const users = await listPlatformAccounts();
        if (!cancelled) setPlatformUsers(users);
      } catch {
        if (!cancelled) setPlatformUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platformOk, agencyView, pwdMsg, platUserMsg]);

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

  async function onAddPlatformUser(e: FormEvent) {
    e.preventDefault();
    setPlatUserMsg('');
    const result = await addPlatformAccount(platUserForm.username, platUserForm.password, {
      firstName: platUserForm.firstName,
      lastName: platUserForm.lastName,
      email: platUserForm.email,
      phone: platUserForm.phone,
      requireSmsOtp: platUserForm.requireSmsOtp,
    });
    if (!result.ok) {
      setPlatUserMsg(result.error);
      return;
    }
    setPlatUserForm({
      username: '',
      password: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      requireSmsOtp: true,
    });
    setPlatUserMsg(`המשתמש «${result.username}» נוסף`);
    setPlatformUsers(await listPlatformAccounts());
  }

  async function onSavePlatformProfile(e: FormEvent) {
    e.preventDefault();
    if (!platEdit) return;
    setPlatUserMsg('');
    const result = await updatePlatformAccountProfile(platEdit.username, {
      firstName: platEdit.firstName,
      lastName: platEdit.lastName,
      email: platEdit.email,
      phone: platEdit.phone,
      requireSmsOtp: platEdit.requireSmsOtp,
    });
    if (!result.ok) {
      setPlatUserMsg(result.error);
      return;
    }
    setPlatEdit(null);
    setPlatUserMsg(`פרטי «${platEdit.username}» עודכנו`);
    setPlatformUsers(await listPlatformAccounts());
  }

  async function onResetPlatformUser(e: FormEvent) {
    e.preventDefault();
    if (!platReset) return;
    setPlatUserMsg('');
    if (platReset.pass !== platReset.pass2) {
      setPlatUserMsg('הסיסמאות אינן תואמות');
      return;
    }
    const result = await resetPlatformAccountPassword(platReset.username, platReset.pass);
    if (!result.ok) {
      setPlatUserMsg(result.error);
      return;
    }
    setPlatReset(null);
    setPlatUserMsg(`סיסמה עודכנה ל־«${platReset.username}»`);
  }

  async function onDeletePlatformUser(username: string) {
    if (
      !(await askConfirm({
        message: `למחוק את משתמש מנהל-העל «${username}»?`,
        confirmLabel: 'מחק',
        danger: true,
      }))
    ) {
      return;
    }
    setPlatUserMsg('');
    const result = await deletePlatformAccount(username);
    if (!result.ok) {
      setPlatUserMsg(result.error);
      return;
    }
    setPlatUserMsg(`«${username}» נמחק`);
    setPlatformUsers(await listPlatformAccounts());
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
      const sub = await fetchSubscription(config.id);
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
    if (!(await askConfirm(`לבטל את הוראת הקבע של «${modal.config.name}»?`))) return;
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
      !(await askConfirm(
        `לשחזר את «${modal.config.name}» מגיבוי זה?\nהמצב הנוכחי יישמר אוטומטית כגיבוי לפני השחזור.`,
      ))
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

  function openCreateModal() {
    setScreenId(
      nextNumericScreenId([...listSynagogueIds(), ...shuls.map((c) => c.id)]),
    );
    setModal({ kind: 'create' });
  }

  async function createShul(e: FormEvent) {
    e.preventDefault();
    if (!isPlatformAdminLoggedIn()) {
      setMsg('נדרשת התחברות מנהל מערכת');
      setPlatformOk(false);
      return;
    }
    if (!name.trim()) return;
    const email = contactEmail.trim();
    if (!email) {
      setMsg('נא להזין מייל לקוח — אליו יישלחו פרטי הכניסה');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg('כתובת המייל אינה תקינה');
      return;
    }
    setBusy(true);
    const id = normalizeScreenId(screenId);
    if (!isValidScreenId(id) || !/^\d{1,12}$/.test(id)) {
      setBusy(false);
      setMsg('מזהה מסך חייב להיות מספר (למשל 12)');
      return;
    }
    const taken = new Set([
      ...listSynagogueIds(),
      ...shuls.map((c) => c.id),
    ]);
    if (taken.has(id) || loadLocal(id)) {
      setBusy(false);
      setMsg('מזהה מסך כבר קיים — בחרו מספר אחר');
      return;
    }
    const adminUser = generateExclusiveAdminUsername(id, email);
    const adminPass = generateExclusiveAdminPassword();
    const config = await createDefaultConfig(id, name.trim(), cityId, adminPass, adminUser);
    config.contactEmail = email;
    config.signupSource = 'agency';
    config.license = issueScreenLicense(id, 'trial', name.trim(), {
      durationDays: TRIAL_DAYS,
    });
    await saveConfig(config, undefined, {
      by: `platform:${loadPlatformSession()?.username ?? 'admin'}`,
      summary: `יצירת בית כנסת + ניסיון ${TRIAL_DAYS} ימים`,
    });

    // Auto-seed default standing-order amount so the customer can pay after trial
    try {
      const plat = await fetchPlatformBilling();
      const amount =
        plat.defaultAmount > 0 ? plat.defaultAmount : Number(defaultBillingAmount) || 99;
      await saveBillingSettings(id, {
        amount,
        active: true,
        invoiceEmail: email,
      });
      refreshSubs();
    } catch {
      /* billing optional if SUMIT off */
    }

    const origin = window.location.origin;
    const loginUrl = `${origin}/login/${encodeURIComponent(id)}`;
    const displayUrl = `${origin}/display/${encodeURIComponent(id)}`;
    const mailResult = await notifyTrialStarted(id, {
      username: adminUser,
      password: adminPass,
      loginUrl,
      displayUrl,
      to: email,
    });
    const mailOk = Boolean(mailResult && (mailResult as { ok?: boolean }).ok);

    setName('');
    setScreenId('');
    setContactEmail('');
    setBusy(false);
    setModal({
      kind: 'created',
      config,
      username: adminUser,
      password: adminPass,
      loginUrl,
      displayUrl,
      emailSentTo: email,
      mailOk,
    });
    refresh(
      mailOk
        ? `נוצר «${config.name}» — פרטי הכניסה נשלחו ל־${email}`
        : `נוצר «${config.name}» — בדקו את פרטי הכניסה למטה (שליחת המייל נכשלה או SMTP כבוי)`,
    );
  }

  async function onTestSmtp() {
    const to = adminEmail.trim();
    if (!to) {
      setMailTestMsg('שמור קודם מייל מנהל ואז בדוק');
      return;
    }
    setMailTestMsg('שולח…');
    try {
      await sendTestMail(to);
      setMailTestMsg(`נשלח מייל בדיקה אל ${to}`);
    } catch (err) {
      setMailTestMsg(err instanceof Error ? err.message : 'שליחת בדיקה נכשלה');
    }
  }

  async function onTestSms() {
    setSmsTestMsg('שולח…');
    try {
      const result = await sendSmsTest(smsTestPhone.trim() || undefined);
      if (!result.ok) {
        setSmsTestMsg(result.error || 'בדיקת SMS נכשלה');
        const st = await fetchSmsStatus().catch(() => null);
        if (st) setSmsStatus(st);
        return;
      }
      setSmsTestMsg(result.message || 'הודעת בדיקה נשלחה');
      const st = await fetchSmsStatus().catch(() => null);
      if (st) setSmsStatus(st);
    } catch (err) {
      setSmsTestMsg(err instanceof Error ? err.message : 'בדיקת SMS נכשלה');
    }
  }

  async function removeLicense(config: SynagogueConfig) {
    if (!config.license) {
      setMsg('אין רישיון להסרה');
      return;
    }
    if (
      !(await askConfirm({
        message: `להסיר את הרישיון של «${config.name}»? המסך יינעל עד הפעלה מחדש.`,
        confirmLabel: 'הסר רישיון',
        danger: true,
      }))
    ) {
      return;
    }
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

  async function confirmChangeId(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.kind !== 'changeId') return;
    const nextId = normalizeScreenId(screenId);
    if (!isNumericScreenId(nextId)) {
      setMsg('מזהה חדש חייב להיות מספר');
      return;
    }
    if (
      !(await askConfirm(
        `להמיר את מזהה «${modal.config.id}» למספר ${nextId}?\nכתובות ישנות (/display/… עם המזהה הישן) יפסיקו לעבוד — עדכנו קיוסקים וקישורים.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    const result = await changeScreenId(modal.config.id, nextId);
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error ?? 'המרת מזהה נכשלה');
      return;
    }
    setModal(null);
    refresh(`המזהה של «${modal.config.name}» הומר ל־${nextId}`);
  }

  async function convertAllToNumeric() {
    const legacy = shuls.filter((c) => !isNumericScreenId(c.id));
    if (!legacy.length) {
      setMsg('כל המסכים כבר עם מזהה מספרי');
      return;
    }
    if (
      !(await askConfirm(
        `להמיר ${legacy.length} מסכים עם מזהה מילולי למספרים?\nיש לעדכן אחרי זה קישורי קיוסק /display.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    const taken = [...listSynagogueIds(), ...shuls.map((c) => c.id)];
    let okCount = 0;
    const errors: string[] = [];
    for (const c of legacy) {
      const nextId = nextNumericScreenId(taken);
      taken.push(nextId);
      const result = await changeScreenId(c.id, nextId);
      if (result.ok) okCount += 1;
      else errors.push(`${c.name}: ${result.error ?? 'שגיאה'}`);
    }
    setBusy(false);
    refresh(
      errors.length
        ? `הומרו ${okCount}/${legacy.length}. בעיות: ${errors.join(' · ')}`
        : `הומרו ${okCount} מסכים למזהים מספריים`,
    );
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
    if (modal.step === 1) {
      setDeleteConfirmText('');
      setModal({ ...modal, step: 2 });
      return;
    }
    const expected = modal.config.name.trim();
    if (deleteConfirmText.trim() !== expected) {
      setMsg('יש להקליד את שם בית הכנסת בדיוק כפי שמופיע לאישור המחיקה');
      return;
    }
    setBusy(true);
    const result = await deleteSynagogue(modal.config.id);
    setBusy(false);
    setModal(null);
    setDeleteConfirmText('');
    const purged = result.purged as
      | { mediaFiles?: number; backupFiles?: number; inquiries?: number }
      | undefined;
    const extra = purged
      ? ` · ${purged.mediaFiles || 0} מדיה · ${purged.backupFiles || 0} גיבויים · ${purged.inquiries || 0} פניות`
      : '';
    refresh(
      result.error
        ? `נמחק «${modal.config.name}»${extra} · ${result.error}`
        : `נמחק לצמיתות «${modal.config.name}»${extra}`,
    );
  }

  if (!platformOk) {
    return <Navigate to="/admin" replace />;
  }

  const session = loadPlatformSession();
  const welcomeName = platformDisplayName(session) || session?.username || '';

  return (
    <div className="agency" dir="rtl" lang="he">
      <header className="agency-top">
        <div>
          <BrandLogo size="md" className="agency-brand-logo" />
          <h1>ניהול בתי כנסת</h1>
          <p className="agency-sub">
            {welcomeName ? `ברוך הבא, ${welcomeName}` : session?.username}
          </p>
        </div>
        <div className="agency-top-actions">
          <div className="agency-view-tabs" role="tablist" aria-label="תצוגת פאנל">
            <button
              type="button"
              role="tab"
              aria-selected={agencyView === 'shuls'}
              className={agencyView === 'shuls' ? 'on' : ''}
              onClick={() => setAgencyView('shuls')}
            >
              בתי כנסת
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={agencyView === 'inquiries'}
              className={agencyView === 'inquiries' ? 'on' : ''}
              onClick={() => {
                setAgencyView('inquiries');
                void reloadInquiries();
              }}
            >
              פניות
              {inquiryUnread > 0 ? <span className="inq-badge">{inquiryUnread}</span> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={agencyView === 'settings'}
              className={agencyView === 'settings' ? 'on' : ''}
              onClick={() => setAgencyView('settings')}
            >
              הגדרות מערכת
            </button>
          </div>
          <button
            type="button"
            className="btn ghost"
            disabled={loadingList}
            onClick={() => void reloadFromCloud('הרשימה רועננה מהענן')}
          >
            {loadingList ? 'טוען…' : 'רענן מהענן'}
          </button>
          <button type="button" className="btn primary" onClick={() => openCreateModal()}>
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

      {agencyView === 'shuls' ? (
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
        <button
          type="button"
          className={`stat inquiry-stat ${inquiryUnread ? 'has-unread' : ''}`}
          onClick={() => setAgencyView('inquiries')}
        >
          <strong>{inquiryUnread}</strong>
          <span>פניות חדשות</span>
        </button>
        <div className="stat landing-stat" title="כניסות לדף הנחיתה (פעם אחת לכל ביקור בדפדפן)">
          <strong>{landingStats?.today ?? '—'}</strong>
          <span>כניסות היום</span>
        </div>
        <div className="stat landing-stat" title="סיכום 7 הימים האחרונים">
          <strong>{landingStats?.last7Days ?? '—'}</strong>
          <span>כניסות השבוע</span>
        </div>
        <div className="stat landing-stat" title="סיכום 30 הימים האחרונים">
          <strong>{landingStats?.last30Days ?? '—'}</strong>
          <span>כניסות החודש</span>
        </div>
        <div className="stat landing-stat">
          <strong>{landingStats?.total ?? '—'}</strong>
          <span>סה״כ כניסות</span>
        </div>
        <div className="stat landing-stat signup">
          <strong>{landingStats?.signupsTotal ?? '—'}</strong>
          <span>הרשמות מאתר</span>
        </div>
      </section>
      ) : null}

      {msg ? <p className="agency-flash banner">{msg}</p> : null}

      {agencyView === 'inquiries' ? (
        <InquiriesPanel mode="agency" canManage />
      ) : agencyView === 'settings' ? (
        <section className="agency-settings" aria-label="הגדרות מערכת">
          <header className="agency-settings-hero">
            <div>
              <p className="agency-settings-kicker">ניהול פלטפורמה</p>
              <h1>הגדרות מערכת</h1>
              <p className="agency-settings-lead">
                תשתית, התראות, חיוב ומשתמשי מנהל-על — במקום אחד.
              </p>
            </div>
          </header>

          <div className="agency-settings-status">
            <article className="settings-stat-card">
              <div className="settings-stat-top">
                <span className="settings-stat-label">דיסק ענן</span>
                {diskStatus ? (
                  <span
                    className={`settings-pill ${diskStatus.diskOk && diskStatus.dataDirSet ? 'ok' : 'warn'}`}
                  >
                    {diskStatus.diskOk && diskStatus.dataDirSet ? 'פעיל' : 'לא מוגדר'}
                  </span>
                ) : (
                  <span className="settings-pill">טוען…</span>
                )}
              </div>
              {diskStatus ? (
                <p className={`hint ${diskStatus.diskOk && diskStatus.dataDirSet ? '' : 'warn'}`}>
                  {diskStatus.diskOk && diskStatus.dataDirSet
                    ? `${diskStatus.mediaFileCount} קבצי מדיה · ${diskStatus.billingRecordCount} רשומות הו״ק`
                    : 'מדיה/הו״ק עלולים להימחק בפריסה — בדוק DATA_DIR בדיסק Render'}
                </p>
              ) : (
                <p className="hint">טוען סטטוס דיסק…</p>
              )}
            </article>

            <article className="settings-stat-card">
              <div className="settings-stat-top">
                <span className="settings-stat-label">SMTP · מיילים</span>
                {mailStatus == null ? (
                  <span className="settings-pill">טוען…</span>
                ) : (
                  <span className={`settings-pill ${mailStatus.configured ? 'ok' : 'warn'}`}>
                    {mailStatus.configured ? 'מחובר' : 'לא מוגדר'}
                  </span>
                )}
              </div>
              {mailStatus == null ? (
                <p className="hint">טוען…</p>
              ) : mailStatus.configured ? (
                <p className="hint">
                  {mailStatus.host || 'שרת'} · מ־ <span dir="ltr">{mailStatus.from}</span>
                </p>
              ) : (
                <p className="hint warn">
                  הוסף ב־Render: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
                </p>
              )}
              <div className="settings-card-actions">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!mailStatus?.configured || busy}
                  onClick={() => void onTestSmtp()}
                >
                  שלח מייל בדיקה
                </button>
              </div>
              {mailTestMsg ? <p className="hint settings-feedback">{mailTestMsg}</p> : null}
            </article>

            <article className="settings-stat-card">
              <div className="settings-stat-top">
                <span className="settings-stat-label">SMS · אימות כניסה</span>
                {smsStatus == null ? (
                  <span className="settings-pill">טוען…</span>
                ) : (
                  <span
                    className={`settings-pill ${
                      smsStatus.ready ? 'ok' : smsStatus.configured ? 'warn' : 'warn'
                    }`}
                  >
                    {smsStatus.ready
                      ? 'פעיל בכניסה'
                      : smsStatus.configured
                        ? 'מוגדר · כבוי בכניסה'
                        : 'לא מוגדר'}
                  </span>
                )}
              </div>
              {smsStatus == null ? (
                <p className="hint">טוען…</p>
              ) : (
                <p className={`hint ${smsStatus.ready ? '' : 'warn'}`}>
                  {smsStatus.notes}
                  {smsStatus.sender ? (
                    <>
                      {' '}
                      · שולח <span dir="ltr">{smsStatus.sender}</span>
                    </>
                  ) : null}
                </p>
              )}
              <div className="settings-fields" style={{ marginTop: '0.5rem' }}>
                <label>
                  נייד לבדיקה (אופציונלי)
                  <input
                    type="tel"
                    value={smsTestPhone}
                    onChange={(e) => setSmsTestPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                  />
                </label>
              </div>
              <div className="settings-card-actions">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!smsStatus?.configured || busy}
                  onClick={() => void onTestSms()}
                >
                  שלח SMS בדיקה
                </button>
              </div>
              {smsTestMsg ? <p className="hint settings-feedback">{smsTestMsg}</p> : null}
              <p className="hint">
                להפעלת OTP בכניסה אחרי שהבדיקה מצליחה: ב־Render הגדירו{' '}
                <span dir="ltr">PLATFORM_SMS_OTP_ENABLED=true</span>
              </p>
            </article>
          </div>

          <div className="agency-settings-grid">
            <form className="side-card settings-panel" onSubmit={(e) => void onSaveAdminEmail(e)}>
              <div className="settings-panel-head">
                <span className="settings-panel-tag">חיוב</span>
                <h2>ברירות מחדל</h2>
                <p className="hint">
                  סכום הו״ק לכל מסך חדש, ומייל מנהל כגיבוי להעתקת חשבוניות.
                </p>
              </div>
              <div className="settings-fields">
                <label>
                  סכום חודשי ברירת מחדל (₪)
                  <input
                    value={defaultBillingAmount}
                    onChange={(e) => setDefaultBillingAmount(e.target.value)}
                    inputMode="decimal"
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                    required
                  />
                </label>
                <label>
                  אימייל מנהל מערכת
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                    placeholder="admin@example.com"
                  />
                </label>
              </div>
              {adminEmailMsg ? <p className="hint settings-feedback">{adminEmailMsg}</p> : null}
              <div className="settings-card-actions">
                <button type="submit" className="btn primary" disabled={busy}>
                  שמור ברירות מחדל
                </button>
              </div>
            </form>

            <div className="side-card settings-panel settings-panel-users">
              <div className="settings-panel-head">
                <span className="settings-panel-tag">משתמשים</span>
                <h2>משתמשי מנהל-על</h2>
                <p className="hint">
                  חשבונות כניסה לפאנל הסוכנות בלבד — לא משתמשי בתי הכנסת.
                </p>
              </div>

              <ul className="platform-users-list">
                {platformUsers.length === 0 ? (
                  <li className="hint">אין משתמשים ברשימה</li>
                ) : (
                  platformUsers.map((user) => {
                    const isMe =
                      user.username ===
                      String(loadPlatformSession()?.username || '')
                        .trim()
                        .toLowerCase();
                    const display = platformDisplayName(user);
                    return (
                      <li key={user.username}>
                        <div className="platform-user-row">
                          <div className="platform-user-meta">
                            <span className="platform-user-display">{display}</span>
                            <span className="platform-user-name" dir="ltr">
                              {user.username}
                              {isMe ? <em> (אתה)</em> : null}
                            </span>
                            {user.email ? (
                              <span className="platform-user-email" dir="ltr">
                                {user.email}
                              </span>
                            ) : null}
                            {user.phone ? (
                              <span className="platform-user-email" dir="ltr">
                                {user.phone}
                              </span>
                            ) : (
                              <span className="hint">אין נייד ל־SMS</span>
                            )}
                            <span className="hint">
                              {user.requireSmsOtp ? 'דורש OTP ב־SMS' : 'בלי OTP'}
                            </span>
                          </div>
                          <div className="platform-user-actions">
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => setPlatEdit({ ...user })}
                            >
                              עריכת פרטים
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() =>
                                setPlatReset({ username: user.username, pass: '', pass2: '' })
                              }
                            >
                              איפוס סיסמה
                            </button>
                            <button
                              type="button"
                              className="btn ghost danger-text"
                              disabled={isMe}
                              onClick={() => void onDeletePlatformUser(user.username)}
                            >
                              מחק
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>

              {platEdit ? (
                <form className="platform-user-reset" onSubmit={(e) => void onSavePlatformProfile(e)}>
                  <p className="hint">
                    עריכת פרטים ל־<span dir="ltr">{platEdit.username}</span>
                  </p>
                  <div className="settings-fields settings-fields-2">
                    <label>
                      שם פרטי
                      <input
                        value={platEdit.firstName}
                        onChange={(e) => setPlatEdit({ ...platEdit, firstName: e.target.value })}
                      />
                    </label>
                    <label>
                      שם משפחה
                      <input
                        value={platEdit.lastName}
                        onChange={(e) => setPlatEdit({ ...platEdit, lastName: e.target.value })}
                      />
                    </label>
                    <label>
                      מייל
                      <input
                        type="email"
                        value={platEdit.email}
                        onChange={(e) => setPlatEdit({ ...platEdit, email: e.target.value })}
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                      />
                    </label>
                    <label>
                      נייד לאימות SMS
                      <input
                        type="tel"
                        value={platEdit.phone}
                        onChange={(e) => setPlatEdit({ ...platEdit, phone: e.target.value })}
                        placeholder="05XXXXXXXX"
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        required={platEdit.requireSmsOtp}
                      />
                    </label>
                  </div>
                  <label className="check remember-check">
                    <input
                      type="checkbox"
                      checked={platEdit.requireSmsOtp}
                      onChange={(e) =>
                        setPlatEdit({ ...platEdit, requireSmsOtp: e.target.checked })
                      }
                    />
                    דורש אימות SMS (OTP) בכל כניסה — פעם ביום
                  </label>
                  <div className="settings-card-actions">
                    <button type="submit" className="btn primary">
                      שמור פרטים
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setPlatEdit(null)}>
                      ביטול
                    </button>
                  </div>
                </form>
              ) : null}

              {platReset ? (
                <form className="platform-user-reset" onSubmit={(e) => void onResetPlatformUser(e)}>
                  <p className="hint">
                    סיסמה חדשה ל־<span dir="ltr">{platReset.username}</span>
                  </p>
                  <div className="settings-fields settings-fields-2">
                    <label>
                      סיסמה חדשה
                      <input
                        type="password"
                        value={platReset.pass}
                        onChange={(e) =>
                          setPlatReset({ ...platReset, pass: e.target.value })
                        }
                        required
                        minLength={8}
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                      />
                    </label>
                    <label>
                      אימות סיסמה
                      <input
                        type="password"
                        value={platReset.pass2}
                        onChange={(e) =>
                          setPlatReset({ ...platReset, pass2: e.target.value })
                        }
                        required
                        minLength={8}
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                      />
                    </label>
                  </div>
                  <div className="settings-card-actions">
                    <button type="submit" className="btn primary">
                      שמור סיסמה
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setPlatReset(null)}
                    >
                      ביטול
                    </button>
                  </div>
                </form>
              ) : null}

              <form className="platform-user-add" onSubmit={(e) => void onAddPlatformUser(e)}>
                <p className="settings-subhead">הוספת משתמש מנהל-על</p>
                <div className="settings-fields settings-fields-2">
                  <label>
                    שם פרטי
                    <input
                      value={platUserForm.firstName}
                      onChange={(e) =>
                        setPlatUserForm({ ...platUserForm, firstName: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    שם משפחה
                    <input
                      value={platUserForm.lastName}
                      onChange={(e) =>
                        setPlatUserForm({ ...platUserForm, lastName: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    מייל
                    <input
                      type="email"
                      value={platUserForm.email}
                      onChange={(e) =>
                        setPlatUserForm({ ...platUserForm, email: e.target.value })
                      }
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                    />
                  </label>
                  <label>
                    נייד לאימות SMS
                    <input
                      type="tel"
                      value={platUserForm.phone}
                      onChange={(e) =>
                        setPlatUserForm({ ...platUserForm, phone: e.target.value })
                      }
                      placeholder="05XXXXXXXX"
                      required={platUserForm.requireSmsOtp}
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                    />
                  </label>
                  <label>
                    שם משתמש
                    <input
                      value={platUserForm.username}
                      onChange={(e) =>
                        setPlatUserForm({ ...platUserForm, username: e.target.value })
                      }
                      required
                      autoComplete="off"
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                    />
                  </label>
                  <label>
                    סיסמה
                    <input
                      type="password"
                      value={platUserForm.password}
                      onChange={(e) =>
                        setPlatUserForm({ ...platUserForm, password: e.target.value })
                      }
                      required
                      minLength={8}
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                    />
                  </label>
                </div>
                <label className="check remember-check">
                  <input
                    type="checkbox"
                    checked={platUserForm.requireSmsOtp}
                    onChange={(e) =>
                      setPlatUserForm({ ...platUserForm, requireSmsOtp: e.target.checked })
                    }
                  />
                  דורש אימות SMS (OTP) בכל כניסה — פעם ביום
                </label>
                <div className="settings-card-actions">
                  <button type="submit" className="btn primary">
                    הוסף משתמש
                  </button>
                </div>
              </form>

              {platUserMsg ? <p className="hint settings-feedback">{platUserMsg}</p> : null}
            </div>

            <form className="side-card settings-panel" onSubmit={onChangePassword}>
              <div className="settings-panel-head">
                <span className="settings-panel-tag">אבטחה</span>
                <h2>הסיסמה שלי</h2>
                <p className="hint">עדכון סיסמת החשבון שאיתו התחברת כרגע.</p>
              </div>
              <div className="settings-fields">
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
              </div>
              {pwdMsg ? <p className="hint settings-feedback">{pwdMsg}</p> : null}
              <div className="settings-card-actions">
                <button type="submit" className="btn primary">
                  עדכן סיסמה
                </button>
              </div>
            </form>

            <div className="side-card settings-panel settings-panel-alert">
              <div className="settings-panel-head">
                <span className="settings-panel-tag danger">בדיקה</span>
                <h2>התראת פיקוד העורף</h2>
                <p className="hint">
                  מפעיל מסך אדום על מסך תצוגה פתוח — למנהל מערכת בלבד. לא אזעקה אמיתית.
                </p>
              </div>
              <div className="settings-fields settings-fields-2">
                <label>
                  בית כנסת / מזהה מסך
                  <select value={orefTestId} onChange={(e) => setOrefTestId(e.target.value)}>
                    <option value="">— בחר —</option>
                    {shuls.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  משך (שניות)
                  <select value={orefTestSeconds} onChange={(e) => setOrefTestSeconds(e.target.value)}>
                    <option value="30">30</option>
                    <option value="60">60</option>
                    <option value="120">120</option>
                  </select>
                </label>
              </div>
              <div className="settings-card-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!orefTestId}
                  onClick={() => {
                    void (async () => {
                      setOrefTestMsg('');
                      const city = getCity(shuls.find((s) => s.id === orefTestId)?.cityId || '');
                      const area = city?.name || 'בדיקת מערכת';
                      const res = await startOrefDrill({
                        synagogueId: orefTestId,
                        seconds: Number(orefTestSeconds) || 60,
                        areas: [area, 'בדיקת מערכת'],
                        title: 'ירי רקטות וטילים',
                        desc: 'זוהי התראת בדיקה — לא אזעקה אמיתית',
                      });
                      setOrefTestMsg(
                        res.ok
                          ? `הופעלה בדיקה על מסך ${orefTestId} ל־${orefTestSeconds} שניות`
                          : res.error || 'שגיאה',
                      );
                    })();
                  }}
                >
                  הפעל בדיקה
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!orefTestId}
                  onClick={() => {
                    void (async () => {
                      await stopOrefDrill(orefTestId);
                      setOrefTestMsg(`כובתה בדיקה למסך ${orefTestId}`);
                    })();
                  }}
                >
                  כבה עכשיו
                </button>
              </div>
              {orefTestMsg ? <p className="hint settings-feedback">{orefTestMsg}</p> : null}
            </div>

            <div className="settings-panel-coupons">
              <CouponsPanel />
            </div>
          </div>

          <div className="agency-settings-wide">
            <p className="agency-settings-section-label">קבצים בדיסק</p>
            <DiskFilesPanel />
          </div>
        </section>
      ) : (
      <>
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
        {shuls.some((c) => !isNumericScreenId(c.id)) ? (
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void convertAllToNumeric()}
            title="ממיר מזהים מילוליים ישנים למספרים"
          >
            המר מזהים למספרים
          </button>
        ) : null}
      </div>

      <div className="agency-body is-full">
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
              <button type="button" className="btn primary" onClick={() => openCreateModal()}>
                צור בית כנסת
              </button>
            </div>
          ) : (
            <ul className="shul-cards">
              {filtered.map((c, i) => {
                const hb = findHeartbeat(heartbeats, c.id);
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
                        <p className="shul-meta">{getCity(c.cityId).name}</p>
                        <div className="shul-id-wrap">
                          <ScreenIdBadge id={c.id} size="sm" copyable />
                        </div>
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
                      {hb ? (
                        <span
                          className={`tag${isOlderVersion(hb.version, APP_VERSION) ? ' warn' : ''}`}
                          title={
                            isOlderVersion(hb.version, APP_VERSION)
                              ? `גרסת מסך ישנה — המערכת ב־v${APP_VERSION}`
                              : `גרסת מסך v${hb.version}`
                          }
                        >
                          v{hb.version}
                          {isOlderVersion(hb.version, APP_VERSION) ? ' · ישן' : ''}
                        </span>
                      ) : null}
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
                        onClick={() => void issueForShul(c.id)}
                      >
                        {licensed || locked ? 'חדש תוקף' : 'הפעל לפי תשלום'}
                      </button>
                      <button
                        type="button"
                        className="act"
                        onClick={() => void openBilling(c)}
                        title="הוראת קבע חודשית"
                      >
                        הו״ק
                      </button>
                      <div className={`shul-more ${moreOpenId === c.id ? 'open' : ''}`}>
                        <button
                          type="button"
                          className="act"
                          aria-expanded={moreOpenId === c.id}
                          onClick={() =>
                            setMoreOpenId((id) => (id === c.id ? null : c.id))
                          }
                        >
                          עוד…
                        </button>
                        {moreOpenId === c.id ? (
                          <div className="shul-more-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setEditName(c.name);
                                setModal({ kind: 'rename', config: c });
                                setMoreOpenId(null);
                              }}
                            >
                              שנה שם
                            </button>
                            {!isNumericScreenId(c.id) ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setScreenId(
                                    nextNumericScreenId([
                                      ...listSynagogueIds(),
                                      ...shuls.map((x) => x.id),
                                    ]),
                                  );
                                  setModal({ kind: 'changeId', config: c });
                                  setMoreOpenId(null);
                                }}
                              >
                                המר למספר
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setEditName(`${c.name} (העתק)`);
                                setModal({ kind: 'duplicate', config: c });
                                setMoreOpenId(null);
                              }}
                            >
                              שכפל
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                void openBackups(c);
                                setMoreOpenId(null);
                              }}
                            >
                              גיבוי
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                openResetPassword(c);
                                setMoreOpenId(null);
                              }}
                            >
                              אפס סיסמה
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={busy || !c.license}
                              onClick={() => {
                                void toggleLicenseLock(c);
                                setMoreOpenId(null);
                              }}
                            >
                              {locked ? 'בטל השבתה' : 'השבת רישיון'}
                            </button>
                            {c.license ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="danger"
                                disabled={busy}
                                onClick={() => {
                                  void removeLicense(c);
                                  setMoreOpenId(null);
                                }}
                              >
                                הסר רישיון
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              onClick={() => {
                                setDeleteConfirmText('');
                                setModal({ kind: 'delete', config: c, step: 1 });
                                setMoreOpenId(null);
                              }}
                            >
                              מחק בית כנסת
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      </>
      )}

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
                  נוצר מסך עם <strong>ניסיון חינם ל־{TRIAL_DAYS} ימים</strong>, שם משתמש וסיסמת מנהל
                  ייחודיים — הפרטים נשלחים אוטומטית למייל הלקוח.
                </p>
                <label>
                  שם בית הכנסת
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    autoComplete="organization"
                    placeholder="לדוגמה: בית כנסת השכונה"
                  />
                </label>
                <label>
                  מזהה מסך (מספר)
                  <input
                    className="ltr"
                    dir="ltr"
                    inputMode="numeric"
                    pattern="[0-9]{1,12}"
                    value={screenId}
                    onChange={(e) => setScreenId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    required
                    autoComplete="off"
                    placeholder="12"
                    style={{ textAlign: 'left' }}
                  />
                </label>
                <p className="hint" style={{ marginTop: '-0.35rem' }}>
                  המזהה מופיע בכתובת המסך: <code dir="ltr">/display/{screenId || '…'}</code>
                </p>
                <label>
                  מייל הלקוח (חובה — פרטי כניסה)
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="gabbai@example.com"
                    dir="ltr"
                    style={{ textAlign: 'left' }}
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

            {modal.kind === 'created' ? (
              <div>
                <h2>המערכת מוכנה</h2>
                <div className="shul-id-wrap" style={{ margin: '0.5rem 0 0.75rem' }}>
                  <ScreenIdBadge id={modal.config.id} size="lg" copyable />
                </div>
                <p className="hint">
                  «{modal.config.name}» · ניסיון {TRIAL_DAYS} ימים
                  {modal.mailOk
                    ? ` · נשלח מייל אל ${modal.emailSentTo}`
                    : ` · שליחת המייל ל־${modal.emailSentTo} נכשלה — העתיקו את הפרטים ידנית`}
                </p>
                <div className="agency-creds-card">
                  <p>
                    <span>שם משתמש</span>
                    <code dir="ltr">{modal.username}</code>
                  </p>
                  <p>
                    <span>סיסמה</span>
                    <code dir="ltr">{modal.password}</code>
                  </p>
                  <p>
                    <span>ניהול</span>
                    <a href={modal.loginUrl} target="_blank" rel="noreferrer" dir="ltr">
                      {modal.loginUrl}
                    </a>
                  </p>
                  <p>
                    <span>מסך חי</span>
                    <a href={modal.displayUrl} target="_blank" rel="noreferrer" dir="ltr">
                      {modal.displayUrl}
                    </a>
                  </p>
                </div>
                <p className="hint warn-inline">
                  הסיסמה מוצגת כאן פעם אחת בלבד — העתיקו לפני הסגירה.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const text = [
                        `בית כנסת: ${modal.config.name}`,
                        `שם משתמש: ${modal.username}`,
                        `סיסמה: ${modal.password}`,
                        `ניהול: ${modal.loginUrl}`,
                        `מסך: ${modal.displayUrl}`,
                      ].join('\n');
                      void navigator.clipboard?.writeText(text).then(
                        () => setMsg('פרטי הכניסה הועתקו'),
                        () => setMsg('ההעתקה נכשלה'),
                      );
                    }}
                  >
                    העתק הכל
                  </button>
                  <button type="button" className="btn primary" onClick={() => setModal(null)}>
                    סגור
                  </button>
                </div>
              </div>
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

            {modal.kind === 'changeId' ? (
              <form onSubmit={(e) => void confirmChangeId(e)}>
                <h2>המרת מזהה למספר</h2>
                <p className="hint">
                  מזהה נוכחי: <code dir="ltr">{modal.config.id}</code> («{modal.config.name}»)
                </p>
                <p className="hint warn-inline">
                  אחרי ההמרה יש לעדכן קיוסקים וקישורים ל־/display/{screenId || '…'}
                </p>
                <label>
                  מזהה מספרי חדש
                  <input
                    className="ltr"
                    dir="ltr"
                    inputMode="numeric"
                    pattern="[0-9]{1,12}"
                    value={screenId}
                    onChange={(e) => setScreenId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    required
                    autoFocus
                    autoComplete="off"
                    placeholder="1"
                    style={{ textAlign: 'left' }}
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    ביטול
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? 'ממיר…' : 'המר למספר'}
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
                {modal.step === 1 ? (
                  <>
                    <p className="hint warn">
                      אזהרה 1 מתוך 2 — פעולה בלתי הפיכה.
                    </p>
                    <p className="hint">
                      מחיקת «<strong>{modal.config.name}</strong>» תמחק{' '}
                      <strong>הכל</strong> שקשור למסך זה:
                    </p>
                    <ul className="delete-purge-list">
                      <li>הגדרות המסך והעיצוב</li>
                      <li>כל קבצי המדיה בדיסק (תמונות, וידאו, פונטים)</li>
                      <li>גיבויים</li>
                      <li>הוראת קבע / רשומות חיוב</li>
                      <li>פניות ותשובות של בית הכנסת</li>
                      <li>תבניות אישיות וסטטוס מסך</li>
                    </ul>
                    <div className="modal-actions">
                      <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                        ביטול
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => void confirmDelete()}
                      >
                        המשך לאזהרה השנייה
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="hint warn">
                      אזהרה 2 מתוך 2 — הקלידו את שם בית הכנסת לאישור סופי.
                    </p>
                    <p className="hint">
                      הקלידו בדיוק: <strong>{modal.config.name}</strong>
                    </p>
                    <label>
                      שם לאישור מחיקה
                      <input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        autoFocus
                        placeholder={modal.config.name}
                      />
                    </label>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setDeleteConfirmText('');
                          setModal({ ...modal, step: 1 });
                        }}
                      >
                        חזרה
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={
                          busy || deleteConfirmText.trim() !== modal.config.name.trim()
                        }
                        onClick={() => void confirmDelete()}
                      >
                        {busy ? 'מוחק הכל…' : 'מחק הכל לצמיתות'}
                      </button>
                    </div>
                  </>
                )}
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
