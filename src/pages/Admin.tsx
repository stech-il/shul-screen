import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { DesignStudio } from '../components/DesignStudio';
import { CanvasBuilder } from '../components/canvas/CanvasBuilder';
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
} from '../lib/auth';
import { listEvents } from '../lib/analytics';
import {
  fetchHebcalZmanim,
  getShabbatZmanimDate,
  isShabbatScheduleBlock,
  pickEnabledZmanim,
  resolveFromZmanimMap,
  type HebcalZmanimResult,
} from '../lib/hebcalZmanim';
import { getHistoryEntry, loadHistory } from '../lib/history';
import { expandConfigMedia } from '../lib/mediaPersist';
import { HEBREW_MONTHS, getDayInfo } from '../lib/jewish';
import {
  DEMO_LICENSE_KEYS,
  isLicenseValid,
  licenseLabel,
} from '../lib/license';
import { activateLicenseKey } from '../lib/licenseCloud';
import { upsertGallery } from '../lib/gallery';
import { useUndoHistory } from '../lib/undoHistory';
import { saveDesignTemplate } from '../lib/designTemplates';
import {
  isSupabaseConfigured,
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
  | 'users';

const TABS: { id: TabId; label: string; ownerOnly?: boolean }[] = [
  { id: 'design', label: 'עיצוב', ownerOnly: true },
  { id: 'canvas', label: 'בונה מסך', ownerOnly: true },
  { id: 'content', label: 'תוכן' },
  { id: 'zmanim', label: 'זמנים' },
  { id: 'announce', label: 'הודעות' },
  { id: 'yahrzeit', label: 'יארצייט' },
  { id: 'media', label: 'מדיה', ownerOnly: true },
  { id: 'nusach', label: 'נוסח', ownerOnly: true },
  { id: 'modes', label: 'מצבים' },
  { id: 'live', label: 'תצוגה חיה' },
  { id: 'history', label: 'היסטוריה', ownerOnly: true },
  { id: 'settings', label: 'הגדרות' },
  { id: 'users', label: 'משתמשים', ownerOnly: true },
];

interface Props {
  synagogueId: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function Admin({ synagogueId }: Props) {
  const navigate = useNavigate();
  const [config, setConfigRaw] = useState<SynagogueConfig | null>(null);
  const undo = useUndoHistory<SynagogueConfig>();
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [newMember, setNewMember] = useState({
    name: '',
    username: '',
    password: '',
    role: 'editor' as UserRole,
  });
  const [session, setSession] = useState(() => loadSession());
  const [tab, setTab] = useState<TabId>(() =>
    canEditSettings(loadSession()?.role ?? 'editor') ? 'design' : 'content',
  );
  const [kioskPin, setKioskPin] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewZmanim, setPreviewZmanim] = useState<ComputedZman[]>([]);
  const [previewZmanimMap, setPreviewZmanimMap] = useState<HebcalZmanimResult['times']>({});
  const [previewShabbatZmanimMap, setPreviewShabbatZmanimMap] =
    useState<HebcalZmanimResult['times']>({});

  const setConfig = (
    updater: SynagogueConfig | null | ((c: SynagogueConfig | null) => SynagogueConfig | null),
  ) => {
    setConfigRaw((c) => {
      const next = typeof updater === 'function' ? updater(c) : updater;
      if (c && next && next !== c && !undo.isApplying()) {
        undo.recordBeforeChange(c);
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
        const mode = r.cloudMode === 'supabase' ? 'Supabase' : 'סנכרון מקומי';
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
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
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

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !newMember.name || !newMember.username || !newMember.password) return;
    const username = newMember.username.trim().toLowerCase();
    if (config?.members.some((m) => (m.username || m.name).toLowerCase() === username)) {
      setStatus('שם המשתמש כבר קיים');
      return;
    }
    const passwordHash = await hashPassword(newMember.password);
    const member: Member = {
      id: uid(),
      name: newMember.name,
      username,
      role: newMember.role,
      passwordHash,
    };
    setConfig((c) => (c ? { ...c, members: [...c.members, member] } : c));
    setNewMember({ name: '', username: '', password: '', role: 'editor' });
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
      setStatus('נשמר מקומית — יסונכרן אוטומטית כשיהיה אינטרנט');
    } else if (result.pending) {
      setStatus(
        result.error
          ? `שמירה מקומית — סנכרון נכשל: ${result.error}`
          : 'שמירה מקומית — המתנה לסנכרון ענן',
      );
    } else {
      setStatus(isSupabaseConfigured ? 'נשמר ב־Supabase ✓' : 'נשמר וסונכרן ✓');
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

  function activateLicense(e: FormEvent) {
    e.preventDefault();
    void (async () => {
      const result = await activateLicenseKey(licenseKey, synagogueId);
      if (!result.ok || !result.info) {
        setStatus(result.error ?? 'מפתח רישיון לא תקין');
        return;
      }
      update({ license: result.info });
      setStatus(
        `רישיון ${licenseLabel(result.info.plan)} הופעל${result.info.serverValidated ? ' (ענן)' : ''} — לחץ שמור`,
      );
    })();
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
    clearSession();
    navigate(`/login/${synagogueId}`);
  }

  return (
    <div className="admin" dir="rtl" lang="he">
      <header className="admin-header sticky-bar">
        <div>
          <p className="eyebrow">
            ניהול מסך · {memberName} ({memberRole === 'owner' ? 'מנהל' : 'עורך'})
          </p>
          <h1>{config.name}</h1>
          <p className="status">{status}</p>
        </div>
        <div className="admin-actions">
          <button
            className="btn ghost"
            type="button"
            onClick={undoEdit}
            disabled={!undo.canUndo}
            title="בטל (Ctrl+Z)"
            aria-label="בטל שינוי אחרון"
          >
            חזור אחורה
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
          <Link className="btn ghost" to={`/display/${synagogueId}`} target="_blank">
            תצוגה חיה
          </Link>
          <button className="btn ghost" type="button" onClick={logout}>
            יציאה
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? 'שומר...' : 'שמור ועדכן מסך'}
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="ניווט ניהול">
        {TABS.filter((t) => !t.ownerOnly || isOwner).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="admin-grid">
        {tab === 'design' && isOwner ? (
          <DesignStudio
            config={config}
            onChange={update}
            onDesign={updateDesign}
            onStatus={setStatus}
          />
        ) : null}

        {tab === 'canvas' && isOwner ? (
          <section className="card wide">
            <div className="section-head">
              <h2>בונה מסך חופשי</h2>
              <div className="section-head-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const name = window.prompt('שם לתבנית העיצוב:', `עיצוב ${config.name}`);
                    if (name == null) return;
                    const t = saveDesignTemplate({
                      name: name.trim() || `עיצוב ${config.name}`,
                      description: 'נשמר מבונה המסך',
                      theme: config.theme,
                      layout: 'canvas',
                      design: config.design,
                      canvas: config.canvas,
                    });
                    setStatus(`נשמרה תבנית «${t.name}» — זמינה בלשונית עיצוב`);
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
            <p className="hint">
              העלה רקע משלך וגרור כל רכיב לכל מקום. השינויים נשמרים עם «שמור ועדכן מסך».
            </p>
            <CanvasBuilder
              canvas={config.canvas}
              blocks={config.blocks}
              enabledZmanim={config.enabledZmanim}
              synagogueId={synagogueId}
              gallery={config.media.gallery ?? []}
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
            <section className="card wide">
              <h2>ענן וקישורים</h2>
              <p className="hint">
                {isSupabaseConfigured
                  ? 'מחובר ל־Supabase — עדכון חי בלי רענון.'
                  : 'מצב הדגמה מקומי. לענן אמיתי הגדר .env.local לפי .env.example'}
              </p>
              <p className="hint">
                מסך: <code dir="ltr">#/display/{synagogueId}</code> · קיוסק:{' '}
                <code dir="ltr">#/display/{synagogueId}?kiosk=1</code>
              </p>
              <p className="hint">
                אירועים אחרונים:{' '}
                {listEvents(synagogueId)
                  .slice(0, 5)
                  .map((e) => `${e.type}`)
                  .join(' · ') || 'אין עדיין'}
              </p>
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

                <section className="card">
                  <h2>רישיון מסך</h2>
                  <p className="hint">
                    {config.license && isLicenseValid(config.license)
                      ? `${licenseLabel(config.license.plan)} · משויך למסך זה · ${config.license.key}`
                      : 'אין רישיון פעיל — המסך נעול עד להפעלת מפתח'}
                  </p>
                  <form className="inline-form" onSubmit={activateLicense}>
                    <input
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      placeholder="SHUL-SCREEN-DEMO-0001"
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                    />
                    <button type="submit" className="btn ghost">
                      הפעל למסך זה
                    </button>
                  </form>
                  <div className="demo-key-row">
                    {DEMO_LICENSE_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="linkish"
                        onClick={() => setLicenseKey(k)}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'modes' ? (
          <>
            <section className="card">
              <h2>מצבי שבת וחג</h2>
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
              <h2>מצב מיוחד</h2>
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
            <h2>מדיה וגלריה</h2>
            <p className="hint">
              כל קובץ שנבחר נפתח בפופאפ גלריה — העלאה חדשה נכנסת לגלריה, ואפשר לבחור מחדש בכל שדה.
              {isSupabaseConfigured
                ? ' קבצים מועלים ל־Supabase Storage (shul-media). אחרי בחירה לחץ «שמור».'
                : ' Supabase לא מוגדר — נשמר בדפדפן בלבד.'}
            </p>

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

            <div className="mg-field" style={{ marginTop: '1rem' }}>
              <GalleryManager
                synagogueId={synagogueId}
                gallery={config.media.gallery ?? []}
                onGalleryChange={updateGallery}
                onStatus={setStatus}
              />
            </div>

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
              נקה שיוכי מדיה (הגלריה נשארת)
            </button>
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
            <h2>זמני היום מ־Hebcal</h2>
            <p className="hint">סמן אילו זמנים להציג במסך</p>
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
              <h2>בלוקי תוכן</h2>
              <button type="button" className="btn ghost" onClick={addBlock}>
                + בלוק
              </button>
            </div>
            <p className="hint">שעה קבועה או לפי זמן הלכתי + היסט בדקות</p>
            {config.blocks.map((block) => (
              <div className="block" key={block.id}>
                <div className="block-head">
                  <input
                    className="block-title"
                    value={block.title}
                    onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={block.enabled}
                      onChange={(e) => updateBlock(block.id, { enabled: e.target.checked })}
                    />
                    פעיל
                  </label>
                </div>
                {block.items.map((item) => (
                  <div className={`item-row ${item.noTime ? 'no-time' : ''}`} key={item.id}>
                    <input
                      value={item.title}
                      onChange={(e) => updateItem(block.id, item.id, { title: e.target.value })}
                      placeholder={item.noTime ? 'כותרת / הערה (בלי שעה)' : 'כותרת'}
                    />
                    <input
                      value={item.note ?? ''}
                      onChange={(e) => updateItem(block.id, item.id, { note: e.target.value })}
                      placeholder="הערה"
                    />
                    {item.noTime ? (
                      <span className="item-hint">שורה ממורכזת בלי שעה</span>
                    ) : (
                      <>
                        <select
                          value={item.fromZman ?? ''}
                          onChange={(e) =>
                            updateItem(block.id, item.id, {
                              fromZman: (e.target.value || undefined) as ZmanKey | undefined,
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
                          />
                        ) : (
                          <input
                            type="time"
                            value={item.time}
                            onChange={(e) =>
                              updateItem(block.id, item.id, { time: e.target.value })
                            }
                          />
                        )}
                      </>
                    )}
                    <label className="check item-notime-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(item.noTime)}
                        onChange={(e) =>
                          updateItem(block.id, item.id, { noTime: e.target.checked })
                        }
                      />
                      בלי שעה
                    </label>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => removeItem(block.id, item.id)}
                    >
                      מחק
                    </button>
                  </div>
                ))}
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
              </div>
            ))}
          </section>
        ) : null}

        {tab === 'announce' ? (
          <section className="card wide">
            <div className="section-head">
              <h2>הודעות מתוזמנות</h2>
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  update({
                    announcements: [
                      ...config.announcements,
                      { id: uid(), text: '', enabled: true },
                    ],
                  })
                }
              >
                + הודעה
              </button>
            </div>
            <p className="hint">מוצג במסך רק בין תאריכי ההתחלה והסיום</p>
            {config.announcements.map((a) => (
              <div className="announce-row" key={a.id}>
                <input
                  value={a.text}
                  onChange={(e) => updateAnnouncement(a.id, { text: e.target.value })}
                  placeholder="טקסט ההודעה"
                />
                <input
                  type="date"
                  value={a.startDate ?? ''}
                  onChange={(e) =>
                    updateAnnouncement(a.id, { startDate: e.target.value || undefined })
                  }
                />
                <input
                  type="date"
                  value={a.endDate ?? ''}
                  onChange={(e) =>
                    updateAnnouncement(a.id, { endDate: e.target.value || undefined })
                  }
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => updateAnnouncement(a.id, { enabled: e.target.checked })}
                  />
                  פעיל
                </label>
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
            ))}
          </section>
        ) : null}

        {tab === 'users' && isOwner ? (
          <section className="card wide">
            <h2>משתמשים והרשאות</h2>
            <p className="hint">מנהל — הכל. עורך — תוכן בלבד. כניסה עם שם משתמש וסיסמה.</p>
            <ul className="members-list">
              {config.members.map((m) => (
                <li key={m.id}>
                  <div>
                    <strong>{m.name}</strong>
                    <span>
                      {m.username || m.name} · {m.role === 'owner' ? 'מנהל' : 'עורך'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() =>
                      update({ members: config.members.filter((x) => x.id !== m.id) })
                    }
                  >
                    הסר
                  </button>
                </li>
              ))}
            </ul>
            <form className="member-form" onSubmit={addMember}>
              <input
                placeholder="שם לתצוגה"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
              />
              <input
                placeholder="שם משתמש"
                value={newMember.username}
                onChange={(e) => setNewMember({ ...newMember, username: e.target.value })}
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="off"
              />
              <input
                placeholder="סיסמה"
                type="password"
                value={newMember.password}
                onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                dir="ltr"
                style={{ textAlign: 'left' }}
                autoComplete="new-password"
              />
              <select
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
  );
}
