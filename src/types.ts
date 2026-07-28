import type { ZmanKey } from './data/zmanim';

export type { ZmanKey };
export type { City } from './data/cities';

export type UserRole = 'owner' | 'editor' | 'agency';
export type ScreenLayout =
  | 'classic'
  | 'split'
  | 'minimal'
  | 'magazine'
  | 'elegant'
  | 'board'
  | 'dual'
  | 'event'
  | 'mourning'
  | 'canvas';
export type PanelStyle = 'glass' | 'solid' | 'outlined' | 'soft';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type MotionLevel = 'off' | 'subtle' | 'rich';
export type HeaderStyle = 'split' | 'centered' | 'banner';
export type ClockStyle = 'bold' | 'elegant' | 'minimal';
export type DayMode = 'weekday' | 'erev-shabbat' | 'shabbat' | 'holiday';
export type NusachId = 'ashkenaz' | 'sephard' | 'edot-hamizrach' | 'chabad';
export type SpecialDisplayMode = 'normal' | 'event' | 'mourning';

export interface ScheduleItem {
  id: string;
  title: string;
  time: string;
  note?: string;
  fromZman?: ZmanKey | string;
  offsetMinutes?: number;
  /** row without a time — displayed centered across full width */
  noTime?: boolean;
}

export interface ScheduleBlock {
  id: string;
  title: string;
  items: ScheduleItem[];
  enabled: boolean;
}

export interface Announcement {
  id: string;
  text: string;
  startDate?: string;
  endDate?: string;
  enabled: boolean;
}

export interface Member {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  /** salted hash: saltHex:sha256Hex */
  passwordHash: string;
  pinHash?: string;
}

export interface YahrzeitEntry {
  id: string;
  name: string;
  /** Hebrew month 1-13 */
  hebrewMonth: number;
  hebrewDay: number;
  note?: string;
  enabled: boolean;
}

export type CanvasWidgetType =
  | 'title'
  | 'logo'
  | 'clock'
  | 'hebrewDate'
  | 'parasha'
  | 'dafYomi'
  | 'weather'
  | 'zmanim'
  | 'zman'
  | 'block'
  | 'announcements'
  | 'yahrzeit'
  | 'calendar'
  | 'countdown'
  | 'omer'
  | 'text'
  | 'heading'
  | 'image'
  | 'video'
  | 'divider'
  | 'button';

export type CanvasWidgetBg = 'none' | 'panel' | 'solid' | 'dark' | 'ghost';
export type CanvasTitleLayout = 'above' | 'below' | 'side' | 'side-reverse';
export type CanvasHtmlTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div';

export interface CanvasWidget {
  id: string;
  type: CanvasWidgetType;
  /** position + size in percent of the stage */
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  visible: boolean;
  title?: string;
  showTitle: boolean;
  /** where the label sits relative to the value (mainly for zman) */
  titleLayout: CanvasTitleLayout;
  text?: string;
  imageUrl?: string;
  /** for type === 'video' — embed / direct media URL */
  videoUrl?: string;
  /** for type === 'button' */
  buttonLabel?: string;
  /** optional link for heading / button / image */
  linkUrl?: string;
  /** semantic tag for heading widget */
  htmlTag?: CanvasHtmlTag;
  blockId?: string;
  /** for type === 'zman' — single zmanim entry */
  zmanKey?: ZmanKey;
  align: 'right' | 'center' | 'left';
  fontScale: number;
  /** Absolute font size in px — when set, overrides responsive fontScale */
  fontSizePx?: number;
  /** Letter spacing in px */
  letterSpacingPx?: number;
  /** Title font size in px — when set, overrides titleScale */
  titleSizePx?: number;
  /** Line height in px */
  lineHeightPx?: number;
  /** Inner padding in px */
  paddingPx?: number;
  /** scale of title relative to the widget font */
  titleScale: number;
  fontFamily?: string;
  fontWeight: 'normal' | 'medium' | 'bold';
  color?: string;
  titleColor?: string;
  bg: CanvasWidgetBg;
  showBorder: boolean;
  textShadow: boolean;
  opacity: number;
  radius: number;
}

/**
 * Reference stage width used to convert widget percent values to px in the
 * builder. Real screens scale proportionally from this.
 */
export const CANVAS_REF_WIDTH = 1920;

export interface CanvasLayoutConfig {
  aspect: '16:9' | '16:10' | '4:3' | '21:9';
  backgroundUrl: string;
  backgroundFit: 'cover' | 'contain';
  overlayOpacity: number;
  gridSize: number;
  widgets: CanvasWidget[];
}

export interface GalleryItem {
  id: string;
  url: string;
  name: string;
  kind: 'image' | 'video';
  createdAt: string;
}

/** Purchased / uploaded webfont for screen typography */
export interface CustomFont {
  id: string;
  /** Label shown in the picker */
  name: string;
  /** CSS font-family value */
  family: string;
  url: string;
  format?: 'woff2' | 'woff' | 'truetype' | 'opentype';
  createdAt: string;
}

export interface MediaSettings {
  logoDataUrl?: string;
  backgroundDataUrl?: string;
  eventImageUrl?: string;
  loopVideoUrl?: string;
  gallery: GalleryItem[];
  /** User-uploaded fonts (e.g. purchased Hebrew webfonts) */
  customFonts?: CustomFont[];
}

