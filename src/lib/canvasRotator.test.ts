import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROTATOR_TYPES,
  normalizeRotatorEventsScroll,
  normalizeRotatorSeconds,
  normalizeRotatorShowTitles,
  normalizeRotatorTypes,
  rotatorItemShowsTitle,
} from './canvasRotator';

describe('normalizeRotatorTypes', () => {
  it('defaults when missing', () => {
    expect(normalizeRotatorTypes(undefined)).toEqual(DEFAULT_ROTATOR_TYPES);
  });

  it('keeps a valid selection in order and drops nested rotator', () => {
    expect(normalizeRotatorTypes(['parasha', 'rotator', 'dafYomi', 'parasha', 'nope'])).toEqual([
      'parasha',
      'dafYomi',
    ]);
  });

  it('allows an empty selection', () => {
    expect(normalizeRotatorTypes([])).toEqual([]);
  });
});

describe('normalizeRotatorSeconds', () => {
  it('clamps to 3–60', () => {
    expect(normalizeRotatorSeconds(8)).toBe(8);
    expect(normalizeRotatorSeconds(1)).toBe(3);
    expect(normalizeRotatorSeconds(99)).toBe(60);
    expect(normalizeRotatorSeconds('x')).toBe(8);
  });
});

describe('rotatorShowTitles', () => {
  it('defaults to showing a title', () => {
    expect(rotatorItemShowsTitle(undefined, 'parasha')).toBe(true);
    expect(rotatorItemShowsTitle({}, 'dafYomi')).toBe(true);
  });

  it('respects an explicit false', () => {
    expect(rotatorItemShowsTitle({ parasha: false, dafYomi: true }, 'parasha')).toBe(false);
    expect(rotatorItemShowsTitle({ parasha: false, dafYomi: true }, 'dafYomi')).toBe(true);
  });

  it('drops unknown keys when normalizing', () => {
    expect(normalizeRotatorShowTitles({ parasha: false, rotator: true, nope: false })).toEqual({
      parasha: false,
    });
    expect(normalizeRotatorShowTitles(null)).toBeUndefined();
  });
});

describe('normalizeRotatorEventsScroll', () => {
  it('is off unless explicitly true', () => {
    expect(normalizeRotatorEventsScroll(undefined)).toBe(false);
    expect(normalizeRotatorEventsScroll(false)).toBe(false);
    expect(normalizeRotatorEventsScroll('true')).toBe(false);
    expect(normalizeRotatorEventsScroll(true)).toBe(true);
  });
});
