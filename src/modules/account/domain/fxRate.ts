/** The USD rate that applies to a user (FT-102): their own, if set, else the Central Bank's. */
export interface EffectiveRate {
  /** сум×100 per 1 USD, e.g. 1285000 for 12 850.00. */
  rateMinor: number;
  source: 'cbu' | 'own';
  /** The date the rate is for (CBU) or applies from (own), YYYY-MM-DD. */
  date: string;
}

/** Port to the rates module; null when no rate is known yet. */
export interface EffectiveRateProvider {
  effectiveUsdRate(userId: string): Promise<EffectiveRate | null>;
}
