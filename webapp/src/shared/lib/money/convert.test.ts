import { describe, expect, it } from 'vitest';
import { usdToUzsMinor } from './convert';

describe('usdToUzsMinor', () => {
  it('converts dollars to whole сум at a rate in сум×100 per dollar', () => {
    // 420 USD × 12 650 = 5 313 000 сум
    expect(usdToUzsMinor(42_000, 1_265_000)).toBe(531_300_000);
  });

  it('rounds half away from zero to whole сум, as the server does', () => {
    // 55 USD × 12 850,37 = 706 770,35 → 706 770
    expect(usdToUzsMinor(5_500, 1_285_037)).toBe(70_677_000);
    // 0,50 USD × 12 851 = 6 425,5 → 6 426
    expect(usdToUzsMinor(50, 1_285_100)).toBe(642_600);
    expect(usdToUzsMinor(-50, 1_285_100)).toBe(-642_600);
  });

  it('stays exact for the largest amounts the keypad allows', () => {
    // 999 999 999,99 USD × 12 850,37
    expect(usdToUzsMinor(99_999_999_999, 1_285_037)).toBe(1_285_036_999_987_100);
  });
});
