import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BillingCard } from '../components/BillingCard';
import { DesignStudio } from '../components/DesignStudio';
import { CanvasBuilder } from '../components/canvas/CanvasBuilder';
import { InquiriesPanel } from '../components/InquiriesPanel';
import { SiteFooter } from '../components/SiteFooter';
import type { CanvasData } from '../components/canvas/CanvasWidgetContent';
import { MediaPickerField, GalleryManager } from '../components/MediaPicker';
import { CITIES } from '../data/cities';
import { NUSACH_TEMPLATES, applyNusachTemplate } from '../data/nusach';
import { ZMAN_DEFS, type ZmanKey } from '../data/zmanim';
import { createDefaultConfig } from '../data/defaults';
import {
  canEditContent,
  canEditSettings,
  clearSession,
  hashPassword,
  hashPin,
  loadSession,
  touchSession,
} from '../lib/auth';
import { useSessionKeepAlive } from '../hooks/useSessionKeepAlive';
import {
  fetchHebcalZmanim,
  getShabbatZmanimDate,
  isShabbatScheduleBlock,
  pickEnabledZmanim,
  resolveFromZmanimMap,
  type HebcalZmanimResult,
} from '../lib/hebcalZmanim';
import { getHistoryEntry, loadHistory } from '../lib/history';
import { ensureCustomFontsLoaded } from '../lib/customFonts';
import { expandConfigMedia } from '../lib/mediaPersist';
import { HEBREW_MONTHS, getDayInfo } from '../lib/jewish';
import { daysLeft, isLicenseValid } from '../lib/license';
import { upsertGallery } from '../lib/gallery';
import { useUndoHistory } from '../lib/undoHistory';
import { saveDesignTemplate } from '../lib/designTemplates';
import { fetchInquiries, markInquiriesSeen } from '../lib/inquiries';
import {
  loadLocal,
  pullFromCloud,
  saveConfig,
  startAutoSync,
  syncConfig,
} from '../lib/storage';
import type {
  Announcement,
  CanvasLayoutConfig,
  ComputedZman,
  DesignSettings,
  GalleryItem,
  HistoryEntry,
  Member,
  ModeSettings,
  ScheduleBlock,
  ScheduleItem,
  SpecialDisplayMode,
  SynagogueConfig,
  UserRole,
} from '../types';
import './Admin.css';

type TabId =
  | 'design'
  | 'canvas'
  | 'content'
  | 'zmanim'
  | 'announce'
  | 'yahrzeit'
  | 'media'
  | 'nusach'
  | 'modes'
  | 'live'
  | 'history'
  | 'settings'
  | 'users'
  | 'support';

type TabGroup = 'daily' | 'studio' | 'system';

const TAB_GROUPS: { id: TabGroup; label: string }[] = [
  { id: 'daily', label: 'יומי' },
  { id: 'studio', label: 'עיצוב' },
  { id: 'system', label: 'מערכת' },
];

const TABS: { id: TabId; label: string; ownerOnly?: boolean; group: TabGroup }[] = [
  { id: 'content', label: 'תפילות', group: 'daily' },
  { id: 'announce', label: 'הודעות', group: 'daily' },
  { id: 'zmanim', label: 'זמנים', group: 'daily' },
  { id: 'yahrzeit', label: 'יארצייט', group: 'daily' },
  { id: 'modes', label: 'שבת ואירוע', group: 'daily' },
  { id: 'live', label: 'תצוגה מקדימה', group: 'daily' },
  { id: 'design', label: 'עיצוב', ownerOnly: true, group: 'studio' },
  { id: 'canvas', label: 'בונה מסך', ownerOnly: true, group: 'studio' },
  { id: 'media', label: 'מדיה', ownerOnly: true, group: 'studio' },
  { id: 'nusach', label: 'נוסח', ownerOnly: true, group: 'studio' },
  { id: 'settings', label: 'הגדרות', group: 'system' },
  { id: 'users', label: 'משתמשים', ownerOnly: true, group: 'system' },
  { id: 'support', label: 'פניות', group: 'system' },
  { id: 'history', label: 'היסטוריה', ownerOnly: true, group: 'system' },
];

