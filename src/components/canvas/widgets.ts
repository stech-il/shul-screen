import type {
  CanvasLayoutConfig,
  CanvasWidget,
  CanvasWidgetType,
  MemorialBoardTheme,
  ZmanKey,
} from '../../types';
import { ZMAN_DEFS } from '../../data/zmanim';
import { decodeHtmlEntities } from '../../lib/sanitizeHtml';
import {
  DEFAULT_ROTATOR_TYPES,
  normalizeRotatorEventsScroll,
  normalizeRotatorSeconds,
  normalizeRotatorShowTitles,
  normalizeRotatorTypes,
} from '../../lib/canvasRotator';

const MEMORIAL_THEMES = new Set<MemorialBoardTheme>(['wood', 'navy', 'marble', 'simple']);

function normalizeMemorialTheme(raw: unknown): MemorialBoardTheme {
  return MEMORIAL_THEMES.has(raw as MemorialBoardTheme) ? (raw as MemorialBoardTheme) : 'wood';
}

export const WIDGET_LABELS: Record<CanvasWidgetType, string> = {
  title: 'שם בית הכנסת',
  logo: 'לוגו',
  clock: 'שעון',
  hebrewDate: 'תאריך עברי',
  parasha: 'פרשת השבוע',
  dafYomi: 'הדף היומי',
  dafYerushalmi: 'הדף היומי ירושלמי',
  dafRotator: 'דף יומי מתחלף',
  weather: 'מזג אוויר',
  zmanim: 'רשימת זמנים',
  zman: 'זמן בודד',
  block: 'בלוק תפילות',
  announcements: 'הודעות',
  yahrzeit: 'יארצייט',
  memorialBoard: 'לוח הנצחה',
  calendar: 'חגים וזיכרון',
  roshChodesh: 'ראש חודש',
  shabbatMevarchim: 'שבת מברכים',
  molad: 'זמני המולד',
  specialShabbat: 'שבת מיוחדת',
  countdown: 'הדלקת נרות · כניסה ויציאה',
  omer: 'ספירת העומר',
  text: 'עורך טקסט',
  heading: 'כותרת',
  image: 'תמונה',
  video: 'וידאו',
  divider: 'מפריד',
  button: 'כפתור',
  itimMoon: 'זמני ירח',
  itimHalachot: 'הלכות השבוע',
  itimEvents: 'מאורעות היום',
  itimLimud: 'הלימוד היומי',
  itimHaftara: 'הפטרה',
  rotator: 'וידג׳ט מתחלף',
};

const SIZE_DEFAULTS: Partial<Record<CanvasWidgetType, { w: number; h: number }>> = {
  title: { w: 44, h: 12 },
  logo: { w: 12, h: 16 },
  clock: { w: 26, h: 14 },
  hebrewDate: { w: 30, h: 8 },
  parasha: { w: 24, h: 12 },
  dafYomi: { w: 24, h: 12 },
  dafYerushalmi: { w: 28, h: 12 },
  dafRotator: { w: 30, h: 16 },
  weather: { w: 16, h: 12 },
  zmanim: { w: 30, h: 55 },
  zman: { w: 18, h: 12 },
  block: { w: 32, h: 34 },
  announcements: { w: 46, h: 18 },
  yahrzeit: { w: 32, h: 22 },
  memorialBoard: { w: 48, h: 42 },
  calendar: { w: 26, h: 14 },
  roshChodesh: { w: 26, h: 12 },
  shabbatMevarchim: { w: 28, h: 12 },
  molad: { w: 36, h: 16 },
  specialShabbat: { w: 28, h: 12 },
  countdown: { w: 36, h: 22 },
  omer: { w: 38, h: 22 },
  text: { w: 36, h: 14 },
  heading: { w: 40, h: 10 },
  image: { w: 24, h: 24 },
  video: { w: 36, h: 28 },
  divider: { w: 40, h: 4 },
  button: { w: 22, h: 8 },
  itimMoon: { w: 28, h: 28 },
  itimHalachot: { w: 30, h: 32 },
  itimEvents: { w: 28, h: 28 },
  itimLimud: { w: 28, h: 32 },
  itimHaftara: { w: 28, h: 16 },
  rotator: { w: 32, h: 28 },
};

