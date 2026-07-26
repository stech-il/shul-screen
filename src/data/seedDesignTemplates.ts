import { DEFAULT_DESIGN } from './designPresets';
import { TEMPLATE_BACKGROUNDS, type TemplateBackgroundKey } from './templateBackgrounds';
import { createWidget, defaultCanvas } from '../components/canvas/widgets';
import type {
  CanvasLayoutConfig,
  CanvasWidget,
  CanvasWidgetType,
  DesignSettings,
  SavedDesignTemplate,
  ScreenLayout,
} from '../types';

export function isSeedTemplateId(id: string): boolean {
  return id.startsWith('seed:');
}

function w(
  seed: string,
  type: CanvasWidgetType,
  x: number,
  y: number,
  ww: number,
  h: number,
  z = 2,
  extras?: Partial<CanvasWidget>,
): CanvasWidget {
  return createWidget(type, z, {
    id: `${seed}-${type}-${x}-${y}`,
    x,
    y,
    w: ww,
    h,
    ...extras,
  });
}

function canvas(
  widgets: CanvasWidget[],
  opts?: Partial<Pick<CanvasLayoutConfig, 'overlayOpacity' | 'aspect' | 'backgroundUrl'>>,
): CanvasLayoutConfig {
  return {
    ...defaultCanvas(),
    overlayOpacity: opts?.overlayOpacity ?? 0.22,
    aspect: opts?.aspect ?? '16:9',
    backgroundUrl: opts?.backgroundUrl ?? '',
    widgets,
  };
}

function withBg(layout: CanvasLayoutConfig, bg: string, overlay = 0.22): CanvasLayoutConfig {
  return { ...layout, backgroundUrl: bg, overlayOpacity: overlay };
}

function design(id: string, partial: Partial<DesignSettings>): DesignSettings {
  return { ...DEFAULT_DESIGN, presetId: id, ...partial };
}

function tpl(
  id: string,
  name: string,
  description: string,
  theme: 'light' | 'dark',
  layout: ScreenLayout,
  partial: Partial<DesignSettings>,
  canvasLayout: CanvasLayoutConfig,
  bgKey: TemplateBackgroundKey,
  overlay = 0.14,
): SavedDesignTemplate {
  const sid = `seed:${id}`;
  const bg = TEMPLATE_BACKGROUNDS[bgKey];
  return {
    id: sid,
    name,
    description,
    createdAt: '2026-01-01T00:00:00.000Z',
    theme,
    layout,
    design: design(sid, {
      ...partial,
      backgroundImageUrl: bg,
      overlayOpacity: overlay,
      showOrnaments: partial.showOrnaments ?? true,
    }),
    canvas: withBg(canvasLayout, bg, overlay),
  };
}

/** Classic synagogue board: side prayer blocks + center notice + clock + zmanim strip */
function layoutClassicBoard(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'hebrewDate', 72, 2, 24, 8, 3),
    w(seed, 'title', 28, 2, 44, 10, 3, { showBorder: false, bg: 'none' }),
    w(seed, 'parasha', 4, 2, 22, 8, 3),
    w(seed, 'block', 4, 14, 28, 40, 2, { title: 'זמני תפילות חול', showTitle: true }),
    w(seed, 'text', 34, 14, 32, 28, 2, {
      title: 'הודעה',
      showTitle: true,
      text: 'נא לא לדבר בשעת התפילה וקריאת התורה.\nנא להחזיר את הספרים למקומם.\nתודה, הגבאים',
      bg: 'solid',
      align: 'center',
      fontScale: 1.1,
    }),
    w(seed, 'block', 68, 14, 28, 40, 2, { title: 'זמני תפילות שבת', showTitle: true }),
    w(seed, 'clock', 40, 44, 20, 18, 4, { bg: 'panel', showBorder: true }),
    w(seed, 'zmanim', 4, 56, 44, 20, 2, { title: 'זמני היום', showTitle: true }),
    w(seed, 'zmanim', 52, 56, 44, 20, 2, { title: 'זמנים', showTitle: true }),
    w(seed, 'countdown', 4, 78, 30, 10, 2),
    w(seed, 'dafYomi', 36, 78, 28, 10, 2),
    w(seed, 'announcements', 66, 78, 30, 10, 2),
  ]);
}

