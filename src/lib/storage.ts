import type { Announcement, CachedBundle, Member, SynagogueConfig } from '../types';
import { normalizeCanvas } from '../components/canvas/widgets';
import { normalizeGallery } from './gallery';
import { DEFAULT_DESIGN } from '../data/designPresets';
import { normalizeZmanKey, type ZmanKey } from '../data/zmanim';
import { pushHistory } from './history';
import { publishLiveUpdate } from './liveBus';
import { compactConfigMedia, expandConfigMedia } from './mediaPersist';
import { getDefaultModes } from './modes';
import { getSupabase, isSupabaseConfigured } from './supabase';

const PREFIX = 'shul-screen:';
const CLOUD_PREFIX = 'shul-screen-cloud:';
const QUEUE_KEY = `${PREFIX}sync-queue`;

function key(id: string) {
  return `${PREFIX}${id}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isAnnouncementActive(a: Announcement, day = todayIso()): boolean {
  if (!a.enabled || !a.text.trim()) return false;
  if (a.startDate && day < a.startDate) return false;
  if (a.endDate && day > a.endDate) return false;
  return true;
}

function normalizeMembers(members: Member[] | undefined): Member[] {
  return (members ?? []).map((m, i) => {
    const username =
      (m.username || m.name || `user${i + 1}`).trim().toLowerCase() || `user${i + 1}`;
    const passwordHash = m.passwordHash || m.pinHash || '';
    return {
      id: m.id || `m-${i}`,
      name: m.name || username,
      username,
      role: m.role === 'owner' || m.role === 'agency' ? m.role : 'editor',
      passwordHash,
      ...(m.pinHash && !m.passwordHash ? { pinHash: m.pinHash } : {}),
    };
  });
}

export function normalizeConfig(config: SynagogueConfig): SynagogueConfig {
  const enabledZmanim = [
    ...new Set(
      (config.enabledZmanim ?? [])
        .map((k) => normalizeZmanKey(String(k)))
        .filter((k): k is ZmanKey => Boolean(k)),
    ),
  ];

  const rawAnnouncements = config.announcements as unknown;
  let announcements: Announcement[] = [];
  if (Array.isArray(rawAnnouncements)) {
    announcements = rawAnnouncements.map((item, i) => {
      if (typeof item === 'string') {
        return {
          id: `legacy-${i}`,
          text: item,
          enabled: true,
        };
      }
      return item as Announcement;
    });
  }

  return {
    ...config,
    layout: config.layout ?? 'classic',
    showStatus: config.showStatus ?? true,
    showOrefAlerts: config.showOrefAlerts ?? true,
    showYahrzeit: config.showYahrzeit ?? true,
    showCalendarExtras: config.showCalendarExtras ?? true,
    orefAreaExtra: config.orefAreaExtra ?? '',
    nusach: config.nusach ?? 'ashkenaz',
    media: {
      ...(config.media ?? {}),
      gallery: normalizeGallery(config.media?.gallery),
      logoDataUrl: config.media?.logoDataUrl ?? '',
      backgroundDataUrl: config.media?.backgroundDataUrl ?? '',
      eventImageUrl: config.media?.eventImageUrl ?? '',
      loopVideoUrl: config.media?.loopVideoUrl ?? '',
    },
    yahrzeits: config.yahrzeits ?? [],
    canvas: normalizeCanvas(config.canvas),
    design: mergeDesign(config),
    modes: { ...getDefaultModes(), ...(config.modes ?? {}) },
    emergency: config.emergency ?? {
      active: false,
      message: '',
      updatedAt: new Date().toISOString(),
    },
    branding: config.branding ?? {
      primaryColor: '#1a2f38',
      accentColor: '#b08d3e',
    },
    members: normalizeMembers(config.members),
    revision: config.revision ?? 1,
    enabledZmanim,
    announcements,
    blocks: (config.blocks ?? []).map((block) => ({
      ...block,
      items: block.items.map((item) => ({
        ...item,
        fromZman: item.fromZman
          ? normalizeZmanKey(String(item.fromZman)) ?? item.fromZman
          : undefined,
      })),
    })),
  };
}

function mergeDesign(config: SynagogueConfig): SynagogueConfig['design'] {
  const base = { ...DEFAULT_DESIGN, ...(config.design ?? {}) };
  if (!config.design && config.branding) {
    base.primaryColor = config.branding.primaryColor || base.primaryColor;
    base.accentColor = config.branding.accentColor || base.accentColor;
    base.logoUrl = config.branding.logoUrl || '';
  }
  return base;
}

export function loadLocal(id: string): CachedBundle | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const bundle = JSON.parse(raw) as CachedBundle;
    return { ...bundle, config: normalizeConfig(bundle.config) };
  } catch {
    return null;
  }
}

export function saveLocal(bundle: CachedBundle): void {
  const raw = JSON.stringify(bundle);
  try {
    localStorage.setItem(key(bundle.config.id), raw);
  } catch (err) {
    // Quota — drop history for this shul and retry once
    try {
      localStorage.removeItem(`shul-screen:history:${bundle.config.id}`);
      localStorage.setItem(key(bundle.config.id), raw);
    } catch (err2) {
      const msg =
        err2 instanceof DOMException && err2.name === 'QuotaExceededError'
          ? 'אחסון הדפדפן מלא. מחק תמונות מהגלריה או חבר Supabase Storage.'
          : 'שמירה מקומית נכשלה';
      throw new Error(msg);
    }
  }
  const list = listSynagogueIds();
  if (!list.includes(bundle.config.id)) {
    localStorage.setItem(`${PREFIX}index`, JSON.stringify([...list, bundle.config.id]));
  }
}

export async function saveLocalCompact(bundle: CachedBundle): Promise<CachedBundle> {
  const compact: CachedBundle = {
    ...bundle,
    config: await compactConfigMedia(normalizeConfig(bundle.config)),
  };
  saveLocal(compact);
  return compact;
}

export function listSynagogueIds(): string[] {
  try {
    const raw = localStorage.getItem(`${PREFIX}index`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function getQueue(): string[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setQueue(ids: string[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...new Set(ids)]));
}

export function enqueueSync(id: string) {
  setQueue([...getQueue(), id]);
}

/** Simulated shared cloud (localStorage) when Supabase is not configured */
async function pullLocalCloud(id: string): Promise<CachedBundle | null> {
  try {
    const raw = localStorage.getItem(CLOUD_PREFIX + id);
    return raw ? (JSON.parse(raw) as CachedBundle) : null;
  } catch {
    return null;
  }
}

async function pushLocalCloud(bundle: CachedBundle): Promise<boolean> {
  try {
    localStorage.setItem(CLOUD_PREFIX + bundle.config.id, JSON.stringify(bundle));
    return true;
  } catch {
    return false;
  }
}

async function pullSupabase(id: string): Promise<CachedBundle | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('synagogues').select('config, updated_at').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return {
    config: normalizeConfig(data.config as SynagogueConfig),
    syncedAt: data.updated_at as string,
  };
}

async function pushSupabase(bundle: CachedBundle): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase לא מוגדר' };
  const { error } = await sb.from('synagogues').upsert({
    id: bundle.config.id,
    name: bundle.config.name,
    config: bundle.config,
    revision: bundle.config.revision,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('pushSupabase', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function pullFromCloud(id: string): Promise<CachedBundle | null> {
  if (!navigator.onLine) return null;
  if (isSupabaseConfigured) {
    const remote = await pullSupabase(id);
    if (remote) return remote;
  }
  return pullLocalCloud(id);
}

export async function pushToCloud(
  bundle: CachedBundle,
): Promise<{ ok: boolean; error?: string }> {
  if (!navigator.onLine) {
    enqueueSync(bundle.config.id);
    return { ok: false, error: 'offline' };
  }
  const next: CachedBundle = {
    ...bundle,
    syncedAt: new Date().toISOString(),
    pendingSync: false,
  };
  let result: { ok: boolean; error?: string } = { ok: false };
  if (isSupabaseConfigured) {
    result = await pushSupabase(next);
  } else {
    const ok = await pushLocalCloud(next);
    result = {
      ok,
      error: ok
        ? undefined
        : 'שמירה מקומית נכשלה (לרוב בגלל תמונות גדולות ב־localStorage). חבר Supabase Storage.',
    };
  }
  if (result.ok) {
    saveLocal(next);
    setQueue(getQueue().filter((x) => x !== bundle.config.id));
    publishLiveUpdate(next.config);
  } else {
    enqueueSync(bundle.config.id);
  }
  return result;
}

export async function syncConfig(
  id: string,
  fallback?: SynagogueConfig,
): Promise<{
  bundle: CachedBundle;
  source: 'cloud' | 'local' | 'default';
  online: boolean;
  cloudMode: 'supabase' | 'local-sim';
}> {
  const online = navigator.onLine;
  const cloudMode = isSupabaseConfigured ? 'supabase' : 'local-sim';
  const local = loadLocal(id);

  async function withExpanded(
    bundle: CachedBundle,
    source: 'cloud' | 'local' | 'default',
  ): Promise<{
    bundle: CachedBundle;
    source: 'cloud' | 'local' | 'default';
    online: boolean;
    cloudMode: 'supabase' | 'local-sim';
  }> {
    return {
      bundle: {
        ...bundle,
        config: await expandConfigMedia(normalizeConfig(bundle.config)),
      },
      source,
      online,
      cloudMode,
    };
  }

  if (online) {
    const cloud = await pullFromCloud(id);
    if (cloud) {
      // Prefer newer revision
      if (!local || (cloud.config.revision ?? 0) >= (local.config.revision ?? 0)) {
        const normalized = {
          ...cloud,
          config: await compactConfigMedia(normalizeConfig(cloud.config)),
          pendingSync: false,
        };
        try {
          saveLocal(normalized);
        } catch {
          /* keep going with in-memory */
        }
        return withExpanded(normalized, 'cloud');
      }
      // Local is newer — keep local and queue push
      if (local.pendingSync) enqueueSync(id);
    }
  }

  if (local) {
    // Migrate any legacy data URLs out of localStorage into IndexedDB
    try {
      const compacted = await compactConfigMedia(normalizeConfig(local.config));
      saveLocal({ ...local, config: compacted });
      return withExpanded({ ...local, config: compacted }, 'local');
    } catch {
      return withExpanded(local, 'local');
    }
  }

  if (fallback) {
    const bundle: CachedBundle = {
      config: await compactConfigMedia(normalizeConfig(fallback)),
      syncedAt: new Date().toISOString(),
    };
    try {
      saveLocal(bundle);
    } catch {
      /* ignore */
    }
    if (online) await pushToCloud(bundle);
    return withExpanded(bundle, 'default');
  }

  throw new Error('לא נמצאה הגדרה לבית הכנסת');
}

export async function saveConfig(
  config: SynagogueConfig,
  weather?: CachedBundle['weather'],
  meta?: { by?: string; summary?: string },
): Promise<{ ok: boolean; online: boolean; pending: boolean; error?: string }> {
  const nextConfig: SynagogueConfig = {
    ...normalizeConfig(config),
    updatedAt: new Date().toISOString(),
    revision: (config.revision ?? 0) + 1,
  };

  let compactConfig: SynagogueConfig;
  try {
    compactConfig = await compactConfigMedia(nextConfig);
  } catch (err) {
    return {
      ok: false,
      online: navigator.onLine,
      pending: true,
      error: err instanceof Error ? err.message : 'שמירת מדיה נכשלה',
    };
  }

  const bundle: CachedBundle = {
    config: compactConfig,
    weather,
    syncedAt: new Date().toISOString(),
    pendingSync: true,
  };

  try {
    saveLocal(bundle);
  } catch (err) {
    return {
      ok: false,
      online: navigator.onLine,
      pending: true,
      error: err instanceof Error ? err.message : 'אחסון הדפדפן מלא',
    };
  }

  try {
    pushHistory(compactConfig, meta?.by ?? 'מערכת', meta?.summary ?? 'שמירת הגדרות');
  } catch {
    /* ignore history errors — often quota */
  }

  // Live update with expanded media so other tabs can render immediately
  const expanded = await expandConfigMedia(compactConfig);
  publishLiveUpdate(expanded);

  const online = navigator.onLine;
  if (online) {
    const result = await pushToCloud(bundle);
    return { ok: result.ok, online, pending: !result.ok, error: result.error };
  }
  enqueueSync(config.id);
  return { ok: true, online: false, pending: true };
}

/** Flush pending local→cloud when back online */
export async function flushSyncQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  const ids = getQueue();
  let done = 0;
  for (const id of ids) {
    const local = loadLocal(id);
    if (!local) {
      setQueue(getQueue().filter((x) => x !== id));
      continue;
    }
    const result = await pushToCloud({ ...local, pendingSync: false });
    if (result.ok) done += 1;
  }
  return done;
}

export function startAutoSync(onFlush?: (n: number) => void): () => void {
  const run = () => {
    flushSyncQueue().then((n) => {
      if (n > 0) onFlush?.(n);
    });
  };
  window.addEventListener('online', run);
  const interval = window.setInterval(run, 30_000);
  run();
  return () => {
    window.removeEventListener('online', run);
    clearInterval(interval);
  };
}

export async function fetchWeather(lat: number, lng: number) {
  // Legacy helper — prefer fetchWeatherForCity / subscribeWeather
  const { CITIES } = await import('../data/cities');
  const city = CITIES.find((c) => c.lat === lat && c.lng === lng) ?? CITIES[0]!;
  const { fetchWeatherForCity } = await import('./weather');
  const w = await fetchWeatherForCity(city.id);
  if (!w) return null;
  return {
    tempC: w.tempC,
    description: w.description,
    fetchedAt: w.fetchedAt,
  };
}

function removeFromIndex(id: string) {
  localStorage.setItem(
    `${PREFIX}index`,
    JSON.stringify(listSynagogueIds().filter((x) => x !== id)),
  );
}

/** Delete a synagogue locally (and from Supabase when configured). */
export async function deleteSynagogue(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  localStorage.removeItem(key(id));
  localStorage.removeItem(CLOUD_PREFIX + id);
  localStorage.removeItem(`shul-screen:history:${id}`);
  localStorage.removeItem(`shul-screen:heartbeat:${id}`);
  localStorage.removeItem(`shul-screen:live-bump:${id}`);
  setQueue(getQueue().filter((x) => x !== id));
  removeFromIndex(id);

  if (isSupabaseConfigured && navigator.onLine) {
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from('synagogues').delete().eq('id', id);
      if (error) {
        return { ok: true, error: `נמחק מקומית · ענן: ${error.message}` };
      }
    }
  }
  return { ok: true };
}

export async function renameSynagogue(
  id: string,
  name: string,
  by = 'platform',
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'יש להזין שם' };
  const local = loadLocal(id);
  if (!local?.config) return { ok: false, error: 'בית הכנסת לא נמצא' };
  const next = {
    ...local.config,
    name: trimmed,
    updatedAt: new Date().toISOString(),
    revision: (local.config.revision ?? 0) + 1,
  };
  return saveConfig(next, undefined, { by, summary: `שינוי שם ל־${trimmed}` });
}

export async function duplicateSynagogue(
  id: string,
  newName: string,
  by = 'platform',
): Promise<{ ok: boolean; error?: string; newId?: string }> {
  const local = loadLocal(id);
  if (!local?.config) return { ok: false, error: 'בית הכנסת לא נמצא' };
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, error: 'יש להזין שם להעתק' };

  const baseId =
    trimmed
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\u0590-\u05FFa-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 36) || `shul-${Date.now().toString(36)}`;
  let newId = baseId;
  let n = 2;
  while (listSynagogueIds().includes(newId) || loadLocal(newId)) {
    newId = `${baseId}-${n}`;
    n += 1;
  }

  const src = await expandConfigMedia(normalizeConfig(local.config));
  const copy: SynagogueConfig = {
    ...src,
    id: newId,
    name: trimmed,
    revision: 1,
    updatedAt: new Date().toISOString(),
    license: undefined,
    emergency: { active: false, message: '', updatedAt: new Date().toISOString() },
  };

  const result = await saveConfig(copy, undefined, {
    by,
    summary: `שכפול מ־${src.name}`,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, newId };
}

export { isSupabaseConfigured };
