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

function readLegacyLocal(): SavedDesignTemplate[] {
  try {
    const raw = localStorage.getItem(LEGACY_DESIGN_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDesignTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let migratePromise: Promise<void> | null = null;

async function migrateLegacyIfNeeded(): Promise<void> {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    // Always free the legacy key first so quota is available for other keys.
    const legacy = readLegacyLocal();
    purgeLegacyDesignTemplateStorage();
    if (!legacy.length) return;
    const existing = await readAllFromIdb();
    if (existing.length) return;
    try {
      const slimmed = await Promise.all(legacy.slice(0, MAX_TEMPLATES).map((t) => slimTemplate(t)));
      await writeAllToIdb(slimmed);
    } catch {
      /* drop unreadable legacy templates rather than crash */
    }
  })();
  return migratePromise;
}

export async function loadDesignTemplates(): Promise<SavedDesignTemplate[]> {
  purgeLegacyDesignTemplateStorage();
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
  purgeLegacyDesignTemplateStorage();
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
    purgeLegacyDesignTemplateStorage();
    return { ok: true, template: slim };
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

export async function deleteDesignTemplate(id: string): Promise<void> {
  purgeLegacyDesignTemplateStorage();
  await migrateLegacyIfNeeded();
  const list = (await loadDesignTemplates()).filter((t) => t.id !== id);
  await writeAllToIdb(list);
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
