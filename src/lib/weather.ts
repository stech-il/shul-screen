import { getCity } from '../data/cities';
import type { WeatherInfo } from '../types';

const CACHE_PREFIX = 'shul-screen:weather:';
const MAX_AGE_MS = 20 * 60_000; // 20 minutes soft freshness

export interface WeatherData extends WeatherInfo {
  cityId: string;
  cityName: string;
  humidity?: number;
  windKmh?: number;
  source: 'cloud' | 'cache';
}

function cacheKey(cityId: string) {
  return `${CACHE_PREFIX}${cityId}`;
}

function loadCache(cityId: string): WeatherData | null {
  try {
    const raw = localStorage.getItem(cacheKey(cityId));
    if (!raw) return null;
    return JSON.parse(raw) as WeatherData;
  } catch {
    return null;
  }
}

function saveCache(data: WeatherData): void {
  localStorage.setItem(cacheKey(data.cityId), JSON.stringify(data));
}

function isFresh(data: WeatherData, maxAge = MAX_AGE_MS): boolean {
  const t = Date.parse(data.fetchedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < maxAge;
}

function weatherCodeToHe(code: number): string {
  if (code === 0) return 'בהיר';
  if (code === 1) return 'בעיקר בהיר';
  if (code === 2) return 'מעונן חלקית';
  if (code === 3) return 'מעונן';
  if (code <= 48) return 'ערפל';
  if (code <= 55) return 'טפטוף';
  if (code <= 57) return 'טפטוף קפוא';
  if (code <= 65) return 'גשם';
  if (code <= 67) return 'גשם קפוא';
  if (code <= 77) return 'שלג';
  if (code <= 82) return 'ממטרים';
  if (code <= 86) return 'ממטרי שלג';
  if (code <= 99) return 'סופות רעמים';
  return 'לא ידוע';
}

/** Map WMO weather code to a representative icon character. */
export function weatherCodeToIcon(code: number | undefined, isNight = false): string {
  if (code == null) return '';
  if (code === 0) return isNight ? '🌙' : '☀️';
  if (code === 1) return isNight ? '🌙' : '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  if (code <= 99) return '⛈️';
  return '';
}

/** Fetch live weather from Open-Meteo cloud API for synagogue city */
export async function fetchWeatherForCity(cityId: string): Promise<WeatherData | null> {
  const city = getCity(cityId);
  const cached = loadCache(cityId);

  if (!navigator.onLine) {
    return cached ? { ...cached, source: 'cache' } : null;
  }

  try {
    const params = new URLSearchParams({
      latitude: String(city.lat),
      longitude: String(city.lng),
      current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      timezone: 'auto',
      wind_speed_unit: 'kmh',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
    const data = (await res.json()) as {
      current: {
        temperature_2m: number;
        relative_humidity_2m?: number;
        weather_code: number;
        wind_speed_10m?: number;
      };
    };

    const weather: WeatherData = {
      cityId,
      cityName: city.name,
      tempC: Math.round(data.current.temperature_2m),
      description: weatherCodeToHe(data.current.weather_code),
      weatherCode: data.current.weather_code,
      humidity: data.current.relative_humidity_2m,
      windKmh:
        data.current.wind_speed_10m != null
          ? Math.round(data.current.wind_speed_10m)
          : undefined,
      fetchedAt: new Date().toISOString(),
      source: 'cloud',
    };
    saveCache(weather);
    return weather;
  } catch {
    if (cached) return { ...cached, source: 'cache' };
    return null;
  }
}

/**
 * Keep weather updated online by city — initial fetch + interval + online event.
 * Calls onUpdate whenever new data arrives.
 */
export function subscribeWeather(
  cityId: string,
  onUpdate: (w: WeatherData) => void,
  intervalMs = 5 * 60_000,
): () => void {
  let stopped = false;
  let currentCity = cityId;

  let lastKey = '';

  function emit(w: WeatherData) {
    const key = `${w.tempC}|${w.description}|${w.source}`;
    if (key === lastKey) return;
    lastKey = key;
    onUpdate(w);
  }

  async function refresh(force = false) {
    if (stopped) return;
    const cached = loadCache(currentCity);
    if (!force && cached && isFresh(cached) && navigator.onLine === false) {
      emit({ ...cached, source: 'cache' });
      return;
    }
    // Show cache immediately while fetching
    if (cached && !force) emit({ ...cached, source: 'cache' });

    const fresh = await fetchWeatherForCity(currentCity);
    if (!stopped && fresh) emit(fresh);
  }

  void refresh(true);

  const timer = window.setInterval(() => void refresh(true), intervalMs);
  const onOnline = () => void refresh(true);
  window.addEventListener('online', onOnline);

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', onOnline);
  };
}

/** Change city on an existing subscription pattern — helper for Display */
export async function getWeatherNow(cityId: string): Promise<WeatherData | null> {
  return fetchWeatherForCity(cityId);
}
