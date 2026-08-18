import { describe, expect, it } from 'vitest';
import { configZmanimSource, mapItimRawTimes } from './itimZmanim';

describe('mapItimRawTimes', () => {
  it('prefers printed Itim slots over calculation fallbacks', () => {
    const times = mapItimRawTimes({
      '30': '2026-08-17T03:10:00.000Z',
      '435': '2026-08-17T03:05:16.361Z',
      '44': '2026-08-17T06:24:09.056Z',
      '290': '2026-08-17T16:24:56.991Z',
      '13': '2026-08-17T09:43:10.515Z',
      '110': '2026-08-17T16:39:17.064Z',
    });
    expect(times.sunrise?.toISOString()).toBe('2026-08-17T03:05:16.361Z');
    expect(times.sofZmanShma?.toISOString()).toBe('2026-08-17T06:24:09.056Z');
    expect(times.sunset?.toISOString()).toBe('2026-08-17T16:24:56.991Z');
    expect(times.chatzot?.toISOString()).toBe('2026-08-17T09:43:10.515Z');
    expect(times.dusk?.toISOString()).toBe('2026-08-17T16:39:17.064Z');
    expect(times.tzeit7083deg?.toISOString()).toBe('2026-08-17T16:39:17.064Z');
  });

  it('skips missing and invalid values', () => {
    const times = mapItimRawTimes({
      '44': 'not-a-date',
      '13': '2026-08-17T09:43:10.515Z',
    });
    expect(times.sofZmanShma).toBeUndefined();
    expect(times.chatzot).toBeDefined();
    expect(times.sunrise).toBeUndefined();
  });
});

describe('configZmanimSource', () => {
  it('defaults to hebcal', () => {
    expect(configZmanimSource(undefined)).toBe('hebcal');
    expect(configZmanimSource({})).toBe('hebcal');
    expect(configZmanimSource({ zmanimSource: 'hebcal' })).toBe('hebcal');
  });

  it('reads itim when selected', () => {
    expect(configZmanimSource({ zmanimSource: 'itim' })).toBe('itim');
  });
});
