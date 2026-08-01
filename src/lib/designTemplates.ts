import type {
  CanvasLayoutConfig,
  DesignSettings,
  SavedDesignTemplate,
  ScreenLayout,
  SynagogueConfig,
} from '../types';
import { compactMediaUrl, expandMediaUrl, isHeavyDataUrl } from './mediaPersist';

/** Legacy key — older builds wrote huge templates here and filled the quota. Never write again. */
export const LEGACY_DESIGN_TEMPLATES_KEY = 'shul-screen:design-templates';

const DB_NAME = 'shul-screen-templates';
const DB_VERSION = 2;
const STORE = 'templates';
const MAX_TEMPLATES = 40;

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function uid() {
  return `tpl_${Math.random().toString(36).slice(2, 10)}`;
}

function cacheKey(synagogueId: string): string {
  return `syn:${synagogueId}`;
}

/** Call on boot — removes the old localStorage blob that caused QuotaExceededError. */
export function purgeLegacyDesignTemplateStorage(): void {
  try {
    localStorage.removeItem(LEGACY_DESIGN_TEMPLATES_KEY);
  } catch {
    /* ignore */
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      // Drop legacy shared cache key so templates don't leak across screens
      try {
        const tx = req.transaction;
        if (tx) tx.objectStore(STORE).delete('list');
      } catch {
        /* ignore */
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

async function readAllFromIdb(synagogueId: string): Promise<SavedDesignTemplate[]> {
  const db = await openDb();
  try {
    const raw = await idbReq(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(cacheKey(synagogueId)),
    );
    const list = Array.isArray(raw) ? (raw as SavedDesignTemplate[]) : [];
    return list.filter((t) => !t.synagogueId || t.synagogueId === synagogueId);
  } finally {
    db.close();
  }
}

async function writeAllToIdb(synagogueId: string, list: SavedDesignTemplate[]): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(
      db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .put(list, cacheKey(synagogueId)),
    );
  } finally {
    db.close();
  }
}

/** Prefer idb refs; never keep raw data: URLs inside templates. */
async function slimUrl(url: string | undefined): Promise<string> {
  if (!url) return '';
  const compacted = await compactMediaUrl(url);
  if (isHeavyDataUrl(compacted) || compacted.startsWith('data:')) return '';
  return compacted;
}

async function slimTemplate(template: SavedDesignTemplate): Promise<SavedDesignTemplate> {
  const design: DesignSettings = {
    ...template.design,
    logoUrl: await slimUrl(template.design.logoUrl),
    backgroundImageUrl: await slimUrl(template.design.backgroundImageUrl),
  };
  const canvas: CanvasLayoutConfig = {
    ...template.canvas,
    backgroundUrl: await slimUrl(template.canvas.backgroundUrl),
    widgets: await Promise.all(
      (template.canvas.widgets ?? []).map(async (w) => ({
        ...w,
        imageUrl: w.imageUrl ? await slimUrl(w.imageUrl) : w.imageUrl,
        text:
          w.text && w.text.length > 12_000 ? `${w.text.slice(0, 12_000)}…` : w.text,
      })),
    ),
  };
  return { ...template, design, canvas };
}

async function expandTemplate(template: SavedDesignTemplate): Promise<SavedDesignTemplate> {
  return {
    ...template,
    design: {
      ...template.design,
      logoUrl: await expandMediaUrl(template.design.logoUrl),
      backgroundImageUrl: await expandMediaUrl(template.design.backgroundImageUrl),
    },
    canvas: {
      ...template.canvas,
      backgroundUrl: await expandMediaUrl(template.canvas.backgroundUrl),
      widgets: await Promise.all(
        (template.canvas.widgets ?? []).map(async (w) => ({
          ...w,
          imageUrl: w.imageUrl ? await expandMediaUrl(w.imageUrl) : w.imageUrl,
        })),
      ),
    },
  };
}

// —— Cloud sync — templates live per synagogue; IndexedDB is an offline cache ——

async function fetchCloudTemplates(synagogueId: string): Promise<SavedDesignTemplate[] | null> {
  try {
    const { apiFetch } = await import('./serverAuth');
    const res = await apiFetch(
      `/api/cloud/templates/${encodeURIComponent(synagogueId)}?_=${Date.now()}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: SavedDesignTemplate[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return null;
  }
}

async function pushCloudTemplates(
  synagogueId: string,
  items: SavedDesignTemplate[],
): Promise<boolean> {
  try {
    const { apiFetch } = await import('./serverAuth');
    const res = await apiFetch(`/api/cloud/templates/${encodeURIComponent(synagogueId)}`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadDesignTemplates(synagogueId: string): Promise<SavedDesignTemplate[]> {
  if (!synagogueId.trim()) return [];
  purgeLegacyDesignTemplateStorage();
  const local = await readAllFromIdb(synagogueId).catch(() => [] as SavedDesignTemplate[]);
  const cloud = await fetchCloudTemplates(synagogueId);
  if (cloud === null) {
    return local.filter((t) => !t.synagogueId || t.synagogueId === synagogueId);
  }
  // Do NOT upload a local shared cache into another synagogue's cloud list.
  try {
    await writeAllToIdb(synagogueId, cloud);
  } catch {
    /* cache write failed — cloud copy is still authoritative */
  }
  return cloud;
}

export async function saveDesignTemplate(input: {
  synagogueId: string;
  name: string;
  description?: string;
  theme: SynagogueConfig['theme'];
  layout: ScreenLayout;
  design: DesignSettings;
  canvas: CanvasLayoutConfig;
}): Promise<{
  ok: boolean;
  template?: SavedDesignTemplate;
  error?: string;
  warning?: string;
}> {
  const synagogueId = input.synagogueId.trim();
  if (!synagogueId) return { ok: false, error: 'חסר מזהה בית כנסת' };

  purgeLegacyDesignTemplateStorage();

  const name = input.name.trim() || 'תבנית ללא שם';
  const draft: SavedDesignTemplate = {
    id: uid(),
    name,
    description: (input.description ?? '').trim() || 'תבנית שמורה מהעיצוב הנוכחי',
    createdAt: new Date().toISOString(),
    synagogueId,
    theme: input.theme,
    layout: input.layout,
    design: {
      ...clone(input.design),
      presetId: `custom:${uid()}`,
    },
    canvas: clone(input.canvas),
  };

  try {
    const slim = await slimTemplate(draft);
    const list = await loadDesignTemplates(synagogueId);
    const next = [slim, ...list.filter((t) => t.synagogueId === synagogueId || !t.synagogueId)].slice(
      0,
      MAX_TEMPLATES,
    );
    await writeAllToIdb(synagogueId, next);
    purgeLegacyDesignTemplateStorage();
    const cloudOk = await pushCloudTemplates(synagogueId, next);
    return {
      ok: true,
      template: slim,
      warning: cloudOk ? undefined : 'נשמר במכשיר זה בלבד — אין חיבור לענן כרגע',
    };
  } catch (err) {
    purgeLegacyDesignTemplateStorage();
    const msg =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        ? 'האחסון מלא — מחק תבניות ישנות או הסר תמונות כבדות מהעיצוב'
        : err instanceof Error
          ? err.message
          : 'שמירת התבנית נכשלה';
    return { ok: false, error: msg };
  }
}

export async function deleteDesignTemplate(synagogueId: string, id: string): Promise<void> {
  if (id.startsWith('seed:')) return;
  if (!synagogueId.trim()) return;
  purgeLegacyDesignTemplateStorage();
  const list = (await loadDesignTemplates(synagogueId)).filter(
    (t) => t.id !== id && !t.id.startsWith('seed:'),
  );
  await writeAllToIdb(synagogueId, list);
  await pushCloudTemplates(synagogueId, list);
}

export async function getDesignTemplate(
  synagogueId: string,
  id: string,
): Promise<SavedDesignTemplate | undefined> {
  const list = await loadDesignTemplates(synagogueId);
  return list.find((t) => t.id === id);
}

/** Apply a saved template onto the current synagogue config. */
export async function applyDesignTemplate(
  template: SavedDesignTemplate,
): Promise<Pick<SynagogueConfig, 'theme' | 'layout' | 'design' | 'canvas'>> {
  const expanded = await expandTemplate(template);
  return {
    theme: expanded.theme,
    layout: expanded.layout,
    design: {
      ...clone(expanded.design),
      presetId: expanded.design.presetId || `custom:${expanded.id}`,
    },
    canvas: clone(expanded.canvas),
  };
}