/** Chabad-style: digital clock + tall zmanim + weekday/shabbat blocks + daily study */
function layoutChabadBoard(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'clock', 4, 2, 22, 12, 3, { fontScale: 1.4, fontWeight: 'bold' }),
    w(seed, 'title', 28, 2, 44, 8, 3, { bg: 'none', showBorder: false }),
    w(seed, 'hebrewDate', 74, 2, 22, 6, 3),
    w(seed, 'parasha', 74, 9, 22, 6, 3),
    w(seed, 'block', 4, 16, 28, 36, 2, { title: 'תפילות לחול', showTitle: true }),
    w(seed, 'text', 34, 16, 34, 36, 2, {
      title: 'הודעה / דבר תורה',
      showTitle: true,
      text: 'ברוכים הבאים לבית הכנסת.\nשמרו על קדושת המקום.',
      align: 'center',
      bg: 'solid',
      fontScale: 1.15,
    }),
    w(seed, 'zmanim', 70, 16, 26, 58, 2, { title: 'זמני היום', showTitle: true }),
    w(seed, 'block', 4, 54, 28, 22, 2, { title: 'תפילות לשבת ויו״ט', showTitle: true }),
    w(seed, 'text', 34, 54, 16, 22, 2, {
      title: 'ימי חב״ד',
      showTitle: true,
      text: 'יום הולדת אדמו״רים וימי גאולה',
      fontScale: 0.85,
    }),
    w(seed, 'text', 52, 54, 16, 22, 2, {
      title: 'לימוד יומי',
      showTitle: true,
      text: 'חומש · תהילים · תניא · רמב״ם',
      fontScale: 0.8,
    }),
    w(seed, 'announcements', 4, 78, 92, 14, 2),
  ]);
}

/** Triptych: weekday | center info | shabbat */
function layoutTriptych(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'block', 4, 4, 30, 70, 2, { title: 'זמני תפילות חול', showTitle: true, fontScale: 1.15 }),
    w(seed, 'title', 36, 4, 28, 10, 3, { bg: 'none', showBorder: false }),
    w(seed, 'clock', 38, 16, 24, 14, 3, { fontWeight: 'bold', fontScale: 1.35 }),
    w(seed, 'hebrewDate', 36, 32, 28, 12, 2, { bg: 'solid', align: 'center' }),
    w(seed, 'parasha', 36, 46, 28, 10, 2),
    w(seed, 'text', 36, 58, 28, 16, 2, {
      title: 'הלימוד היומי',
      showTitle: true,
      text: 'חומש עם רש״י · תהילים · תניא · רמב״ם יומי',
      fontScale: 0.75,
      align: 'right',
    }),
    w(seed, 'block', 66, 4, 30, 70, 2, { title: 'זמני תפילות שבת', showTitle: true, fontScale: 1.15 }),
    w(seed, 'zmanim', 4, 76, 92, 16, 2, { title: 'זמני היום', showTitle: true }),
  ]);
}

/** Modern bright community board with sponsors / QR slots as text boxes */
function layoutModernCommunity(seed: string): CanvasLayoutConfig {
  return canvas(
    [
      w(seed, 'clock', 4, 2, 20, 10, 3),
      w(seed, 'hebrewDate', 26, 2, 20, 10, 3),
      w(seed, 'title', 48, 2, 28, 10, 3, { bg: 'none', showBorder: false }),
      w(seed, 'parasha', 78, 2, 18, 10, 3),
      w(seed, 'text', 4, 14, 18, 12, 2, {
        title: 'יום הולדת',
        showTitle: true,
        text: 'מזל טוב לחוגגים!',
        bg: 'solid',
        align: 'center',
      }),
      w(seed, 'yahrzeit', 4, 28, 18, 14, 2),
      w(seed, 'countdown', 4, 44, 18, 18, 2),
      w(seed, 'image', 24, 14, 48, 48, 1, { bg: 'none', showBorder: true }),
      w(seed, 'block', 74, 14, 22, 32, 2, { title: 'זמני תפילות', showTitle: true }),
      w(seed, 'text', 74, 48, 22, 14, 2, {
        title: 'לתרומות',
        showTitle: true,
        text: 'סרוקו את הברקוד',
        align: 'center',
      }),
      w(seed, 'text', 4, 64, 20, 12, 2, {
        title: 'תורם השבת',
        showTitle: true,
        text: 'לעילוי נשמת…',
        fontScale: 0.85,
      }),
      w(seed, 'text', 24, 64, 70, 12, 2, {
        title: 'היום יום',
        showTitle: true,
        text: 'פתגם יומי לחיזוק',
        fontScale: 0.9,
      }),
      w(seed, 'announcements', 4, 78, 92, 14, 2),
    ],
    { overlayOpacity: 0.15 },
  );
}

