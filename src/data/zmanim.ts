/** Keys exactly as returned by https://www.hebcal.com/zmanim */
export type ZmanKey =
  | 'chatzotNight'
  | 'alosBaalHatanya'
  | 'alotHaShachar'
  | 'misheyakir'
  | 'misheyakirMachmir'
  | 'dawn'
  | 'sunrise'
  | 'sofZmanShmaMGA19Point8'
  | 'sofZmanShmaMGA16Point1'
  | 'sofZmanShmaMGA'
  | 'sofZmanShmaBaalHatanya'
  | 'sofZmanShma'
  | 'sofZmanTfillaMGA19Point8'
  | 'sofZmanTfillaMGA16Point1'
  | 'sofZmanTfillaMGA'
  | 'sofZmanTfilaBaalHatanya'
  | 'sofZmanTfilla'
  | 'chatzot'
  | 'minchaGedola'
  | 'minchaGedolaBaalHatanya'
  | 'minchaGedolaMGA'
  | 'minchaKetana'
  | 'minchaKetanaBaalHatanya'
  | 'minchaKetanaMGA'
  | 'plagHaMincha'
  | 'plagHaminchaBaalHatanya'
  | 'sunset'
  | 'beinHaShmashos'
  | 'dusk'
  | 'tzaisBaalHatanya'
  | 'tzeit7083deg'
  | 'tzeit85deg'
  | 'tzeit42min'
  | 'tzeit50min'
  | 'tzeit72min';

export interface ZmanDefinition {
  key: ZmanKey;
  label: string;
}

/** Full Hebcal zmanim list with Hebrew labels */
export const ZMAN_DEFS: ZmanDefinition[] = [
  { key: 'chatzotNight', label: 'חצות הלילה' },
  { key: 'alosBaalHatanya', label: 'עלות השחר (בעל התניא)' },
  { key: 'alotHaShachar', label: 'עלות השחר' },
  { key: 'misheyakir', label: 'משיכיר' },
  { key: 'misheyakirMachmir', label: 'משיכיר מחמיר' },
  { key: 'dawn', label: 'עלות אזרחי (dawn)' },
  { key: 'sunrise', label: 'זריחת החמה' },
  { key: 'sofZmanShmaMGA19Point8', label: 'סוזק״ש מג״א (מחמיר)' },
  { key: 'sofZmanShmaMGA16Point1', label: 'סוזק״ש מג״א' },
  { key: 'sofZmanShmaMGA', label: 'סוזק״ש (מג״א)' },
  { key: 'sofZmanShmaBaalHatanya', label: 'סוזק״ש (בעל התניא)' },
  { key: 'sofZmanShma', label: 'סוף זמן ק״ש (גר״א)' },
  { key: 'sofZmanTfillaMGA19Point8', label: 'סוז״ת מג״א (מחמיר)' },
  { key: 'sofZmanTfillaMGA16Point1', label: 'סוז״ת מג״א' },
  { key: 'sofZmanTfillaMGA', label: 'סוז״ת (מג״א)' },
  { key: 'sofZmanTfilaBaalHatanya', label: 'סוז״ת (בעל התניא)' },
  { key: 'sofZmanTfilla', label: 'סוף זמן תפילה (גר״א)' },
  { key: 'chatzot', label: 'חצות היום' },
  { key: 'minchaGedola', label: 'מנחה גדולה' },
  { key: 'minchaGedolaBaalHatanya', label: 'מנחה גדולה (בעל התניא)' },
  { key: 'minchaGedolaMGA', label: 'מנחה גדולה (מג״א)' },
  { key: 'minchaKetana', label: 'מנחה קטנה' },
  { key: 'minchaKetanaBaalHatanya', label: 'מנחה קטנה (בעל התניא)' },
  { key: 'minchaKetanaMGA', label: 'מנחה קטנה (מג״א)' },
  { key: 'plagHaMincha', label: 'פלג המנחה' },
  { key: 'plagHaminchaBaalHatanya', label: 'פלג המנחה (בעל התניא)' },
  { key: 'sunset', label: 'שקיעת החמה' },
  { key: 'beinHaShmashos', label: 'בין השמשות' },
  { key: 'dusk', label: 'צאת הכוכבים' },
  { key: 'tzaisBaalHatanya', label: 'צאת הכוכבים (בעל התניא)' },
  { key: 'tzeit7083deg', label: 'צאת הכוכבים' },
  { key: 'tzeit85deg', label: 'צאת הכוכבים (ר״ת)' },
  { key: 'tzeit42min', label: 'צאת הכוכבים 42 דק׳' },
  { key: 'tzeit50min', label: 'צאת הכוכבים 50 דק׳' },
  { key: 'tzeit72min', label: 'צאת הכוכבים 72 דק׳' },
];

/** Default selection similar to a typical synagogue board */
export const DEFAULT_ENABLED_ZMANIM: ZmanKey[] = [
  'alotHaShachar',
  'sunrise',
  'sofZmanShmaMGA',
  'sofZmanShma',
  'sofZmanTfillaMGA',
  'sofZmanTfilla',
  'chatzot',
  'minchaGedola',
  'plagHaMincha',
  'sunset',
  'beinHaShmashos',
  'tzeit7083deg',
];

/** Migrate old internal keys → Hebcal API keys */
const LEGACY_KEY_MAP: Record<string, ZmanKey> = {
  alot: 'alotHaShachar',
  sofZmanShmaMga: 'sofZmanShmaMGA',
  sofZmanTfillaMga: 'sofZmanTfillaMGA',
  plag: 'plagHaMincha',
  tzeit: 'tzeit7083deg',
};

export function normalizeZmanKey(key: string): ZmanKey | undefined {
  if (ZMAN_DEFS.some((z) => z.key === key)) return key as ZmanKey;
  return LEGACY_KEY_MAP[key];
}

export function getZmanLabel(key: ZmanKey | string): string {
  const normalized = normalizeZmanKey(key) ?? key;
  return ZMAN_DEFS.find((z) => z.key === normalized)?.label ?? String(normalized);
}

export function isZmanKey(key: string): key is ZmanKey {
  return ZMAN_DEFS.some((z) => z.key === key);
}
