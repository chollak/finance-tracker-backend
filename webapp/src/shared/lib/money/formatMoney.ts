/**
 * Money in «Пастель» (docs/pastel/design-system.md, «Содержание и тон»):
 * sign and unit always — «−186 400 сум», «+12 500 000 сум», «420,00 USD»; digit groups by a
 * non-breaking space, decimals after a comma; сумы without fractions, USD with cents.
 * Amounts are integer minor units (hundredths) — see docs/pastel/money-model.md.
 */
export type Currency = 'UZS' | 'USD';

export const NBSP = ' ';
export const MINUS = '−';

export const CURRENCY_UNIT: Record<Currency, string> = { UZS: 'сум', USD: 'USD' };

export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export interface FormatMoneyOptions {
  /** 'auto' — minus for negatives only; 'always' — «+» for positives too; 'none' — no sign (analytics). */
  sign?: 'auto' | 'always' | 'none';
  /** Append «сум» / «USD». Default true. */
  unit?: boolean;
}

export function formatMinor(minor: number, currency: Currency, options: FormatMoneyOptions = {}): string {
  const { sign = 'auto', unit = true } = options;
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));

  let body: string;
  if (currency === 'UZS') {
    body = groupDigits(String(Math.round(abs / 100)));
  } else {
    const whole = Math.floor(abs / 100);
    const cents = String(abs % 100).padStart(2, '0');
    body = `${groupDigits(String(whole))},${cents}`;
  }

  const prefix = sign === 'none' ? '' : negative ? MINUS : sign === 'always' && abs > 0 ? '+' : '';
  return `${prefix}${body}${unit ? `${NBSP}${CURRENCY_UNIT[currency]}` : ''}`;
}
