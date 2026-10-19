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