export function createWidget(
  type: CanvasWidgetType,
  z = 1,
  extras?: Partial<CanvasWidget>,
): CanvasWidget {
  const size = SIZE_DEFAULTS[type] ?? { w: 26, h: 14 };
  return {
    id: `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    x: 50 - size.w / 2,
    y: 44 - size.h / 2,
    w: size.w,
    h: size.h,
    z,
    visible: true,
    showTitle:
      type === 'zmanim' ||
      type === 'block' ||
      type === 'announcements' ||
      type === 'zman' ||
      type === 'countdown' ||
      type === 'itimMoon' ||
      type === 'itimHalachot' ||
      type === 'itimEvents' ||
      type === 'itimLimud' ||
      type === 'itimHaftara',
    titleLayout: type === 'zman' ? 'above' : 'above',
    align:
      type === 'zmanim' ||
      type === 'block' ||
      type === 'countdown' ||
      type === 'itimMoon' ||
      type === 'itimHalachot' ||
      type === 'itimEvents' ||
      type === 'itimLimud' ||
      type === 'itimHaftara'
        ? 'right'
        : 'center',
    fontScale: type === 'heading' ? 1.35 : 1,
    titleScale: 0.55,
    fontWeight: type === 'zman' || type === 'clock' || type === 'heading' || type === 'button' || type === 'countdown' ? 'bold' : 'normal',
    bg:
      type === 'text' ||
      type === 'heading' ||
      type === 'image' ||
      type === 'logo' ||
      type === 'zman' ||
      type === 'divider' ||
      type === 'video' ||
      type === 'memorialBoard' ||
      type === 'yahrzeit'
        ? 'none'
        : type === 'button'
          ? 'solid'
          : 'panel',
    showBorder:
      type !== 'zman' &&
      type !== 'text' &&
      type !== 'heading' &&
      type !== 'image' &&
      type !== 'logo' &&
      type !== 'divider' &&
      type !== 'video' &&
      type !== 'memorialBoard' &&
      type !== 'yahrzeit',
    textShadow: type === 'zman',
    opacity: 1,
    radius: type === 'zman' || type === 'divider' ? 0 : type === 'button' ? 10 : 12,
    zmanKey: type === 'zman' ? 'sunrise' : undefined,
    htmlTag: type === 'heading' ? 'h2' : undefined,
    text: type === 'heading' ? 'כותרת לדוגמה' : type === 'text' ? 'כתבו כאן טקסט…' : undefined,
    buttonLabel: type === 'button' ? 'לחצו כאן' : undefined,
    showCandles:
      type === 'countdown' || type === 'memorialBoard' || type === 'yahrzeit' ? true : undefined,
    memorialTheme: type === 'memorialBoard' || type === 'yahrzeit' ? 'wood' : undefined,
    memorialShowFeatured: type === 'memorialBoard' ? true : undefined,
    memorialShowKicker: type === 'memorialBoard' || type === 'yahrzeit' ? true : undefined,
    memorialShowTnz: type === 'memorialBoard' || type === 'yahrzeit' ? true : undefined,
    rotatorTypes: type === 'rotator' ? [...DEFAULT_ROTATOR_TYPES] : undefined,
    rotatorSeconds: type === 'rotator' || type === 'dafRotator' ? 8 : undefined,
    title:
      type === 'countdown'
        ? 'הדלקת נרות'
        : type === 'memorialBoard'
          ? 'לזכרון עולם בהיכל ה׳'
          : type === 'yahrzeit'
            ? 'יארצייט היום'
            : type === 'itimMoon'
              ? 'זמני ירח'
              : type === 'itimHalachot'
                ? 'הלכות השבוע'
                : type === 'itimEvents'
                  ? 'מאורעות היום'
                  : type === 'itimLimud'
                    ? 'הלימוד היומי'
                    : type === 'itimHaftara'
                      ? 'הפטרה'
                      : undefined,
    ...extras,
  };
}

/** Place each enabled zman as its own widget in a grid */
export function createZmanWidgets(
  keys: ZmanKey[],
  startZ = 1,
  opts?: { cols?: number; startX?: number; startY?: number; w?: number; h?: number; gap?: number },
): CanvasWidget[] {
  const cols = opts?.cols ?? 3;
  const startX = opts?.startX ?? 4;
  const startY = opts?.startY ?? 18;
  const w = opts?.w ?? 28;
  const h = opts?.h ?? 14;
  const gap = opts?.gap ?? 2;
  return keys.map((key, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const def = ZMAN_DEFS.find((d) => d.key === key);
    return createWidget('zman', startZ + i, {
      id: `w-zman-${key}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      zmanKey: key,
      title: def?.label,
      x: startX + col * (w + gap),
      y: startY + row * (h + gap),
      w,
      h,
      showTitle: true,
      titleLayout: 'above',
      align: 'center',
      bg: 'none',
      showBorder: false,
      textShadow: true,
    });
  });
}

