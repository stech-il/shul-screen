import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROTATOR_TYPES,
  normalizeRotatorSeconds,
  normalizeRotatorTypes,
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
