/** Client helpers for synagogue backups on the Render disk. */

export interface BackupItem {
  id: string;
  fileName: string;
  createdAt: string;
  reason: string;
  revision: number | null;
  name: string;
  hasBilling: boolean;
  bytes: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body?.error || `שגיאת שרת ${res.status}`);
  }
  return body;
}

export function listBackups(synagogueId: string): Promise<{
  synagogueId: string;
  retentionDays: number;
  items: BackupItem[];
}> {
  return api(`/api/cloud/backups/${encodeURIComponent(synagogueId)}`);
}

export function createBackupNow(synagogueId: string): Promise<{
  ok: boolean;
  id?: string;
  createdAt?: string;
  items: BackupItem[];
}> {
  return api(`/api/cloud/backups/${encodeURIComponent(synagogueId)}`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'manual' }),
  });
}

export function restoreBackup(
  synagogueId: string,
  backupId: string,
): Promise<{ ok: boolean; restoredAt: string; from: string }> {
  return api(`/api/cloud/backups/${encodeURIComponent(synagogueId)}/restore`, {
    method: 'POST',
    body: JSON.stringify({ backupId }),
  });
}

export function formatBackupDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function backupReasonLabel(reason: string): string {
  switch (reason) {
    case 'manual':
      return 'ידני';
    case 'daily':
      return 'יומי';
    case 'auto':
      return 'אוטומטי';
    case 'pre-restore':
      return 'לפני שחזור';
    default:
      return reason;
  }
}