export function defaultCanvas(): CanvasLayoutConfig {
  const widgets: CanvasWidget[] = [
    { ...createWidget('title', 3), x: 28, y: 3, w: 44, h: 12 },
    { ...createWidget('clock', 3), x: 4, y: 3, w: 22, h: 12 },
    { ...createWidget('hebrewDate', 3), x: 74, y: 4, w: 22, h: 9 },
    { ...createWidget('zmanim', 2), x: 68, y: 18, w: 28, h: 56 },
    { ...createWidget('block', 2), x: 36, y: 18, w: 30, h: 56 },
    { ...createWidget('parasha', 2), x: 4, y: 18, w: 30, h: 16 },
    { ...createWidget('dafYomi', 2), x: 4, y: 36, w: 30, h: 16 },
    { ...createWidget('announcements', 2), x: 4, y: 76, w: 92, h: 20 },
  ];
  return {
    aspect: '16:9',
    backgroundUrl: '',
    backgroundFit: 'cover',
    overlayOpacity: 0.3,
    gridSize: 1,
    widgets,
  };
}

export const ASPECT_RATIOS: Record<CanvasLayoutConfig['aspect'], number> = {
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
};

export function normalizeCanvas(input?: Partial<CanvasLayoutConfig>): CanvasLayoutConfig {
  const base = defaultCanvas();
  if (!input) return base;
  const widgets = Array.isArray(input.widgets)
    ? input.widgets.map((w, i) => normalizeWidget(w, i))
    : base.widgets;
  return {
    aspect: input.aspect ?? base.aspect,
    backgroundUrl: input.backgroundUrl ?? '',
    backgroundFit: input.backgroundFit ?? 'cover',
    overlayOpacity: input.overlayOpacity ?? base.overlayOpacity,
    gridSize: input.gridSize ?? base.gridSize,
    widgets,
  };
}

