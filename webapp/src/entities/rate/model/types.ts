/** A USD rate: сум×100 per 1 USD (`1285037` = 12 850,37 сум), docs/pastel/api.md «Курс доллара». */
export interface EffectiveUsdRate {
  rateMinor: number;
  /** The user's own rate or the Central Bank's. */
  source: 'cbu' | 'own';
  /** The date the CBU rate is for, or the own rate applies from (YYYY-MM-DD). */
  date: string;
}

/** `GET /api/rates/usd`. */
export interface UsdRates {
  /** The rate in effect; null while no rate is known at all. */
  effective: EffectiveUsdRate | null;
  cbu: { rateMinor: number; date: string; fetchedAt: string } | null;
  own: { rateMinor: number; since: string } | null;
}
