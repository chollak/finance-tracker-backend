import { describe, expect, it } from 'vitest';
import { convertMinor, recalculationAfterMove, usdToUzsMinor, uzsToUsdMinor } from './convert';

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

describe('uzsToUsdMinor', () => {
  it('converts сум to cents at a rate in сум×100 per dollar', () => {
    // 186 400 сум ÷ 12 650 = 14,735… → 14,74 USD (the «≈ 14,74 USD» under the amount on manual entry)
    expect(uzsToUsdMinor(18_640_000, 1_265_000)).toBe(1_474);
    // 5 313 000 сум ÷ 12 650 = 420,00 USD
    expect(uzsToUsdMinor(531_300_000, 1_265_000)).toBe(42_000);
  });

  it('rounds half a cent away from zero', () => {
    // 6 325 сум ÷ 12 650 = 0,5 USD exactly; 63,25 сум ÷ 12 650 = 0,005 USD → 0,01
    expect(uzsToUsdMinor(632_500, 1_265_000)).toBe(50);
    expect(uzsToUsdMinor(6_325, 1_265_000)).toBe(1);
    expect(uzsToUsdMinor(-6_325, 1_265_000)).toBe(-1);
  });
});

describe('convertMinor', () => {
  it('is the amount itself in its own currency, null without a rate', () => {
    expect(convertMinor(14_500_000, 'UZS', 'UZS', null)).toBe(14_500_000);
    expect(convertMinor(14_500_000, 'UZS', 'USD', null)).toBeNull();
    expect(convertMinor(14_500_000, 'UZS', 'USD', 1_265_000)).toBe(1_146);
  });
});

describe('recalculationAfterMove (TxnSheet.md: the number stays, «Пересчитать» is offered)', () => {
  const written = { currency: 'UZS' as const, amountMinor: 14_500_000, recalculation: null };

  it('to another currency: the amount first written, converted', () => {
    expect(recalculationAfterMove(written, 'USD', 1_265_000)).toEqual({ origin: { currency: 'UZS', amountMinor: 14_500_000 }, amountMinor: 1_146 });
  });

  it('back to the first currency: nothing to offer', () => {
    const moved = { currency: 'USD' as const, amountMinor: 14_500_000, recalculation: recalculationAfterMove(written, 'USD', 1_265_000) };

    expect(recalculationAfterMove(moved, 'UZS', 1_265_000)).toBeNull();
  });

  it('within the currency: the offer stays; without a rate: none', () => {
    const offer = recalculationAfterMove(written, 'USD', 1_265_000);

    expect(recalculationAfterMove({ currency: 'USD', amountMinor: 14_500_000, recalculation: offer }, 'USD', 1_265_000)).toBe(offer);
    expect(recalculationAfterMove(written, 'USD', null)).toBeNull();
  });
});