/** Photo-board: side cards + center quotes over translucent panels */
function layoutPhotoBoard(seed: string): CanvasLayoutConfig {
  return canvas(
    [
      w(seed, 'clock', 36, 2, 28, 8, 3, { bg: 'none', showBorder: false, fontWeight: 'bold' }),
      w(seed, 'title', 28, 10, 44, 8, 3, { bg: 'none', showBorder: false }),
      w(seed, 'hebrewDate', 4, 2, 28, 8, 3),
      w(seed, 'parasha', 68, 2, 28, 8, 3),
      w(seed, 'block', 4, 14, 22, 28, 2, { title: 'זמני היום', showTitle: true }),
      w(seed, 'block', 4, 44, 22, 28, 2, { title: 'זמני שבת', showTitle: true }),
      w(seed, 'text', 28, 14, 22, 28, 2, {
        title: 'היום יום',
        showTitle: true,
        text: 'לימוד יומי והשראה',
        fontScale: 0.85,
      }),
      w(seed, 'text', 52, 14, 20, 18, 2, {
        title: 'ברכות',
        showTitle: true,
        text: 'משיב הרוח / מוריד הטל',
        fontScale: 0.9,
      }),
      w(seed, 'zmanim', 74, 14, 22, 28, 2, { title: 'זמני הלכה', showTitle: true }),
      w(seed, 'text', 74, 44, 22, 14, 2, {
        title: 'ימי חב״ד',
        showTitle: true,
        text: 'אירועי היום בתולדות חב״ד',
        fontScale: 0.8,
      }),
      w(seed, 'countdown', 74, 60, 22, 12, 2),
      w(seed, 'announcements', 28, 44, 44, 28, 2, { title: 'הודעות', showTitle: true }),
      w(seed, 'dafYomi', 4, 74, 92, 12, 2),
    ],
    { overlayOpacity: 0.42 },
  );
}

/** Ark / wood: clock center, dedications, prayer times */
function layoutArkWood(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'hebrewDate', 4, 2, 24, 8, 3),
    w(seed, 'parasha', 30, 2, 22, 8, 3),
    w(seed, 'title', 54, 2, 22, 8, 3, { bg: 'none', showBorder: false }),
    w(seed, 'dafYomi', 78, 2, 18, 8, 3),
    w(seed, 'block', 4, 12, 26, 32, 2, { title: 'זמני התפילות', showTitle: true }),
    w(seed, 'text', 32, 12, 18, 20, 2, {
      title: 'נר למאור',
      showTitle: true,
      text: 'לעילוי נשמת…',
      align: 'center',
      bg: 'solid',
    }),
    w(seed, 'text', 52, 12, 18, 20, 2, {
      title: 'פרנס היום',
      showTitle: true,
      text: 'לזכות…',
      align: 'center',
      bg: 'solid',
    }),
    w(seed, 'zmanim', 72, 12, 24, 40, 2, { title: 'זמני היום', showTitle: true }),
    w(seed, 'clock', 38, 36, 24, 22, 4, { showBorder: true }),
    w(seed, 'text', 4, 46, 30, 20, 2, {
      title: 'מזל טוב',
      showTitle: true,
      text: 'שהשמחה במעונם',
      align: 'center',
    }),
    w(seed, 'text', 66, 54, 30, 20, 2, {
      title: 'שיעורים',
      showTitle: true,
      text: 'דף יומי · חסידות · הלכה',
      align: 'center',
    }),
    w(seed, 'countdown', 36, 60, 28, 10, 2),
    w(seed, 'announcements', 4, 78, 92, 14, 2),
  ]);
}

/** Big clock focus */
function layoutClockFocus(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'title', 20, 4, 60, 10, 3, { bg: 'none', showBorder: false }),
    w(seed, 'clock', 30, 18, 40, 36, 4, { fontScale: 1.8, fontWeight: 'bold', showBorder: true }),
    w(seed, 'hebrewDate', 4, 20, 22, 14, 2),
    w(seed, 'parasha', 74, 20, 22, 14, 2),
    w(seed, 'countdown', 4, 58, 44, 12, 2),
    w(seed, 'dafYomi', 52, 58, 44, 12, 2),
    w(seed, 'announcements', 4, 74, 92, 18, 2),
  ]);
}

/** Zmanim wall */
function layoutZmanimWall(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'title', 20, 2, 60, 8, 3, { bg: 'none', showBorder: false }),
    w(seed, 'clock', 4, 2, 14, 10, 3),
    w(seed, 'hebrewDate', 82, 2, 14, 10, 3),
    w(seed, 'zmanim', 4, 14, 44, 62, 2, { title: 'זמני היום', showTitle: true, fontScale: 1.2 }),
    w(seed, 'zmanim', 52, 14, 44, 40, 2, { title: 'זמנים נוספים', showTitle: true }),
    w(seed, 'block', 52, 56, 44, 20, 2, { title: 'תפילות', showTitle: true }),
    w(seed, 'announcements', 4, 78, 92, 14, 2),
  ]);
}

