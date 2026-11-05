import type { CanvasWidgetType } from '../types';
import type { CanvasData } from '../components/canvas/CanvasWidgetContent';

/** Widget types that can appear inside a rotating canvas slot. */
export const ROTATOR_CHOICES: CanvasWidgetType[] = [
  'clock',
  'hebrewDate',
  'parasha',
  'dafYomi',
  'dafYerushalmi',
  'weather',
  'zmanim',
  'announcements',
  'yahrzeit',
  'calendar',
  'roshChodesh',
  'shabbatMevarchim',
  'molad',
  'specialShabbat',
  'countdown',
  'omer',
  'itimMoon',
  'itimHalachot',
  'itimEvents',
  'itimLimud',
  'itimHaftara',
];

export const DEFAULT_ROTATOR_TYPES: CanvasWidgetType[] = [
  'dafYomi',
  'dafYerushalmi',
  'parasha',
  'itimHaftara',
];

/** Dedicated daf rotator: Bavli ↔ Yerushalmi only */
export const DAF_ROTATOR_TYPES: CanvasWidgetType[] = ['dafYomi', 'dafYerushalmi'];

const ALLOWED = new Set<CanvasWidgetType>(ROTATOR_CHOICES);

export function normalizeRotatorTypes(raw: unknown): CanvasWidgetType[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ROTATOR_TYPES];
  const seen = new Set<string>();
  const out: CanvasWidgetType[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !ALLOWED.has(item as CanvasWidgetType) || seen.has(item)) continue;
    seen.add(item);
    out.push(item as CanvasWidgetType);
  }
  return out;
}

export function normalizeRotatorSeconds(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 8;
  return Math.min(60, Math.max(3, Math.round(n)));
}

/** Missing keys default to showing a title. */
export function rotatorItemShowsTitle(
  map: Partial<Record<CanvasWidgetType, boolean>> | undefined,
  type: CanvasWidgetType,
): boolean {
  return map?.[type] !== false;
}

export function normalizeRotatorShowTitles(
  raw: unknown,
): Partial<Record<CanvasWidgetType, boolean>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Partial<Record<CanvasWidgetType, boolean>> = {};
  let any = false;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED.has(key as CanvasWidgetType) || typeof value !== 'boolean') continue;
    out[key as CanvasWidgetType] = value;
    any = true;
  }
  return any ? out : undefined;
}

export function normalizeRotatorEventsScroll(raw: unknown): boolean {
  return raw === true;
}

export function widgetTypeHasContent(type: CanvasWidgetType, data: CanvasData): boolean {
  const day = data.day;
  switch (type) {
    case 'rotator':
      return false;
    case 'dafRotator':
      return DAF_ROTATOR_TYPES.some((t) => widgetTypeHasContent(t, data));
    case 'logo':
      return Boolean(data.logoSrc);
    case 'parasha':
      return Boolean(day.parasha);
    case 'dafYomi':
      return Boolean(day.dafYomi);
    case 'dafYerushalmi':
      return Boolean(day.dafYerushalmi);
    case 'weather':
      return data.weatherTemp != null;
    case 'zmanim':
      return data.zmanim.length > 0;
    case 'block':
      return data.blocks.some((b) => b.items.length);
    case 'announcements':
      return Boolean(data.announcement);
    case 'yahrzeit':
      return Boolean(day.yahrzeitNames?.length);
    case 'calendar':
      return Boolean((day.holidays?.length ?? 0) + (day.memorials?.length ?? 0));
    case 'roshChodesh':
      return Boolean(day.roshChodesh?.length);
    case 'shabbatMevarchim':
      return Boolean(day.shabbatMevarchim?.length);
    case 'molad':
      return Boolean(day.molad?.length);
    case 'specialShabbat':
      return Boolean(day.specialShabbat?.length);
    case 'omer':
      return Boolean(day.omer);
    case 'countdown':
      return Boolean(data.candleBoard);
    case 'itimMoon':
      return Boolean(data.itim?.moon?.length);
    case 'itimHalachot':
      return Boolean(data.itim?.halachot?.length);
    case 'itimEvents':
      return Boolean(data.itim?.events?.length);
    case 'itimLimud':
      return Boolean(data.itim?.limud?.length);
    case 'itimHaftara':
      return Boolean(data.itim?.haftara?.length);
    default:
      return true;
  }
}

export function rotatorHasContent(types: CanvasWidgetType[], data: CanvasData): boolean {
  return types.some((type) => widgetTypeHasContent(type, data));
}
