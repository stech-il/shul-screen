import { describe, expect, it } from 'vitest';
import { areaMatchesCity, parseOrefPayload } from './orefAlerts';
import { hashPassword, verifyPassword } from './auth';

describe('oref area match', () => {
  it('matches exact and neighborhood names', () => {
    expect(areaMatchesCity('פתח תקווה', ['פתח תקווה'])).toBe(true);
    expect(areaMatchesCity('פתח תקווה - מערב', ['פתח תקווה'])).toBe(true);
    expect(areaMatchesCity('פתח תקוה', ['פתח תקווה'])).toBe(true);
    expect(areaMatchesCity('רעננה', ['פתח תקווה'])).toBe(false);
  });

  it('parses empty and BOM payloads', () => {
    expect(parseOrefPayload('')).toEqual([]);
    expect(parseOrefPayload('\uFEFF')).toEqual([]);
    const alerts = parseOrefPayload(
      JSON.stringify({
        id: '1',
        cat: '1',
        title: 'ירי רקטות וטילים',
        data: ['פתח תקווה'],
        desc: 'היכנסו למרחב המוגן',
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.data[0]).toBe('פתח תקווה');
  });
});

describe('password hashing', () => {
  it('verifies salted password', async () => {
    const hash = await hashPassword('admin123');
    expect(hash.includes(':')).toBe(true);
    expect(await verifyPassword('admin123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
