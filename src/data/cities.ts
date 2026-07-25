import type { ZmanKey } from './zmanim';

export interface City {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tzid: string;
  elevation?: number;
  /** Hebcal / GeoNames id when available */
  geonameid?: number;
  /** Extra Pikud HaOref area name aliases (Hebrew) */
  orefNames?: string[];
}

export const CITIES: City[] = [
  { id: 'jerusalem', name: 'ירושלים', lat: 31.778, lng: 35.235, tzid: 'Asia/Jerusalem', elevation: 800, geonameid: 281184, orefNames: ['ירושלים - מערב', 'ירושלים - מזרח', 'ירושלים - צפון', 'ירושלים - דרום', 'מעלה אדומים'] },
  { id: 'tel-aviv', name: 'תל אביב', lat: 32.085, lng: 34.782, tzid: 'Asia/Jerusalem', geonameid: 293397, orefNames: ['תל אביב - מזרח', 'תל אביב - מערב', 'תל אביב - מרכז', 'תל אביב - דרום', 'תל אביב - צפון', 'יפו'] },
  { id: 'bnei-brak', name: 'בני ברק', lat: 32.085, lng: 34.834, tzid: 'Asia/Jerusalem', geonameid: 295514 },
  { id: 'petah-tikva', name: 'פתח תקווה', lat: 32.087, lng: 34.888, tzid: 'Asia/Jerusalem', geonameid: 293918, orefNames: ['פתח תקוה'] },
  { id: 'haifa', name: 'חיפה', lat: 32.794, lng: 34.989, tzid: 'Asia/Jerusalem', geonameid: 294801, orefNames: ['חיפה - מפרץ', 'חיפה - מערב', 'חיפה - נווה שאנן - רמות רמז - רמת אלמוגי', 'חיפה - כרמל'] },
  { id: 'beersheba', name: 'באר שבע', lat: 31.253, lng: 34.792, tzid: 'Asia/Jerusalem', geonameid: 295530 },
  { id: 'ashdod', name: 'אשדוד', lat: 31.804, lng: 34.655, tzid: 'Asia/Jerusalem', geonameid: 295629 },
  { id: 'ashkelon', name: 'אשקלון', lat: 31.669, lng: 34.571, tzid: 'Asia/Jerusalem', geonameid: 295620 },
  { id: 'netanya', name: 'נתניה', lat: 32.321, lng: 34.853, tzid: 'Asia/Jerusalem', geonameid: 294117 },
  { id: 'rishon', name: 'ראשון לציון', lat: 31.973, lng: 34.792, tzid: 'Asia/Jerusalem', geonameid: 293703, orefNames: ['ראשון לציון - מזרח', 'ראשון לציון - מערב'] },
  { id: 'rehovot', name: 'רחובות', lat: 31.893, lng: 34.808, tzid: 'Asia/Jerusalem', geonameid: 293725 },
  { id: 'modiin', name: 'מודיעין', lat: 31.898, lng: 35.01, tzid: 'Asia/Jerusalem', geonameid: 6693237, orefNames: ['מודיעין-מכבים-רעות'] },
  { id: 'modiin-illit', name: 'מודיעין עילית', lat: 31.933, lng: 35.042, tzid: 'Asia/Jerusalem', geonameid: 8199396 },
  { id: 'beit-shemesh', name: 'בית שמש', lat: 31.751, lng: 34.989, tzid: 'Asia/Jerusalem', geonameid: 295432 },
  { id: 'tiberias', name: 'טבריה', lat: 32.795, lng: 35.531, tzid: 'Asia/Jerusalem', elevation: -200, geonameid: 293322 },
  { id: 'safed', name: 'צפת', lat: 32.965, lng: 35.496, tzid: 'Asia/Jerusalem', elevation: 900, geonameid: 293100 },
  { id: 'eilat', name: 'אילת', lat: 29.557, lng: 34.951, tzid: 'Asia/Jerusalem', geonameid: 295277 },
  { id: 'ariel', name: 'אריאל', lat: 32.106, lng: 35.185, tzid: 'Asia/Jerusalem', geonameid: 8199394 },
  { id: 'kiryat-gat', name: 'קריית גת', lat: 31.61, lng: 34.764, tzid: 'Asia/Jerusalem', geonameid: 293842 },
  { id: 'lod', name: 'לוד', lat: 31.951, lng: 34.888, tzid: 'Asia/Jerusalem', geonameid: 294421 },
  { id: 'ramla', name: 'רמלה', lat: 31.929, lng: 34.867, tzid: 'Asia/Jerusalem', geonameid: 293703 },
  { id: 'herzliya', name: 'הרצליה', lat: 32.162, lng: 34.844, tzid: 'Asia/Jerusalem', geonameid: 294751 },
  { id: 'raanana', name: 'רעננה', lat: 32.185, lng: 34.871, tzid: 'Asia/Jerusalem', geonameid: 293768 },
  { id: 'kfar-saba', name: 'כפר סבא', lat: 32.178, lng: 34.907, tzid: 'Asia/Jerusalem', geonameid: 294514 },
  { id: 'holon', name: 'חולון', lat: 32.012, lng: 34.775, tzid: 'Asia/Jerusalem', geonameid: 294751 },
  { id: 'bat-yam', name: 'בת ים', lat: 32.017, lng: 34.75, tzid: 'Asia/Jerusalem', geonameid: 295548 },
];

export function getCity(id: string): City {
  return CITIES.find((c) => c.id === id) ?? CITIES[0]!;
}

/** Names to match against Pikud HaOref `data` areas */
export function getOrefMatchNames(cityId: string, extra?: string): string[] {
  const city = getCity(cityId);
  const names = [city.name, ...(city.orefNames ?? [])];
  if (extra?.trim()) names.push(...extra.split(/[,،]/).map((s) => s.trim()).filter(Boolean));
  return [...new Set(names)];
}

export type { ZmanKey };
