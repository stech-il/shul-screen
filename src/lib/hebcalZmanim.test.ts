import { describe, expect, it } from 'vitest';
import { getShabbatZmanimDate, isShabbatScheduleBlock } from './hebcalZmanim';

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
