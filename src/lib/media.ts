/** Media helpers — prefer Supabase Storage when configured, else local data URL */

import { getSupabase, isSupabaseConfigured } from './supabase';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const LOCAL_IMAGE_MAX_EDGE = 1920;
const LOCAL_IMAGE_QUALITY = 0.82;
export const MEDIA_BUCKET = 'shul-media';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type MediaKind = 'image' | 'video';
export type UploadProgressFn = (percent: number, label?: string) => void;

export interface UploadMediaResult {
  url: string;
  /** true when file lives on Supabase Storage */
  remote: boolean;
  warning?: string;
}

function maxBytes(kind: MediaKind): number {
  return kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

function assertSize(file: File, kind: MediaKind): void {
  const max = maxBytes(kind);
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    throw new Error(
      kind === 'video' ? `הסרטון גדול מדי (עד ${mb}MB)` : `התמונה גדולה מדי (עד ${mb}MB)`,
    );
  }
}

function safeName(name: string): string {
  const cleaned = name
    .replace(/[^\w.\u0590-\u05FF-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return cleaned || 'file';
}

function report(onProgress: UploadProgressFn | undefined, pct: number, label?: string) {
  onProgress?.(Math.max(0, Math.min(100, Math.round(pct))), label);
}

export function readFileAsDataUrl(
  file: File,
  kind: MediaKind = 'image',
  onProgress?: UploadProgressFn,
): Promise<string> {
  assertSize(file, kind);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        report(onProgress, (e.loaded / e.total) * 90, 'קורא קובץ...');
      }
    };
    reader.onload = () => {
      report(onProgress, 100, 'הושלם');
      resolve(String(reader.result));
    };
    reader.onerror = () => reject(new Error('קריאת קובץ נכשלה'));
    reader.readAsDataURL(file);
  });
}

/** Compress image for localStorage-friendly data URLs */
export async function fileToOptimizedDataUrl(
  file: File,
  onProgress?: UploadProgressFn,
): Promise<string> {
  assertSize(file, 'image');
  report(onProgress, 5, 'מכין תמונה...');
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return readFileAsDataUrl(file, 'image', onProgress);
  }

  try {
    report(onProgress, 25, 'טוען תמונה...');
    const bitmap = await createImageBitmap(file);
    try {
      report(onProgress, 55, 'דוחס תמונה...');
      const scale = Math.min(1, LOCAL_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return readFileAsDataUrl(file, 'image', onProgress);
      ctx.drawImage(bitmap, 0, 0, w, h);
      report(onProgress, 85, 'שומר תמונה...');
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const url = canvas.toDataURL(mime, LOCAL_IMAGE_QUALITY);
      report(onProgress, 100, 'הושלם');
      return url;
    } finally {
      bitmap.close();
    }
  } catch {
    return readFileAsDataUrl(file, 'image', onProgress);
  }
}