/** Announcement hero */
function layoutAnnouncementHero(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'clock', 4, 2, 18, 10, 3),
    w(seed, 'title', 24, 2, 52, 10, 3, { bg: 'none', showBorder: false }),
    w(seed, 'hebrewDate', 78, 2, 18, 10, 3),
    w(seed, 'text', 10, 16, 80, 44, 3, {
      title: 'הודעה ראשית',
      showTitle: true,
      text: 'ברוכים הבאים!\nפרטים והודעות הקהילה יופיעו כאן.',
      align: 'center',
      fontScale: 1.4,
      bg: 'solid',
    }),
    w(seed, 'block', 4, 64, 30, 26, 2, { title: 'תפילות', showTitle: true }),
    w(seed, 'zmanim', 36, 64, 30, 26, 2, { title: 'זמנים', showTitle: true }),
    w(seed, 'countdown', 68, 64, 28, 26, 2),
  ]);
}

/** Compact dual columns */
function layoutDualColumns(seed: string): CanvasLayoutConfig {
  return canvas([
    w(seed, 'title', 20, 2, 60, 8, 3, { bg: 'none', showBorder: false }),
    w(seed, 'block', 4, 12, 44, 50, 2, { title: 'חול', showTitle: true }),
    w(seed, 'block', 52, 12, 44, 50, 2, { title: 'שבת', showTitle: true }),
    w(seed, 'clock', 36, 64, 28, 12, 3),
    w(seed, 'announcements', 4, 78, 92, 14, 2),
  ]);
}

/**
 * 30 built-in design templates inspired by common synagogue / Chabad boards.
 * Shown in Design Studio with layout + background previews; not stored in cloud quota.
 */
