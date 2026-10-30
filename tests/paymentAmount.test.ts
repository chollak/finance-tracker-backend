import { paymentAmountMinor, paymentName } from '../src/modules/quickCapture/domain/paymentCapture';

/**
 * FT-176: a payment from Apple Pay comes with a ready amount, and it is written exactly as it came — never read like a
 * phrase, where a bare «500» is 500 000 сум. The client sends major units as a strict decimal string.
 */
describe('the amount of a payment (FT-176)', () => {
  it.each([
    ['500', 50_000],
    ['25000', 2_500_000],
    ['4.50', 450],
    ['4.5', 450],
    ['25000.00', 2_500_000],
    ['0.99', 99],
    ['0', 0],
    ['1000000000', 100_000_000_000],
  ])('reads %s as %d minor units, exactly', (written, minor) => {
    expect(paymentAmountMinor(written)).toBe(minor);
  });

  it.each([
    ['a number, not a string', 500],
    ['a comma', '4,50'],
    ['grouped thousands', '25 000'],
    ['a non-breaking space', '25 000'],
    ['a sign', '-500'],
    ['a plus', '+500'],
    ['an exponent', '1e3'],
    ['three decimals: it would be rounded', '4.505'],
    ['no whole part', '.5'],
    ['a dot without decimals', '5.'],
    ['a leading zero', '0500'],
    ['a currency', '500 UZS'],
    ['spaces around', ' 500 '],
    ['empty', ''],
    ['null', null],
    ['too many digits', '1234567890123'],
  ])('refuses %s', (_why, value) => {
    expect(paymentAmountMinor(value)).toBeNull();
  });
});

describe('the merchant and the account name of a payment (FT-176)', () => {
  it('keeps the name as it came, with runs of spaces made one', () => {
    expect(paymentName('  KORZINKA 24   CHILONZOR ')).toBe('KORZINKA 24 CHILONZOR');
  });

  it('takes a blank name for none', () => {
    expect(paymentName('   ')).toBeUndefined();
    expect(paymentName(undefined)).toBeUndefined();
  });
});
