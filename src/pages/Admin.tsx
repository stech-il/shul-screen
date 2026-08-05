import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BillingCard } from '../components/BillingCard';
import { DesignStudio } from '../components/DesignStudio';
import { CanvasBuilder } from '../components/canvas/CanvasBuilder';
import { InquiriesPanel } from '../components/InquiriesPanel';
import { useAppNotice } from '../components/AppNotice';
import { BrandLogo } from '../components/BrandLogo';
import { NotFoundScreen } from '../components/NotFoundScreen';
import { ScreenIdBadge } from '../components/ScreenIdBadge';
import { SiteFooter } from '../components/SiteFooter';
import type { CanvasData } from '../components/canvas/CanvasWidgetContent';
import { MediaPickerField, GalleryManager } from '../components/MediaPicker';
import { RichTextEditor } from '../components/RichTextEditor';
import { CITIES } from '../data/cities';
import { hasVisibleText, sanitizeRichHtml, toPlainDisplayText } from '../lib/sanitizeHtml';
import { NUSACH_TEMPLATES, applyNusachTemplate } from '../data/nusach';
import { ZMAN_DEFS, type ZmanKey } from '../data/zmanim';
import { useI18n, LangSwitch } from '../i18n';
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
  resolveScheduleItemAt,
  type HebcalZmanimResult,
} from '../lib/hebcalZmanim';
import { getHistoryEntry, loadHistory } from '../lib/history';
import { ensureCustomFontsLoaded } from '../lib/customFonts';
import { expandConfigMedia } from '../lib/mediaPersist';
import { getDayInfo } from '../lib/jewish';
import { HebrewDatePicker } from '../components/HebrewDatePicker';
import { daysLeft, isLicenseValid } from '../lib/license';
import { upsertGallery } from '../lib/gallery';
import { useUndoHistory } from '../lib/undoHistory';
import { isNativeCapacitorShell } from '../lib/androidKiosk';
import { MANAGE_STUDIO_TABS, loginPathFor } from '../lib/manageApp';
import {
  authenticateWithBiometric,
  isBiometricAvailable,
  loadBiometricEnabled,
  saveManageScreenId,
  setBiometricEnabled,
} from '../lib/manageAuth';
import { saveDesignTemplate } from '../lib/designTemplates';
import { fetchInquiries, markInquiriesSeen, type InquiryTopic } from '../lib/inquiries';
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
  | 'quick'
  | 'design'
  | 'canvas'
  | 'content'
  | 'announce'
  | 'yahrzeit'
  | 'media'
  | 'history'
  | 'settings'
  | 'users'
  | 'support';

type TabGroup = 'daily' | 'studio' | 'system';

const TAB_GROUP_DEFS: { id: TabGroup; labelKey: string }[] = [
  { id: 'daily', labelKey: 'admin.groupDaily' },
  { id: 'studio', labelKey: 'admin.groupStudio' },
  { id: 'system', labelKey: 'admin.groupSystem' },
];

const TAB_DEFS: { id: TabId; labelKey: string; ownerOnly?: boolean; group: TabGroup }[] = [
  { id: 'quick', labelKey: 'admin.tabQuick', group: 'daily' },
  { id: 'content', labelKey: 'admin.tabContent', group: 'daily' },
  { id: 'announce', labelKey: 'admin.tabAnnounce', group: 'daily' },
  { id: 'yahrzeit', labelKey: 'admin.tabYahrzeit', group: 'daily' },
  { id: 'design', labelKey: 'admin.tabDesign', ownerOnly: true, group: 'studio' },
  { id: 'canvas', labelKey: 'admin.tabCanvas', ownerOnly: true, group: 'studio' },
  { id: 'media', labelKey: 'admin.tabMedia', ownerOnly: true, group: 'studio' },
  { id: 'settings', labelKey: 'admin.tabSettings', group: 'system' },
  { id: 'users', labelKey: 'admin.tabUsers', ownerOnly: true, group: 'system' },
  { id: 'support', labelKey: 'admin.tabSupport', group: 'system' },
  { id: 'history', labelKey: 'admin.tabHistory', ownerOnly: true, group: 'system' },
];

/** Bottom-nav primary destinations in the phone management app */
const MANAGE_PRIMARY_TABS = new Set<TabId>(['quick', 'content', 'announce']);

