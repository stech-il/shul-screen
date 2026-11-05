import { describe, expect, it } from 'vitest';
import { getDayInfo } from './jewish';

describe('getDayInfo', () => {
  it('returns the Hebrew Daf Yomi for a known date', () => {
    const info = getDayInfo(new Date(2024, 3, 8, 12));
    expect(info.dafYomi).toContain('בבא מציעא');
    expect(info.dafYomi).toContain('מ׳');
  });

  it('returns Yerushalmi Daf Yomi in Hebrew', () => {
    const info = getDayInfo(new Date(2024, 4, 10, 12));
    expect(info.dafYerushalmi).toMatch(/ירושלמי|יְרוּשַׁלְמִי/);
    expect(info.dafYerushalmi.length).toBeGreaterThan(4);
  });

  it('returns full Hebrew Omer count during Sefirat HaOmer', () => {
    const info = getDayInfo(new Date(2024, 4, 10, 12));
    expect(info.omer).toBeTruthy();
    expect(info.omer?.todayIs).toMatch(/הַיּוֹם|היום/);
    expect(info.omer?.label).toMatch(/עוֹמֶר|עומר/);
    expect(info.omer?.sefira).toBeTruthy();
    expect(info.omer?.weeks).toBeGreaterThanOrEqual(0);
  });
});