function uploadToSupabaseWithProgress(
  path: string,
  file: File,
  contentType: string,
  onProgress?: UploadProgressFn,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return Promise.reject(new Error('Supabase לא מוגדר'));
  }

  const encodedPath = path
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/');
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${MEDIA_BUCKET}/${encodedPath}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('cache-control', '3600');
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        report(onProgress, (e.loaded / e.total) * 100, 'מעלה לשרת...');
      } else {
        report(onProgress, 30, 'מעלה לשרת...');
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        report(onProgress, 100, 'הועלה לשרת');
        resolve();
        return;
      }
      let message = `שגיאת שרת ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message || body.error || message;
      } catch {
        if (xhr.responseText) message = xhr.responseText.slice(0, 160);
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('שגיאת רשת בהעלאה'));
    xhr.onabort = () => reject(new Error('ההעלאה בוטלה'));
    report(onProgress, 1, 'מתחיל העלאה...');
    xhr.send(file);
  });
}

/**
 * Upload media to Supabase Storage when configured.
 * Otherwise uploads to the app's durable cloud media API (/api/cloud/media)
 * so every display screen can load the same file.
 * Falls back to compressed data URL only when cloud is unavailable.
 */
export async function uploadMedia(
  synagogueId: string,
  file: File,
  kind: MediaKind = 'image',
  folder = 'uploads',
  onProgress?: UploadProgressFn,
): Promise<UploadMediaResult> {
  if (!file || file.size === 0) {
    throw new Error('הקובץ ריק או לא נבחר');
  }
  assertSize(file, kind);
  report(onProgress, 0, 'מתחיל...');

  const sb = getSupabase();
  if (sb && isSupabaseConfigured && navigator.onLine) {
    const ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'file';
    const path = `${synagogueId}/${folder}/${Date.now()}-${base}.${ext}`;
    const contentType = file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');

    try {
      await uploadToSupabaseWithProgress(path, file, contentType, onProgress);
      const { data } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      if (!data?.publicUrl) {
        throw new Error('לא התקבל קישור ציבורי לקובץ');
      }
      return { url: data.publicUrl, remote: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'העלאה נכשלה';
      // Fall through to server cloud media
      report(onProgress, 40, `Supabase נכשל — מעלה לענן המערכת...`);
      try {
        return await uploadToServerCloud(synagogueId, file, kind, folder, onProgress, message);
      } catch {
        const url =
          kind === 'image'
            ? await fileToOptimizedDataUrl(file, (p, l) =>
                report(onProgress, 50 + p / 2, l ?? 'שומר מקומית...'),
              )
            : await readFileAsDataUrl(file, kind, (p, l) =>
                report(onProgress, 50 + p / 2, l ?? 'שומר מקומית...'),
              );
        return {
          url,
          remote: false,
          warning: `העלאה לשרת נכשלה (${message}). נשמר מקומית — לחץ שמור מהמחשב הזה.`,
        };
      }
    }
  }

  if (navigator.onLine) {
    try {
      return await uploadToServerCloud(synagogueId, file, kind, folder, onProgress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'העלאה נכשלה';
      report(onProgress, 50, 'שומר מקומית...');
      const url =
        kind === 'image'
          ? await fileToOptimizedDataUrl(file, (p, l) =>
              report(onProgress, 50 + p / 2, l ?? 'שומר מקומית...'),
            )
          : await readFileAsDataUrl(file, kind, (p, l) =>
              report(onProgress, 50 + p / 2, l ?? 'שומר מקומית...'),
            );
      return {
        url,
        remote: false,
        warning: `העלאה לענן נכשלה (${message}). נשמר מקומית במכשיר זה בלבד.`,
      };
    }
  }

  const url =
    kind === 'image'
      ? await fileToOptimizedDataUrl(file, onProgress)
      : await readFileAsDataUrl(file, kind, onProgress);
  return {
    url,
    remote: false,
    warning: 'אין אינטרנט — נשמר מקומית במכשיר זה בלבד. לחץ שמור כשיש רשת.',
  };
}

async function uploadToServerCloud(
  synagogueId: string,
  file: File,
  kind: MediaKind,
  folder: string,
  onProgress?: UploadProgressFn,
  priorWarning?: string,
): Promise<UploadMediaResult> {
  report(onProgress, 10, 'מכין קובץ...');
  // Compress images before upload to keep cloud payloads small
  let blob: Blob = file;
  let contentType = file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  let ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();

  if (kind === 'image' && file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    const dataUrl = await fileToOptimizedDataUrl(file, (p, l) =>
      report(onProgress, 10 + p * 0.35, l ?? 'דוחס...'),
    );
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1);
    contentType = meta.includes('image/png') ? 'image/png' : 'image/jpeg';
    ext = contentType === 'image/png' ? 'png' : 'jpg';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: contentType });
  }

  report(onProgress, 55, 'מעלה לענן...');
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const dataBase64 = btoa(binary);

  const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'file';
  const fileName = `${folder}-${Date.now()}-${base}.${ext}`;

  const res = await fetch(`/api/cloud/media/${encodeURIComponent(synagogueId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, dataBase64 }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !body.url) {
    throw new Error(body.error || `שגיאת שרת ${res.status}`);
  }
  report(onProgress, 100, 'הועלה לענן');
  return {
    url: body.url,
    remote: true,
    warning: priorWarning
      ? `נשמר בענן המערכת (Supabase: ${priorWarning})`
      : undefined,
  };
}

