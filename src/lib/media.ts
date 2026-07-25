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
 * Falls back to compressed data URL for offline / no-cloud mode.
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
        warning: `העלאה לשרת נכשלה (${message}). נשמר מקומית — צור bucket ציבורי בשם ${MEDIA_BUCKET} ולחץ שמור.`,
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
    warning: isSupabaseConfigured
      ? 'אין אינטרנט — נשמר מקומית בגלריה. לחץ שמור.'
      : 'Supabase לא מוגדר (.env.local) — נשמר בגלריה מקומית. לחץ שמור.',
  };
}
