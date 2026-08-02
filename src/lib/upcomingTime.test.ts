import { describe, expect, it } from 'vitest';
import { isUpcomingWithinMinutes, parseTimeOnDay } from './upcomingTime';

describe('parseTimeOnDay', () => {
  it('parses HH:MM on the given day', () => {
    const now = new Date(2026, 7, 2, 12, 0, 0);
    const t = parseTimeOnDay('18:30', now);
    expect(t?.getHours()).toBe(18);
    expect(t?.getMinutes()).toBe(30);
    expect(t?.getDate()).toBe(2);
  });

  it('rejects invalid times', () => {
    expect(parseTimeOnDay('25:00')).toBeNull();
    expect(parseTimeOnDay('abc')).toBeNull();
  });
});

describe('isUpcomingWithinMinutes', () => {
  const now = new Date(2026, 7, 2, 17, 55, 0);

  it('highlights within 10 minutes before', () => {
    expect(isUpcomingWithinMinutes('18:00', now, 10)).toBe(true);
    expect(isUpcomingWithinMinutes('18:05', now, 10)).toBe(true);
  });

  it('does not highlight too early or after the minute', () => {
    expect(isUpcomingWithinMinutes('18:10', now, 10)).toBe(false);
    expect(isUpcomingWithinMinutes('17:50', now, 10)).toBe(false);
    const after = new Date(2026, 7, 2, 18, 1, 0);
    expect(isUpcomingWithinMinutes('18:00', after, 10)).toBe(false);
  });

  it('accepts Date targets', () => {
    const target = new Date(2026, 7, 2, 18, 0, 0);
    expect(isUpcomingWithinMinutes(target, now, 10)).toBe(true);
  });
});
