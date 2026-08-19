/**
 * Proxy for עיתים לבינה (itimlabina.co.il) daily zmanim and sidebar extras.
 * Their API is CORS-locked to their origin, so the display fetches through us.
 */
import { gunzipSync } from 'zlib';
import { sendJson } from './apiAuth.mjs';

const ITIM_ORIGIN = 'https://itimlabina.co.il';
const WEEKLY_VIEW_ID = 251;
const WEB_VIEW_ID = 127;
const FALLBACK_LUACH_ID = 136;
const LUCHOT_TTL_MS = 24 * 60 * 60 * 1000;
const ELEV_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMES_TTL_MS = 6 * 60 * 60 * 1000;
const EXTRAS_TTL_MS = 6 * 60 * 60 * 1000;

const HEB_MONTH_HE = {
  1: 'ניסן',
  2: 'אייר',
  3: 'סיון',
  4: 'תמוז',
  5: 'אב',
  6: 'אלול',
  7: 'תשרי',
  8: 'חשוון',
  9: 'כסלו',
  10: 'טבת',
  11: 'שבט',
  12: 'אדר',
  13: 'אדר ב׳',
};

const HEB_MONTH_EN = {
  1: 'Nisan',
  2: 'Iyyar',
  3: 'Sivan',
  4: 'Tamuz',
  5: 'Av',
  6: 'Elul',
  7: 'Tishrei',
  8: 'Cheshvan',
  9: 'Kislev',
  10: 'Tevet',
  11: 'Shvat',
  12: 'Adar',
  13: 'Adar2',
};

/** Mirrors src/data/cities.ts — id, Hebrew name, coords. */
const CITIES = [
  { id: 'jerusalem', name: 'ירושלים', lat: 31.778, lng: 35.235, elevation: 800 },
  { id: 'tel-aviv', name: 'תל אביב', lat: 32.085, lng: 34.782 },
  { id: 'bnei-brak', name: 'בני ברק', lat: 32.085, lng: 34.834 },
  { id: 'petah-tikva', name: 'פתח תקווה', lat: 32.087, lng: 34.888 },
  { id: 'haifa', name: 'חיפה', lat: 32.794, lng: 34.989 },
  { id: 'beersheba', name: 'באר שבע', lat: 31.253, lng: 34.792 },
  { id: 'ashdod', name: 'אשדוד', lat: 31.804, lng: 34.655 },
  { id: 'ashkelon', name: 'אשקלון', lat: 31.669, lng: 34.571 },
  { id: 'netanya', name: 'נתניה', lat: 32.321, lng: 34.853 },
  { id: 'rishon', name: 'ראשון לציון', lat: 31.973, lng: 34.792 },
  { id: 'rehovot', name: 'רחובות', lat: 31.893, lng: 34.808 },
  { id: 'modiin', name: 'מודיעין', lat: 31.898, lng: 35.01 },
  { id: 'modiin-illit', name: 'מודיעין עילית', lat: 31.933, lng: 35.042 },
  { id: 'beit-shemesh', name: 'בית שמש', lat: 31.751, lng: 34.989 },
  { id: 'tiberias', name: 'טבריה', lat: 32.795, lng: 35.531, elevation: -200 },
  { id: 'safed', name: 'צפת', lat: 32.965, lng: 35.496, elevation: 900 },
  { id: 'eilat', name: 'אילת', lat: 29.557, lng: 34.951 },
  { id: 'ariel', name: 'אריאל', lat: 32.106, lng: 35.185 },
  { id: 'kiryat-gat', name: 'קריית גת', lat: 31.61, lng: 34.764 },
  { id: 'lod', name: 'לוד', lat: 31.951, lng: 34.888 },
  { id: 'ramla', name: 'רמלה', lat: 31.929, lng: 34.867 },
  { id: 'herzliya', name: 'הרצליה', lat: 32.162, lng: 34.844 },
  { id: 'raanana', name: 'רעננה', lat: 32.185, lng: 34.871 },
  { id: 'kfar-saba', name: 'כפר סבא', lat: 32.178, lng: 34.907 },
  { id: 'holon', name: 'חולון', lat: 32.012, lng: 34.775 },
  { id: 'bat-yam', name: 'בת ים', lat: 32.017, lng: 34.75 },
];

const cache = {
  luchot: { at: 0, list: [] },
  places: new Map(),
  times: new Map(),
  extras: new Map(),
};

function itimHeaders() {
  return {
    Accept: 'application/json, text/plain, */*',
    Origin: ITIM_ORIGIN,
    Referer: `${ITIM_ORIGIN}/calendar/weekly`,
    'User-Agent': 'screensmart/0.3 (zmanim proxy)',
  };
}