interface Props {
  synagogueId: string;
  /** Mobile / app shell: times & settings only — hide design studio tabs */
  manageMode?: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function Admin({ synagogueId, manageMode = false }: Props) {
  const { t, dir, locale, dateTag } = useI18n();
  const { toast, confirm: askConfirm } = useAppNotice();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [config, setConfigRaw] = useState<SynagogueConfig | null>(null);
  const [missingShul, setMissingShul] = useState(false);
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
    email: '',
    password: '',
    role: 'editor' as UserRole,
  });
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMember, setEditMember] = useState({
    name: '',
    username: '',
    email: '',
    role: 'editor' as UserRole,
  });
  const [session, setSession] = useState(() => loadSession());
  const [tab, setTab] = useState<TabId>(() => {
    if (searchParams.get('billing') === '1' && canEditSettings(loadSession()?.role ?? 'editor')) {
      return 'settings';
    }
    try {
      const saved = localStorage.getItem(`screensmart:admin-tab:${synagogueId}`);
      if (
        saved &&
        saved !== 'modes' &&
        saved !== 'live' &&
        saved !== 'nusach' &&
        saved !== 'zmanim' &&
        TAB_DEFS.some((def) => def.id === saved) &&
        !(manageMode && MANAGE_STUDIO_TABS.has(saved as TabId)) &&
        !(saved === 'quick' && !manageMode)
      ) {
        return saved as TabId;
      }
    } catch {
      /* ignore */
    }
    return manageMode ? 'quick' : 'content';
  });
  const tabGroups = useMemo(
    () =>
      TAB_GROUP_DEFS.filter((g) => !(manageMode && g.id === 'studio')).map((g) => ({
        id: g.id,
        label: t(g.labelKey),
      })),
    [t, manageMode],
  );
  const tabs = useMemo(
    () =>
      TAB_DEFS.filter((def) => {
        if (def.id === 'quick' && !manageMode) return false;
        if (manageMode && MANAGE_STUDIO_TABS.has(def.id)) return false;
        return true;
      }).map((def) => ({
        id: def.id,
        label: t(def.labelKey),
        ownerOnly: def.ownerOnly,
        group: def.group,
      })),
    [t, manageMode],
  );
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const [manageMoreOpen, setManageMoreOpen] = useState(false);
  const [manageLocked, setManageLocked] = useState(false);
  const [manageUnlocking, setManageUnlocking] = useState(false);
  const [kioskPin, setKioskPin] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [previewZmanim, setPreviewZmanim] = useState<ComputedZman[]>([]);
  const [previewZmanimMap, setPreviewZmanimMap] = useState<HebcalZmanimResult['times']>({});
  const [previewShabbatZmanimMap, setPreviewShabbatZmanimMap] =
    useState<HebcalZmanimResult['times']>({});
  const [itemDrag, setItemDrag] = useState<{ blockId: string; index: number } | null>(null);
  const [inquiryUnreadMessages, setInquiryUnreadMessages] = useState(0);
  const [inquiryTopicPrefill, setInquiryTopicPrefill] = useState<InquiryTopic | null>(null);

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
      if (prev) queueMicrotask(() => setStatus(t('admin.statusUndone')));
      return prev ?? c;
    });
  }

  function redoEdit() {
    setConfigRaw((c) => {
      if (!c) return c;
      const next = undo.redo(c);
      if (next) queueMicrotask(() => setStatus(t('admin.statusRedone')));
      return next ?? c;
    });
  }

  useEffect(() => {
    setSession(loadSession());
    const stop = startAutoSync((n) => setStatus(t('admin.statusSynced', { n })));
    setMissingShul(false);
    void syncConfig(synagogueId, undefined, { preferCloud: true })
      .then((r) => {
        if (r.source === 'default') {
          setMissingShul(true);
          setConfigRaw(null);
          return;
        }
        setConfigRaw(r.bundle.config);
        undo.reset();
        setDirty(false);
        if (!r.online) setStatus(t('admin.statusOffline'));
        else setStatus('');
        setHistory(loadHistory(synagogueId));
      })
      .catch(() => {
        setMissingShul(true);
        setConfigRaw(null);
      });
    return stop;
  }, [synagogueId, t]);

  useEffect(() => {
    if (!manageMode && tab === 'quick') setTab('content');
  }, [manageMode, tab]);

  useEffect(() => {
    if (!manageMode || !session) return;
    void saveManageScreenId(synagogueId);
    let cancelled = false;
    void (async () => {
      try {
        if (sessionStorage.getItem('screensmart.bioAsk') === '1') return;
        if (await loadBiometricEnabled()) return;
        if (!(await isBiometricAvailable())) return;
        if (cancelled) return;
        sessionStorage.setItem('screensmart.bioAsk', '1');
        if (!(await askConfirm(t('manage.enableBiometricAsk')))) return;
        const r = await authenticateWithBiometric(t('manage.biometricEnableReason'));
        if (cancelled) return;
        if (r.ok) await setBiometricEnabled(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manageMode, session, synagogueId, t, askConfirm]);

  /** Re-lock manage app when returning from background (native APK). */
  useEffect(() => {
    if (!manageMode || !isNativeCapacitorShell()) return;
    let remove: (() => void) | undefined;
    let wasBackground = false;
    void (async () => {
      if (!(await loadBiometricEnabled())) return;
      if (!(await isBiometricAvailable())) return;
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            wasBackground = true;
            return;
          }
          if (!wasBackground) return;
          wasBackground = false;
          setManageLocked(true);
          setManageMoreOpen(false);
        });
        remove = () => {
          void handle.remove();
        };
      } catch {
        /* ignore */
      }
    })();
    return () => remove?.();
  }, [manageMode]);

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
        void onSave(t('admin.saveSummary'));
        return;
      }
      if (typing) return;
      if (tab !== 'design' && tab !== 'canvas') return;
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
    const billingTimer = window.setTimeout(() => {
      document.getElementById('billing-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(billingTimer);
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
    if (tab !== 'canvas' || !config || manageMode) return;
    if (!session || !canEditSettings(session.role)) return;
    if (config.layout === 'canvas') return;
    setConfig((c) => (c && c.layout !== 'canvas' ? { ...c, layout: 'canvas' } : c));
    setStatus(t('admin.canvasLayoutHint'));
  }, [tab, session?.role, config?.layout, t, manageMode]);

  if (!session || session.synagogueId !== synagogueId || !canEditContent(session.role)) {
    return <Navigate to={`/login/${synagogueId}`} replace />;
  }

  if (missingShul) {
    return (
      <NotFoundScreen
        screenId={synagogueId}
        homeTo={manageMode ? '/manage' : '/agency'}
        homeLabel={manageMode ? t('notFound.backManage') : t('admin.backToAgency')}
      />
    );
  }

  if (!config) {
    return (
      <div className="admin loading" dir={dir} lang={locale}>
        {t('common.loading')}
      </div>
    );
  }

  const isOwner = canEditSettings(session.role);
  const memberName = session.memberName;
  const memberRole = session.role;

  const activePreviewAnnouncement =
    config.announcements.find((a) => a.enabled && hasVisibleText(a.text)) ?? null;

  const quickAnnouncement =
    config.announcements.find((a) => a.enabled) ??
    config.announcements.find((a) => hasVisibleText(a.text)) ??
    config.announcements[0] ??
    null;

  const quickPrayerRows = config.blocks
    .filter((b) => b.enabled)
    .flatMap((b) =>
      b.items
        .filter((it) => !it.noTime)
        .map((item) => ({ blockId: b.id, blockTitle: b.title, item })),
    );

  const previewNow = new Date();
  const previewShabbatFriday = getShabbatZmanimDate(previewNow, previewZmanimMap);
  const canvasPreviewData: CanvasData = {
    name: config.name,
    dedication: config.dedication,
    logoSrc: config.media?.logoDataUrl || config.design.logoUrl || config.branding?.logoUrl,
    clock: previewNow.toLocaleTimeString(dateTag, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    day: getDayInfo(previewNow, config.yahrzeits),
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
    resolveItemAt: (item, block) => {
      if (item.noTime) return null;
      return resolveScheduleItemAt(
        block && isShabbatScheduleBlock(block)
          ? previewShabbatZmanimMap
          : previewZmanimMap,
        item.time,
        item.fromZman,
        item.offsetMinutes ?? 0,
        {
          now: previewNow,
          shabbatFriday: block && isShabbatScheduleBlock(block) ? previewShabbatFriday : null,
          block,
        },
      );
    },
    announcement: activePreviewAnnouncement,
    announcementCount: config.announcements.filter((a) => a.enabled && a.text.trim()).length,
    announcementIndex: 0,
    weatherTemp: config.showWeather ? 24 : null,
    weatherCode: config.showWeather ? 2 : undefined,
    weatherDesc: config.showWeather ? 'מעונן חלקית' : undefined,
    countdownLabel: t('admin.candleCountdownPreview'),
    candleBoard: {
      entry: '18:42',
      exit: '19:48',
      exitRT: '20:24',
      entryLabel: t('admin.candleEntry'),
      exitLabel: t('admin.candleExit'),
      exitRTLabel: t('admin.candleExitRT'),
      countdownLabel: t('admin.candleCountdownPreview'),
    },
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
        ? { id: uid(), title: t('admin.itemTitle'), time: '', noTime: true }
        : { id: uid(), title: t('admin.itemNew'), time: '18:00' };
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
          const copy: ScheduleItem = {
            ...src,
            id: uid(),
            title: t('admin.itemCopy', { title: src.title }),
          };
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
        blocks: [...c.blocks, { id: uid(), title: t('admin.blockNew'), enabled: true, items: [] }],
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

  async function removeAnnouncement(id: string) {
    if (!(await askConfirm(t('admin.confirmDeleteAnnouncement')))) return;
    setConfig((c) => {
      if (!c) return c;
      return { ...c, announcements: c.announcements.filter((x) => x.id !== id) };
    });
    setStatus(t('admin.announcementDeleted'));
  }

  async function addMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isOwner || !config) {
      setStatus(t('admin.noUserPerm'));
      return;
    }
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('memberName') ?? newMember.name).trim();
    const username = String(data.get('memberUsername') ?? newMember.username)
      .trim()
      .toLowerCase();
    const email = String(data.get('memberEmail') ?? newMember.email)
      .trim()
      .toLowerCase();
    const password = String(data.get('memberPassword') ?? '');
    const role = (String(data.get('memberRole') ?? newMember.role) || 'editor') as UserRole;
    if (!name || !username || !password) {
      setStatus(t('admin.fillUserFields'));
      return;
    }
    if (password.trim().length < 4) {
      setStatus(t('admin.passTooShort'));
      return;
    }
    const members = config.members ?? [];
    if (members.some((m) => (m.username || m.name).toLowerCase() === username)) {
      setStatus(t('admin.userExists'));
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
        ...(email ? { email } : {}),
      };
      const nextMembers = [...(config.members ?? []), member];
      const nextConfig = { ...config, members: nextMembers };
      setConfig(nextConfig);
      setNewMember({ name: '', username: '', email: '', password: '', role: 'editor' });
      form.reset();
      setStatus(t('admin.savingUser', { username }));
      const result = await saveConfig(nextConfig, undefined, {
        by: memberName,
        summary: t('admin.addUserSummary', { username }),
      });
      if (!result.ok) {
        setStatus(result.error ?? t('admin.userSavedLocalFail'));
      } else {
        setStatus(t('admin.userSaved', { username }));
      }
      refreshHistory();
    } catch (err) {
      setStatus(t('admin.addUserFail', { error: String((err as Error)?.message || err) }));
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
      setStatus(t('admin.passTooShort'));
      return;
    }
    if (passwordReset.pass !== passwordReset.pass2) {
      setStatus(t('admin.passMismatch'));
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
    setStatus(t('admin.savingPass', { label: passwordReset.label }));
    const result = await saveConfig(nextConfig, undefined, {
      by: memberName,
      summary: t('admin.resetPassSummary', { label: passwordReset.label }),
    });
    if (result.ok) setDirty(false);
    setStatus(
      result.ok
        ? t('admin.passUpdated', { label: passwordReset.label })
        : result.error ?? t('admin.passUpdatedLocal'),
    );
    refreshHistory();
  }

  function startEditMember(member: Member) {
    setEditMemberId(member.id);
    setEditMember({
      name: member.name,
      username: member.username || member.name,
      email: member.email || '',
      role: member.role,
    });
  }

  async function saveEditMember(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !config || !editMemberId) return;
    const name = editMember.name.trim();
    const username = editMember.username.trim().toLowerCase();
    const email = editMember.email.trim().toLowerCase();
    if (!name || !username) {
      setStatus(t('admin.fillNameUser'));
      return;
    }
    const taken = config.members.some(
      (m) => m.id !== editMemberId && (m.username || m.name).toLowerCase() === username,
    );
    if (taken) {
      setStatus(t('admin.userExists'));
      return;
    }
    const owners = config.members.filter((m) => m.role === 'owner');
    const current = config.members.find((m) => m.id === editMemberId);
    if (
      current?.role === 'owner' &&
      editMember.role !== 'owner' &&
      owners.length <= 1
    ) {
      setStatus(t('admin.needOneOwner'));
      return;
    }
    const nextConfig = {
      ...config,
      members: config.members.map((m) =>
        m.id === editMemberId
          ? { ...m, name, username, role: editMember.role, email: email || undefined }
          : m,
      ),
    };
    setConfig(nextConfig);
    setEditMemberId(null);
    setStatus(t('admin.savingUser', { username }));
    const result = await saveConfig(nextConfig, undefined, {
      by: memberName,
      summary: t('admin.userUpdated'),
    });
    if (!result.ok) {
      setStatus(result.error ?? t('admin.userSavedLocalFail'));
    } else {
      setStatus(t('admin.userUpdated'));
    }
    refreshHistory();
  }

  async function removeMember(member: Member) {
    if (!isOwner || !config) return;
    if (member.id === session?.memberId) {
      setStatus(t('admin.cantDeleteSelf'));
      return;
    }
    const owners = config.members.filter((m) => m.role === 'owner');
    if (member.role === 'owner' && owners.length <= 1) {
      setStatus(t('admin.needOneOwner'));
      return;
    }
    if (
      !(await askConfirm({
        message: t('admin.confirmDeleteUser', { name: member.username || member.name }),
        confirmLabel: 'מחק',
        danger: true,
      }))
    ) {
      return;
    }
    if (editMemberId === member.id) setEditMemberId(null);
    update({ members: config.members.filter((x) => x.id !== member.id) });
    setStatus(t('admin.userDeleted'));
  }

  function updateModes(patch: Partial<ModeSettings>) {
    setConfig((c) => (c ? { ...c, modes: { ...c.modes, ...patch } } : c));
  }

  function plainToAnnounceHtml(plain: string): string {
    const escaped = plain
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return sanitizeRichHtml(escaped.replace(/\n/g, '<br>'));
  }

  function setQuickAnnouncementText(plain: string) {
    const html = plainToAnnounceHtml(plain);
    setConfig((c) => {
      if (!c) return c;
      const existing =
        c.announcements.find((a) => a.enabled) ?? c.announcements[0] ?? null;
      if (existing) {
        return {
          ...c,
          announcements: c.announcements.map((a) =>
            a.id === existing.id ? { ...a, text: html, enabled: true } : a,
          ),
        };
      }
      return {
        ...c,
        announcements: [
          {
            id: uid(),
            text: html,
            enabled: true,
            startDate: new Date().toISOString().slice(0, 10),
          },
        ],
      };
    });
  }

  function setQuickAnnouncementEnabled(enabled: boolean) {
    setConfig((c) => {
      if (!c) return c;
      const target = c.announcements.find((a) => hasVisibleText(a.text)) ?? c.announcements[0];
      if (!target) {
        if (!enabled) return c;
        return {
          ...c,
          announcements: [
            {
              id: uid(),
              text: '',
              enabled: true,
              startDate: new Date().toISOString().slice(0, 10),
            },
          ],
        };
      }
      return {
        ...c,
        announcements: c.announcements.map((a) =>
          a.id === target.id ? { ...a, enabled } : a,
        ),
      };
    });
  }

  function shareCongregantTimesWhatsApp() {
    if (!config) return;
    const url = `${window.location.origin}/times/${encodeURIComponent(synagogueId)}`;
    const text = t('admin.whatsappShareText', { name: config.name, url });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    setStatus(t('admin.sharedWhatsApp'));
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

  async function onSave(summary = t('admin.saveSummary')) {
    if (!config || saving || !dirty) return;
    if (!(await askConfirm(t('admin.confirmPublish')))) return;
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
            name: memberName || t('admin.defaultManager'),
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
    if (!result.ok) {
      setStatus(result.error ?? t('admin.saveFail'));
      toast(result.error ?? t('admin.saveFail'), 'error');
    } else if (!result.online) {
      setDirty(false);
      setStatus(t('admin.savedOffline'));
      toast(t('admin.toastOffline'), 'warn');
    } else if (result.pending) {
      setDirty(false);
      setStatus(
        result.error
          ? t('admin.savedSyncFail', { error: result.error })
          : t('admin.savedWaiting'),
      );
      toast(t('admin.toastWaiting'), 'warn');
    } else {
      setDirty(false);
      setStatus(t('admin.savedPublished'));
      toast(t('admin.toastPublished'), 'success');
    }
  }

  async function setKioskExitPin(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !kioskPin.trim()) return;
    const pinHash = await hashPin(kioskPin);
    update({ kioskExitPinHash: pinHash });
    setKioskPin('');
    setStatus(t('admin.pinUpdated'));
  }

  async function restoreHistory(entryId: string) {
    const entry = getHistoryEntry(synagogueId, entryId);
    if (!entry || !isOwner) return;
    if (
      !(await askConfirm(
        t('admin.confirmRestore', {
          rev: entry.revision,
          date: new Date(entry.at).toLocaleString(dateTag),
        }),
      ))
    ) {
      return;
    }
    const expanded = await expandConfigMedia(entry.config);
    setConfig(expanded);
    setStatus(t('admin.restoredDraft'));
    setTab('settings');
  }

  async function logout() {
    if (dirty && !(await askConfirm(t('admin.confirmLeave')))) return;
    clearSession();
    navigate(manageMode ? '/manage' : loginPathFor(synagogueId, manageMode));
  }

  const licenseOk = isLicenseValid(config.license);
  const licenseExpiry = config.license?.expiresAt
    ? new Date(config.license.expiresAt).toLocaleDateString(dateTag, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const licenseDays = daysLeft(config.license);
  const licenseBanner = licenseOk ? (
    licenseExpiry ? (
      t('admin.licenseOkUntil', { date: licenseExpiry }) +
      (licenseDays != null && licenseDays <= 30
        ? t('admin.licenseDaysLeft', { n: licenseDays })
        : '')
    ) : (
      t('admin.licenseActive')
    )
  ) : (
    <>
      {t('admin.licenseMissing')}{' '}
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
        {t('admin.updateCard')}
      </button>
    </>
  );

  const manageMoreActive = manageMode && (manageMoreOpen || !MANAGE_PRIMARY_TABS.has(tab));
  const manageDailyMore = tabs.filter(
    (tabItem) =>
      tabItem.group === 'daily' &&
      !MANAGE_PRIMARY_TABS.has(tabItem.id) &&
      (!tabItem.ownerOnly || isOwner),
  );
  const manageSystemMore = tabs.filter(
    (tabItem) => tabItem.group === 'system' && (!tabItem.ownerOnly || isOwner),
  );

  async function unlockManageApp() {
    setManageUnlocking(true);
    setStatus('');
    const r = await authenticateWithBiometric(t('manage.biometricReason'));
    setManageUnlocking(false);
    if (r.ok) {
      setManageLocked(false);
      return;
    }
    setStatus(r.error || t('manage.biometricFailed'));
  }

  function goManageTab(next: TabId) {
    setManageMoreOpen(false);
    setTab(next);
  }

  return (
    <div
      className={`admin${tab === 'canvas' ? ' canvas-mode' : ''}${manageMode ? ' manage-mode' : ''}`}
      dir={dir}
      lang={locale}
    >
      {manageMode && manageLocked ? (
        <div className="manage-lock-overlay" role="dialog" aria-modal>
          <div className="manage-lock-card">
            <p className="manage-mode-badge">{t('manage.modeBadge')}</p>
            <h2>{t('manage.resumeLockTitle')}</h2>
            <p>{t('manage.resumeLockLead')}</p>
            {status ? <p className="manage-lock-error">{status}</p> : null}
            <button
              type="button"
              className="btn primary"
              disabled={manageUnlocking}
              onClick={() => void unlockManageApp()}
            >
              {manageUnlocking ? t('manage.unlocking') : t('manage.resumeUnlock')}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                clearSession();
                navigate('/manage');
              }}
            >
              {t('manage.usePassword')}
            </button>
          </div>
        </div>
      ) : null}

      <header className={`admin-header sticky-bar${manageMode ? ' manage-app-header' : ''}`}>
        <div className="admin-header-main">
          <div className="admin-title">
            <div className="admin-title-row">
              {!manageMode ? <BrandLogo size="sm" className="admin-brand-logo" /> : null}
              {manageMode ? <p className="manage-mode-badge">{t('manage.modeBadge')}</p> : null}
              <h1>{config.name}</h1>
              <ScreenIdBadge id={synagogueId} size={manageMode ? 'sm' : 'md'} copyable />
            </div>
            <div className="admin-meta">
              {!manageMode ? (
                <span className="eyebrow">
                  {t('admin.eyebrow', {
                    name: memberName,
                    role: memberRole === 'owner' ? t('admin.roleOwner') : t('admin.roleEditor'),
                  })}
                </span>
              ) : (
                <span className="eyebrow manage-app-user">
                  {memberName}
                  {' · '}
                  {memberRole === 'owner' ? t('admin.roleOwner') : t('admin.roleEditor')}
                </span>
              )}
              {!manageMode || !licenseOk || (licenseDays != null && licenseDays <= 30) ? (
                <span className={`license-banner ${licenseOk ? 'ok' : 'warn'}`}>
                  {licenseBanner}
                </span>
              ) : null}
              {session.viaPlatform && !manageMode ? (
                <span className="license-banner ok">
                  {t('admin.platformBanner')}{' '}
                  <Link to="/agency">{t('admin.backToAgency')}</Link>
                </span>
              ) : null}
            </div>
          </div>
          <div className="admin-actions">
            {inquiryUnreadMessages > 0 ? (
              <button
                className="btn inquiry-mail-btn has-unread"
                type="button"
                onClick={() => goManageTab('support')}
                title={t('admin.inquiryMailTitle', { n: inquiryUnreadMessages })}
                aria-label={t('admin.inquiryMailAria', { n: inquiryUnreadMessages })}
              >
                <span className="inquiry-mail-icon" aria-hidden="true">
                  ✉
                </span>
                <span className="inquiry-mail-badge">{inquiryUnreadMessages > 99 ? '99+' : inquiryUnreadMessages}</span>
              </button>
            ) : null}
            {!manageMode ? <LangSwitch variant="light" /> : null}
            {!manageMode ? (
              <Link className="btn ghost admin-guide-link" to="/guide">
                {t('admin.installGuide')}
              </Link>
            ) : null}
            {!manageMode && (tab === 'design' || tab === 'canvas') ? (
              <>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={undoEdit}
                  disabled={!undo.canUndo}
                  title={t('admin.undoTitle')}
                  aria-label={t('admin.undoAria')}
                >
                  {t('admin.undo')}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={redoEdit}
                  disabled={!undo.canRedo}
                  title={t('admin.redoTitle')}
                  aria-label={t('admin.redoAria')}
                >
                  {t('admin.redo')}
                </button>
              </>
            ) : null}
            {!manageMode ? (
              <button className="btn ghost" type="button" onClick={logout}>
                {t('admin.logout')}
              </button>
            ) : null}
            <button
              className={`btn primary ${dirty ? 'dirty' : ''}`}
              type="button"
              onClick={() => void onSave()}
              disabled={saving || !dirty}
            >
              {saving ? t('admin.saving') : dirty ? t('admin.publishDirty') : t('admin.publish')}
            </button>
          </div>
        </div>
        {!manageMode && tab !== 'canvas' ? (
          <div className="admin-quick" role="navigation" aria-label={t('admin.quickAria')}>
            <Link className="admin-quick-ext" to={`/display/${synagogueId}`} target="_blank" rel="noreferrer">
              {t('admin.liveScreen')}
            </Link>
            <Link className="admin-quick-ext" to={`/times/${synagogueId}`} target="_blank" rel="noreferrer">
              {t('admin.congregantTimes')}
            </Link>
            <button type="button" className="admin-quick-ext" onClick={shareCongregantTimesWhatsApp}>
              {t('admin.shareWhatsApp')}
            </button>
            <button
              type="button"
              className="admin-quick-ext"
              onClick={() => {
                const url = `${window.location.origin}/times/${encodeURIComponent(synagogueId)}`;
                void navigator.clipboard.writeText(url).then(
                  () => setStatus(t('admin.copiedCongregantTimes')),
                  () => setStatus(url),
                );
              }}
            >
              {t('admin.copyCongregantTimes')}
            </button>
          </div>
        ) : null}
      </header>

      <div className={`admin-body${tab === 'canvas' ? ' is-canvas' : ''}`}>
        {!manageMode ? (
        <nav className="admin-tabs" aria-label={t('admin.navAria')}>
          {tabGroups.map((group) => {
            const items = tabs.filter(
              (tabItem) => tabItem.group === group.id && (!tabItem.ownerOnly || isOwner),
            );
            if (!items.length) return null;
            return (
              <div key={group.id} className="tab-group">
                <p className="tab-group-label">{group.label}</p>
                {items.map((tabItem) => (
                  <button
                    key={tabItem.id}
                    type="button"
                    className={`tab ${tab === tabItem.id ? 'active' : ''}`}
                    onClick={() => setTab(tabItem.id)}
                  >
                    {tabItem.label}
                    {tabItem.id === 'support' && inquiryUnreadMessages > 0 ? (
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
        ) : null}

        <div className="admin-main">
        {manageMode && manageMoreOpen ? (
          <div className="manage-more-sheet" role="dialog" aria-label={t('manage.moreTitle')}>
            <div className="manage-more-head">
              <h2>{t('manage.moreTitle')}</h2>
              <button type="button" className="btn ghost" onClick={() => setManageMoreOpen(false)}>
                {t('common.close')}
              </button>
            </div>
            {manageDailyMore.length ? (
              <div className="manage-more-group">
                <p className="manage-more-label">{t('manage.moreDaily')}</p>
                <div className="manage-more-grid">
                  {manageDailyMore.map((tabItem) => (
                    <button
                      key={tabItem.id}
                      type="button"
                      className={`manage-more-item${tab === tabItem.id ? ' on' : ''}`}
                      onClick={() => goManageTab(tabItem.id)}
                    >
                      {tabItem.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {manageSystemMore.length ? (
              <div className="manage-more-group">
                <p className="manage-more-label">{t('manage.moreSystem')}</p>
                <div className="manage-more-grid">
                  {manageSystemMore.map((tabItem) => (
                    <button
                      key={tabItem.id}
                      type="button"
                      className={`manage-more-item${tab === tabItem.id ? ' on' : ''}`}
                      onClick={() => goManageTab(tabItem.id)}
                    >
                      {tabItem.label}
                      {tabItem.id === 'support' && inquiryUnreadMessages > 0 ? (
                        <span className="tab-unread-badge">
                          {inquiryUnreadMessages > 99 ? '99+' : inquiryUnreadMessages}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="manage-more-group">
              <p className="manage-more-label">{t('manage.moreLinks')}</p>
              <div className="manage-more-grid">
                <Link
                  className="manage-more-item"
                  to={`/display/${synagogueId}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setManageMoreOpen(false)}
                >
                  {t('admin.liveScreen')}
                </Link>
                <Link className="manage-more-item" to={`/times/${synagogueId}`}>
                  {t('manage.openTimes')}
                </Link>
                <button
                  type="button"
                  className="manage-more-item"
                  onClick={() => {
                    shareCongregantTimesWhatsApp();
                    setManageMoreOpen(false);
                  }}
                >
                  {t('admin.shareWhatsApp')}
                </button>
                <button
                  type="button"
                  className="manage-more-item"
                  onClick={() => {
                    const url = `${window.location.origin}/times/${encodeURIComponent(synagogueId)}`;
                    void navigator.clipboard.writeText(url).then(
                      () => setStatus(t('admin.copiedCongregantTimes')),
                      () => setStatus(url),
                    );
                    setManageMoreOpen(false);
                  }}
                >
                  {t('admin.copyCongregantTimes')}
                </button>
              </div>
            </div>
            <div className="manage-more-footer">
              <LangSwitch variant="light" />
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setManageMoreOpen(false);
                  navigate('/manage');
                }}
              >
                {t('manage.changeScreen')}
              </button>
              <button type="button" className="btn ghost" onClick={() => void logout()}>
                {t('admin.logout')}
              </button>
            </div>
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
            onRequestCustomDesign={() => {
              setInquiryTopicPrefill('custom_design');
              setTab('support');
            }}
          />
        ) : null}

        {tab === 'canvas' && isOwner ? (
          <section className="card wide canvas-builder-card">
            <div className="section-head">
              <h2>{t('admin.canvasTitle')}</h2>
              <div className="section-head-actions">
                <Link className="btn ghost" to={`/display/${synagogueId}`} target="_blank" rel="noreferrer">
                  {t('admin.liveScreen')}
                </Link>
                <Link className="btn ghost" to={`/times/${synagogueId}`} target="_blank" rel="noreferrer">
                  {t('admin.congregantTimes')}
                </Link>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    void (async () => {
                      const name = window.prompt(
                        t('admin.templateNamePrompt'),
                        t('admin.templateNameDefault', { name: config.name }),
                      );
                      if (name == null) return;
                      const result = await saveDesignTemplate({
                        synagogueId,
                        name: name.trim() || t('admin.templateNameDefault', { name: config.name }),
                        description: t('admin.templateDesc'),
                        theme: config.theme,
                        layout: 'canvas',
                        design: config.design,
                        canvas: config.canvas,
                      });
                      if (!result.ok || !result.template) {
                        setStatus(result.error ?? t('admin.templateSaveFail'));
                        return;
                      }
                      setStatus(t('admin.templateSaved', { name: result.template.name }));
                    })();
                  }}
                >
                  {t('admin.saveAsTemplate')}
                </button>
                {config.layout !== 'canvas' ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      update({ layout: 'canvas' });
                      setStatus(t('admin.canvasLayoutHintSave'));
                    }}
                  >
                    {t('admin.activateOnDisplay')}
                  </button>
                ) : (
                  <span className="hint">{t('admin.activeOnDisplay')}</span>
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
                      setStatus(t('admin.paymentNoLicense'));
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
                        setStatus(t('admin.paymentLicenseServer'));
                        return;
                      }
                      const toSave = { ...current, license };
                      setConfigRaw(toSave);
                      const result = await saveConfig(toSave, undefined, {
                        by: session?.memberName ?? 'billing',
                        summary: t('admin.licenseRenewSummary'),
                      });
                      if (result.ok) {
                        const refreshed = loadLocal(synagogueId)?.config ?? toSave;
                        setConfigRaw(refreshed);
                        const until = license.expiresAt
                          ? new Date(license.expiresAt).toLocaleDateString(dateTag)
                          : '';
                        setStatus(
                          until
                            ? t('admin.licenseRenewedUntil', { date: until })
                            : t('admin.licenseRenewed'),
                        );
                      } else {
                        setStatus(result.error ?? t('admin.paymentSaveFail'));
                      }
                    })();
                  }}
                />
              </div>
            ) : null}
            <section className="card">
              <h2>{t('admin.settingsTitle')}</h2>
              <label>
                {t('common.name')}
                <input
                  value={config.name}
                  onChange={(e) => update({ name: e.target.value })}
                  disabled={!isOwner}
                />
              </label>
              <label>
                {t('admin.city')}
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
                {t('admin.dedication')}
                <input
                  value={config.dedication ?? ''}
                  onChange={(e) => update({ dedication: e.target.value })}
                />
              </label>
            </section>
            <section className="card">
              <h2>{t('admin.displayTitle')}</h2>
              {(
                [
                  ['showClock', 'admin.showClock'],
                  ['showHebrewDate', 'admin.showHebrewDate'],
                  ['showParasha', 'admin.showParsha'],
                  ['showDafYomi', 'admin.showDaf'],
                  ['showOmer', 'admin.showOmer'],
                  ['showWeather', 'admin.showWeather'],
                  ['showOrefAlerts', 'admin.showOrefAlerts'],
                  ['showYahrzeit', 'admin.showYahrzeitToday'],
                  ['showCalendarExtras', 'admin.showCalendarExtras'],
                ] as const
              ).map(([key, labelKey]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(config[key])}
                    onChange={(e) => update({ [key]: e.target.checked })}
                  />
                  {t(labelKey)}
                </label>
              ))}
              {config.showOrefAlerts ? (
                <label>
                  {t('admin.orefAreasExtra')}
                  <input
                    value={config.orefAreaExtra ?? ''}
                    onChange={(e) => update({ orefAreaExtra: e.target.value })}
                    placeholder={t('admin.orefAreasPlaceholder')}
                  />
                </label>
              ) : null}
            </section>

            <section className="card">
              <h2>{t('admin.modesShabbat')}</h2>
              <p className="hint">{t('admin.modesShabbatHint')}</p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.autoShabbat}
                  onChange={(e) => updateModes({ autoShabbat: e.target.checked })}
                />
                {t('admin.autoShabbat')}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.autoHoliday}
                  onChange={(e) => updateModes({ autoHoliday: e.target.checked })}
                />
                {t('admin.autoHoliday')}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.showCandleCountdown}
                  onChange={(e) => updateModes({ showCandleCountdown: e.target.checked })}
                />
                {t('admin.candleCountdown')}
              </label>
              <label>
                {t('admin.candleOffset')}
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
              <h2>{t('admin.modesCarousel')}</h2>
              <label>
                {t('admin.carouselSeconds')}
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
              <h2>{t('admin.modesOref')}</h2>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.orefSound}
                  onChange={(e) => updateModes({ orefSound: e.target.checked })}
                />
                {t('admin.orefSound')}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.modes.muteOrefOnShabbat}
                  onChange={(e) => updateModes({ muteOrefOnShabbat: e.target.checked })}
                />
                {t('admin.muteOrefOnShabbat')}
              </label>
            </section>
            <section className="card wide">
              <h2>{t('admin.modesEvent')}</h2>
              <p className="hint">{t('admin.modesEventHint')}</p>
              <label>
                {t('admin.displayMode')}
                <select
                  value={config.modes.specialMode}
                  onChange={(e) =>
                    updateModes({ specialMode: e.target.value as SpecialDisplayMode })
                  }
                >
                  <option value="normal">{t('admin.modeNormal')}</option>
                  <option value="event">{t('admin.modeEvent')}</option>
                  <option value="mourning">{t('admin.modeMourning')}</option>
                </select>
              </label>
              {config.modes.specialMode === 'event' ? (
                <>
                  <label>
                    {t('admin.eventTitle')}
                    <input
                      value={config.modes.eventTitle ?? ''}
                      onChange={(e) => updateModes({ eventTitle: e.target.value })}
                    />
                  </label>
                  <label>
                    {t('admin.eventSubtitle')}
                    <input
                      value={config.modes.eventSubtitle ?? ''}
                      onChange={(e) => updateModes({ eventSubtitle: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
              {config.modes.specialMode === 'mourning' ? (
                <label>
                  {t('admin.mourningName')}
                  <input
                    value={config.modes.mourningName ?? ''}
                    onChange={(e) => updateModes({ mourningName: e.target.value })}
                  />
                </label>
              ) : null}
            </section>

            <section className="card wide">
              <h2>{t('admin.zmanimTitle')}</h2>
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

            {isOwner ? (
              <>
                <section className="card emergency-card">
                  <h2>{t('admin.emergencyTitle')}</h2>
                  <p className="hint">{t('admin.emergencyHint')}</p>
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
                    {t('admin.enableEmergency')}
                  </label>
                  <label>
                    {t('admin.message')}
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
                      placeholder={t('admin.emergencyPlaceholder')}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() =>
                      void onSave(
                        config.emergency.active
                          ? t('admin.emergencyOnSummary')
                          : t('admin.emergencyOffSummary'),
                      )
                    }
                  >
                    {t('admin.saveEmergencyNow')}
                  </button>
                </section>

                <section className="card">
                  <h2>{t('admin.kioskExitTitle')}</h2>
                  <form className="inline-form" onSubmit={setKioskExitPin}>
                    <input
                      type="password"
                      value={kioskPin}
                      onChange={(e) => setKioskPin(e.target.value)}
                      placeholder={t('admin.newPin')}
                    />
                    <button type="submit" className="btn ghost">
                      {t('admin.update')}
                    </button>
                  </form>
                </section>

                <section className="card wide">
                  <h2>{t('admin.nusachTitle')}</h2>
                  <p className="hint">{t('admin.nusachHint')}</p>
                  <div className="preset-grid">
                    {NUSACH_TEMPLATES.map((nusachTpl) => (
                      <button
                        key={nusachTpl.id}
                        type="button"
                        className={`preset-card ${config.nusach === nusachTpl.id ? 'active' : ''}`}
                        onClick={() => {
                          void (async () => {
                            if (!(await askConfirm(t('admin.confirmNusach')))) return;
                            setConfig((c) => (c ? applyNusachTemplate(c, nusachTpl.id) : c));
                            setStatus(t('admin.nusachApplied', { name: nusachTpl.name }));
                          })();
                        }}
                      >
                        <strong>{nusachTpl.name}</strong>
                        <em>{nusachTpl.description}</em>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'yahrzeit' ? (
          <section className="card wide">
            <div className="section-head">
              <h2>{t('admin.yahrzeitTitle')}</h2>
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
                {t('admin.addYahrzeit')}
              </button>
            </div>
            <p className="hint">{t('admin.yahrzeitHint')}</p>
            {config.yahrzeits.map((y) => (
              <div className="yahrzeit-row" key={y.id}>
                <input
                  value={y.name}
                  onChange={(e) =>
                    update({
                      yahrzeits: config.yahrzeits.map((x) =>
                        x.id === y.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder={t('common.name')}
                />
                <HebrewDatePicker
                  value={{ hebrewDay: y.hebrewDay, hebrewMonth: y.hebrewMonth }}
                  onChange={(next) =>
                    update({
                      yahrzeits: config.yahrzeits.map((x) =>
                        x.id === y.id
                          ? { ...x, hebrewDay: next.hebrewDay, hebrewMonth: next.hebrewMonth }
                          : x,
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
                  {t('common.enabled')}
                </label>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() =>
                    update({ yahrzeits: config.yahrzeits.filter((x) => x.id !== y.id) })
                  }
                >
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </section>
        ) : null}

        {tab === 'media' && isOwner ? (
          <section className="card wide">
            <div className="section-head">
              <h2>{t('admin.mediaTitle')}</h2>
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
                {t('admin.clearAssignments')}
              </button>
            </div>

            <div className="media-slots">
              <MediaPickerField
                label={t('admin.logo')}
                value={config.media.logoDataUrl}
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                kind="image"
                onChange={(url) => setMediaUrl('logoDataUrl', url, 'image')}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
              <MediaPickerField
                label={t('admin.screenBg')}
                value={config.media.backgroundDataUrl}
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                kind="image"
                onChange={(url) => setMediaUrl('backgroundDataUrl', url, 'image')}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
              <MediaPickerField
                label={t('admin.eventImage')}
                value={config.media.eventImageUrl}
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                kind="image"
                onChange={(url) => setMediaUrl('eventImageUrl', url, 'image')}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
              <MediaPickerField
                label={t('admin.loopVideo')}
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

        {tab === 'history' && isOwner ? (
          <section className="card wide">
            <h2>{t('admin.historyTitle')}</h2>
            <p className="hint">{t('admin.historyHint')}</p>
            {history.length === 0 ? (
              <p className="hint">{t('admin.noHistory')}</p>
            ) : (
              <ul className="history-list">
                {history.map((h) => (
                  <li key={h.id}>
                    <div>
                      <strong>{t('admin.revision', { n: h.revision })}</strong>
                      <span>
                        {new Date(h.at).toLocaleString(dateTag)} · {h.by}
                      </span>
                      <em>{h.summary}</em>
                    </div>
                    <button type="button" className="btn ghost" onClick={() => void restoreHistory(h.id)}>
                      {t('admin.restore')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'quick' ? (
          <section className="card wide quick-update">
            <div className="section-head">
              <h2>{t('admin.quickTitle')}</h2>
              {dirty ? (
                <strong className="warn">{t('admin.pendingPublish')}</strong>
              ) : (
                <em>{t('admin.upToDate')}</em>
              )}
            </div>
            <p className="hint">{t('admin.quickHint')}</p>

            <div className="quick-update-grid">
              <div className="quick-update-block">
                <h3>{t('admin.quickAnnounce')}</h3>
                <textarea
                  className="quick-announce-input"
                  rows={3}
                  value={toPlainDisplayText(quickAnnouncement?.text ?? '')}
                  placeholder={t('admin.quickAnnouncePlaceholder')}
                  onChange={(e) => setQuickAnnouncementText(e.target.value)}
                />
                <div className="quick-update-actions">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={Boolean(quickAnnouncement?.enabled)}
                      onChange={(e) => setQuickAnnouncementEnabled(e.target.checked)}
                    />
                    {quickAnnouncement?.enabled
                      ? t('admin.quickAnnounceOn')
                      : t('admin.quickAnnounceOff')}
                  </label>
                  <button type="button" className="btn ghost" onClick={() => setTab('announce')}>
                    {t('admin.quickMoreAnnounce')}
                  </button>
                </div>
              </div>

            </div>

            <div className="quick-update-block quick-prayers">
              <div className="section-head">
                <h3>{t('admin.quickPrayers')}</h3>
                <button type="button" className="btn ghost" onClick={() => setTab('content')}>
                  {t('admin.quickOpenContent')}
                </button>
              </div>
              {quickPrayerRows.length === 0 ? (
                <div className="admin-empty">
                  <p>{t('admin.quickNoPrayers')}</p>
                  <button type="button" className="btn primary" onClick={() => setTab('content')}>
                    {t('admin.createFirstBlock')}
                  </button>
                </div>
              ) : (
                <div className="quick-prayer-list">
                  {quickPrayerRows.map(({ blockId, blockTitle, item }) => (
                    <div className="quick-prayer-row" key={`${blockId}-${item.id}`}>
                      <span className="quick-prayer-block">{blockTitle}</span>
                      <input
                        value={item.title}
                        onChange={(e) => updateItem(blockId, item.id, { title: e.target.value })}
                        placeholder={t('admin.titlePlaceholder')}
                      />
                      {item.fromZman ? (
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
                          onChange={(e) => updateItem(blockId, item.id, { time: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="quick-update-footer">
              <button
                type="button"
                className="btn ghost"
                onClick={shareCongregantTimesWhatsApp}
              >
                {t('admin.shareWhatsApp')}
              </button>
              <button
                type="button"
                className={`btn primary${dirty ? ' dirty' : ''}`}
                disabled={saving || !dirty}
                onClick={() => void onSave()}
              >
                {saving ? t('admin.publishing') : dirty ? t('admin.quickPublishCta') : t('admin.publish')}
              </button>
            </div>
          </section>
        ) : null}

        {tab === 'content' ? (
          <section className="card wide">
            <div className="section-head">
              <h2>{t('admin.contentTitle')}</h2>
              <button type="button" className="btn ghost" onClick={addBlock}>
                {t('admin.addBlock')}
              </button>
            </div>
            <div className="admin-today">
              <span>
                {t('admin.activeBlocks', {
                  blocks: config.blocks.filter((b) => b.enabled).length,
                  items: config.blocks.reduce((n, b) => n + b.items.length, 0),
                })}
              </span>
              <span>
                {t('admin.activeAnnouncements', {
                  n: config.announcements.filter((a) => a.enabled && a.text.trim()).length,
                })}
              </span>
              {dirty ? (
                <strong className="warn">{t('admin.pendingPublish')}</strong>
              ) : (
                <em>{t('admin.upToDate')}</em>
              )}
            </div>
            {config.blocks.length === 0 ? (
              <div className="admin-empty">
                <p>{t('admin.noBlocks')}</p>
                <button type="button" className="btn primary" onClick={addBlock}>
                  {t('admin.createFirstBlock')}
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
                    placeholder={t('admin.blockNamePlaceholder')}
                  />
                  <span className="block-count">{block.items.length}</span>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={block.enabled}
                      onChange={(e) => updateBlock(block.id, { enabled: e.target.checked })}
                    />
                    {t('common.enabled')}
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
                        title={t('admin.dragReorder')}
                        aria-label={t('admin.dragReorder')}
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
                        placeholder={item.noTime ? t('admin.itemTitle') : t('admin.titlePlaceholder')}
                      />
                      {item.noTime ? (
                        <span className="item-hint">{t('admin.noTime')}</span>
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
                        {open ? t('common.close') : t('admin.more')}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        title={t('admin.duplicateItem')}
                        onClick={() => duplicateItem(block.id, item.id)}
                      >
                        {t('common.duplicate')}
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => removeItem(block.id, item.id)}
                      >
                        {t('common.delete')}
                      </button>
                      {open ? (
                        <div className="item-more">
                          <div className="item-order-actions">
                            <button
                              type="button"
                              className="btn ghost item-move"
                              aria-label={t('admin.moveUp')}
                              disabled={index === 0}
                              onClick={() => moveItem(block.id, index, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn ghost item-move"
                              aria-label={t('admin.moveDown')}
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
                            placeholder={t('admin.noteOptional')}
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
                                <option value="">{t('admin.fixedTime')}</option>
                                {ZMAN_DEFS.map((z) => (
                                  <option key={z.key} value={z.key}>
                                    {t('admin.accordingTo', { label: z.label })}
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
                                  placeholder={t('admin.offsetMinutes')}
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
                            {t('admin.rowWithoutTime')}
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div className="row-actions">
                  <button type="button" className="btn ghost" onClick={() => addItem(block.id)}>
                    {t('admin.addItem')}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => addItem(block.id, true)}
                  >
                    {t('admin.addNoTimeRow')}
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
              <h2>{t('admin.announceTitle')}</h2>
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
                {t('admin.newAnnouncement')}
              </button>
            </div>
            <p className="hint">{t('admin.announceHint')}</p>
            {config.announcements.length === 0 ? (
              <div className="admin-empty">
                <p>{t('admin.noAnnouncements')}</p>
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
                  {t('admin.writeFirstAnnouncement')}
                </button>
              </div>
            ) : (
              config.announcements.map((a, index) => (
                <div className="announce-card" key={a.id}>
                  <div className="announce-card-head">
                    <strong>{t('admin.announcementN', { n: index + 1 })}</strong>
                    <button
                      type="button"
                      className="announce-delete-btn"
                      onClick={() => void removeAnnouncement(a.id)}
                    >
                      {t('admin.deleteAnnouncement')}
                    </button>
                  </div>
                  <div className="announce-text">
                    <span className="announce-text-label">{t('admin.announceText')}</span>
                    <RichTextEditor
                      value={a.text}
                      onChange={(html) => updateAnnouncement(a.id, { text: sanitizeRichHtml(html) })}
                      placeholder={t('admin.announcePlaceholder')}
                      dir={dir}
                      minHeight="6.5rem"
                    />
                  </div>
                  <div className="announce-dates">
                    <label>
                      {t('admin.fromDate')}
                      <input
                        type="date"
                        value={a.startDate ?? ''}
                        onChange={(e) =>
                          updateAnnouncement(a.id, { startDate: e.target.value || undefined })
                        }
                      />
                    </label>
                    <label>
                      {t('admin.toDate')}
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
                      {t('admin.activeOnScreen')}
                    </label>
                  </div>
                  <div className="announce-card-foot">
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
                              text: a.text
                                ? `${sanitizeRichHtml(a.text)} <b>(${t('admin.copyMark')})</b>`
                                : '',
                            },
                          ],
                        })
                      }
                    >
                      {t('common.duplicate')}
                    </button>
                    <button
                      type="button"
                      className="announce-delete-btn"
                      onClick={() => void removeAnnouncement(a.id)}
                    >
                      {t('admin.deleteAnnouncement')}
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
            defaultName={
              session?.viaPlatform
                ? config.name
                : session?.memberName ||
                  config.members.find((m) => m.role === 'owner')?.name ||
                  config.name
            }
            defaultEmail={config.contactEmail || ''}
            canManage={false}
            initialTopic={inquiryTopicPrefill}
            onPrefillConsumed={() => setInquiryTopicPrefill(null)}
          />
        ) : null}

        {tab === 'users' && isOwner ? (
          <section className="card wide">
            <h2>{t('admin.usersTitle')}</h2>
            <p className="hint">{t('admin.usersHint')}</p>
            <p className="hint">{t('admin.usersGoogleHint')}</p>
            <ul className="members-list">
              {config.members.map((m) =>
                editMemberId === m.id ? (
                  <li key={m.id} className="member-editing">
                    <form
                      className="member-form member-form-email"
                      onSubmit={(e) => void saveEditMember(e)}
                    >
                      <input
                        placeholder={t('admin.displayName')}
                        value={editMember.name}
                        onChange={(e) =>
                          setEditMember({ ...editMember, name: e.target.value })
                        }
                      />
                      <input
                        placeholder={t('admin.username')}
                        value={editMember.username}
                        onChange={(e) =>
                          setEditMember({ ...editMember, username: e.target.value })
                        }
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        autoComplete="off"
                      />
                      <input
                        type="email"
                        placeholder={t('admin.memberEmail')}
                        value={editMember.email}
                        onChange={(e) =>
                          setEditMember({ ...editMember, email: e.target.value })
                        }
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        autoComplete="email"
                      />
                      <select
                        value={editMember.role}
                        onChange={(e) =>
                          setEditMember({ ...editMember, role: e.target.value as UserRole })
                        }
                      >
                        <option value="editor">{t('admin.roleEditor')}</option>
                        <option value="owner">{t('admin.roleOwner')}</option>
                      </select>
                      <button type="submit" className="btn primary">
                        {t('admin.saveChange')}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setEditMemberId(null)}
                      >
                        {t('common.cancel')}
                      </button>
                    </form>
                  </li>
                ) : (
                  <li key={m.id}>
                    <div>
                      <strong>{m.name}</strong>
                      <span>
                        {m.username || m.name}
                        {m.email ? ` · ${m.email}` : ''}
                        {' · '}
                        {m.role === 'owner' ? t('admin.roleOwner') : t('admin.roleEditor')}
                        {m.googleSub ? ` · ${t('admin.googleLinked')}` : ''}
                        {m.passkeys?.length ? ` · ${t('admin.passkeyLinked')}` : ''}
                      </span>
                    </div>
                    <div className="member-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => startEditMember(m)}
                      >
                        {t('admin.editUser')}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => void resetMemberPassword(m.id)}
                      >
                        {t('admin.resetPass')}
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => removeMember(m)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
            <form className="member-form member-form-add member-form-email" onSubmit={(e) => void addMember(e)}>
              <input
                name="memberName"
                placeholder={t('admin.displayName')}
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                required
              />
              <input
                name="memberUsername"
                placeholder={t('admin.username')}
                value={newMember.username}
                onChange={(e) => setNewMember({ ...newMember, username: e.target.value })}
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="off"
                required
              />
              <input
                name="memberEmail"
                type="email"
                placeholder={t('admin.memberEmail')}
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="email"
              />
              <input
                name="memberPassword"
                placeholder={t('admin.password')}
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
                <option value="editor">{t('admin.roleEditor')}</option>
                <option value="owner">{t('admin.roleOwner')}</option>
              </select>
              <button type="submit" className="btn primary">
                {t('common.add')}
              </button>
            </form>
          </section>
        ) : null}
        </div>
        </div>
      </div>

      <div className={`admin-save-bar ${dirty ? 'show' : ''}`}>
        <span>{dirty ? t('admin.dirtyBar') : t('admin.allUpdated')}</span>
        <button
          type="button"
          className="btn primary"
          disabled={saving || !dirty}
          onClick={() => void onSave()}
        >
          {saving ? t('admin.publishing') : t('admin.publish')}
        </button>
      </div>

      {manageMode ? (
        <nav className="manage-bottom-nav" aria-label={t('admin.navAria')}>
          <button
            type="button"
            className={tab === 'quick' && !manageMoreOpen ? 'on' : ''}
            onClick={() => goManageTab('quick')}
          >
            {t('manage.navQuick')}
          </button>
          <button
            type="button"
            className={tab === 'content' && !manageMoreOpen ? 'on' : ''}
            onClick={() => goManageTab('content')}
          >
            {t('manage.navPrayers')}
          </button>
          <button
            type="button"
            className={tab === 'announce' && !manageMoreOpen ? 'on' : ''}
            onClick={() => goManageTab('announce')}
          >
            {t('manage.navNotices')}
          </button>
          <button
            type="button"
            className={manageMoreActive ? 'on' : ''}
            onClick={() => setManageMoreOpen((open) => !open)}
          >
            {t('manage.navMore')}
            {inquiryUnreadMessages > 0 ? (
              <i className="manage-nav-dot" aria-hidden="true" />
            ) : null}
          </button>
        </nav>
      ) : null}

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
            <h2>{t('admin.resetPasswordTitle')}</h2>
            <p className="hint">{t('admin.userLabel', { label: passwordReset.label })}</p>
            <label>
              {t('admin.newPassword')}
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
              {t('admin.confirmPassword')}
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
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn primary">
                {t('admin.updatePassword')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {!manageMode && tab !== 'canvas' ? (
        <SiteFooter credit note={!manageLocked && status ? status : undefined} />
      ) : null}
    </div>
  );
}
