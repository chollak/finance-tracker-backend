import {
  convertUsdToUzsMinor,
  fromMinor,
  minorOf,
  percentOf,
  resolveAmountMinor,
  sumMinor,
  toMinor,
} from '../src/shared/domain/money/money';

describe('Money (FT-097)', () => {
  it('turns major units into integer minor units without float errors', () => {
    expect(toMinor(186400)).toBe(18640000);
    expect(toMinor(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996 in floating point
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(1.005)).toBe(101); // rounds half away from zero on the third decimal
    expect(toMinor('12,5')).toBe(1250);
    expect(toMinor('1 500.75')).toBe(150075);
    expect(toMinor('250 000 000')).toBe(25000000000);
    expect(toMinor(-45.1)).toBe(-4510);
  });

  it('keeps 250 000 000 сум exact through a round trip', () => {
    const minor = toMinor(250_000_000);
    expect(minor).toBe(25_000_000_000);
    expect(fromMinor(minor)).toBe(250_000_000);
  });

  it('rejects anything that is not an amount', () => {
    expect(() => toMinor(Number.NaN)).toThrow(RangeError);
    expect(() => toMinor(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => toMinor('12abc')).toThrow(RangeError);
    expect(() => toMinor('')).toThrow(RangeError);
    expect(() => toMinor(1e15)).toThrow(RangeError);
  });

  it('sums exactly where floating point drifts', () => {
    const tenCents = Array.from({ length: 10 }, () => toMinor(0.1));
    expect(sumMinor(tenCents)).toBe(100);
    expect(sumMinor([])).toBe(0);
  });

  it('reads a record by amountMinor, falling back to the legacy amount', () => {
    expect(minorOf({ amountMinor: 2500000, amount: 1 })).toBe(2500000);
    expect(minorOf({ amount: 25000 })).toBe(2500000);
    expect(minorOf({})).toBe(0);
  });

  it('computes percentages on integers', () => {
    expect(percentOf(1, 3)).toBe(33.33);
    expect(percentOf(1, 3, 0)).toBe(33);
    expect(percentOf(5, 0)).toBe(0);
  });

  describe('resolveAmountMinor — old and new writers', () => {
    it('accepts the old amount in сум', () => {
      expect(resolveAmountMinor({ amount: 25000 })).toEqual({ ok: true, amountMinor: 2500000 });
      expect(resolveAmountMinor({ amount: '25000' })).toEqual({ ok: true, amountMinor: 2500000 });
    });

    it('accepts the new amountMinor', () => {
      expect(resolveAmountMinor({ amountMinor: 2500000 })).toEqual({ ok: true, amountMinor: 2500000 });
    });

    it('accepts both when they agree and refuses when they do not', () => {
      expect(resolveAmountMinor({ amount: 25000, amountMinor: 2500000 })).toEqual({ ok: true, amountMinor: 2500000 });
      expect(resolveAmountMinor({ amount: 25000, amountMinor: 25000 })).toEqual({
        ok: false,
        message: 'amount and amountMinor disagree',
      });
    });

    it('refuses a fractional amountMinor and a missing amount', () => {
      expect(resolveAmountMinor({ amountMinor: 12.5 })).toMatchObject({ ok: false });
      expect(resolveAmountMinor({ amountMinor: '100' })).toMatchObject({ ok: false });
      expect(resolveAmountMinor({})).toEqual({ ok: false, message: 'amount is required' });
      expect(resolveAmountMinor({ amount: 'много' })).toEqual({ ok: false, message: 'amount must be a number' });
    });
  });

  describe('convertUsdToUzsMinor', () => {
    it('converts at a rate in minor units and rounds to whole сум', () => {
      // 55.00 USD × 12 850.00 = 706 750 сум
      expect(convertUsdToUzsMinor(5500, 1285000)).toBe(70675000);
      // 0.01 USD × 12 850.37 = 128.5037 сум → 129 сум
      expect(convertUsdToUzsMinor(1, 1285037)).toBe(12900);
      // 0.01 USD × 12 849.00 = 128.49 сум → 128 сум
      expect(convertUsdToUzsMinor(1, 1284900)).toBe(12800);
      expect(convertUsdToUzsMinor(-5500, 1285000)).toBe(-70675000);
      expect(convertUsdToUzsMinor(0, 1285000)).toBe(0);
    });

    it('stays exact for a large balance', () => {
      // 10 000 000.00 USD × 12 850.55 = 128 505 500 000 сум
      expect(convertUsdToUzsMinor(1_000_000_000, 1285055)).toBe(12_850_550_000_000);
    });
  });
});
