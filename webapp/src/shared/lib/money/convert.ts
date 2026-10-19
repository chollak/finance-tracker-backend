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
