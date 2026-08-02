import { describe, expect, it } from 'vitest';
import {
  getShabbatZmanimDate,
  isShabbatScheduleBlock,
  resolveScheduleItemAt,
} from './hebcalZmanim';
import { isUpcomingWithinMinutes } from './upcomingTime';

describe('getShabbatZmanimDate', () => {
  it('uses the upcoming Friday during the week', () => {
    const monday = new Date(2026, 6, 20, 12);
    const friday = getShabbatZmanimDate(monday);
    expect(friday.getFullYear()).toBe(2026);
    expect(friday.getMonth()).toBe(6);
    expect(friday.getDate()).toBe(24);
    expect(friday.getDay()).toBe(5);
  });

  it('keeps the previous Friday until Motzei Shabbat', () => {
    const saturday = new Date(2026, 6, 25, 19);
    const tzeit = new Date(2026, 6, 25, 20, 15);
    const friday = getShabbatZmanimDate(saturday, { tzeit7083deg: tzeit });
    expect(friday.getDate()).toBe(24);
  });

  it('switches to next Friday after Motzei Shabbat', () => {
    const saturday = new Date(2026, 6, 25, 21);
    const tzeit = new Date(2026, 6, 25, 20, 15);
    const friday = getShabbatZmanimDate(saturday, { tzeit7083deg: tzeit });
    expect(friday.getDate()).toBe(31);
  });
});

describe('isShabbatScheduleBlock', () => {
  it('recognizes existing Hebrew and English Shabbat blocks', () => {
    expect(isShabbatScheduleBlock({ id: 'shabbat', title: 'זמני תפילות שבת' })).toBe(true);
    expect(isShabbatScheduleBlock({ id: 'custom', title: 'מעריב מוצ״ש' })).toBe(true);
    expect(isShabbatScheduleBlock({ id: 'weekday', title: 'תפילות חול' })).toBe(false);
  });
});

describe('resolveScheduleItemAt + upcoming highlight across Shabbat', () => {
  it('does not highlight Friday evening time on Saturday afternoon', () => {
    const friday = new Date(2026, 6, 24, 12);
    const satAfternoon = new Date(2026, 6, 25, 17, 50);
    const block = { id: 'sb', title: 'קבלת שבת' };
    const at = resolveScheduleItemAt({}, '18:00', undefined, 0, {
      now: satAfternoon,
      shabbatFriday: friday,
      block,
    });
    expect(at?.getDay()).toBe(5); // Friday
    expect(isUpcomingWithinMinutes(at, satAfternoon, 10)).toBe(false);
  });

  it('highlights Saturday morning Shacharit on Saturday', () => {
    const friday = new Date(2026, 6, 24, 12);
    const satMorning = new Date(2026, 6, 25, 7, 50);
    const block = { id: 'sb', title: 'תפילות שבת' };
    const at = resolveScheduleItemAt({}, '08:00', undefined, 0, {
      now: satMorning,
      shabbatFriday: friday,
      block,
    });
    expect(at?.getDay()).toBe(6);
    expect(isUpcomingWithinMinutes(at, satMorning, 10)).toBe(true);
  });
});
