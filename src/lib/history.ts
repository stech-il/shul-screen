import type { HistoryEntry, SynagogueConfig } from '../types';

const PREFIX = 'shul-screen:history:';
const MAX = 40;

function key(id: string) {
  return `${PREFIX}${id}`;
}

export function loadHistory(synagogueId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(key(synagogueId));
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function pushHistory(
  config: SynagogueConfig,
  by: string,
  summary: string,
): void {
  const list = loadHistory(config.id);
  // Avoid storing huge data URLs in history — keep refs / short urls only
  const slim = JSON.parse(JSON.stringify(config)) as SynagogueConfig;
  const entry: HistoryEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    by,
    revision: config.revision,
    summary,
    config: slim,
  };
  const next = [entry, ...list].slice(0, MAX);
  try {
    localStorage.setItem(key(config.id), JSON.stringify(next));
  } catch {
    // Quota — keep fewer entries
    try {
      localStorage.setItem(key(config.id), JSON.stringify(next.slice(0, 8)));
    } catch {
      localStorage.removeItem(key(config.id));
    }
  }
}

export function clearHistory(synagogueId: string): void {
  localStorage.removeItem(key(synagogueId));
}

export function getHistoryEntry(synagogueId: string, entryId: string): HistoryEntry | null {
  return loadHistory(synagogueId).find((e) => e.id === entryId) ?? null;
}
