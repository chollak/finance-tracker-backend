/**
 * Money as integer minor units (FT-097, docs/pastel/money-model.md).
 *
 * One scale for both currencies: 100 minor units per major unit — тийины for UZS, cents for USD.
 * Every sum, comparison and share is computed on these integers. The legacy `amount` (сумы as a JS
 * number) exists only at the edges — accepted from old writers and returned to old screens — until
 * the clean-up task FT-136 removes it.
 */

export const MINOR_PER_MAJOR = 100;

/**
 * Largest absolute amount accepted from input: 10^14 minor = 1 trillion сум. Far above any real
 * record and far below 2^53, so sums of many such values stay exact.
 */
export const MAX_ABS_AMOUNT_MINOR = 100_000_000_000_000;

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

export function isMinorInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_ABS_AMOUNT_MINOR;
}

/** Decimal text → minor units, rounding half away from zero beyond two decimals. No floating point. */
function decimalTextToMinor(text: string): number | null {
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  const cents = (fraction + '00').slice(0, 2);
  let minor = Number(whole) * MINOR_PER_MAJOR + Number(cents);
  if (fraction.length > 2 && Number(fraction[2]) >= 5) minor += 1;
  if (!Number.isSafeInteger(minor)) return null;
  return sign === '-' ? -minor : minor;
}

/**
 * Major units (a number or numeric text such as "186400", "12,5", "1 500.75") → integer minor units.
 * Throws a RangeError for anything that is not a finite amount within MAX_ABS_AMOUNT_MINOR.
 */
export function toMinor(major: number | string): number {
  let minor: number | null;
  if (typeof major === 'number') {
    if (!Number.isFinite(major)) throw new RangeError(`Not an amount: ${major}`);
    // String(n) is exact for the decimals people type ("0.29", "1.005"); exponent forms fall back.
    minor = decimalTextToMinor(String(major)) ?? Math.round(major * MINOR_PER_MAJOR);
  } else if (typeof major === 'string') {
    const text = major.replace(/[\s  ]/g, '').replace(',', '.');
    minor = decimalTextToMinor(text);
  } else {
    throw new RangeError(`Not an amount: ${String(major)}`);
  }
  if (minor === null || !isMinorInteger(minor)) throw new RangeError(`Not an amount: ${String(major)}`);
  return minor === 0 ? 0 : minor; // no -0
}

/**
 * A сум amount in whole сум (design-system «в сумах дробей нет», Shukur 2026-10-30, FT-185): tiyin round to the nearest
 * сум, half up — «1 234,50 сум» is 1 235. Dollars keep their cents; this is for сум only.
 */
export function wholeSumMinor(minor: number): number {
  return Math.round(minor / MINOR_PER_MAJOR) * MINOR_PER_MAJOR;
}

/** Minor units → major units as a JS number, for the legacy `amount` field and display only. */
export function fromMinor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

/** Exact integer sum; throws if the total leaves the safe range. */
export function sumMinor(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('Sum of amounts is out of range');
  return total;
}

/** The amount of a record in minor units: `amountMinor` when present, else the legacy `amount`. */
export function minorOf(record: { amountMinor?: number | null; amount?: number | null }): number {
  if (typeof record.amountMinor === 'number') return record.amountMinor;
  return toMinor(record.amount ?? 0);
}

/** Share of `part` in `total` as a percentage with `decimals` places (0 when the total is 0). */
export function percentOf(part: number, total: number, decimals = 2): number {
  if (total === 0) return 0;
  const factor = 10 ** decimals;
  return Math.round((part / total) * 100 * factor) / factor;
}

export type AmountResolution =
  | { ok: true; amountMinor: number }
  | { ok: false; message: string };

/**
 * Read an amount from a writer that may send the new `amountMinor` (integer minor units) or the old
 * `amount` (major units). Both may be sent; then they must agree.
 */
export function resolveAmountMinor(input: { amountMinor?: unknown; amount?: unknown }): AmountResolution {
  const hasMinor = input.amountMinor !== undefined && input.amountMinor !== null;
  const hasMajor = input.amount !== undefined && input.amount !== null && input.amount !== '';

  let fromMajor: number | undefined;
  if (hasMajor) {
    if (typeof input.amount !== 'number' && typeof input.amount !== 'string') {
      return { ok: false, message: 'amount must be a number' };
    }
    try {
      fromMajor = toMinor(input.amount);
    } catch {
      return { ok: false, message: 'amount must be a number' };
    }
  }

  if (hasMinor) {
    if (!isMinorInteger(input.amountMinor)) {
      return { ok: false, message: 'amountMinor must be an integer number of minor units' };
    }
    if (fromMajor !== undefined && fromMajor !== input.amountMinor) {
      return { ok: false, message: 'amount and amountMinor disagree' };
    }
    return { ok: true, amountMinor: input.amountMinor };
  }

  if (fromMajor !== undefined) return { ok: true, amountMinor: fromMajor };
  return { ok: false, message: 'amount is required' };
}

/**
 * Dollars → сум at a rate given in minor units (сум×100 per 1 USD, e.g. 1285000 for 12 850.00). The
 * result is rounded to whole сум (money-model: «округлением до целых сум») and returned in tiyin.
 * BigInt keeps the product exact however large the balance.
 */
export function convertUsdToUzsMinor(usdMinor: number, rateMinor: number): number {
  const product = BigInt(usdMinor) * BigInt(rateMinor); // tiyin × 100
  const divisor = BigInt(MINOR_PER_MAJOR * MINOR_PER_MAJOR); // → whole сум
  const negative = product < BigInt(0);
  const magnitude = negative ? -product : product;
  // Round half away from zero to whole сум
  let sum = magnitude / divisor;
  if ((magnitude % divisor) * BigInt(2) >= divisor) sum += BigInt(1);
  const tiyin = Number(sum) * MINOR_PER_MAJOR;
  return negative ? -tiyin : tiyin;
}
