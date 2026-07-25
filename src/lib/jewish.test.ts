import { describe, expect, it } from 'vitest';
import { getDayInfo } from './jewish';

describe('getDayInfo', () => {
  it('returns the Hebrew Daf Yomi for a known date', () => {
    const info = getDayInfo(new Date(2024, 3, 8, 12));
    expect(info.dafYomi).toContain('בבא מציעא');
    expect(info.dafYomi).toContain('מ׳');
  });
});
