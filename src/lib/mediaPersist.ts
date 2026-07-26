import type { CanvasLayoutConfig, CustomFont, GalleryItem, SynagogueConfig } from '../types';
import { getMediaBlob, putMediaBlob } from './mediaDb';
import { uploadDataUrlToCloud } from './media';

export const IDB_MEDIA_PREFIX = 'idb-media:';

/** Only inline large payloads; keep http(s) and already-compact refs as-is */
const DATA_URL_MIN_COMPACT = 8_000;

export function isIdbMediaRef(url: string | undefined | null): boolean {
  return Boolean(url && url.startsWith(IDB_MEDIA_PREFIX));
}

export function isCloudMediaUrl(url: string | undefined | null): boolean {
  return Boolean(
    url &&
      (url.startsWith('/api/cloud/media/') ||
        url.startsWith('https://') ||
        url.startsWith('http://')),
  );
}

export function isHeavyDataUrl(url: string | undefined | null): boolean {
  return Boolean(url && url.startsWith('data:') && url.length >= DATA_URL_MIN_COMPACT);
}

function newMediaIdFor(dataUrl: string): string {
  // Stable id so re-saving the same image does not duplicate IndexedDB blobs
  let h = dataUrl.length;
  const step = Math.max(1, Math.floor(dataUrl.length / 250));
  for (let i = 0; i < dataUrl.length; i += step) {
    h = (Math.imul(h, 31) + dataUrl.charCodeAt(i)) | 0;
  }
  return `m-${dataUrl.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

/**
 * Prefer durable cloud URL so every display can load the file.
 * Falls back to IndexedDB ref when offline / upload fails.
 */
export async function compactMediaUrl(
  url: string | undefined | null,
  synagogueId?: string,
): Promise<string> {
  if (!url) return '';
  if (isCloudMediaUrl(url)) return url;

  let dataUrl = url;
  if (isIdbMediaRef(url)) {
    dataUrl = (await expandMediaUrl(url)) || '';
    if (!dataUrl) return url; // blob missing on this device
  }

  if (isHeavyDataUrl(dataUrl) && synagogueId && navigator.onLine) {
    const cloudUrl = await uploadDataUrlToCloud(synagogueId, dataUrl);
    if (cloudUrl) return cloudUrl;
  }

  if (isHeavyDataUrl(dataUrl)) {
    const id = newMediaIdFor(dataUrl);
    await putMediaBlob(id, dataUrl);
    return `${IDB_MEDIA_PREFIX}${id}`;
  }
  return dataUrl;
}

export async function expandMediaUrl(url: string | undefined | null): Promise<string> {
  if (!url) return '';
  if (!isIdbMediaRef(url)) return url;
  const id = url.slice(IDB_MEDIA_PREFIX.length);
  return (await getMediaBlob(id)) ?? '';
}

async function compactGallery(
  gallery: GalleryItem[],
  synagogueId?: string,
): Promise<GalleryItem[]> {
  const next: GalleryItem[] = [];
  for (const item of gallery ?? []) {
    next.push({ ...item, url: await compactMediaUrl(item.url, synagogueId) });
  }
  return next;
}

async function expandGallery(gallery: GalleryItem[]): Promise<GalleryItem[]> {
  const next: GalleryItem[] = [];
  for (const item of gallery ?? []) {
    next.push({ ...item, url: await expandMediaUrl(item.url) });
  }
  return next;
}

async function compactCustomFonts(
  fonts: CustomFont[] | undefined,
  synagogueId?: string,
): Promise<CustomFont[]> {
  const next: CustomFont[] = [];
  for (const font of fonts ?? []) {
    next.push({ ...font, url: await compactMediaUrl(font.url, synagogueId) });
  }
  return next;
}

async function expandCustomFonts(fonts: CustomFont[] | undefined): Promise<CustomFont[]> {
  const next: CustomFont[] = [];
  for (const font of fonts ?? []) {
    next.push({ ...font, url: await expandMediaUrl(font.url) });
  }
  return next;
}

async function compactCanvas(
  canvas: CanvasLayoutConfig,
  synagogueId?: string,
): Promise<CanvasLayoutConfig> {
  return {
    ...canvas,
    backgroundUrl: await compactMediaUrl(canvas.backgroundUrl, synagogueId),
    widgets: await Promise.all(
      (canvas.widgets ?? []).map(async (w) => ({
        ...w,
        imageUrl: w.imageUrl
          ? await compactMediaUrl(w.imageUrl, synagogueId)
          : w.imageUrl,
      })),
    ),
  };
}

async function expandCanvas(canvas: CanvasLayoutConfig): Promise<CanvasLayoutConfig> {
  return {
    ...canvas,
    backgroundUrl: await expandMediaUrl(canvas.backgroundUrl),
    widgets: await Promise.all(
      (canvas.widgets ?? []).map(async (w) => ({
        ...w,
        imageUrl: w.imageUrl ? await expandMediaUrl(w.imageUrl) : w.imageUrl,
      })),
    ),
  };
}

/** Move heavy data URLs into cloud (preferred) or IndexedDB; config keeps short refs */
export async function compactConfigMedia(config: SynagogueConfig): Promise<SynagogueConfig> {
  const media = config.media ?? { gallery: [] };
  const id = config.id;

  return {
    ...config,
    media: {
      ...media,
      logoDataUrl: await compactMediaUrl(media.logoDataUrl, id),
      backgroundDataUrl: await compactMediaUrl(media.backgroundDataUrl, id),
      eventImageUrl: await compactMediaUrl(media.eventImageUrl, id),
      loopVideoUrl: await compactMediaUrl(media.loopVideoUrl, id),
      gallery: await compactGallery(media.gallery ?? [], id),
      customFonts: await compactCustomFonts(media.customFonts, id),
    },
    canvas: await compactCanvas(config.canvas, id),
    design: {
      ...config.design,
      logoUrl: await compactMediaUrl(config.design?.logoUrl, id),
      backgroundImageUrl: await compactMediaUrl(config.design?.backgroundImageUrl, id),
    },
    branding: config.branding
      ? {
          ...config.branding,
          logoUrl: await compactMediaUrl(config.branding.logoUrl, id),
        }
      : config.branding,
  };
}

/** Resolve idb-media refs back to data URLs for editing / display in memory */
export async function expandConfigMedia(config: SynagogueConfig): Promise<SynagogueConfig> {
  const media = config.media ?? { gallery: [] };
  return {
    ...config,
    media: {
      ...media,
      logoDataUrl: await expandMediaUrl(media.logoDataUrl),
      backgroundDataUrl: await expandMediaUrl(media.backgroundDataUrl),
      eventImageUrl: await expandMediaUrl(media.eventImageUrl),
      loopVideoUrl: await expandMediaUrl(media.loopVideoUrl),
      gallery: await expandGallery(media.gallery ?? []),
      customFonts: await expandCustomFonts(media.customFonts),
    },
    canvas: await expandCanvas(config.canvas),
    design: {
      ...config.design,
      logoUrl: await expandMediaUrl(config.design?.logoUrl),
      backgroundImageUrl: await expandMediaUrl(config.design?.backgroundImageUrl),
    },
    branding: config.branding
      ? {
          ...config.branding,
          logoUrl: await expandMediaUrl(config.branding.logoUrl),
        }
      : config.branding,
  };
}
