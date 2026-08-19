import { describe, expect, it } from 'vitest';
import { EMPTY_ITIM_EXTRAS } from './itimExtras';
import { defaultRotatingScreens, ROTATING_SLIDE_ORDER } from './rotatingScreens';

describe('itim extras', () => {
  it('starts empty', () => {
    expect(EMPTY_ITIM_EXTRAS.moon).toEqual([]);
    expect(EMPTY_ITIM_EXTRAS.halachot).toEqual([]);
    expect(EMPTY_ITIM_EXTRAS.events).toEqual([]);
    expect(EMPTY_ITIM_EXTRAS.limud).toEqual([]);
    expect(EMPTY_ITIM_EXTRAS.haftara).toEqual([]);
  });
});

describe('itim rotating slides', () => {
  it('are present but off by default', () => {
    const ids = ['itimMoon', 'itimHalachot', 'itimEvents', 'itimLimud', 'itimHaftara'] as const;
    for (const id of ids) {
      expect(ROTATING_SLIDE_ORDER).toContain(id);
    }
    const settings = defaultRotatingScreens();
    for (const id of ids) {
      expect(settings.slides.find((s) => s.id === id)?.enabled).toBe(false);
    }
    expect(settings.slides.find((s) => s.id === 'clock')?.enabled).toBe(true);
  });
});