interface Props {
  synagogueId: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function Admin({ synagogueId }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [config, setConfigRaw] = useState<SynagogueConfig | null>(null);
  const undo = useUndoHistory<SynagogueConfig>();
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [passwordReset, setPasswordReset] = useState<{
    memberId: string;
    label: string;
    pass: string;
    pass2: string;
  } | null>(null);
  const [newMember, setNewMember] = useState({
    name: '',
    username: '',
    password: '',
    role: 'editor' as UserRole,
  });
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMember, setEditMember] = useState({
    name: '',
    username: '',
    role: 'editor' as UserRole,
  });
  const [session, setSession] = useState(() => loadSession());
  const [tab, setTab] = useState<TabId>(() => {
    if (searchParams.get('billing') === '1' && canEditSettings(loadSession()?.role ?? 'editor')) {
      return 'settings';
    }
    try {
      const saved = localStorage.getItem(`screensmart:admin-tab:${synagogueId}`) as TabId | null;
      if (saved && TABS.some((t) => t.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return 'content';
  });
  const [toast, setToast] = useState<string | null>(null);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const [kioskPin, setKioskPin] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewZmanim, setPreviewZmanim] = useState<ComputedZman[]>([]);
  const [previewZmanimMap, setPreviewZmanimMap] = useState<HebcalZmanimResult['times']>({});
  const [previewShabbatZmanimMap, setPreviewShabbatZmanimMap] =
    useState<HebcalZmanimResult['times']>({});
  const [itemDrag, setItemDrag] = useState<{ blockId: string; index: number } | null>(null);
  const [inquiryUnreadMessages, setInquiryUnreadMessages] = useState(0);

  const setConfig = (
    updater: SynagogueConfig | null | ((c: SynagogueConfig | null) => SynagogueConfig | null),
  ) => {
    setConfigRaw((c) => {
      const next = typeof updater === 'function' ? updater(c) : updater;
      if (c && next && next !== c && !undo.isApplying()) {
        undo.recordBeforeChange(c);
        queueMicrotask(() => setDirty(true));
      }
      return next;
    });
  };

  function undoEdit() {
    setConfigRaw((c) => {
      if (!c) return c;
      const prev = undo.undo(c);
      if (prev) queueMicrotask(() => setStatus('בוטל שינוי אחרון (Ctrl+Z)'));
      return prev ?? c;
    });
  }

  function redoEdit() {
    setConfigRaw((c) => {
      if (!c) return c;
      const next = undo.redo(c);
      if (next) queueMicrotask(() => setStatus('שוחזר שינוי (Ctrl+Y)'));
      return next ?? c;
    });
  }

  const previewSrc = useMemo(
    () => `${window.location.origin}${window.location.pathname}#/display/${synagogueId}?preview=1`,
    [synagogueId, previewKey],
  );

  useEffect(() => {
    setSession(loadSession());
    const stop = startAutoSync((n) => setStatus(`סונכרנו ${n} שינויים לענן`));
    createDefaultConfig(synagogueId, 'בית כנסת חדש').then((fallback) =>
      syncConfig(synagogueId, fallback).then((r) => {
        setConfigRaw(r.bundle.config);
        undo.reset();
        setDirty(false);
        const mode =
          r.cloudMode === 'supabase'
            ? 'Supabase'
            : r.cloudMode === 'server'
              ? 'ענן שרת'
              : 'סנכרון מקומי';
        setStatus(
          r.online
            ? `נטען (${r.source}) · ${mode}`
            : `אופליין — מטמון מקומי · יסונכרן אוטומטית`,
        );
        setHistory(loadHistory(synagogueId));
      }),
    );
    return stop;
  }, [synagogueId]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    ensureCustomFontsLoaded(config?.media?.customFonts);
  }, [config?.media?.customFonts]);

  useEffect(() => {
    try {
      localStorage.setItem(`screensmart:admin-tab:${synagogueId}`, tab);
    } catch {
      /* ignore */
    }
  }, [tab, synagogueId]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnread() {
      try {
        if (tab === 'support') {
          await markInquiriesSeen({ role: 'customer', synagogueId });
          if (!cancelled) setInquiryUnreadMessages(0);
          return;
        }
        const data = await fetchInquiries({ synagogueId });
        if (!cancelled) {
          setInquiryUnreadMessages(data.unreadMessagesCustomer || 0);
        }
      } catch {
        /* ignore badge errors */
      }
    }
    void loadUnread();
    const id = window.setInterval(() => void loadUnread(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [synagogueId, tab]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (key === 's') {
        e.preventDefault();
        void onSave('פרסום למסך (Ctrl+S)');
        return;
      }
      if (typing) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoEdit();
        return;
      }
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redoEdit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (tab === 'history') setHistory(loadHistory(synagogueId));
  }, [tab, synagogueId]);

  useEffect(() => {
    if (searchParams.get('billing') !== '1') return;
    if (!canEditSettings(session?.role ?? 'editor')) return;
    setTab('settings');
    const t = window.setTimeout(() => {
      document.getElementById('billing-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [searchParams, session?.role]);

  useSessionKeepAlive(
    touchSession,
    () => {
      clearSession();
      setSession(null);
      navigate(`/login/${synagogueId}`);
    },
    Boolean(session && session.synagogueId === synagogueId),
  );

  const canvasCityId = config?.cityId;
  const canvasEnabledZmanim = config?.enabledZmanim;

  useEffect(() => {
    if (tab !== 'canvas' || !canvasCityId) return;
    let cancelled = false;
    const now = new Date();
    void fetchHebcalZmanim(canvasCityId, now).then(async (result) => {
      const shabbatDate = getShabbatZmanimDate(now, result.times);
      const shabbatResult = await fetchHebcalZmanim(canvasCityId, shabbatDate);
      if (cancelled) return;
      setPreviewZmanimMap(result.times);
      setPreviewShabbatZmanimMap(shabbatResult.times);
      setPreviewZmanim(pickEnabledZmanim(result, (canvasEnabledZmanim ?? []) as ZmanKey[]));
    });
    return () => {
      cancelled = true;
    };
  }, [tab, canvasCityId, canvasEnabledZmanim]);

  useEffect(() => {
    if (tab !== 'canvas' || !config) return;
    if (!session || !canEditSettings(session.role)) return;
    if (config.layout === 'canvas') return;
    setConfig((c) => (c && c.layout !== 'canvas' ? { ...c, layout: 'canvas' } : c));
    setStatus(
      'מבנה המסך הוגדר לבונה חופשי — לחצו «פרסם למסך» כדי לעדכן את הטלוויזיה',
    );
  }, [tab, session?.role, config?.layout]);

  if (!session || session.synagogueId !== synagogueId || !canEditContent(session.role)) {
    return <Navigate to={`/login/${synagogueId}`} replace />;
  }

  if (!config) {
    return (
      <div className="admin loading" dir="rtl">
        טוען...
      </div>
    );
  }

  const isOwner = canEditSettings(session.role);
  const memberName = session.memberName;
  const memberRole = session.role;

  const activePreviewAnnouncement =
    config.announcements.find((a) => a.enabled && a.text.trim()) ?? null;

  const canvasPreviewData: CanvasData = {
    name: config.name,
    dedication: config.dedication,
    logoSrc: config.media?.logoDataUrl || config.design.logoUrl || config.branding?.logoUrl,
    clock: new Date().toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    day: getDayInfo(new Date(), config.yahrzeits),
    zmanim: previewZmanim,
    blocks: config.blocks.filter((b) => b.enabled),
    resolveTime: (item, block) =>
      resolveFromZmanimMap(
        block && isShabbatScheduleBlock(block)
          ? previewShabbatZmanimMap
          : previewZmanimMap,
        item.time,
        item.fromZman,
        item.offsetMinutes ?? 0,
      ),
    announcement: activePreviewAnnouncement,
    announcementCount: config.announcements.filter((a) => a.enabled && a.text.trim()).length,
    announcementIndex: 0,
    weatherTemp: config.showWeather ? 24 : null,
    countdownLabel: 'הדלקת נרות בעוד 02:14:00',
  };

  function update(patch: Partial<SynagogueConfig>) {
    setConfig((c) => (c ? { ...c, ...patch } : c));
  }

  function updateDesign(patch: Partial<DesignSettings>) {
    setConfig((c) =>
      c
        ? {
            ...c,
            design: {
              ...c.design,
              ...patch,
              presetId: 'presetId' in patch && patch.presetId ? patch.presetId : 'custom',
            },
          }
        : c,
    );
  }

  function updateBlock(blockId: string, patch: Partial<ScheduleBlock>) {
    setConfig((c) => {
      if (!c) return c;
      return {
        ...c,
        blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
      };
    });
  }

  function updateItem(blockId: string, itemId: string, patch: Partial<ScheduleItem>) {
    setConfig((c) => {
      if (!c) return c;
      return {
        ...c,
        blocks: c.blocks.map((b) =>
          b.id !== blockId
            ? b
            : {
                ...b,
                items: b.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
              },
        ),
      };
    });
  }

  function addItem(blockId: string, noTime = false) {
    setConfig((c) => {
      if (!c) return c;
      const newItem: ScheduleItem = noTime
        ? { id: uid(), title: 'כותרת / הערה', time: '', noTime: true }
        : { id: uid(), title: 'פריט חדש', time: '18:00' };
      return {
        ...c,
        blocks: c.blocks.map((b) =>
          b.id !== blockId ? b : { ...b, items: [...b.items, newItem] },
        ),
      };
    });
  }

  function duplicateItem(blockId: string, itemId: string) {
    setConfig((c) => {
      if (!c) return c;
      return {
        ...c,
        blocks: c.blocks.map((b) => {
          if (b.id !== blockId) return b;
          const idx = b.items.findIndex((it) => it.id === itemId);
          if (idx < 0) return b;
          const src = b.items[idx]!;
          const copy: ScheduleItem = { ...src, id: uid(), title: `${src.title} (העתק)` };
          const items = [...b.items];
          items.splice(idx + 1, 0, copy);
          return { ...b, items };
        }),
      };
    });
  }

  function removeItem(blockId: string, itemId: string) {
    setConfig((c) => {
      if (!c) return c;
      return {
        ...c,
        blocks: c.blocks.map((b) =>
          b.id !== blockId ? b : { ...b, items: b.items.filter((it) => it.id !== itemId) },
        ),
      };
    });
  }

  function reorderItem(blockId: string, from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setConfig((c) => {
      if (!c) return c;
      return {
        ...c,
        blocks: c.blocks.map((b) => {
          if (b.id !== blockId) return b;
          if (from >= b.items.length || to >= b.items.length) return b;
          const list = [...b.items];
          const [moved] = list.splice(from, 1);
          if (!moved) return b;
          list.splice(to, 0, moved);
          return { ...b, items: list };
        }),
      };
    });
  }

  function moveItem(blockId: string, index: number, dir: -1 | 1) {
    reorderItem(blockId, index, index + dir);
  }

  function addBlock() {
    setConfig((c) => {
      if (!c) return c;
      return {
        ...c,
        blocks: [...c.blocks, { id: uid(), title: 'בלוק חדש', enabled: true, items: [] }],
      };
    });
  }

  function toggleZman(key: ZmanKey) {
    setConfig((c) => {
      if (!c) return c;
      const has = c.enabledZmanim.includes(key);
      return {
        ...c,
        enabledZmanim: has
          ? c.enabledZmanim.filter((k) => k !== key)
          : [...c.enabledZmanim, key],
      };
    });
  }

  function updateAnnouncement(id: string, patch: Partial<Announcement>) {
    setConfig((c) => {
      if (!c) return c;
      return {
        ...c,
        announcements: c.announcements.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      };
    });
  }

  async function addMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isOwner || !config) {
      setStatus('אין הרשאה להוספת משתמשים');
      return;
    }
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('memberName') ?? newMember.name).trim();
    const username = String(data.get('memberUsername') ?? newMember.username)
      .trim()
      .toLowerCase();
    const password = String(data.get('memberPassword') ?? '');
    const role = (String(data.get('memberRole') ?? newMember.role) || 'editor') as UserRole;
    if (!name || !username || !password) {
      setStatus('יש למלא שם לתצוגה, שם משתמש וסיסמה');
      return;
    }
    if (password.trim().length < 4) {
      setStatus('סיסמה קצרה מדי (לפחות 4 תווים)');
      return;
    }
    const members = config.members ?? [];
    if (members.some((m) => (m.username || m.name).toLowerCase() === username)) {
      setStatus('שם המשתמש כבר קיים');
      return;
    }
    try {
      const passwordHash = await hashPassword(password.trim());
      const member: Member = {
        id: uid(),
        name,
        username,
        role: role === 'owner' ? 'owner' : 'editor',
        passwordHash,
      };
      const nextMembers = [...(config.members ?? []), member];
      const nextConfig = { ...config, members: nextMembers };
      setConfig(nextConfig);
      setNewMember({ name: '', username: '', password: '', role: 'editor' });
      form.reset();
      setStatus(`שומר את «${username}» בענן…`);
      const result = await saveConfig(nextConfig, undefined, {
        by: memberName,
        summary: `הוספת משתמש ${username}`,
      });
      if (!result.ok) {
        setStatus(result.error ?? 'המשתמש נוסף מקומית אך השמירה לענן נכשלה — לחץ שמור');
      } else {
        setStatus(`המשתמש «${username}» נשמר — אפשר להתחבר ב־/#/login/...`);
      }
      refreshHistory();
    } catch (err) {
      setStatus(`הוספת משתמש נכשלה: ${String((err as Error)?.message || err)}`);
    }
  }

  async function resetMemberPassword(memberId: string) {
    if (!isOwner || !config) return;
    const member = config.members.find((m) => m.id === memberId);
    if (!member) return;
    setPasswordReset({
      memberId,
      label: member.username || member.name,
      pass: '',
      pass2: '',
    });
  }

  async function confirmPasswordReset(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !config || !passwordReset) return;
    if (passwordReset.pass.trim().length < 4) {
      setStatus('סיסמה קצרה מדי (לפחות 4 תווים)');
      return;
    }
    if (passwordReset.pass !== passwordReset.pass2) {
      setStatus('הסיסמאות אינן תואמות');
      return;
    }
    const passwordHash = await hashPassword(passwordReset.pass.trim());
    const nextConfig = {
      ...config,
      members: config.members.map((m) =>
        m.id === passwordReset.memberId ? { ...m, passwordHash } : m,
      ),
    };
    setConfig(nextConfig);
    setPasswordReset(null);
    setStatus(`שומר סיסמה חדשה ל־${passwordReset.label}…`);
    const result = await saveConfig(nextConfig, undefined, {
      by: memberName,
      summary: `איפוס סיסמה ל־${passwordReset.label}`,
    });
    if (result.ok) setDirty(false);
    setStatus(
      result.ok
        ? `סיסמה עודכנה ל־${passwordReset.label}`
        : result.error ?? 'הסיסמה עודכנה מקומית — לחץ שמור',
    );
    refreshHistory();
  }

  function startEditMember(member: Member) {
    setEditMemberId(member.id);
    setEditMember({
      name: member.name,
      username: member.username || member.name,
      role: member.role,
    });
  }

  function saveEditMember(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !config || !editMemberId) return;
    const name = editMember.name.trim();
    const username = editMember.username.trim().toLowerCase();
    if (!name || !username) {
      setStatus('יש למלא שם ושם משתמש');
      return;
    }
    const taken = config.members.some(
      (m) => m.id !== editMemberId && (m.username || m.name).toLowerCase() === username,
    );
    if (taken) {
      setStatus('שם המשתמש כבר קיים');
      return;
    }
    const owners = config.members.filter((m) => m.role === 'owner');
    const current = config.members.find((m) => m.id === editMemberId);
    if (
      current?.role === 'owner' &&
      editMember.role !== 'owner' &&
      owners.length <= 1
    ) {
      setStatus('חייב להישאר לפחות מנהל אחד');
      return;
    }
    setConfig((c) =>
      c
        ? {
            ...c,
            members: c.members.map((m) =>
              m.id === editMemberId ? { ...m, name, username, role: editMember.role } : m,
            ),
          }
        : c,
    );
    setEditMemberId(null);
    setStatus(`המשתמש עודכן — לחץ שמור`);
  }

  function removeMember(member: Member) {
    if (!isOwner || !config) return;
    if (member.id === session?.memberId) {
      setStatus('אי אפשר למחוק את המשתמש שאיתו התחברת');
      return;
    }
    const owners = config.members.filter((m) => m.role === 'owner');
    if (member.role === 'owner' && owners.length <= 1) {
      setStatus('חייב להישאר לפחות מנהל אחד');
      return;
    }
    if (!confirm(`למחוק את «${member.username || member.name}»?`)) return;
    if (editMemberId === member.id) setEditMemberId(null);
    update({ members: config.members.filter((x) => x.id !== member.id) });
    setStatus(`המשתמש נמחק — לחץ שמור`);
  }

  function updateModes(patch: Partial<ModeSettings>) {
    setConfig((c) => (c ? { ...c, modes: { ...c.modes, ...patch } } : c));
  }

  function updateCanvas(canvas: CanvasLayoutConfig) {
    setConfig((c) => (c ? { ...c, canvas } : c));
  }

  function updateGallery(gallery: GalleryItem[]) {
    setConfig((c) => (c ? { ...c, media: { ...c.media, gallery } } : c));
  }

  function setMediaUrl(
    key: 'logoDataUrl' | 'backgroundDataUrl' | 'eventImageUrl' | 'loopVideoUrl',
    url: string,
    kind: 'image' | 'video' = 'image',
  ) {
    setConfig((c) => {
      if (!c) return c;
      const gallery = url ? upsertGallery(c.media.gallery ?? [], url, kind) : c.media.gallery;
      return { ...c, media: { ...c.media, [key]: url, gallery } };
    });
  }

  function refreshHistory() {
    setHistory(loadHistory(synagogueId));
  }

  async function onSave(summary = 'שמירת הגדרות') {
    if (!config) return;
    setSaving(true);
    let toSave = config;
    // Bootstrap owner if members empty after first owner login
    if (!toSave.members.length && memberRole === 'owner') {
      const passwordHash = await hashPassword('admin123');
      toSave = {
        ...toSave,
        members: [
          {
            id: uid(),
            name: memberName || 'מנהל',
            username: 'admin',
            role: 'owner',
            passwordHash,
          },
        ],
      };
      setConfig(toSave);
    }
    const result = await saveConfig(toSave, undefined, { by: memberName, summary });
    setSaving(false);
    refreshHistory();
    setPreviewKey((k) => k + 1);
    if (!result.ok) {
      setStatus(result.error ?? 'השמירה נכשלה — אחסון מלא או שגיאת מדיה');
    } else if (!result.online) {
      setDirty(false);
      setStatus('נשמר מקומית — יסונכרן אוטומטית כשיהיה אינטרנט');
      setToast('נשמר במכשיר — יפורסם כשיהיה אינטרנט');
    } else if (result.pending) {
      setDirty(false);
      setStatus(
        result.error
          ? `שמירה מקומית — סנכרון נכשל: ${result.error}`
          : 'שמירה מקומית — המתנה לסנכרון ענן',
      );
      setToast('נשמר — ממתין לסנכרון');
    } else {
      setDirty(false);
      setStatus('נשמר ופורסם למסך ✓');
      setToast('פורסם למסך בהצלחה');
    }
  }

  async function setKioskExitPin(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !kioskPin.trim()) return;
    const pinHash = await hashPin(kioskPin);
    update({ kioskExitPinHash: pinHash });
    setKioskPin('');
    setStatus('PIN יציאת קיוסק עודכן — לחץ שמור');
  }

