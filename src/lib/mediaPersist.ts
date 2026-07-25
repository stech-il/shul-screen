import type { CanvasLayoutConfig, CustomFont, GalleryItem, SynagogueConfig } from '../types';
import { getMediaBlob, putMediaBlob } from './mediaDb';

export const IDB_MEDIA_PREFIX = 'idb-media:';

/** Only inline large payloads; keep http(s) and already-compact refs as-is */
const DATA_URL_MIN_COMPACT = 8_000;

export function isIdbMediaRef(url: string | undefined | null): boolean {
  return Boolean(url && url.startsWith(IDB_MEDIA_PREFIX));
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

export async function compactMediaUrl(url: string | undefined | null): Promise<string> {
  if (!url) return '';
  if (isIdbMediaRef(url) || !isHeavyDataUrl(url)) return url;
  const id = newMediaIdFor(url);
  await putMediaBlob(id, url);
  return `${IDB_MEDIA_PREFIX}${id}`;
}

export async function expandMediaUrl(url: string | undefined | null): Promise<string> {
  if (!url) return '';
  if (!isIdbMediaRef(url)) return url;
  const id = url.slice(IDB_MEDIA_PREFIX.length);
  return (await getMediaBlob(id)) ?? '';
}

async function compactGallery(gallery: GalleryItem[]): Promise<GalleryItem[]> {
  const next: GalleryItem[] = [];
  for (const item of gallery ?? []) {
    next.push({ ...item, url: await compactMediaUrl(item.url) });
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

async function compactCustomFonts(fonts: CustomFont[] | undefined): Promise<CustomFont[]> {
  const next: CustomFont[] = [];
  for (const font of fonts ?? []) {
    next.push({ ...font, url: await compactMediaUrl(font.url) });
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

async function compactCanvas(canvas: CanvasLayoutConfig): Promise<CanvasLayoutConfig> {
  return {
    ...canvas,
    backgroundUrl: await compactMediaUrl(canvas.backgroundUrl),
    widgets: await Promise.all(
      (canvas.widgets ?? []).map(async (w) => ({
        ...w,
        imageUrl: w.imageUrl ? await compactMediaUrl(w.imageUrl) : w.imageUrl,
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

/** Move heavy data URLs into IndexedDB; config keeps short refs for localStorage */
export async function compactConfigMedia(config: SynagogueConfig): Promise<SynagogueConfig> {
  const media = config.media ?? { gallery: [] };
  return {
    ...config,
    media: {
      ...media,
      logoDataUrl: await compactMediaUrl(media.logoDataUrl),
      backgroundDataUrl: await compactMediaUrl(media.backgroundDataUrl),
      eventImageUrl: await compactMediaUrl(media.eventImageUrl),
      loopVideoUrl: await compactMediaUrl(media.loopVideoUrl),
      gallery: await compactGallery(media.gallery ?? []),
      customFonts: await compactCustomFonts(media.customFonts),
    },
    canvas: await compactCanvas(config.canvas),
    design: {
      ...config.design,
      logoUrl: await compactMediaUrl(config.design?.logoUrl),
      backgroundImageUrl: await compactMediaUrl(config.design?.backgroundImageUrl),
    },
    branding: config.branding
      ? {
          ...config.branding,
          logoUrl: await compactMediaUrl(config.branding.logoUrl),
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
