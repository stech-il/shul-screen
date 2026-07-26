export interface DiskFileItem {
  id: string;
  kind: string;
  synagogueId: string;
  name: string;
  relative: string;
  bytes: number;
  mtime: string;
  protected?: boolean;
  url?: string | null;
}

export interface DiskFileGroup {
  kind: string;
  label: string;
  synagogueId: string;
  bytes: number;
  files: DiskFileItem[];
}

export interface DiskInventory {
  root: string;
  dataDirSet: boolean;
  totalBytes: number;
  totalFiles: number;
  groups: DiskFileGroup[];
  kinds: { kind: string; label: string }[];
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `שגיאה ${res.status}`);
  }
  return data;
}

export async function fetchDiskInventory(): Promise<DiskInventory> {
  const res = await fetch('/api/cloud/disk', { cache: 'no-store' });
  return parseJson(res);
}

export async function deleteDiskFile(relative: string): Promise<{ ok: boolean; deleted: string }> {
  const res = await fetch('/api/cloud/disk/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relative }),
  });
  return parseJson(res);
}

export async function deleteDiskFolder(
  kind: string,
  synagogueId: string,
): Promise<{ ok: boolean; removed: number; bytes: number }> {
  const res = await fetch('/api/cloud/disk/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, synagogueId }),
  });
  return parseJson(res);
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