/** Upload a data URL / blob already in memory to durable cloud media. */
export async function uploadDataUrlToCloud(
  synagogueId: string,
  dataUrl: string,
  fileNameHint = 'image.jpg',
): Promise<string | null> {
  if (!dataUrl.startsWith('data:') || !navigator.onLine) return null;
  try {
    let payload = dataUrl;
    // Re-compress large images so the POST fits Render body limits
    if (payload.startsWith('data:image/') && payload.length > 400_000) {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('image load failed'));
          el.src = payload;
        });
        const scale = Math.min(1, LOCAL_IMAGE_MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          payload = canvas.toDataURL('image/jpeg', LOCAL_IMAGE_QUALITY);
        }
      } catch {
        /* keep original */
      }
    }

    const comma = payload.indexOf(',');
    if (comma < 0) return null;
    const meta = payload.slice(0, comma);
    const b64 = payload.slice(comma + 1);
    const contentType = /data:([^;]+)/.exec(meta)?.[1] || 'application/octet-stream';
    const ext =
      contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : contentType.startsWith('video/')
            ? 'mp4'
            : contentType.startsWith('font/') || contentType.includes('font')
              ? 'woff2'
              : 'jpg';
    const fileName = `migrated-${Date.now()}-${safeName(fileNameHint)}.${ext}`;
    const res = await fetch(`/api/cloud/media/${encodeURIComponent(synagogueId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, contentType, dataBase64: b64 }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      console.warn('uploadDataUrlToCloud failed', res.status, body.error);
      return null;
    }
    return body.url;
  } catch (err) {
    console.warn('uploadDataUrlToCloud error', err);
    return null;
  }
}

const MAX_FONT_BYTES = 4 * 1024 * 1024;
const FONT_MIME = new Set([
  'font/woff2',
  'font/woff',
  'font/ttf',
  'font/otf',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-otf',
  'application/octet-stream',
]);

function isAllowedFontFile(file: File): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['woff2', 'woff', 'ttf', 'otf'].includes(ext)) return true;
  return FONT_MIME.has(file.type);
}

/**
 * Upload a purchased webfont (WOFF2 / WOFF / TTF / OTF).
 * Prefers Supabase Storage; falls back to a data URL (then IndexedDB on save).
 */
export async function uploadFont(
  synagogueId: string,
  file: File,
  onProgress?: UploadProgressFn,
): Promise<UploadMediaResult> {
  if (!file || file.size === 0) {
    throw new Error('הקובץ ריק או לא נבחר');
  }
  if (!isAllowedFontFile(file)) {
    throw new Error('סוג קובץ לא נתמך — העלה WOFF2, WOFF, TTF או OTF');
  }
  if (file.size > MAX_FONT_BYTES) {
    throw new Error('קובץ הפונט גדול מדי (עד 4MB)');
  }
  report(onProgress, 0, 'מתחיל...');

  const sb = getSupabase();
  if (sb && isSupabaseConfigured && navigator.onLine) {
    const ext = (file.name.split('.').pop() || 'woff2').toLowerCase();
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'font';
    const path = `${synagogueId}/fonts/${Date.now()}-${base}.${ext}`;
    const contentType =
      file.type && file.type !== 'application/octet-stream'
        ? file.type
        : ext === 'woff2'
          ? 'font/woff2'
          : ext === 'woff'
            ? 'font/woff'
            : ext === 'otf'
              ? 'font/otf'
              : 'font/ttf';

    try {
      await uploadToSupabaseWithProgress(path, file, contentType, onProgress);
      const { data } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      if (!data?.publicUrl) {
        throw new Error('לא התקבל קישור ציבורי לקובץ');
      }
      return { url: data.publicUrl, remote: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'העלאה נכשלה';
      try {
        return await uploadToServerCloud(synagogueId, file, 'image', 'fonts', onProgress, message);
      } catch {
        /* fall through to local */
      }
      report(onProgress, 50, 'שומר מקומית...');
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('קריאת קובץ נכשלה'));
        reader.readAsDataURL(file);
      });
      report(onProgress, 100, 'הושלם');
      return {
        url,
        remote: false,
        warning: `העלאה לשרת נכשלה (${message}). נשמר מקומית — לחץ שמור.`,
      };
    }
  }

  if (navigator.onLine) {
    try {
      return await uploadToServerCloud(synagogueId, file, 'image', 'fonts', onProgress);
    } catch {
      /* local fallback */
    }
  }

  report(onProgress, 20, 'קורא פונט...');
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        report(onProgress, 20 + (e.loaded / e.total) * 75, 'קורא פונט...');
      }
    };
    reader.onload = () => {
      report(onProgress, 100, 'הושלם');
      resolve(String(reader.result));
    };
    reader.onerror = () => reject(new Error('קריאת קובץ נכשלה'));
    reader.readAsDataURL(file);
  });
  return {
    url,
    remote: false,
    warning: 'הפונט נשמר מקומית במכשיר. לחץ שמור כשיש רשת כדי שיעלה לענן.',
  };
}
