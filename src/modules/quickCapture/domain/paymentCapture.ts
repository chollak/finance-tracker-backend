import { toMinor } from '../../../shared/domain/money/money';

/**
 * A payment that comes ready (FT-176, docs/QUICK_CAPTURE_API.md «Payments»): Apple Pay gives the iOS app the amount,
 * currency, merchant and card, so the server writes them as they came instead of parsing a phrase — a bare «500» in a
 * phrase is 500 000 сум, and the digits of «KORZINKA 24» would be read as an amount.
 */

/** How long the names of a payment may be: a Wallet merchant, a Kapelka account. */
export const PAYMENT_NAME_LIMITS = { merchant: 200, accountName: 100 } as const;

/**
 * Major units as a decimal string with a dot and up to two decimals: "25000", "4.50". No sign, grouping, comma or
 * exponent, and no third decimal — it would have to be rounded, and the amount is written exactly as it came. Up to
 * 12 whole digits, so an amount too large is refused by the record's limit with its own message, not by the format.
 */
const PAYMENT_AMOUNT_FORMAT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

/** The amount of a payment in minor units, exactly as written; null for anything but the strict format. */
export function paymentAmountMinor(value: unknown): number | null {
  if (typeof value !== 'string' || !PAYMENT_AMOUNT_FORMAT.test(value)) return null;
  return toMinor(value);
}

/** A merchant or an account name as it came, with runs of spaces made one; undefined when blank. */
export function paymentName(value: string | undefined): string | undefined {
  const name = value?.replace(/\s+/g, ' ').trim();
  return name ? name : undefined;
}
