import { describe, expect, it } from 'vitest';
import { withLiveCountdown } from './modes';
import type { ModeInfo } from '../types';

describe('withLiveCountdown', () => {
  it('returns the same reference when nothing to refresh', () => {
    const info: ModeInfo = {
      mode: 'weekday',
      label: 'יום חול',
    };
    expect(withLiveCountdown(info, new Date())).toBe(info);
  });

  it('updates candle countdown from candleLighting', () => {
    const friday = new Date();
    friday.setDate(friday.getDate() + ((5 - friday.getDay() + 7) % 7));
    friday.setHours(15, 0, 0, 0);
    const lighting = new Date(friday);
    lighting.setHours(18, 30, 0, 0);
    const info: ModeInfo = {
      mode: 'erev-shabbat',
      label: 'ערב שבת',
      candleLighting: lighting,
      countdownLabel: 'ישן',
      candleBoard: {
        entry: '18:30',
        exit: '19:40',
        exitRT: '20:10',
        entryLabel: 'כניסה',
        exitLabel: 'יציאה',
        exitRTLabel: 'יציאה ר״ת',
        countdownLabel: 'ישן',
      },
    };

    const next = withLiveCountdown(info, friday, true);
    expect(next).not.toBe(info);
    expect(next?.countdownLabel).toMatch(/^הדלקת נרות בעוד /);
    expect(next?.candleBoard?.countdownLabel).toBe(next?.countdownLabel);
  });
});
