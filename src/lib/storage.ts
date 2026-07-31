import type { Announcement, CachedBundle, Member, SynagogueConfig } from '../types';
import { normalizeCanvas } from '../components/canvas/widgets';
import { normalizeGallery } from './gallery';
import { DEFAULT_DESIGN } from '../data/designPresets';
import { normalizeZmanKey, type ZmanKey } from '../data/zmanim';
import { cloudUrl } from './apiOrigin';
import { pushHistory } from './history';
import { publishLiveUpdate } from './liveBus';
import { compactConfigMedia, expandConfigMedia } from './mediaPersist';
import { getDefaultModes } from './modes';
import { decodeHtmlEntities, hasVisibleText } from './sanitizeHtml';
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
  if (!a.enabled || !hasVisibleText(a.text)) return false;
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
          text: decodeHtmlEntities(item),
          enabled: true,
        };
      }
      const a = item as Announcement;
      return { ...a, text: decodeHtmlEntities(a.text ?? '') };
    });
  }

  const modes = { ...getDefaultModes(), ...(config.modes ?? {}) };
  modes.eventTitle = decodeHtmlEntities(modes.eventTitle ?? '');
  modes.eventSubtitle = decodeHtmlEntities(modes.eventSubtitle ?? '');
  modes.mourningName = decodeHtmlEntities(modes.mourningName ?? '');

  return {
    ...config,
    layout: config.layout ?? 'classic',
    showStatus: config.showStatus ?? true,
    showOrefAlerts: config.showOrefAlerts ?? true,
    showYahrzeit: config.showYahrzeit ?? true,
    showCalendarExtras: config.showCalendarExtras ?? true,
    showOmer: config.showOmer ?? true,
    orefAreaExtra: config.orefAreaExtra ?? '',
    nusach: config.nusach ?? 'ashkenaz',
    dedication: decodeHtmlEntities(config.dedication ?? ''),
    media: {
      ...(config.media ?? {}),
      gallery: normalizeGallery(config.media?.gallery),
      logoDataUrl: config.media?.logoDataUrl ?? '',
      backgroundDataUrl: config.media?.backgroundDataUrl ?? '',
      eventImageUrl: config.media?.eventImageUrl ?? '',
      loopVideoUrl: config.media?.loopVideoUrl ?? '',
      customFonts: config.media?.customFonts ?? [],
    },
    yahrzeits: config.yahrzeits ?? [],
    canvas: normalizeCanvas(config.canvas),
    design: mergeDesign(config),
    modes,
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
      title: decodeHtmlEntities(block.title ?? ''),
      items: block.items.map((item) => ({
        ...item,
        title: decodeHtmlEntities(item.title ?? ''),
        note: item.note != null ? decodeHtmlEntities(item.note) : item.note,
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

/**
 * Pull every synagogue from Supabase (and local cloud mirrors) into the local index
 * so the agency panel can manage delete / rename / licenses across devices.
 */
export async function syncSynagogueIndexFromCloud(): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  const byId = new Map<string, CachedBundle>();

  for (const id of listSynagogueIds()) {
    const local = loadLocal(id);
    if (local?.config) byId.set(id, local);
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(CLOUD_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const bundle = JSON.parse(raw) as CachedBundle;
        if (!bundle?.config?.id) continue;
        const id = bundle.config.id;
        const existing = byId.get(id);
        const remoteAt = Date.parse(bundle.syncedAt || bundle.config.updatedAt || '') || 0;
        const localAt =
          Date.parse(existing?.syncedAt || existing?.config.updatedAt || '') || 0;
        if (!existing || remoteAt >= localAt) {
          byId.set(id, {
            ...bundle,
            config: normalizeConfig(bundle.config),
          });
        }
      } catch {
        /* skip bad mirror */
      }
    }
  } catch {
    /* ignore */
  }

  if (isSupabaseConfigured && navigator.onLine) {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from('synagogues')
        .select('id, config, updated_at')
        .order('updated_at', { ascending: false });
      if (error) {
        // Still keep whatever we already collected locally
        if (byId.size === 0) {
          return { ok: false, count: 0, error: error.message };
        }
      } else {
        for (const row of data ?? []) {
          const config = normalizeConfig(row.config as SynagogueConfig);
          byId.set(config.id, {
            config,
            syncedAt: (row.updated_at as string) || new Date().toISOString(),
          });
        }
      }
    }
  } else if (await isServerCloudAvailable()) {
    const remote = await listServerCloud();
    for (const bundle of remote) {
      byId.set(bundle.config.id, bundle);
    }
  }

  const ids: string[] = [];
  for (const [id, bundle] of byId) {
    ids.push(id);
    try {
      saveLocal(bundle);
    } catch {
      // Quota — still register id so the panel shows something
      if (!ids.includes(id)) ids.push(id);
    }
  }
  localStorage.setItem(`${PREFIX}index`, JSON.stringify(ids));
  return { ok: true, count: ids.length };
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

/** Simulated shared cloud (localStorage) when no remote backend is available */
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

/** Built-in Render/Node cloud API (/api/cloud) — durable when CLOUD_GITHUB_TOKEN is set */
let serverCloudChecked: boolean | null = null;

export async function isServerCloudAvailable(): Promise<boolean> {
  if (serverCloudChecked != null) return serverCloudChecked;
  if (typeof fetch === 'undefined' || !navigator.onLine) {
    serverCloudChecked = false;
    return false;
  }
  try {
    const res = await fetch(cloudUrl('/api/cloud/status'), { cache: 'no-store' });
    serverCloudChecked = res.ok;
  } catch {
    serverCloudChecked = false;
  }
  return serverCloudChecked;
}

async function pullServerCloud(id: string): Promise<CachedBundle | null> {
  try {
    const res = await fetch(
      cloudUrl(`/api/cloud/synagogues/${encodeURIComponent(id)}?_=${Date.now()}`),
      { cache: 'no-store' },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const body = (await res.json()) as CachedBundle;
    if (!body?.config) return null;
    return {
      config: normalizeConfig(body.config),
      syncedAt: body.syncedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function pushServerCloud(bundle: CachedBundle): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(cloudUrl(`/api/cloud/synagogues/${encodeURIComponent(bundle.config.id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'server cloud failed' };
  }
}

async function listServerCloud(): Promise<CachedBundle[]> {
  try {
    const res = await fetch(cloudUrl('/api/cloud/synagogues'), { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      items?: Array<{ config: SynagogueConfig; syncedAt?: string }>;
    };
    return (body.items ?? [])
      .filter((i) => i?.config?.id)
      .map((i) => ({
        config: normalizeConfig(i.config),
        syncedAt: i.syncedAt || new Date().toISOString(),
      }));
  } catch {
    return [];
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
  if (await isServerCloudAvailable()) {
    const remote = await pullServerCloud(id);
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
  } else if (await isServerCloudAvailable()) {
    result = await pushServerCloud(next);
  } else {
    const ok = await pushLocalCloud(next);
    result = {
      ok,
      error: ok
        ? undefined
        : 'שמירה מקומית נכשלה (לרוב בגלל תמונות גדולות ב־localStorage).',
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
  options?: { preferCloud?: boolean },
): Promise<{
  bundle: CachedBundle;
  source: 'cloud' | 'local' | 'default';
  online: boolean;
  cloudMode: 'supabase' | 'server' | 'local-sim';
}> {
  const online = navigator.onLine;
  const cloudMode: 'supabase' | 'server' | 'local-sim' = isSupabaseConfigured
    ? 'supabase'
    : (await isServerCloudAvailable())
      ? 'server'
      : 'local-sim';
  const local = loadLocal(id);
  const preferCloud = Boolean(options?.preferCloud);

  async function withExpanded(
    bundle: CachedBundle,
    source: 'cloud' | 'local' | 'default',
  ): Promise<{
    bundle: CachedBundle;
    source: 'cloud' | 'local' | 'default';
    online: boolean;
    cloudMode: 'supabase' | 'server' | 'local-sim';
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
      const cloudRev = cloud.config.revision ?? 0;
      const localRev = local?.config.revision ?? 0;
      // Login / auth must see latest members+passwords from the server.
      const takeCloud = preferCloud || !local || cloudRev >= localRev;
      if (takeCloud) {
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
    } else if (preferCloud) {
      // Cloud is authoritative for login/admin — missing id must not invent a shul
      // or revive a leftover local draft from a previous mistaken visit.
      if (fallback) {
        return withExpanded(
          {
            config: await compactConfigMedia(normalizeConfig(fallback)),
            syncedAt: new Date().toISOString(),
          },
          'default',
        );
      }
      throw new Error('לא נמצאה הגדרה לבית הכנסת');
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

  // Never auto-create cloud synagogues from /admin|/login|/display URLs.
  // Agency "create" (saveConfig) is the only path that should seed a new id.
  if (fallback) {
    return withExpanded(
      {
        config: await compactConfigMedia(normalizeConfig(fallback)),
        syncedAt: new Date().toISOString(),
      },
      'default',
    );
  }

  throw new Error('לא נמצאה הגדרה לבית הכנסת');
}

export async function saveConfig(
  config: SynagogueConfig,
  weather?: CachedBundle['weather'],
  meta?: { by?: string; summary?: string },
): Promise<{ ok: boolean; online: boolean; pending: boolean; error?: string }> {
  // Pull cloud first so we never overwrite a newer license with a stale local copy
  let base = config;
  if (navigator.onLine) {
    try {
      const cloud = await pullFromCloud(config.id);
      if (cloud?.config?.license && !config.license) {
        base = { ...config, license: cloud.config.license };
      } else if (
        cloud?.config?.license?.expiresAt &&
        config.license?.expiresAt &&
        Date.parse(cloud.config.license.expiresAt) > Date.parse(config.license.expiresAt) &&
        !config.license.locked
      ) {
        base = { ...config, license: cloud.config.license };
      }
    } catch {
      /* continue with local */
    }
  }

  const nextConfig: SynagogueConfig = {
    ...normalizeConfig(base),
    updatedAt: new Date().toISOString(),
    revision: (base.revision ?? 0) + 1,
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

  // Detect media that stayed local-only (won't show on other screens)
  if (navigator.onLine) {
    const stillLocal = collectIdbMediaRefs(compactConfig);
    if (stillLocal.length) {
      return {
        ok: false,
        online: true,
        pending: true,
        error:
          'התמונה לא עלתה לדיסק הענן. נסה שוב (תמונה קטנה יותר / רשת יציבה) ואז שמור. ' +
          `קבצים מקומיים: ${stillLocal.length}`,
      };
    }
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

function collectIdbMediaRefs(config: SynagogueConfig): string[] {
  const out: string[] = [];
  const check = (url?: string) => {
    if (url && url.startsWith('idb-media:')) out.push(url);
  };
  check(config.media?.logoDataUrl);
  check(config.media?.backgroundDataUrl);
  check(config.media?.eventImageUrl);
  check(config.media?.loopVideoUrl);
  check(config.design?.logoUrl);
  check(config.design?.backgroundImageUrl);
  check(config.canvas?.backgroundUrl);
  check(config.branding?.logoUrl);
  for (const g of config.media?.gallery ?? []) check(g.url);
  for (const f of config.media?.customFonts ?? []) check(f.url);
  for (const w of config.canvas?.widgets ?? []) check(w.imageUrl);
  return out;
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

/** Delete a synagogue locally + purge all server disk data (media, backups, billing…). */
export async function deleteSynagogue(
  id: string,
): Promise<{ ok: boolean; error?: string; purged?: Record<string, unknown> }> {
  localStorage.removeItem(key(id));
  localStorage.removeItem(CLOUD_PREFIX + id);
  localStorage.removeItem(`shul-screen:history:${id}`);
  localStorage.removeItem(`shul-screen:heartbeat:${id}`);
  localStorage.removeItem(`shul-screen:live-bump:${id}`);
  try {
    localStorage.removeItem(`screensmart:admin-tab:${id}`);
  } catch {
    /* ignore */
  }
  setQueue(getQueue().filter((x) => x !== id));
  removeFromIndex(id);

  const notes: string[] = [];
  let purged: Record<string, unknown> | undefined;

  if (isSupabaseConfigured && navigator.onLine) {
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from('synagogues').delete().eq('id', id);
      if (error) notes.push(`Supabase: ${error.message}`);
      await sb.from('screen_heartbeats').delete().eq('synagogue_id', id);
      await sb.from('analytics_events').delete().eq('synagogue_id', id);
    }
  }

  // Always purge Render/disk cloud when available (media, backups, HOK, inquiries…)
  if (await isServerCloudAvailable()) {
    try {
      const res = await fetch(cloudUrl(`/api/cloud/synagogues/${encodeURIComponent(id)}`), {
        method: 'DELETE',
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        purged?: Record<string, unknown>;
      };
      if (!res.ok) {
        notes.push(body.error || `מחיקת דיסק נכשלה (${res.status})`);
      } else {
        purged = body.purged;
      }
    } catch (err) {
      notes.push(err instanceof Error ? err.message : 'מחיקת דיסק נכשלה');
    }
  }

  return {
    ok: true,
    error: notes.length ? notes.join(' · ') : undefined,
    purged,
  };
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

/** Change screen id (e.g. Hebrew slug → numeric). Moves cloud media/billing. */
export async function changeScreenId(
  oldId: string,
  newIdRaw: string,
): Promise<{ ok: boolean; error?: string; newId?: string }> {
  const from = String(oldId || '').trim();
  const to = String(newIdRaw || '').trim();
  if (!from || !to) return { ok: false, error: 'חסר מזהה' };
  if (from === to) return { ok: false, error: 'המזהה החדש זהה לישן' };
  if (!/^\d{1,12}$/.test(to)) return { ok: false, error: 'מזהה חדש חייב להיות מספר' };
  if (listSynagogueIds().includes(to) || loadLocal(to)) {
    return { ok: false, error: `מזהה ${to} כבר קיים מקומית` };
  }

  if (!(await isServerCloudAvailable())) {
    return { ok: false, error: 'שרת הענן לא זמין — נדרש לשינוי מזהה' };
  }

  try {
    const res = await fetch(
      cloudUrl(`/api/cloud/synagogues/${encodeURIComponent(from)}/change-id`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newId: to }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      newId?: string;
    };
    if (!res.ok) {
      return { ok: false, error: body.error || `שינוי מזהה נכשל (${res.status})` };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'שינוי מזהה נכשל',
    };
  }

  // Refresh local cache under the new id; drop the old one
  const remote = await pullFromCloud(to);
  if (remote) saveLocal(remote);
  localStorage.removeItem(key(from));
  localStorage.removeItem(CLOUD_PREFIX + from);
  localStorage.removeItem(`shul-screen:history:${from}`);
  localStorage.removeItem(`shul-screen:heartbeat:${from}`);
  localStorage.removeItem(`shul-screen:live-bump:${from}`);
  try {
    localStorage.removeItem(`screensmart:admin-tab:${from}`);
  } catch {
    /* ignore */
  }
  setQueue(getQueue().filter((x) => x !== from));
  removeFromIndex(from);
  if (remote) {
    const ids = listSynagogueIds();
    if (!ids.includes(to)) {
      localStorage.setItem(`${PREFIX}index`, JSON.stringify([...ids, to]));
    }
  }

  if (isSupabaseConfigured && navigator.onLine) {
    const sb = getSupabase();
    if (sb && remote) {
      await sb.from('synagogues').delete().eq('id', from);
      await pushSupabase(remote);
    }
  }

  return { ok: true, newId: to };
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

  const { nextNumericScreenId } = await import('./screenId');
  const cloudBundles = await listServerCloud().catch(() => [] as CachedBundle[]);
  const newId = nextNumericScreenId([
    ...listSynagogueIds(),
    ...cloudBundles.map((b) => b.config.id),
    id,
  ]);

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

  // Fresh trial for the copy (same as a newly created synagogue)
  try {
    const { issueScreenLicense, TRIAL_DAYS } = await import('./license');
    copy.license = issueScreenLicense(newId, 'trial', trimmed, {
      durationDays: TRIAL_DAYS,
    });
  } catch {
    /* keep unlicensed if issue fails */
  }

  const result = await saveConfig(copy, undefined, {
    by,
    summary: `שכפול מ־${src.name}`,
  });
  if (!result.ok) return { ok: false, error: result.error };
  try {
    const { notifyTrialStarted } = await import('./notifications');
    void notifyTrialStarted(newId);
  } catch {
    /* optional */
  }
  return { ok: true, newId };
}

export { isSupabaseConfigured };
