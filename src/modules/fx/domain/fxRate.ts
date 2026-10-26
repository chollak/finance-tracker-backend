/**
 * USD rates (FT-102, docs/pastel/money-model.md → `fx_rates`). Only two currencies exist — сум and USD —
 * so only the USD rate is kept: сум×100 per 1 USD.
 */
export interface CbuRate {
  /** The date the rate is set for, YYYY-MM-DD. */
  date: string;
  currency: 'USD';
  rateMinor: number;
  source: 'cbu';
  /** When it was loaded, ISO. */
  fetchedAt: string;
}

/** Own rates outside these bounds are typos: 1 сум … 1 000 000 сум per dollar. */
export const MIN_RATE_MINOR = 100;
export const MAX_RATE_MINOR = 100_000_000;

export function isPlausibleRateMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_RATE_MINOR && value <= MAX_RATE_MINOR;
}