function normalizeWidget(w: Partial<CanvasWidget>, index: number): CanvasWidget {
  const fallback = createWidget((w.type as CanvasWidgetType) ?? 'text', index + 1);
  return {
    ...fallback,
    ...w,
    id: w.id ?? fallback.id,
    x: clamp(w.x ?? fallback.x, -20, 110),
    y: clamp(w.y ?? fallback.y, -20, 110),
    w: clamp(w.w ?? fallback.w, 4, 120),
    h: clamp(w.h ?? fallback.h, 3, 120),
    z: w.z ?? index + 1,
    visible: w.visible ?? true,
    showTitle: w.showTitle ?? fallback.showTitle,
    titleLayout: w.titleLayout ?? fallback.titleLayout,
    title: w.title != null ? decodeHtmlEntities(w.title) : w.title,
    text: w.text != null ? decodeHtmlEntities(w.text) : w.text,
    linkUrl: w.linkUrl,
    videoUrl: w.videoUrl,
    buttonLabel: w.buttonLabel,
    htmlTag: w.htmlTag,
    align: w.align ?? fallback.align,
    fontScale: w.fontScale ?? 1,
    fontSizePx:
      typeof w.fontSizePx === 'number' && w.fontSizePx > 0 ? w.fontSizePx : undefined,
    letterSpacingPx:
      typeof w.letterSpacingPx === 'number' ? w.letterSpacingPx : undefined,
    titleSizePx:
      typeof w.titleSizePx === 'number' && w.titleSizePx > 0 ? w.titleSizePx : undefined,
    lineHeightPx:
      typeof w.lineHeightPx === 'number' && w.lineHeightPx > 0 ? w.lineHeightPx : undefined,
    paddingPx:
      typeof w.paddingPx === 'number' && w.paddingPx >= 0 ? w.paddingPx : undefined,
    titleScale: w.titleScale ?? fallback.titleScale,
    fontWeight: w.fontWeight ?? fallback.fontWeight,
    bg: w.bg ?? fallback.bg,
    showBorder: w.showBorder ?? (w.bg === 'none' || w.bg === 'ghost' ? false : fallback.showBorder),
    textShadow: w.textShadow ?? fallback.textShadow,
    opacity: w.opacity ?? 1,
    radius: w.radius ?? fallback.radius,
    showCandles:
      w.type === 'countdown' ||
      w.type === 'memorialBoard' ||
      w.type === 'yahrzeit' ||
      fallback.type === 'countdown' ||
      fallback.type === 'memorialBoard' ||
      fallback.type === 'yahrzeit'
        ? w.showCandles ?? fallback.showCandles ?? true
        : w.showCandles,
    memorialTheme:
      w.type === 'memorialBoard' ||
      w.type === 'yahrzeit' ||
      fallback.type === 'memorialBoard' ||
      fallback.type === 'yahrzeit'
        ? normalizeMemorialTheme(w.memorialTheme ?? fallback.memorialTheme)
        : undefined,
    memorialShowFeatured:
      w.type === 'memorialBoard' || fallback.type === 'memorialBoard'
        ? w.memorialShowFeatured ?? fallback.memorialShowFeatured ?? true
        : undefined,
    memorialShowKicker:
      w.type === 'memorialBoard' ||
      w.type === 'yahrzeit' ||
      fallback.type === 'memorialBoard' ||
      fallback.type === 'yahrzeit'
        ? w.memorialShowKicker ?? fallback.memorialShowKicker ?? true
        : undefined,
    memorialShowTnz:
      w.type === 'memorialBoard' ||
      w.type === 'yahrzeit' ||
      fallback.type === 'memorialBoard' ||
      fallback.type === 'yahrzeit'
        ? w.memorialShowTnz ?? fallback.memorialShowTnz ?? true
        : undefined,
    rotatorTypes:
      w.type === 'rotator' || fallback.type === 'rotator'
        ? normalizeRotatorTypes(w.rotatorTypes ?? fallback.rotatorTypes)
        : undefined,
    rotatorSeconds:
      w.type === 'rotator' ||
      w.type === 'dafRotator' ||
      fallback.type === 'rotator' ||
      fallback.type === 'dafRotator'
        ? normalizeRotatorSeconds(w.rotatorSeconds ?? fallback.rotatorSeconds)
        : undefined,
    rotatorShowTitles:
      w.type === 'rotator' ||
      w.type === 'dafRotator' ||
      fallback.type === 'rotator' ||
      fallback.type === 'dafRotator'
        ? normalizeRotatorShowTitles(w.rotatorShowTitles ?? fallback.rotatorShowTitles)
        : undefined,
    rotatorEventsScroll:
      w.type === 'rotator' || fallback.type === 'rotator'
        ? normalizeRotatorEventsScroll(w.rotatorEventsScroll ?? fallback.rotatorEventsScroll)
        : undefined,
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function snap(value: number, grid: number): number {
  if (!grid || grid <= 0) return Math.round(value * 100) / 100;
  return Math.round(value / grid) * grid;
}
