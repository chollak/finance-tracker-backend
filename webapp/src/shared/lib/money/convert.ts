import type { Currency } from './formatMoney';

/**
 * Dollars → сум at a rate (docs/pastel/money-model.md «Пересчёт долларов в сумы»): the rate is сум×100
 * per 1 USD (`rateMinor` from GET /api/rates/usd), the result is rounded half away from zero to whole сум —
 * the same rule as the server's convertUsdToUzsMinor, so a total on screen matches GET /api/accounts.
 * BigInt keeps the product exact for any amount the keypad allows.
 */
export function usdToUzsMinor(usdMinor: number, rateMinor: number): number {
  const product = BigInt(Math.round(usdMinor)) * BigInt(Math.round(rateMinor)); // tiyin × 100
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const divisor = 10_000n; // → whole сум
  let sum = magnitude / divisor;
  if ((magnitude % divisor) * 2n >= divisor) sum += 1n;
  const tiyin = Number(sum) * 100;
  return negative ? -tiyin : tiyin;
}

/**
 * Сум → dollars at a rate (the «≈ 14,74 USD» under the amount on manual entry, FT-113): `uzsMinor` in tiyin,
 * the rate in сум×100 per 1 USD, the result in cents rounded half away from zero.
 */
export function uzsToUsdMinor(uzsMinor: number, rateMinor: number): number {
  const numerator = BigInt(Math.round(uzsMinor)) * 100n; // cents × rate
  const rate = BigInt(Math.round(rateMinor));
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let cents = magnitude / rate;
  if ((magnitude % rate) * 2n >= rate) cents += 1n;
  return negative ? -Number(cents) : Number(cents);
}


/** An amount in another currency at the rate (сум×100 per 1 USD); as is in its own; null without a rate. */
export function convertMinor(amountMinor: number, from: Currency, to: Currency, rateMinor: number | null): number | null {
  if (from === to) return amountMinor;
  if (!rateMinor) return null;
  return to === 'USD' ? uzsToUsdMinor(amountMinor, rateMinor) : usdToUzsMinor(amountMinor, rateMinor);
}

/** The converted amount offered after a record moved to an account of another currency. */
export interface Recalculation {
  /** The amount as it was before the first move: every offer is converted from it. */
  origin: { currency: Currency; amountMinor: number };
  /** In the record's new currency. */
  amountMinor: number;
}

/**
 * «Пересчитать» after a move to an account of another currency (TxnSheet.md, the AI review): the number stays —
 * money never changes currency silently — and the amount converted from the one first written is offered.
 * Moved within the currency, the offer stays as it was; back to the first currency the number is the one
 * written, so nothing is offered; without a rate there is nothing to offer.
 */
export function recalculationAfterMove(
  record: { currency: Currency; amountMinor: number; recalculation: Recalculation | null },
  to: Currency,
  rateMinor: number | null
): Recalculation | null {
  if (to === record.currency) return record.recalculation;
  const origin = record.recalculation?.origin ?? { currency: record.currency, amountMinor: record.amountMinor };
  if (origin.currency === to) return null;
  const amountMinor = convertMinor(origin.amountMinor, origin.currency, to, rateMinor);
  return amountMinor === null ? null : { origin, amountMinor };
}