export interface DesignSettings {
  presetId: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  backgroundColor2: string;
  panelColor: string;
  mutedColor: string;
  logoUrl: string;
  backgroundImageUrl: string;
  fontHeading: string;
  fontBody: string;
  titleScale: number;
  clockScale: number;
  bodyScale: number;
  panelStyle: PanelStyle;
  panelRadius: number;
  showShadows: boolean;
  density: Density;
  motion: MotionLevel;
  headerStyle: HeaderStyle;
  clockStyle: ClockStyle;
  showOrnaments: boolean;
  overlayOpacity: number;
  /** TV / accessibility scale multiplier */
  accessibilityScale: number;
  highContrast: boolean;
}

export interface EmergencyState {
  active: boolean;
  message: string;
  updatedAt: string;
}

export interface ModeSettings {
  autoShabbat: boolean;
  autoHoliday: boolean;
  candleOffsetMin: number;
  showCandleCountdown: boolean;
  carouselSeconds: number;
  orefSound: boolean;
  muteOrefOnShabbat: boolean;
  specialMode: SpecialDisplayMode;
  eventTitle?: string;
  eventSubtitle?: string;
  mourningName?: string;
}

export interface LicenseInfo {
  key: string;
  plan: 'trial' | 'basic' | 'pro' | 'agency';
  activatedAt: string;
  expiresAt?: string;
  holderName?: string;
  locked?: boolean;
  serverValidated?: boolean;
  /** Screen / synagogue this license is bound to */
  synagogueId?: string;
}

export interface SynagogueConfig {
  id: string;
  name: string;
  cityId: string;
  dedication?: string;
  theme: 'light' | 'dark';
  layout: ScreenLayout;
  nusach: NusachId;
  branding?: {
    logoUrl?: string;
    primaryColor: string;
    accentColor: string;
  };
  design: DesignSettings;
  media: MediaSettings;
  canvas: CanvasLayoutConfig;
  enabledZmanim: ZmanKey[];
  blocks: ScheduleBlock[];
  announcements: Announcement[];
  yahrzeits: YahrzeitEntry[];
  members: Member[];
  showWeather: boolean;
  showDafYomi: boolean;
  showParasha: boolean;
  showHebrewDate: boolean;
  showClock: boolean;
  showStatus: boolean;
  showOrefAlerts: boolean;
  showYahrzeit: boolean;
  showCalendarExtras: boolean;
  /** Show Sefirat HaOmer on the screen during the counting period */
  showOmer: boolean;
  orefAreaExtra?: string;
  modes: ModeSettings;
  emergency: EmergencyState;
  kioskExitPinHash?: string;
  /** Contact email for trial/payment notifications */
  contactEmail?: string;
  license?: LicenseInfo;
  updatedAt: string;
  revision: number;
}

export interface HistoryEntry {
  id: string;
  at: string;
  by: string;
  revision: number;
  summary: string;
  config: SynagogueConfig;
}

export interface ComputedZman {
  key: ZmanKey;
  label: string;
  time: Date;
  formatted: string;
}

export interface DayInfo {
  hebrewDate: string;
  weekday: string;
  parasha: string;
  dafYomi: string;
  holidays: string[];
  memorials: string[];
  yahrzeitNames: string[];
  /** Present only during Sefirat HaOmer */
  omer?: {
    day: number;
    label: string;
    todayIs: string;
    sefira: string;
  } | null;
}

export interface ModeInfo {
  mode: DayMode;
  label: string;
  holidayName?: string;
  candleLighting?: Date;
  countdownLabel?: string;
}

export interface WeatherInfo {
  tempC: number;
  description: string;
  fetchedAt: string;
}

export interface CachedBundle {
  config: SynagogueConfig;
  weather?: WeatherInfo;
  syncedAt: string;
  pendingSync?: boolean;
}

export interface Session {
  synagogueId: string;
  memberId: string;
  memberName: string;
  role: UserRole;
  /** Opaque session id — regenerated on each login */
  token?: string;
  at?: string;
  expiresAt?: string;
  lastActiveAt?: string;
  /** Persist across browser restarts when true */
  remember?: boolean;
  /** Entered via platform super-admin (no shul password) */
  viaPlatform?: boolean;
}

export interface DesignPreset {
  id: string;
  name: string;
  description: string;
  theme: 'light' | 'dark';
  layout: ScreenLayout;
  design: DesignSettings;
  /** Optional gallery filter group */
  category?: 'classic' | 'festive' | 'nature' | 'modern' | 'solemn';
}

/** User-saved design (colors + layout + free-form canvas) reusable as a template */
export interface SavedDesignTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  /** Owning screen — custom templates are private to this synagogue */
  synagogueId?: string;
  theme: 'light' | 'dark';
  layout: ScreenLayout;
  design: DesignSettings;
  canvas: CanvasLayoutConfig;
}

export interface AnalyticsEvent {
  id: string;
  at: string;
  synagogueId: string;
  type: string;
  detail?: string;
}

export interface ScreenHeartbeat {
  synagogueId: string;
  at: string;
  version: string;
  online: boolean;
  layout: string;
}
