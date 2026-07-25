import type {
  CanvasLayoutConfig,
  DesignSettings,
  SavedDesignTemplate,
  ScreenLayout,
  SynagogueConfig,
} from '../types';
import { compactMediaUrl, expandMediaUrl } from './mediaPersist';

const LEGACY_LS_KEY = 'shul-screen:design-templates';
const DB_NAME = 'shul-screen-templates';
const DB_VERSION = 1;
const STORE = 'templates';
const MAX_TEMPLATES = 24;

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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
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

async function readAllFromIdb(): Promise<SavedDesignTemplate[]> {
  const db = await openDb();
  try {
    const raw = await idbReq(
      db.transaction(STORE, 'readonly').objectStore(STORE).get('list'),
    );
    return Array.isArray(raw) ? (raw as SavedDesignTemplate[]) : [];
  } finally {
    db.close();
  }
}

async function writeAllToIdb(list: SavedDesignTemplate[]): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(STORE, 'readwrite').objectStore(STORE).put(list, 'list'));
  } finally {
    db.close();
  }
}

/** Drop huge inline images from a template so storage stays small */
async function slimTemplate(template: SavedDesignTemplate): Promise<SavedDesignTemplate> {
  const design: DesignSettings = {
    ...template.design,
    logoUrl: await compactMediaUrl(template.design.logoUrl),
    backgroundImageUrl: await compactMediaUrl(template.design.backgroundImageUrl),
  };
  const canvas: CanvasLayoutConfig = {
    ...template.canvas,
    backgroundUrl: await compactMediaUrl(template.canvas.backgroundUrl),
    widgets: await Promise.all(
      (template.canvas.widgets ?? []).map(async (w) => ({
        ...w,
        // Free-text HTML can be large but usually OK; strip only image blobs
        imageUrl: w.imageUrl ? await compactMediaUrl(w.imageUrl) : w.imageUrl,
        text:
          w.text && w.text.length > 20_000
            ? `${w.text.slice(0, 20_000)}…`
            : w.text,
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

function readLegacyLocal(): SavedDesignTemplate[] {
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDesignTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLegacyLocal() {
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
}

let migratePromise: Promise<void> | null = null;

async function migrateLegacyIfNeeded(): Promise<void> {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    const legacy = readLegacyLocal();
    if (!legacy.length) return;
    const existing = await readAllFromIdb();
    if (!existing.length) {
      const slimmed = await Promise.all(legacy.map((t) => slimTemplate(t)));
      await writeAllToIdb(slimmed.slice(0, MAX_TEMPLATES));
    }
    clearLegacyLocal();
  })().catch(() => {
    // If migrate fails, still try to free quota
    clearLegacyLocal();
  });
  return migratePromise;
}

export async function loadDesignTemplates(): Promise<SavedDesignTemplate[]> {
  await migrateLegacyIfNeeded();
  try {
    return await readAllFromIdb();
  } catch {
    return [];
  }
}

export async function saveDesignTemplate(input: {
  name: string;
  description?: string;
  theme: SynagogueConfig['theme'];
  layout: ScreenLayout;
  design: DesignSettings;
  canvas: CanvasLayoutConfig;
}): Promise<{ ok: boolean; template?: SavedDesignTemplate; error?: string }> {
  await migrateLegacyIfNeeded();
  const name = input.name.trim() || 'תבנית ללא שם';
  const draft: SavedDesignTemplate = {
    id: uid(),
    name,
    description: (input.description ?? '').trim() || 'תבנית שמורה מהעיצוב הנוכחי',
    createdAt: new Date().toISOString(),
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
    const list = await loadDesignTemplates();
    await writeAllToIdb([slim, ...list].slice(0, MAX_TEMPLATES));
    // Ensure legacy key cannot refill quota
    clearLegacyLocal();
    return { ok: true, template: slim };
  } catch (err) {
    const msg =
      err instanceof DOMException && err.name === 'QuotaExceededError'
        ? 'האחסון מלא — נסה תבנית בלי תמונות כבדות, או מחק תבניות ישנות'
        : err instanceof Error
          ? err.message
          : 'שמירת התבנית נכשלה';
    return { ok: false, error: msg };
  }
}

export async function deleteDesignTemplate(id: string): Promise<void> {
  await migrateLegacyIfNeeded();
  const list = (await loadDesignTemplates()).filter((t) => t.id !== id);
  await writeAllToIdb(list);
  clearLegacyLocal();
}

export async function getDesignTemplate(id: string): Promise<SavedDesignTemplate | undefined> {
  const list = await loadDesignTemplates();
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
