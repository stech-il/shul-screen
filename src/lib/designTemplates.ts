import type {
  CanvasLayoutConfig,
  DesignSettings,
  SavedDesignTemplate,
  ScreenLayout,
  SynagogueConfig,
} from '../types';

const STORAGE_KEY = 'shul-screen:design-templates';

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

export function loadDesignTemplates(): SavedDesignTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDesignTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(list: SavedDesignTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function saveDesignTemplate(input: {
  name: string;
  description?: string;
  theme: SynagogueConfig['theme'];
  layout: ScreenLayout;
  design: DesignSettings;
  canvas: CanvasLayoutConfig;
}): SavedDesignTemplate {
  const name = input.name.trim() || 'תבנית ללא שם';
  const template: SavedDesignTemplate = {
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
  const list = loadDesignTemplates();
  saveAll([template, ...list].slice(0, 40));
  return template;
}

export function deleteDesignTemplate(id: string): void {
  saveAll(loadDesignTemplates().filter((t) => t.id !== id));
}

export function getDesignTemplate(id: string): SavedDesignTemplate | undefined {
  return loadDesignTemplates().find((t) => t.id === id);
}

/** Apply a saved template onto the current synagogue config. */
export function applyDesignTemplate(
  template: SavedDesignTemplate,
): Pick<SynagogueConfig, 'theme' | 'layout' | 'design' | 'canvas'> {
  return {
    theme: template.theme,
    layout: template.layout,
    design: {
      ...clone(template.design),
      presetId: template.design.presetId || `custom:${template.id}`,
    },
    canvas: clone(template.canvas),
  };
}