async function itimGet(path) {
  const url = path.startsWith('http') ? path : `${ITIM_ORIGIN}${path}`;
  const res = await fetch(url, {
    headers: itimHeaders(),
    signal: AbortSignal.timeout(18000),
  });
  if (!res.ok) {
    const err = new Error(`Itim ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return parseItimBody(res);
}

async function itimPost(path, body) {
  const url = path.startsWith('http') ? path : `${ITIM_ORIGIN}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...itimHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = new Error(`Itim ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return parseItimBody(res);
}

async function parseItimBody(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return JSON.parse(gunzipSync(buf).toString('utf8'));
  }
  const text = buf.toString('utf8').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function utcDateString(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)).toUTCString();
}

function parseDateParam(raw) {
  const m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeName(name) {
  return String(name || '')
    .replace(/[\u05F3']/g, '')
    .replace(/קריית/g, 'קרית')
    .replace(/תקווה/g, 'תקוה')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadLuchot() {
  if (cache.luchot.list.length && Date.now() - cache.luchot.at < LUCHOT_TTL_MS) {
    return cache.luchot.list;
  }
  const list = await itimGet('/api/luchot/');
  cache.luchot = { at: Date.now(), list: Array.isArray(list) ? list : [] };
  return cache.luchot.list;
}

const NAME_ALIASES = {
  'פתח תקווה': ['פתח תקוה'],
  'קריית גת': ['קרית גת'],
  'לוד': ['לוד אחיסמך'],
};

function pickLuach(cityName, luchot) {
  const n = normalizeName(cityName);
  const aliasSet = new Set([n, ...(NAME_ALIASES[cityName] || []).map(normalizeName)]);
  const exact = luchot.filter((luach) => aliasSet.has(normalizeName(luach.name)));
  if (exact.length) {
    exact.sort((a, b) => normalizeName(a.name).length - normalizeName(b.name).length || a.id - b.id);
    return exact[0];
  }
  return luchot.find((l) => l.id === FALLBACK_LUACH_ID) ?? { id: FALLBACK_LUACH_ID, name: cityName };
}

async function placeForCity(city) {
  const hit = cache.places.get(city.id);
  if (hit && Date.now() - hit.at < ELEV_TTL_MS) return hit.value;
  let lat = city.lat;
  let lng = city.lng;
  let elevation = Number.isFinite(city.elevation) ? city.elevation : 0;
  let address = city.name;
  try {
    const results = await itimGet(
      `/api/coords/search/addresses/${encodeURIComponent(city.name)}/lang/he`,
    );
    const first = Array.isArray(results) ? results[0] : null;
    const loc = first?.geometry?.location;
    if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
      lat = Number(loc.lat);
      lng = Number(loc.lng);
      if (first.formatted_address) address = String(first.formatted_address);
    }
  } catch {
    /* keep city coords */
  }
  try {
    const data = await itimGet(
      `/api/coords/addressfromcoords/${lat}/${lng}/filter/address|elevation`,
    );
    const elev = Number(data?.elevation);
    if (Number.isFinite(elev)) elevation = elev;
    if (data?.address) address = String(data.address);
    if (Number.isFinite(Number(data?.lat))) lat = Number(data.lat);
    if (Number.isFinite(Number(data?.lng))) lng = Number(data.lng);
  } catch {
    /* keep search / city coords */
  }
  const value = { lat, lng, elevation, address };
  cache.places.set(city.id, { at: Date.now(), value });
  return value;
}

function pickDay(payload, date) {
  if (!payload || typeof payload !== 'object') return {};
  const values = Object.values(payload);
  if (values.length === 1 && values[0] && typeof values[0] === 'object') {
    return values[0];
  }
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const keys = [`${d}/${m}/${y}`, `${d}/${String(m).padStart(2, '0')}/${y}`];
  for (const k of keys) {
    if (payload[k] && typeof payload[k] === 'object') return payload[k];
  }
  return values.find((v) => v && typeof v === 'object') ?? {};
}

async function timesForView(luachId, viewId, date, lat, lng, elev) {
  const start = encodeURIComponent(utcDateString(date));
  const path = `/api/times/bydatesrange/${luachId}/${viewId}/${start}/${start}/${lat}/${lng}/${elev}/0`;
  const payload = await itimGet(path);
  return pickDay(payload, date);
}

async function timesForLuach(luachId, date, lat, lng, elev) {
  const [weekly, web] = await Promise.all([
    timesForView(luachId, WEEKLY_VIEW_ID, date, lat, lng, elev).catch(() => ({})),
    timesForView(luachId, WEB_VIEW_ID, date, lat, lng, elev).catch(() => ({})),
  ]);
  return mergeRaw(web, weekly);
}

function mergeRaw(a, b) {
  return { ...a, ...b };
}

async function fetchCityTimes(city, date) {
  const luchot = await loadLuchot();
  const luach = pickLuach(city.name, luchot);
  const place = await placeForCity(city);
  const cacheKey = `${luach.id}|${dateKey(date)}|${place.lat.toFixed(5)}|${place.lng.toFixed(5)}`;
  const cached = cache.times.get(cacheKey);
  if (cached && Date.now() - cached.at < TIMES_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  let raw = await timesForLuach(luach.id, date, place.lat, place.lng, place.elevation);
  let used = luach;
  if (!Object.keys(raw).length && luach.id !== FALLBACK_LUACH_ID) {
    used = luchot.find((l) => l.id === FALLBACK_LUACH_ID) ?? luach;
    raw = await timesForLuach(used.id, date, place.lat, place.lng, place.elevation);
  }
  if (!Object.keys(raw).length) {
    throw new Error('Itim empty times');
  }
  const value = {
    date: dateKey(date),
    cityId: city.id,
    luachId: used.id,
    luachName: used.name,
    address: place.address,
    elevation: place.elevation,
    raw,
  };
  cache.times.set(cacheKey, { at: Date.now(), value });
  return value;
}

function weekBounds(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max = 220) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

const GERESH = '\u05F3';
const GERSHAYIM = '\u05F4';
const HEB_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const HEB_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HEB_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** Hebrew numeral with geresh/gershayim (5 → ה׳, 15 → ט״ו). */
function gematria(n) {
  const num = Math.floor(Number(n));
  if (!Number.isFinite(num) || num <= 0) return '';
  let rest = num;
  let letters = '';
  while (rest >= 1000) {
    letters += 'תתק';
    rest -= 900;
  }
  letters += HEB_HUNDREDS[Math.floor(rest / 100)] || '';
  rest %= 100;
  if (rest === 15) letters += 'טו';
  else if (rest === 16) letters += 'טז';
  else {
    letters += HEB_TENS[Math.floor(rest / 10)] || '';
    letters += HEB_ONES[rest % 10] || '';
  }
  if (!letters) return '';
  if (letters.length === 1) return `${letters}${GERESH}`;
  return `${letters.slice(0, -1)}${GERSHAYIM}${letters.slice(-1)}`;
}

function gematriaYear(year) {
  const y = Math.floor(Number(year));
  if (!Number.isFinite(y) || y <= 0) return '';
  const thousands = Math.floor(y / 1000);
  const rest = y % 1000;
  const head = thousands ? gematria(thousands) : '';
  const tail = rest ? gematria(rest) : '';
  return `${head}${tail}`;
}

function hebDayLabel(hebDay, month) {
  const dayHe = gematria(hebDay);
  const monthHe = HEB_MONTH_HE[Number(month)] || '';
  return joinParts(dayHe, monthHe);
}

function todaysItimDay(days, date) {
  if (!Array.isArray(days) || !days.length) return null;
  const weekday = date.getDay() + 1;
  return days.find((d) => Number(d?.day) === weekday) || days[date.getDay()] || null;
}

function joinParts(...parts) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/g, '')
    .trim();
}

function formatIl(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function pickMertsbach(slot) {
  if (!slot || typeof slot !== 'object') return slot;
  return slot.mertsbach || slot.tikutsinki || slot.tashbets || slot.rosh || slot;
}

function slotTime(slot) {
  const picked = pickMertsbach(slot);
  if (typeof picked === 'string') return picked;
  if (picked && typeof picked.time === 'string') return picked.time;
  return '';
}

function slotEnd(slot) {
  const picked = pickMertsbach(slot);
  if (picked && typeof picked.end === 'string') return picked.end;
  return '';
}

function formatLimud(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const rows = [
    ['dafYomi', 'דף היומי', joinParts('מסכת', raw.dafYomi?.title1, raw.dafYomi?.title2 ? `דף ${raw.dafYomi.title2}` : '')],
    ['mishnaYomit', 'משנה יומית', joinParts('מסכת', raw.mishnaYomit?.title1, raw.mishnaYomit?.title2, raw.mishnaYomit?.title3)],
    ['halachaYomit', 'הלכה יומית', joinParts(raw.halachaYomit?.title3, raw.halachaYomit?.title1, raw.halachaYomit?.title2 ? `, ${raw.halachaYomit.title2}` : '')],
    ['rambamYomi', 'רמב״ם יומי', joinParts(raw.rambamYomi?.title1, raw.rambamYomi?.title2, raw.rambamYomi?.title3)],
    [
      'mishnaBruraYomi',
      'משנה ברורה',
      joinParts(
        raw.mishnaBruraYomi?.title1 ? `חלק ${raw.mishnaBruraYomi.title1}` : '',
        raw.mishnaBruraYomi?.title2 ? `סימן ${raw.mishnaBruraYomi.title2}` : '',
        raw.mishnaBruraYomi?.title3 ? `סעיף ${raw.mishnaBruraYomi.title3}` : '',
      ),
    ],
    [
      'dafYomiBehalacha',
      'הדף היומי בהלכה',
      truncate(joinParts(raw.dafYomiBehalacha?.title1, raw.dafYomiBehalacha?.title3), 90),
    ],
  ];
  return rows
    .filter(([, , text]) => text)
    .map(([, title, text]) => ({ title, text }));
}

function extractHaftaraText(day) {
  const details = day?.details && typeof day.details === 'object' ? day.details : day;
  const h = details?.haftara;
  if (typeof h === 'string' && h.trim() && h.trim() !== '0') return h;
  if (h && typeof h === 'object' && typeof h.text === 'string' && h.text.trim() && h.text.trim() !== '0') {
    return h.text;
  }
  return '';
}

function formatHaftara(days, date) {
  if (!Array.isArray(days) || !days.length) return [];
  const today = todaysItimDay(days, date);
  const shabbat = days.find((d) => Number(d?.day) === 7);
  const ordered = [today, shabbat, ...days].filter(Boolean);
  let raw = '';
  for (const row of ordered) {
    raw = extractHaftaraText(row);
    if (raw) break;
  }
  const text = truncate(stripHtml(raw), 180);
  if (!text) return [];
  return [{ text }];
}

function formatHalachotForDay(day) {
  if (!day) return [];
  const dateLabel = hebDayLabel(day.date, day.month);
  const out = [];
  for (const ext of Array.isArray(day.extensions) ? day.extensions : []) {
    const text = truncate(stripHtml(ext?.text), 420);
    if (!text) continue;
    out.push({
      title: String(ext?.type || '').trim(),
      text,
      dateLabel,
    });
  }
  return out;
}

function formatHalachot(days, date) {
  const todayItems = formatHalachotForDay(todaysItimDay(days, date));
  if (todayItems.length) return todayItems.slice(0, 4);
  if (!Array.isArray(days)) return [];
  const week = [];
  for (const day of days) {
    week.push(...formatHalachotForDay(day));
    if (week.length >= 6) break;
  }
  return week.slice(0, 6);
}

function formatEvents(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    const text = truncate(stripHtml(item?.text || item?.textForPrint), 160);
    if (!text) continue;
    const yearHe = gematriaYear(item?.year);
    out.push({
      title: yearHe ? `שנת ${yearHe}` : '',
      text,
    });
    if (out.length >= 8) break;
  }
  return out;
}

function pickMoladMonth(moladot, hebYear, hebMonth) {
  const bag = moladot?.[hebYear] || moladot?.[String(hebYear)];
  if (!bag || typeof bag !== 'object') return null;
  const names = [
    HEB_MONTH_EN[hebMonth],
    hebMonth === 12 ? 'Adar' : '',
    hebMonth === 13 ? 'Adar2' : '',
    hebMonth === 8 ? 'Marcheshvan' : '',
  ].filter(Boolean);
  for (const name of names) {
    if (bag[name]) return bag[name];
  }
  const keys = Object.keys(bag);
  return keys.length === 1 ? bag[keys[0]] : bag[keys[keys.length - 1]] || null;
}

function formatMoon(payload, hebYear, hebMonth, weekStart, weekEnd) {
  const out = [];
  const month = pickMoladMonth(payload?.moladot, hebYear, hebMonth);
  const monthHe = HEB_MONTH_HE[hebMonth] || '';
  if (month) {
    const molad = slotTime(month.molad0);
    if (molad) out.push({ title: monthHe ? `המולד · ${monthHe}` : 'המולד', text: formatIl(molad) });
    const kidushStart = slotTime(month.molad3);
    const kidushStartEnd = slotEnd(month.molad3);
    if (kidushStart) {
      out.push({
        title: 'תחילת קידוש לבנה',
        text: kidushStartEnd ? `${formatIl(kidushStart)} – ${formatIl(kidushStartEnd)}` : formatIl(kidushStart),
      });
    }
    const kidushEnd = slotEnd(month.molad7) || slotTime(month.molad7);
    if (kidushEnd) out.push({ title: 'סוף זמן קידוש לבנה (ז׳ ימים)', text: formatIl(kidushEnd) });
    const half = slotTime(month.moladHalfMonth);
    if (half) out.push({ title: 'סוף זמן קידוש לבנה (חצי חודש)', text: formatIl(half) });
  }

  const weekFrom = weekStart.getTime();
  const weekTo = weekEnd.getTime() + 24 * 60 * 60 * 1000;
  const tkYear = payload?.tkufot?.[hebYear] || payload?.tkufot?.[String(hebYear)] || [];
  for (const row of Array.isArray(tkYear) ? tkYear : []) {
    const iso = slotTime(row?.tkufa?.shmuel?.times || row?.tkufa?.addah?.times || row);
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (t < weekFrom || t > weekTo) continue;
    out.push({ title: 'תקופה', text: formatIl(iso) });
  }
  return out.slice(0, 6);
}

async function fetchCityExtras(city, date) {
  const cacheKey = `${city.id}|${dateKey(date)}|v6`;
  const cached = cache.extras.get(cacheKey);
  if (cached && Date.now() - cached.at < EXTRAS_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const { start, end } = weekBounds(date);
  const dayUtc = encodeURIComponent(utcDateString(date));
  const startUtc = encodeURIComponent(utcDateString(start));
  const endUtc = encodeURIComponent(utcDateString(end));

  const [limudRes, daysRes] = await Promise.allSettled([
    itimGet(`/api/limudim/${dayUtc}`),
    itimGet(`/api/years/days/range/${startUtc}/${endUtc}/true/true`),
  ]);

  let weekDays = daysRes.status === 'fulfilled' && Array.isArray(daysRes.value) ? daysRes.value : [];
  if (!weekDays.length) {
    try {
      const fallback = await itimGet(`/api/years/days/extensions/range/${startUtc}/${endUtc}/true`);
      if (Array.isArray(fallback)) weekDays = fallback;
    } catch {
      /* keep empty */
    }
  }

  const limud = limudRes.status === 'fulfilled' ? formatLimud(limudRes.value) : [];
  const todayHeb = todaysItimDay(weekDays, date);
  const halachot = formatHalachot(weekDays, date);
  const haftara = formatHaftara(weekDays, date);
  let events = [];
  const month = Number(todayHeb?.month);
  const hebDay = Number(todayHeb?.date);
  if (Number.isFinite(month) && Number.isFinite(hebDay)) {
    try {
      events = formatEvents(await itimGet(`/api/generalsRepo/events/${month}-${hebDay}/${month}-${hebDay}`));
    } catch {
      events = [];
    }
  }

  let moon = [];
  try {
    const place = await placeForCity(city);
    const moladPayload = await Promise.race([
      itimPost(`/api/times/moladot/${startUtc}/${endUtc}/${place.lat}/${place.lng}/${place.elevation}`, {
        timeZone: 'Asia/Jerusalem',
        alt: 0,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('molad timeout')), 4000);
      }),
    ]);
    const hebYear = Number(Object.keys(moladPayload?.moladot || {})[0]) || 0;
    moon = formatMoon(moladPayload, hebYear, Number.isFinite(month) ? month : 0, start, end);
  } catch {
    moon = [];
  }

  const value = {
    date: dateKey(date),
    cityId: city.id,
    moon,
    halachot,
    events,
    limud,
    haftara,
  };
  cache.extras.set(cacheKey, { at: Date.now(), value });
  return value;
}

async function handleCityGet(req, res, url, fetcher) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' }, req);
    return true;
  }
  const cityId = String(url.searchParams.get('cityId') || '').trim();
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) {
    sendJson(res, 400, { ok: false, error: 'unknown city' }, req);
    return true;
  }
  try {
    const date = parseDateParam(url.searchParams.get('date'));
    const payload = await fetcher(city, date);
    sendJson(res, 200, { ok: true, ...payload }, req);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: String(err?.message || err) }, req);
  }
  return true;
}

/** GET /api/itim/zmanim|extras?cityId=&date=YYYY-MM-DD */
export async function handleItimZmanim(req, res, url) {
  if (!url.pathname.startsWith('/api/itim')) return false;
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {}, req);
    return true;
  }
  if (url.pathname === '/api/itim/zmanim') {
    return handleCityGet(req, res, url, fetchCityTimes);
  }
  if (url.pathname === '/api/itim/extras') {
    return handleCityGet(req, res, url, fetchCityExtras);
  }
  sendJson(res, 404, { ok: false, error: 'not found' }, req);
  return true;
}