  async function restoreHistory(entryId: string) {
    const entry = getHistoryEntry(synagogueId, entryId);
    if (!entry || !isOwner) return;
    if (!confirm(`לשחזר גרסה ${entry.revision} מ־${new Date(entry.at).toLocaleString('he-IL')}?`)) {
      return;
    }
    const expanded = await expandConfigMedia(entry.config);
    setConfig(expanded);
    setStatus('שוחזר טיוטה — לחץ שמור כדי להחיל על המסך');
    setTab('settings');
  }

  function logout() {
    if (dirty && !confirm('יש שינויים שלא נשמרו. לצאת בכל זאת?')) return;
    clearSession();
    navigate(`/login/${synagogueId}`);
  }

  const licenseOk = isLicenseValid(config.license);
  const licenseExpiry = config.license?.expiresAt
    ? new Date(config.license.expiresAt).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const licenseDays = daysLeft(config.license);
  const licenseBanner = licenseOk ? (
    licenseExpiry ? (
      `מערכת ברישיון עד ${licenseExpiry}${
        licenseDays != null && licenseDays <= 30 ? ` · נותרו ${licenseDays} ימים` : ''
      }`
    ) : (
      'מערכת ברישיון פעיל'
    )
  ) : (
    <>
      אין רישיון פעיל למסך זה — פנה לספק המערכת ·{' '}
      <button
        type="button"
        className="license-pay-link"
        onClick={() => {
          setTab('settings');
          queueMicrotask(() =>
            document.getElementById('billing-card')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            }),
          );
        }}
      >
        עדכן כרטיס אשראי — לחץ כאן
      </button>
    </>
  );

  return (
    <div className={`admin${tab === 'canvas' ? ' canvas-mode' : ''}`} dir="rtl" lang="he">
      <header className="admin-header sticky-bar">
        <div className="admin-title">
          <p className="eyebrow">
            ניהול מסך · {memberName} ({memberRole === 'owner' ? 'מנהל' : 'עורך'})
          </p>
          <h1>{config.name}</h1>
          <div className="admin-meta">
            <span className={`license-banner ${licenseOk ? 'ok' : 'warn'}`}>
              {licenseBanner}
            </span>
            {session.viaPlatform ? (
              <span className="license-banner ok">
                נכנסת כמנהל מערכת ·{' '}
                <Link to="/agency">חזרה לפאנל העל</Link>
              </span>
            ) : null}
            {status ? <span className="status">{status}</span> : null}
          </div>
        </div>
        <div className="admin-actions">
          {inquiryUnreadMessages > 0 ? (
            <button
              className="btn inquiry-mail-btn has-unread"
              type="button"
              onClick={() => setTab('support')}
              title={`${inquiryUnreadMessages} הודעות חדשות מפניות`}
              aria-label={`${inquiryUnreadMessages} הודעות חדשות בפניות`}
            >
              <span className="inquiry-mail-icon" aria-hidden="true">
                ✉
              </span>
              <span className="inquiry-mail-badge">{inquiryUnreadMessages > 99 ? '99+' : inquiryUnreadMessages}</span>
            </button>
          ) : null}
          <button
            className="btn ghost"
            type="button"
            onClick={undoEdit}
            disabled={!undo.canUndo}
            title="בטל (Ctrl+Z)"
            aria-label="בטל שינוי אחרון"
          >
            חזור
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={redoEdit}
            disabled={!undo.canRedo}
            title="קדימה (Ctrl+Y)"
            aria-label="שחזר שינוי"
          >
            קדימה
          </button>
          <button className="btn ghost" type="button" onClick={logout}>
            יציאה
          </button>
          <button
            className={`btn primary ${dirty ? 'dirty' : ''}`}
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? 'שומר...' : dirty ? 'פרסם למסך · יש שינויים' : 'פרסם למסך'}
          </button>
        </div>
      </header>

      {toast ? (
        <div className="admin-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className={`admin-body${tab === 'canvas' ? ' is-canvas' : ''}`}>
        <nav className="admin-tabs" aria-label="ניווט ניהול">
          {TAB_GROUPS.map((group) => {
            const items = TABS.filter(
              (t) => t.group === group.id && (!t.ownerOnly || isOwner),
            );
            if (!items.length) return null;
            return (
              <div key={group.id} className="tab-group">
                <p className="tab-group-label">{group.label}</p>
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.id === 'support' && inquiryUnreadMessages > 0 ? (
                      <span className="tab-unread-badge">
                        {inquiryUnreadMessages > 99 ? '99+' : inquiryUnreadMessages}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="admin-main">
        {tab !== 'canvas' ? (
        <div className="admin-quick" role="navigation" aria-label="פעולות מהירות">
          <button type="button" className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>
            תפילות
          </button>
          <button type="button" className={tab === 'announce' ? 'on' : ''} onClick={() => setTab('announce')}>
            הודעות
          </button>
          <button type="button" className={tab === 'zmanim' ? 'on' : ''} onClick={() => setTab('zmanim')}>
            זמנים
          </button>
          <button type="button" className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>
            תצוגה מקדימה
          </button>
          <Link className="admin-quick-ext" to={`/display/${synagogueId}`} target="_blank" rel="noreferrer">
            מסך חי ↗
          </Link>
          <span className="admin-quick-hint">Ctrl+S לפרסום</span>
        </div>
        ) : null}

        <div className="admin-grid">
        {tab === 'design' && isOwner ? (
          <DesignStudio
            config={config}
            synagogueId={synagogueId}
            onChange={update}
            onDesign={updateDesign}
            onGalleryChange={updateGallery}
            onStatus={setStatus}
          />
        ) : null}

        {tab === 'canvas' && isOwner ? (
          <section className="card wide canvas-builder-card">
            <div className="section-head">
              <h2>בונה מסך חופשי</h2>
              <div className="section-head-actions">
                <Link className="btn ghost" to={`/display/${synagogueId}`} target="_blank" rel="noreferrer">
                  מסך חי ↗
                </Link>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    void (async () => {
                      const name = window.prompt('שם לתבנית העיצוב:', `עיצוב ${config.name}`);
                      if (name == null) return;
                      const result = await saveDesignTemplate({
                        name: name.trim() || `עיצוב ${config.name}`,
                        description: 'נשמר מבונה המסך',
                        theme: config.theme,
                        layout: 'canvas',
                        design: config.design,
                        canvas: config.canvas,
                      });
                      if (!result.ok || !result.template) {
                        setStatus(result.error ?? 'שמירת התבנית נכשלה');
                        return;
                      }
                      setStatus(`נשמרה תבנית «${result.template.name}» — זמינה בלשונית עיצוב`);
                    })();
                  }}
                >
                  שמור כתבנית
                </button>
                {config.layout !== 'canvas' ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      update({ layout: 'canvas' });
                      setStatus('מבנה המסך הוגדר לבונה חופשי — לחץ שמור');
                    }}
                  >
                    הפעל במסך התצוגה
                  </button>
                ) : (
                  <span className="hint">פעיל במסך התצוגה ✓</span>
                )}
              </div>
            </div>
            <CanvasBuilder
              canvas={config.canvas}
              blocks={config.blocks}
              enabledZmanim={config.enabledZmanim}
              synagogueId={synagogueId}
              gallery={config.media.gallery ?? []}
              customFonts={config.media.customFonts ?? []}
              data={canvasPreviewData}
              onChange={updateCanvas}
              onGalleryChange={updateGallery}
              onStatus={setStatus}
              onInteractionEnd={undo.checkpoint}
            />
          </section>
        ) : null}

        {tab === 'settings' ? (
          <>
            {isOwner ? (
              <div id="billing-card">
                <BillingCard
                  synagogueId={synagogueId}
                  onRenewed={(license) => {
                    if (!license) {
                      setStatus('התשלום בוצע אך לא התקבל רישיון — פנה לתמיכה');
                      return;
                    }
                    void (async () => {
                      let current = loadLocal(synagogueId)?.config;
                      if (!current) {
                        try {
                          current = (await pullFromCloud(synagogueId))?.config;
                        } catch {
                          /* ignore */
                        }
                      }
                      if (!current) {
                        // Still apply license into in-memory config so the banner updates
                        setConfigRaw((prev) =>
                          prev ? { ...prev, license } : prev,
                        );
                        setStatus(
                          'התשלום עבר והרישיון עודכן בשרת — רענן את הדף אם המסך לא נפתח',
                        );
                        return;
                      }
                      const toSave = { ...current, license };
                      setConfigRaw(toSave);
                      const result = await saveConfig(toSave, undefined, {
                        by: session?.memberName ?? 'billing',
                        summary: 'חידוש רישיון לאחר תשלום חודשי',
                      });
                      if (result.ok) {
                        const refreshed = loadLocal(synagogueId)?.config ?? toSave;
                        setConfigRaw(refreshed);
                        const until = license.expiresAt
                          ? new Date(license.expiresAt).toLocaleDateString('he-IL')
                          : '';
                        setStatus(
                          until
                            ? `הרישיון חודש עד ${until} — תודה על התשלום`
                            : 'הרישיון חודש — תודה על התשלום',
                        );
                      } else {
                        setStatus(
                          result.error ?? 'התשלום עבר אך שמירת הרישיון נכשלה — לחץ שמור',
                        );
                      }
                    })();
                  }}
                />
              </div>
            ) : null}
            <section className="card">
              <h2>פרטי בית הכנסת</h2>
              <label>
                שם
                <input
                  value={config.name}
                  onChange={(e) => update({ name: e.target.value })}
                  disabled={!isOwner}
                />
              </label>
              <label>
                עיר
                <select
                  value={config.cityId}
                  onChange={(e) => update({ cityId: e.target.value })}
                  disabled={!isOwner}
                >
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                הקדשה / לע״נ
                <input
                  value={config.dedication ?? ''}
                  onChange={(e) => update({ dedication: e.target.value })}
                />
              </label>
            </section>
            <section className="card">
              <h2>מה מוצג במסך</h2>
              {(
                [
                  ['showClock', 'שעון חי'],
                  ['showHebrewDate', 'תאריך עברי'],
                  ['showParasha', 'פרשת השבוע'],
                  ['showDafYomi', 'הדף היומי'],
                  ['showWeather', 'מזג אוויר'],
                  ['showOrefAlerts', 'התראות פיקוד העורף'],
                  ['showYahrzeit', 'יארצייט היום'],
                  ['showCalendarExtras', 'חגים וימי זיכרון'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(config[key])}
                    onChange={(e) => update({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              {config.showOrefAlerts ? (
                <label>
                  אזורי התראה נוספים (מופרדים בפסיק)
                  <input
                    value={config.orefAreaExtra ?? ''}
                    onChange={(e) => update({ orefAreaExtra: e.target.value })}
                    placeholder="לדוגמה: פתח תקווה - מערב"
                  />
                </label>
              ) : null}
            </section>

            {isOwner ? (
              <>
                <section className="card emergency-card">
                  <h2>שידור חירום</h2>
                  <p className="hint">מסך מלא אדום במסך התצוגה עד כיבוי</p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={config.emergency.active}
                      onChange={(e) =>
                        update({
                          emergency: {
                            ...config.emergency,
                            active: e.target.checked,
                            updatedAt: new Date().toISOString(),
                          },
                        })
                      }
                    />
                    הפעל הודעת חירום
                  </label>
                  <label>
                    הודעה
                    <textarea
                      rows={3}
                      value={config.emergency.message}
                      onChange={(e) =>
                        update({
                          emergency: {
                            ...config.emergency,
                            message: e.target.value,
                            updatedAt: new Date().toISOString(),
                          },
                        })
                      }
                      placeholder="לדוגמה: תפילת מנחה מוקדמת היום"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() =>
                      void onSave(config.emergency.active ? 'הפעלת חירום' : 'כיבוי חירום')
                    }
                  >
                    שמור חירום עכשיו
                  </button>
                </section>

                <section className="card">
                  <h2>יציאת קיוסק</h2>
                  <p className="hint">
                    PIN ליציאה מ־Electron / מסך מלא (Ctrl+Shift+Q).{' '}
                    {config.kioskExitPinHash ? 'מוגדר ✓' : 'לא הוגדר'}
                  </p>
                  <form className="inline-form" onSubmit={setKioskExitPin}>
                    <input
                      type="password"
                      value={kioskPin}
                      onChange={(e) => setKioskPin(e.target.value)}
                      placeholder="PIN חדש"
                    />
                    <button type="submit" className="btn ghost">
                      עדכן
                    </button>
                  </form>
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'modes' ? (
          <>
            <section className="card">
              <h2>שבת וחג</h2>
              <p className="hint">הגדרות אוטומטיות לסוף השבוע וחגים</p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.autoShabbat}
                  onChange={(e) => updateModes({ autoShabbat: e.target.checked })}
                />
                מצב אוטומטי לשבת / ערב שבת
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.autoHoliday}
                  onChange={(e) => updateModes({ autoHoliday: e.target.checked })}
                />
                מצב אוטומטי לחגים
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.showCandleCountdown}
                  onChange={(e) => updateModes({ showCandleCountdown: e.target.checked })}
                />
                ספירה לאחור להדלקת נרות
              </label>
              <label>
                דקות לפני שקיעה להדלקה
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={config.modes.candleOffsetMin}
                  onChange={(e) => updateModes({ candleOffsetMin: Number(e.target.value) || 18 })}
                />
              </label>
            </section>
            <section className="card">
              <h2>קרוסלת הודעות</h2>
              <label>
                שניות בין הודעות
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={config.modes.carouselSeconds}
                  onChange={(e) =>
                    updateModes({ carouselSeconds: Math.max(3, Number(e.target.value) || 8) })
                  }
                />
              </label>
            </section>
            <section className="card">
              <h2>התראות oref</h2>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.orefSound}
                  onChange={(e) => updateModes({ orefSound: e.target.checked })}
                />
                צליל בהתראה
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.muteOrefOnShabbat}
                  onChange={(e) => updateModes({ muteOrefOnShabbat: e.target.checked })}
                />
                השתק צליל בשבת
              </label>
            </section>
            <section className="card wide">
              <h2>אירוע מיוחד / אבל</h2>
              <p className="hint">מחליף זמנית את תצוגת המסך הרגילה</p>
              <label>
                תצוגה
                <select
                  value={config.modes.specialMode}
                  onChange={(e) =>
                    updateModes({ specialMode: e.target.value as SpecialDisplayMode })
                  }
                >
                  <option value="normal">רגיל</option>
                  <option value="event">אירוע / חתונה</option>
                  <option value="mourning">אבל / לע״נ</option>
                </select>
              </label>
              {config.modes.specialMode === 'event' ? (
                <>
                  <label>
                    כותרת אירוע
                    <input
                      value={config.modes.eventTitle ?? ''}
                      onChange={(e) => updateModes({ eventTitle: e.target.value })}
                    />
                  </label>
                  <label>
                    תת־כותרת
                    <input
                      value={config.modes.eventSubtitle ?? ''}
                      onChange={(e) => updateModes({ eventSubtitle: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
              {config.modes.specialMode === 'mourning' ? (
                <label>
                  שם לע״נ
                  <input
                    value={config.modes.mourningName ?? ''}
                    onChange={(e) => updateModes({ mourningName: e.target.value })}
                  />
                </label>
              ) : null}
            </section>
          </>
        ) : null}

        {tab === 'nusach' && isOwner ? (
          <section className="card wide">
            <h2>תבניות נוסח</h2>
            <p className="hint">מחליף זמנים ובלוקי תפילה לפי נוסח הקהילה</p>
            <div className="preset-grid">
              {NUSACH_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`preset-card ${config.nusach === t.id ? 'active' : ''}`}
                  onClick={() => {
                    setConfig((c) => (c ? applyNusachTemplate(c, t.id) : c));
                    setStatus(`נוסח ${t.name} הוחל — לחץ שמור`);
                  }}
                >
                  <strong>{t.name}</strong>
                  <em>{t.description}</em>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'yahrzeit' ? (
          <section className="card wide">
            <div className="section-head">
              <h2>יארצייט</h2>
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  update({
                    yahrzeits: [
                      ...config.yahrzeits,
                      {
                        id: uid(),
                        name: '',
                        hebrewMonth: 1,
                        hebrewDay: 1,
                        enabled: true,
                      },
                    ],
                  })
                }
              >
                + יארצייט
              </button>
            </div>
            <p className="hint">מוצג במסך ביום העברי המתאים</p>
            {config.yahrzeits.map((y) => (
              <div className="announce-row" key={y.id}>
                <input
                  value={y.name}
                  onChange={(e) =>
                    update({
                      yahrzeits: config.yahrzeits.map((x) =>
                        x.id === y.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="שם"
                />
                <select
                  value={y.hebrewMonth}
                  onChange={(e) =>
                    update({
                      yahrzeits: config.yahrzeits.map((x) =>
                        x.id === y.id ? { ...x, hebrewMonth: Number(e.target.value) } : x,
                      ),
                    })
                  }
                >
                  {HEBREW_MONTHS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={y.hebrewDay}
                  onChange={(e) =>
                    update({
                      yahrzeits: config.yahrzeits.map((x) =>
                        x.id === y.id ? { ...x, hebrewDay: Number(e.target.value) || 1 } : x,
                      ),
                    })
                  }
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={y.enabled}
                    onChange={(e) =>
                      update({
                        yahrzeits: config.yahrzeits.map((x) =>
                          x.id === y.id ? { ...x, enabled: e.target.checked } : x,
                        ),
                      })
                    }
                  />
                  פעיל
                </label>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() =>
                    update({ yahrzeits: config.yahrzeits.filter((x) => x.id !== y.id) })
                  }
                >
                  מחק
                </button>
              </div>
            ))}
          </section>
        ) : null}

        {tab === 'media' && isOwner ? (
          <section className="card wide">
            <div className="section-head">
              <h2>מדיה וגלריה</h2>
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  update({
                    media: {
                      logoDataUrl: '',
                      backgroundDataUrl: '',
                      eventImageUrl: '',
                      loopVideoUrl: '',
                      gallery: config.media.gallery ?? [],
                    },
                  })
                }
              >
                נקה שיוכים
              </button>
            </div>

            <div className="media-slots">
              <MediaPickerField
                label="לוגו"
                value={config.media.logoDataUrl}
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                kind="image"
                onChange={(url) => setMediaUrl('logoDataUrl', url, 'image')}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
              <MediaPickerField
                label="רקע מסך"
                value={config.media.backgroundDataUrl}
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                kind="image"
                onChange={(url) => setMediaUrl('backgroundDataUrl', url, 'image')}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
              <MediaPickerField
                label="תמונת אירוע"
                value={config.media.eventImageUrl}
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                kind="image"
                onChange={(url) => setMediaUrl('eventImageUrl', url, 'image')}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
              <MediaPickerField
                label="סרטון קצר (מצב אירוע)"
                value={config.media.loopVideoUrl}
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                kind="video"
                onChange={(url) => setMediaUrl('loopVideoUrl', url, 'video')}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
            </div>

            <div className="media-gallery-block">
              <GalleryManager
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
            </div>
          </section>
        ) : null}

        {tab === 'live' ? (
          <section className="card wide live-preview-card">
            <div className="section-head">
              <h2>תצוגה מקדימה חיה</h2>
              <div className="row-actions">
                <button type="button" className="btn ghost" onClick={() => setPreviewKey((k) => k + 1)}>
                  רענן
                </button>
                <Link className="btn ghost" to={`/display/${synagogueId}`} target="_blank">
                  פתח בחלון
                </Link>
              </div>
            </div>
            <p className="hint">המסך מתעדכן אחרי שמירה — שמור כדי לראות שינויים</p>
            <div className="preview-frame-wrap">
              <iframe
                key={previewKey}
                title="תצוגה מקדימה"
                className="preview-frame"
                src={previewSrc}
              />
            </div>
          </section>
        ) : null}

        {tab === 'history' && isOwner ? (
          <section className="card wide">
            <h2>היסטוריית שינויים</h2>
            <p className="hint">עד 40 גרסאות אחרונות — שחזור טוען טיוטה; יש לשמור כדי להחיל</p>
            {history.length === 0 ? (
              <p className="hint">אין היסטוריה עדיין</p>
            ) : (
              <ul className="history-list">
                {history.map((h) => (
                  <li key={h.id}>
                    <div>
                      <strong>גרסה {h.revision}</strong>
                      <span>
                        {new Date(h.at).toLocaleString('he-IL')} · {h.by}
                      </span>
                      <em>{h.summary}</em>
                    </div>
                    <button type="button" className="btn ghost" onClick={() => void restoreHistory(h.id)}>
                      שחזר
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'zmanim' ? (
          <section className="card wide">
            <h2>זמני היום</h2>
            <div className="chips">
              {ZMAN_DEFS.map((z) => (
                <label
                  key={z.key}
                  className={`chip ${config.enabledZmanim.includes(z.key) ? 'on' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={config.enabledZmanim.includes(z.key)}
                    onChange={() => toggleZman(z.key)}
                  />
                  {z.label}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'content' ? (
          <section className="card wide">
            <div className="section-head">
              <h2>תפילות וזמנים במסך</h2>
              <button type="button" className="btn ghost" onClick={addBlock}>
                + בלוק
              </button>
            </div>
            <div className="admin-today">
              <span>
                {config.blocks.filter((b) => b.enabled).length} בלוקים פעילים ·{' '}
                {config.blocks.reduce((n, b) => n + b.items.length, 0)} פריטים
              </span>
              <span>
                {config.announcements.filter((a) => a.enabled && a.text.trim()).length} הודעות
                פעילות
              </span>
              {dirty ? <strong className="warn">שינויים ממתינים לפרסום</strong> : <em>מעודכן</em>}
            </div>
            <p className="hint">
              הזן כותרת ושעה. «עוד» לפתיחת הערה / זמן הלכתי. Ctrl+S מפרסם למסך.
            </p>
            {config.blocks.length === 0 ? (
              <div className="admin-empty">
                <p>עדיין אין בלוקי תפילה</p>
                <button type="button" className="btn primary" onClick={addBlock}>
                  צור בלוק ראשון (למשל שחרית)
                </button>
              </div>
            ) : null}
            {config.blocks.map((block) => {
              const collapsed = Boolean(collapsedBlocks[block.id]);
              return (
              <div className={`block ${collapsed ? 'is-collapsed' : ''}`} key={block.id}>
                <div className="block-head">
                  <button
                    type="button"
                    className="btn ghost block-collapse"
                    aria-expanded={!collapsed}
                    onClick={() =>
                      setCollapsedBlocks((m) => ({ ...m, [block.id]: !collapsed }))
                    }
                  >
                    {collapsed ? '▸' : '▾'}
                  </button>
                  <input
                    className="block-title"
                    value={block.title}
                    onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                    placeholder="שם הבלוק (למשל שחרית)"
                  />
                  <span className="block-count">{block.items.length}</span>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={block.enabled}
                      onChange={(e) => updateBlock(block.id, { enabled: e.target.checked })}
                    />
                    פעיל
                  </label>
                </div>
                {collapsed ? null : (
                <>
                {block.items.map((item, index) => {
                  const open = expandedItemId === item.id;
                  return (
                    <div
                      className={`item-row compact ${item.noTime ? 'no-time' : ''} ${
                        itemDrag?.blockId === block.id && itemDrag.index === index
                          ? 'dragging'
                          : ''
                      } ${open ? 'is-open' : ''}`}
                      key={item.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (!itemDrag || itemDrag.blockId !== block.id) return;
                        reorderItem(block.id, itemDrag.index, index);
                        setItemDrag(null);
                      }}
                    >
                      <span
                        className="item-drag-handle"
                        title="גרור לשינוי סדר"
                        aria-label="גרור לשינוי סדר"
                        draggable
                        onDragStart={() => setItemDrag({ blockId: block.id, index })}
                        onDragEnd={() => setItemDrag(null)}
                      >
                        ⋮⋮
                      </span>
                      <input
                        value={item.title}
                        onChange={(e) =>
                          updateItem(block.id, item.id, { title: e.target.value })
                        }
                        placeholder={item.noTime ? 'כותרת / הערה' : 'כותרת'}
                      />
                      {item.noTime ? (
                        <span className="item-hint">בלי שעה</span>
                      ) : item.fromZman ? (
                        <span className="item-hint" dir="ltr">
                          {ZMAN_DEFS.find((z) => z.key === item.fromZman)?.label ?? item.fromZman}
                          {(item.offsetMinutes ?? 0) !== 0
                            ? ` ${item.offsetMinutes! > 0 ? '+' : ''}${item.offsetMinutes}`
                            : ''}
                        </span>
                      ) : (
                        <input
                          type="time"
                          value={item.time}
                          onChange={(e) =>
                            updateItem(block.id, item.id, { time: e.target.value })
                          }
                        />
                      )}
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setExpandedItemId(open ? null : item.id)}
                      >
                        {open ? 'סגור' : 'עוד'}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        title="שכפל פריט"
                        onClick={() => duplicateItem(block.id, item.id)}
                      >
                        שכפל
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => removeItem(block.id, item.id)}
                      >
                        מחק
                      </button>
                      {open ? (
                        <div className="item-more">
                          <div className="item-order-actions">
                            <button
                              type="button"
                              className="btn ghost item-move"
                              aria-label="העבר למעלה"
                              disabled={index === 0}
                              onClick={() => moveItem(block.id, index, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn ghost item-move"
                              aria-label="העבר למטה"
                              disabled={index >= block.items.length - 1}
                              onClick={() => moveItem(block.id, index, 1)}
                            >
                              ↓
                            </button>
                          </div>
                          <input
                            value={item.note ?? ''}
                            onChange={(e) =>
                              updateItem(block.id, item.id, { note: e.target.value })
                            }
                            placeholder="הערה (אופציונלי)"
                          />
                          {!item.noTime ? (
                            <>
                              <select
                                value={item.fromZman ?? ''}
                                onChange={(e) =>
                                  updateItem(block.id, item.id, {
                                    fromZman: (e.target.value || undefined) as
                                      | ZmanKey
                                      | undefined,
                                  })
                                }
                              >
                                <option value="">שעה קבועה</option>
                                {ZMAN_DEFS.map((z) => (
                                  <option key={z.key} value={z.key}>
                                    לפי {z.label}
                                  </option>
                                ))}
                              </select>
                              {item.fromZman ? (
                                <input
                                  type="number"
                                  value={item.offsetMinutes ?? 0}
                                  onChange={(e) =>
                                    updateItem(block.id, item.id, {
                                      offsetMinutes: Number(e.target.value),
                                    })
                                  }
                                  placeholder="היסט בדקות"
                                />
                              ) : null}
                            </>
                          ) : null}
                          <label className="check item-notime-toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(item.noTime)}
                              onChange={(e) =>
                                updateItem(block.id, item.id, { noTime: e.target.checked })
                              }
                            />
                            שורה בלי שעה
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div className="row-actions">
                  <button type="button" className="btn ghost" onClick={() => addItem(block.id)}>
                    + פריט
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => addItem(block.id, true)}
                  >
                    + שורה בלי שעה
                  </button>
                </div>
                </>
                )}
              </div>
            );
            })}
          </section>
        ) : null}

        {tab === 'announce' ? (
          <section className="card wide">
            <div className="section-head">
              <h2>הודעות למסך</h2>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  update({
                    announcements: [
                      ...config.announcements,
                      {
                        id: uid(),
                        text: '',
                        enabled: true,
                        startDate: new Date().toISOString().slice(0, 10),
                      },
                    ],
                  })
                }
              >
                + הודעה חדשה
              </button>
            </div>
            <p className="hint">ההודעה תופיע במסך רק בין התאריכים שתגדיר (אופציונלי).</p>
            {config.announcements.length === 0 ? (
              <div className="admin-empty">
                <p>אין הודעות עדיין</p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() =>
                    update({
                      announcements: [
                        {
                          id: uid(),
                          text: '',
                          enabled: true,
                          startDate: new Date().toISOString().slice(0, 10),
                        },
                      ],
                    })
                  }
                >
                  כתוב הודעה ראשונה
                </button>
              </div>
            ) : (
              config.announcements.map((a) => (
                <div className="announce-card" key={a.id}>
                  <label className="announce-text">
                    טקסט ההודעה
                    <textarea
                      value={a.text}
                      rows={2}
                      onChange={(e) => updateAnnouncement(a.id, { text: e.target.value })}
                      placeholder="לדוגמה: שיעור אחרי ערבית · מניין נוסף בשבת"
                    />
                  </label>
                  <div className="announce-dates">
                    <label>
                      מתאריך
                      <input
                        type="date"
                        value={a.startDate ?? ''}
                        onChange={(e) =>
                          updateAnnouncement(a.id, { startDate: e.target.value || undefined })
                        }
                      />
                    </label>
                    <label>
                      עד תאריך
                      <input
                        type="date"
                        value={a.endDate ?? ''}
                        onChange={(e) =>
                          updateAnnouncement(a.id, { endDate: e.target.value || undefined })
                        }
                      />
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) => updateAnnouncement(a.id, { enabled: e.target.checked })}
                      />
                      פעיל במסך
                    </label>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() =>
                        update({
                          announcements: [
                            ...config.announcements,
                            {
                              ...a,
                              id: uid(),
                              text: a.text ? `${a.text} (העתק)` : '',
                            },
                          ],
                        })
                      }
                    >
                      שכפל
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() =>
                        update({
                          announcements: config.announcements.filter((x) => x.id !== a.id),
                        })
                      }
                    >
                      מחק
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        ) : null}

        {tab === 'support' ? (
          <InquiriesPanel
            mode="admin"
            synagogueId={synagogueId}
            synagogueName={config.name}
            defaultName={session?.memberName || ''}
            defaultEmail={config.contactEmail || ''}
            canManage={false}
          />
        ) : null}

        {tab === 'users' && isOwner ? (
          <section className="card wide">
            <h2>משתמשים והרשאות</h2>
            <p className="hint">מנהל — הכל. עורך — תוכן בלבד. התחברות עם שם המשתמש (לא שם התצוגה) והסיסמה.</p>
            <ul className="members-list">
              {config.members.map((m) =>
                editMemberId === m.id ? (
                  <li key={m.id} className="member-editing">
                    <form className="member-form" onSubmit={saveEditMember}>
                      <input
                        placeholder="שם לתצוגה"
                        value={editMember.name}
                        onChange={(e) =>
                          setEditMember({ ...editMember, name: e.target.value })
                        }
                      />
                      <input
                        placeholder="שם משתמש"
                        value={editMember.username}
                        onChange={(e) =>
                          setEditMember({ ...editMember, username: e.target.value })
                        }
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        autoComplete="off"
                      />
                      <select
                        value={editMember.role}
                        onChange={(e) =>
                          setEditMember({ ...editMember, role: e.target.value as UserRole })
                        }
                      >
                        <option value="editor">עורך</option>
                        <option value="owner">מנהל</option>
                      </select>
                      <button type="submit" className="btn primary">
                        שמור שינוי
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setEditMemberId(null)}
                      >
                        ביטול
                      </button>
                    </form>
                  </li>
                ) : (
                  <li key={m.id}>
                    <div>
                      <strong>{m.name}</strong>
                      <span>
                        {m.username || m.name} · {m.role === 'owner' ? 'מנהל' : 'עורך'}
                      </span>
                    </div>
                    <div className="member-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => startEditMember(m)}
                      >
                        ערוך
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => void resetMemberPassword(m.id)}
                      >
                        אפס סיסמה
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => removeMember(m)}
                      >
                        מחק
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
            <form className="member-form member-form-add" onSubmit={(e) => void addMember(e)}>
              <input
                name="memberName"
                placeholder="שם לתצוגה"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                required
              />
              <input
                name="memberUsername"
                placeholder="שם משתמש"
                value={newMember.username}
                onChange={(e) => setNewMember({ ...newMember, username: e.target.value })}
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="off"
                required
              />
              <input
                name="memberPassword"
                placeholder="סיסמה"
                type="password"
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="new-password"
                required
                minLength={4}
              />
              <select
                name="memberRole"
                value={newMember.role}
                onChange={(e) =>
                  setNewMember({ ...newMember, role: e.target.value as UserRole })
                }
              >
                <option value="editor">עורך</option>
                <option value="owner">מנהל</option>
              </select>
              <button type="submit" className="btn primary">
                הוסף
              </button>
            </form>
          </section>
        ) : null}
        </div>
        </div>
      </div>

      <div className={`admin-save-bar ${dirty ? 'show' : ''}`}>
        <span>{dirty ? 'יש שינויים — לחץ לפרסום למסך' : 'הכל מעודכן'}</span>
        <button
          type="button"
          className="btn primary"
          disabled={saving || !dirty}
          onClick={() => void onSave()}
        >
          {saving ? 'מפרסם…' : 'פרסם למסך'}
        </button>
      </div>

      {passwordReset ? (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onClick={() => setPasswordReset(null)}
        >
          <form
            className="admin-modal"
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void confirmPasswordReset(e)}
          >
            <h2>איפוס סיסמה</h2>
            <p className="hint">משתמש: {passwordReset.label}</p>
            <label>
              סיסמה חדשה
              <input
                type="password"
                value={passwordReset.pass}
                onChange={(e) =>
                  setPasswordReset((p) => (p ? { ...p, pass: e.target.value } : p))
                }
                required
                minLength={4}
                autoFocus
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </label>
            <label>
              אימות סיסמה
              <input
                type="password"
                value={passwordReset.pass2}
                onChange={(e) =>
                  setPasswordReset((p) => (p ? { ...p, pass2: e.target.value } : p))
                }
                required
                minLength={4}
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setPasswordReset(null)}>
                ביטול
              </button>
              <button type="submit" className="btn primary">
                עדכן סיסמה
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {tab !== 'canvas' ? <SiteFooter /> : null}
    </div>
  );
}