export const SEED_DESIGN_TEMPLATES: SavedDesignTemplate[] = [
  tpl(
    'gold-columns',
    'עמודי זהב',
    'קלאסי עם עמודות זהב, שעון מרכזי וזמני תפילה',
    'light',
    'canvas',
    {
      primaryColor: '#3a2a18',
      accentColor: '#c9a227',
      backgroundColor: '#f3e8d4',
      backgroundColor2: '#e4d3b4',
      panelColor: 'rgba(255,248,235,0.9)',
      mutedColor: '#6b5740',
      fontHeading: 'Frank Ruhl Libre',
      panelStyle: 'outlined',
      showOrnaments: true,
      headerStyle: 'centered',
      clockStyle: 'elegant',
    },
    layoutClassicBoard('gold-columns'),
    'goldColumns',
  ),
  tpl(
    'chabad-nasso',
    'חב״ד קלאסי',
    'לוח חב״ד עם זמנים אנכיים ולימוד יומי',
    'light',
    'canvas',
    {
      primaryColor: '#2c2418',
      accentColor: '#b8943c',
      backgroundColor: '#f0e6d2',
      backgroundColor2: '#dcc9a8',
      panelColor: 'rgba(255,252,245,0.92)',
      mutedColor: '#5c4d38',
      fontHeading: 'Frank Ruhl Libre',
      panelStyle: 'soft',
      clockStyle: 'bold',
    },
    layoutChabadBoard('chabad-nasso'),
    'chabadCream',
  ),
  tpl(
    'blue-ornate',
    'כחול וזהב',
    'מסגרות זהב על רקע קרם עם כותרות כחולות',
    'light',
    'canvas',
    {
      primaryColor: '#1a2a4a',
      accentColor: '#d4af37',
      backgroundColor: '#f5efe3',
      backgroundColor2: '#e8dcc8',
      panelColor: 'rgba(255,255,255,0.88)',
      mutedColor: '#4a5568',
      fontHeading: 'Frank Ruhl Libre',
      panelStyle: 'outlined',
      headerStyle: 'banner',
    },
    layoutClassicBoard('blue-ornate'),
    'blueGold',
  ),
  tpl(
    'ramot-maroon',
    'רמות חב״ד',
    'שלוש עמודות — חול | מרכז | שבת — בגוון בורדו',
    'light',
    'canvas',
    {
      primaryColor: '#5c1a2a',
      accentColor: '#c9a227',
      backgroundColor: '#f7f0e6',
      backgroundColor2: '#ead9c4',
      panelColor: 'rgba(255,250,243,0.92)',
      mutedColor: '#6b4a52',
      fontHeading: 'Frank Ruhl Libre',
      panelStyle: 'solid',
      clockStyle: 'bold',
    },
    layoutTriptych('ramot-maroon'),
    'maroonParchment',
  ),
  tpl(
    'cozumel-blue',
    'קהילה מודרנית',
    'כחול בהיר, גלריית אירועים ותרומות — בסגנון בית חב״ד מודרני',
    'light',
    'canvas',
    {
      primaryColor: '#003d6b',
      accentColor: '#f5a623',
      backgroundColor: '#00a8e8',
      backgroundColor2: '#0077b6',
      panelColor: 'rgba(255,255,255,0.92)',
      mutedColor: '#e8f4fc',
      fontHeading: 'Heebo',
      fontBody: 'Heebo',
      panelStyle: 'solid',
      panelRadius: 14,
      showOrnaments: false,
      clockStyle: 'bold',
    },
    layoutModernCommunity('cozumel-blue'),
    'cozumel', 0.12,
  ),
  tpl(
    'haditch-photo',
    'לוח על רקע צילום',
    'כרטיסים שקופים מעל תמונת רקע — מתאים לקמפוס / קרית חב״ד',
    'light',
    'canvas',
    {
      primaryColor: '#1c1810',
      accentColor: '#c9a227',
      backgroundColor: '#d8cfc0',
      backgroundColor2: '#b8a990',
      panelColor: 'rgba(255,248,235,0.78)',
      mutedColor: '#4a4030',
      fontHeading: 'Frank Ruhl Libre',
      panelStyle: 'glass',
      overlayOpacity: 0.4,
    },
    layoutPhotoBoard('haditch-photo'),
    'campusAerial', 0.42,
  ),
  tpl(
    'ark-wood',
    'ארון קודש',
    'עץ בורדו, פרוכת ושעונים — אווירה מסורתית עמוקה',
    'dark',
    'canvas',
    {
      primaryColor: '#f3ead7',
      accentColor: '#d4af37',
      backgroundColor: '#4a1414',
      backgroundColor2: '#2a0c0c',
      panelColor: 'rgba(60,20,20,0.88)',
      mutedColor: '#c4a882',
      fontHeading: 'Frank Ruhl Libre',
      panelStyle: 'outlined',
      clockStyle: 'elegant',
      headerStyle: 'banner',
      showOrnaments: true,
    },
    layoutArkWood('ark-wood'),
    'arkWood', 0.35,
  ),
  tpl(
    'clock-hero',
    'שעון מרכזי',
    'שעון גדול במרכז עם תאריך ופרשה בצדדים',
    'light',
    'canvas',
    {
      primaryColor: '#1c3140',
      accentColor: '#a8893d',
      backgroundColor: '#eef2f0',
      backgroundColor2: '#d5ded9',
      panelStyle: 'glass',
      clockStyle: 'bold',
      clockScale: 1.3,
    },
    layoutClockFocus('clock-hero'),
    'jerusalemStone',
  ),
  tpl(
    'zmanim-wall',
    'קיר זמנים',
    'דגש על רשימות זמנים מלאות לקריאה מרחוק',
    'light',
    'canvas',
    {
      primaryColor: '#1a2430',
      accentColor: '#8b6914',
      backgroundColor: '#f5f0e6',
      backgroundColor2: '#e6dcc8',
      panelColor: 'rgba(255,255,255,0.94)',
      panelStyle: 'solid',
      density: 'compact',
      bodyScale: 1.1,
    },
    layoutZmanimWall('zmanim-wall'),
    'parchment',
  ),
  tpl(
    'gabbai-notice',
    'הודעת גבאים',
    'בלוק הודעה גדול במרכז עם תפילות וזמנים מסביב',
    'dark',
    'canvas',
    {
      primaryColor: '#f5efe3',
      accentColor: '#d4af37',
      backgroundColor: '#2a1810',
      backgroundColor2: '#1a1008',
      panelColor: 'rgba(40,28,18,0.9)',
      mutedColor: '#b8a890',
      panelStyle: 'soft',
      headerStyle: 'centered',
    },
    layoutAnnouncementHero('gabbai-notice'),
    'arkWood', 0.4,
  ),
  tpl(
    'shabbat-queen',
    'שבת מלכה',
    'ערב שבת אלגנטי — זהב על כחול-לילה',
    'dark',
    'magazine',
    {
      primaryColor: '#f6f0e6',
      accentColor: '#c9a227',
      backgroundColor: '#0d1117',
      backgroundColor2: '#182230',
      panelColor: 'rgba(18,26,36,0.88)',
      mutedColor: '#a8b3bc',
      panelStyle: 'outlined',
      headerStyle: 'banner',
      clockStyle: 'elegant',
      motion: 'rich',
    },
    layoutClassicBoard('shabbat-queen'),
    'shabbatNight', 0.32,
  ),
  tpl(
    'parchment',
    'קלף עתיק',
    'טקסטורה של נייר ישן ומסגרות זהב עדינות',
    'light',
    'elegant',
    {
      primaryColor: '#3a2c1a',
      accentColor: '#b89a4a',
      backgroundColor: '#f4ead8',
      backgroundColor2: '#e6d5b5',
      panelColor: 'rgba(255,250,240,0.85)',
      mutedColor: '#6d5c45',
      fontHeading: 'David Libre',
      panelStyle: 'outlined',
      panelRadius: 4,
      showOrnaments: true,
    },
    layoutChabadBoard('parchment'),
    'parchment',
  ),
  tpl(
    'daily-study',
    'לימוד יומי',
    'מרכז את הלימוד היומי, דף יומי וימי חב״ד',
    'light',
    'canvas',
    {
      primaryColor: '#3d1f28',
      accentColor: '#c9a227',
      backgroundColor: '#f8f1e8',
      backgroundColor2: '#ead9c8',
      panelColor: 'rgba(90,30,45,0.92)',
      mutedColor: '#f5e6d8',
      fontHeading: 'Frank Ruhl Libre',
      panelStyle: 'solid',
    },
    canvas([
      w('daily-study', 'title', 20, 2, 60, 8, 3, { bg: 'none', showBorder: false }),
      w('daily-study', 'clock', 4, 2, 14, 10, 3),
      w('daily-study', 'hebrewDate', 82, 2, 14, 10, 3),
      w('daily-study', 'text', 8, 14, 84, 36, 2, {
        title: 'הלימוד היומי',
        showTitle: true,
        text: 'חומש · תהילים · תניא · רמב״ם · הירושלמי',
        align: 'center',
        fontScale: 1.2,
        bg: 'solid',
      }),
      w('daily-study', 'dafYomi', 8, 54, 40, 18, 2),
      w('daily-study', 'parasha', 52, 54, 40, 18, 2),
      w('daily-study', 'announcements', 8, 76, 84, 16, 2),
    ]),
    'maroonParchment',
  ),
  tpl(
    'jerusalem-stone',
    'אבן ירושלים',
    'בהיר, נקי, זהב עדין — למראה יומיומי',
    'light',
    'classic',
    {
      primaryColor: '#1c3140',
      accentColor: '#a8893d',
      backgroundColor: '#e8eeea',
      backgroundColor2: '#d2ddd6',
      panelStyle: 'glass',
    },
    defaultCanvas(),
    'jerusalemStone',
  ),
  tpl(
    'negev-warm',
    'נגב חם',
    'חול ונחושת — חמימות מדברית',
    'light',
    'classic',
    {
      primaryColor: '#3a2c22',
      accentColor: '#b0783a',
      backgroundColor: '#f0e6d8',
      backgroundColor2: '#e0d0ba',
      panelColor: 'rgba(255,250,243,0.88)',
      mutedColor: '#6d5c4c',
      panelStyle: 'soft',
      fontHeading: 'Secular One',
    },
    layoutDualColumns('negev-warm'),
    'negev',
  ),
  tpl(
    'tzfat-mist',
    'אוויר צפת',
    'כחול־אפור מיסטי למסכי ערב',
    'dark',
    'split',
    {
      primaryColor: '#e8eef5',
      accentColor: '#6e9bc3',
      backgroundColor: '#141c28',
      backgroundColor2: '#1e2c3e',
      panelColor: 'rgba(22,32,48,0.85)',
      mutedColor: '#9aadc0',
      panelStyle: 'glass',
      fontHeading: 'Miriam Libre',
    },
    layoutPhotoBoard('tzfat-mist'),
    'tzfat', 0.35,
  ),
  tpl(
    'kotel-stone',
    'כותל',
    'אבן גיר ופחם — מראה קפדני',
    'light',
    'board',
    {
      primaryColor: '#2a2a2a',
      accentColor: '#8a7350',
      backgroundColor: '#ebe6dc',
      backgroundColor2: '#d8d0c2',
      panelColor: 'rgba(255,252,247,0.9)',
      panelStyle: 'outlined',
      panelRadius: 2,
      fontHeading: 'Suez One',
      showShadows: false,
    },
    layoutZmanimWall('kotel-stone'),
    'jerusalemStone',
  ),
  tpl(
    'magazine-shabbat',
    'מגזין שבת',
    'פריסה מגזינית עם דגש על כותרות',
    'light',
    'magazine',
    {
      primaryColor: '#1c2836',
      accentColor: '#a8893d',
      backgroundColor: '#f4f1ea',
      backgroundColor2: '#e5dfd2',
      panelStyle: 'soft',
      headerStyle: 'banner',
      titleScale: 1.15,
    },
    layoutClassicBoard('magazine-shabbat'),
    'chabadCream',
  ),
  tpl(
    'dense-board',
    'לוח צפוף',
    'הרבה מידע במסך אחד — צפיפות גבוהה',
    'light',
    'board',
    {
      primaryColor: '#222',
      accentColor: '#9a7b2f',
      backgroundColor: '#f2ebe0',
      backgroundColor2: '#e0d4c0',
      panelColor: 'rgba(255,255,255,0.95)',
      panelStyle: 'solid',
      density: 'compact',
      bodyScale: 0.95,
    },
    layoutChabadBoard('dense-board'),
    'parchment',
  ),
  tpl(
    'simcha-event',
    'שמחת אירוע',
    'חגיגי לחתונה, בר מצווה או קידושין',
    'light',
    'event',
    {
      primaryColor: '#3a2f1c',
      accentColor: '#b8943c',
      backgroundColor: '#f7f1e6',
      backgroundColor2: '#ebe0cc',
      panelColor: 'rgba(255,252,246,0.92)',
      panelStyle: 'soft',
      headerStyle: 'centered',
      clockStyle: 'elegant',
      motion: 'rich',
    },
    layoutAnnouncementHero('simcha-event'),
    'wedding',
  ),
  tpl(
    'yahrzeit-quiet',
    'לע״נ שקט',
    'עיצוב מכובד לימי זיכרון ויארצייט',
    'light',
    'mourning',
    {
      primaryColor: '#2a2a2a',
      accentColor: '#6b6b6b',
      backgroundColor: '#f0f0f0',
      backgroundColor2: '#e2e2e2',
      panelColor: 'rgba(255,255,255,0.94)',
      mutedColor: '#555',
      panelStyle: 'solid',
      showOrnaments: false,
      motion: 'off',
      clockStyle: 'minimal',
      headerStyle: 'centered',
      fontHeading: 'Heebo',
      fontBody: 'Heebo',
    },
    canvas([
      w('yahrzeit-quiet', 'title', 20, 4, 60, 10, 3, { bg: 'none', showBorder: false }),
      w('yahrzeit-quiet', 'yahrzeit', 20, 18, 60, 40, 2, {
        title: 'לעילוי נשמת',
        showTitle: true,
        align: 'center',
        fontScale: 1.2,
      }),
      w('yahrzeit-quiet', 'hebrewDate', 25, 62, 50, 10, 2),
      w('yahrzeit-quiet', 'announcements', 10, 76, 80, 16, 2),
    ]),
    'remembrance',
    0.12,
  ),
  tpl(
    'modern-ink',
    'מודרני נקי',
    'מינימליסטי חד — בלי קישוטים',
    'light',
    'board',
    {
      primaryColor: '#111827',
      accentColor: '#2563a8',
      backgroundColor: '#f7f8fa',
      backgroundColor2: '#e8ecf1',
      panelColor: 'rgba(255,255,255,0.95)',
      panelStyle: 'solid',
      panelRadius: 14,
      showOrnaments: false,
      motion: 'off',
      fontHeading: 'Heebo',
      fontBody: 'Heebo',
      density: 'compact',
    },
    layoutDualColumns('modern-ink'),
    'modern', 0.08,
  ),
  tpl(
    'kinneret',
    'ים כנרת',
    'טורקיז רך ואוויר פתוח',
    'light',
    'split',
    {
      primaryColor: '#153f4a',
      accentColor: '#2a8f8a',
      backgroundColor: '#e4f1f0',
      backgroundColor2: '#c5e0dc',
      panelStyle: 'solid',
      fontHeading: 'Heebo',
    },
    layoutTriptych('kinneret'),
    'kinneret', 0.15,
  ),
  tpl(
    'grove',
    'חורשה',
    'ירוק עמוק ורגוע',
    'light',
    'classic',
    {
      primaryColor: '#1e3328',
      accentColor: '#5c8a4d',
      backgroundColor: '#e7efe4',
      backgroundColor2: '#cfdcc8',
      panelStyle: 'soft',
      fontHeading: 'David Libre',
    },
    defaultCanvas(),
    'grove',
    0.18,
  ),
  tpl(
    'night-tv',
    'לילה עמוק',
    'כחול־לילה לטלוויזיה בחדר תפילה',
    'dark',
    'classic',
    {
      primaryColor: '#e7eef7',
      accentColor: '#4ea1d3',
      backgroundColor: '#0a1220',
      backgroundColor2: '#122033',
      panelColor: 'rgba(12,22,38,0.86)',
      mutedColor: '#8fa3b8',
      panelStyle: 'soft',
    },
    layoutClockFocus('night-tv'),
    'nightTv', 0.28,
  ),
  tpl(
    'wedding-gold',
    'שמחת חתונה',
    'זהב חגיגי לאירוע מיוחד',
    'light',
    'event',
    {
      primaryColor: '#3a2f1c',
      accentColor: '#b8943c',
      backgroundColor: '#f7f1e6',
      backgroundColor2: '#ebe0cc',
      panelColor: 'rgba(255,252,246,0.92)',
      panelStyle: 'soft',
      headerStyle: 'centered',
      clockStyle: 'elegant',
      fontHeading: 'Frank Ruhl Libre',
      motion: 'rich',
    },
    layoutAnnouncementHero('wedding-gold'),
    'wedding',
  ),
  tpl(
    'dual-screen',
    'מסך כפול',
    'שתי עמודות סימטריות — חול מול שבת',
    'light',
    'dual',
    {
      primaryColor: '#1c3140',
      accentColor: '#a8893d',
      backgroundColor: '#eef1ef',
      backgroundColor2: '#d8e0dc',
      panelStyle: 'glass',
    },
    layoutDualColumns('dual-screen'),
    'jerusalemStone',
  ),
  tpl(
    'gold-sanctuary',
    'זהב מקדש',
    'כהה מפואר עם זהב — למראה חגיגי',
    'dark',
    'elegant',
    {
      primaryColor: '#f3ead7',
      accentColor: '#d4af37',
      backgroundColor: '#121820',
      backgroundColor2: '#1c2836',
      panelColor: 'rgba(20,28,38,0.82)',
      mutedColor: '#9aa7b0',
      panelStyle: 'soft',
      clockStyle: 'elegant',
      headerStyle: 'centered',
      showOrnaments: true,
    },
    layoutArkWood('gold-sanctuary'),
    'goldSanctuary', 0.3,
  ),
  tpl(
    'footer-ticker',
    'טיקר תחתון',
    'הודעות רחבות בתחתית + תוכן עליון מרווח',
    'light',
    'canvas',
    {
      primaryColor: '#1a2430',
      accentColor: '#b33a3a',
      backgroundColor: '#f5f2ec',
      backgroundColor2: '#e4ddd0',
      panelStyle: 'solid',
      headerStyle: 'split',
    },
    canvas([
      w('footer-ticker', 'title', 20, 2, 60, 10, 3, { bg: 'none', showBorder: false }),
      w('footer-ticker', 'clock', 4, 2, 14, 10, 3),
      w('footer-ticker', 'hebrewDate', 82, 2, 14, 10, 3),
      w('footer-ticker', 'block', 4, 14, 30, 48, 2, { title: 'תפילות', showTitle: true }),
      w('footer-ticker', 'text', 36, 14, 28, 48, 2, {
        title: 'דבר תורה',
        showTitle: true,
        text: 'הודעה מרכזית',
        align: 'center',
        fontScale: 1.2,
      }),
      w('footer-ticker', 'zmanim', 66, 14, 30, 48, 2, { title: 'זמנים', showTitle: true }),
      w('footer-ticker', 'announcements', 4, 66, 92, 26, 2, {
        title: 'הודעות רצות',
        showTitle: true,
        fontScale: 1.1,
      }),
    ]),
    'blueGold',
  ),
  tpl(
    'canvas-studio',
    'סטודיו חופשי',
    'נקודת התחלה לבונה המסך — גררו ושנו כרצונכם',
    'light',
    'canvas',
    {
      primaryColor: '#1c3140',
      accentColor: '#a8893d',
      backgroundColor: '#e8eeea',
      backgroundColor2: '#d2ddd6',
      panelStyle: 'glass',
      overlayOpacity: 0.28,
    },
    defaultCanvas(),
    'goldColumns',
  ),
];

export function mergeGalleryTemplates(
  userTemplates: SavedDesignTemplate[],
): SavedDesignTemplate[] {
  const userOnly = userTemplates.filter((t) => !isSeedTemplateId(t.id));
  return [...SEED_DESIGN_TEMPLATES, ...userOnly];
}
