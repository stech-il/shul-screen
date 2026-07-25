import type { GalleryItem } from '../types';

export function createGalleryItem(
  url: string,
  kind: 'image' | 'video',
  name?: string,
): GalleryItem {
  return {
    id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    url,
    name: name?.trim() || (kind === 'video' ? 'סרטון' : 'תמונה'),
    kind,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeGallery(raw: unknown): GalleryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (typeof item === 'string') {
        if (!item) return null;
        const kind: 'image' | 'video' =
          item.startsWith('data:video') || /\.(mp4|webm|mov)(\?|$)/i.test(item)
            ? 'video'
            : 'image';
        return {
          id: `g-legacy-${i}`,
          url: item,
          name: kind === 'video' ? `סרטון ${i + 1}` : `תמונה ${i + 1}`,
          kind,
          createdAt: new Date(0).toISOString(),
        } satisfies GalleryItem;
      }
      if (item && typeof item === 'object' && 'url' in item) {
        const row = item as Partial<GalleryItem>;
        if (!row.url) return null;
        return {
          id: row.id || `g-${i}`,
          url: row.url,
          name: row.name || 'מדיה',
          kind: row.kind === 'video' ? 'video' : 'image',
          createdAt: row.createdAt || new Date(0).toISOString(),
        } satisfies GalleryItem;
      }
      return null;
    })
    .filter((x): x is GalleryItem => Boolean(x));
}

/** Add url to gallery if missing; returns updated list */
export function upsertGallery(
  gallery: GalleryItem[],
  url: string,
  kind: 'image' | 'video',
  name?: string,
): GalleryItem[] {
  if (!url) return gallery;
  if (gallery.some((g) => g.url === url)) return gallery;
  return [createGalleryItem(url, kind, name), ...gallery];
}

export function removeFromGallery(gallery: GalleryItem[], id: string): GalleryItem[] {
  return gallery.filter((g) => g.id !== id);
}

export function guessMediaKind(url: string, fallback: 'image' | 'video' = 'image'): 'image' | 'video' {
  if (!url) return fallback;
  if (url.startsWith('data:video') || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (url.startsWith('data:image') || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)) return 'image';
  return fallback;
}
