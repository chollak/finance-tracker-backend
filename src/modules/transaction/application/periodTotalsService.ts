import { Transaction } from '../domain/transactionEntity';
import { PeriodTotals, summarizePeriod } from '../domain/periodTotals';

/** The USD rate that applies to a user (FT-102): their own, else the Central Bank's. */
export interface EffectiveUsdRate {
  rateMinor: number;
  source?: 'cbu' | 'own';
}

/** The USD rate that applies to a user (FT-102); implemented by the rates module. */
export interface UsdRateSource {
  effectiveUsdRate(userId: string): Promise<EffectiveUsdRate | null>;
}

/**
 * The one place period totals are computed (FT-103). Asks for the user's rate only when the records
 * hold dollars.
 */
export class PeriodTotalsService {
  constructor(private rates?: UsdRateSource) {}

  setRateSource(rates: UsdRateSource): void {
    this.rates = rates;
  }

  /** The rate dollars in these records convert at, or null (no dollars, or no rate yet). */
  async usdRateFor(userId: string, records: ReadonlyArray<Pick<Transaction, 'currency'>>): Promise<number | null> {
    return (await this.usdRateInfoFor(userId, records))?.rateMinor ?? null;
  }

  /** The same rate with where it comes from — the user's own or the Central Bank's (FT-120: the footnote). */
  async usdRateInfoFor(userId: string, records: ReadonlyArray<Pick<Transaction, 'currency'>>): Promise<EffectiveUsdRate | null> {
    if (!this.rates || !records.some(record => record.currency === 'USD')) return null;
    return (await this.rates.effectiveUsdRate(userId)) ?? null;
  }

  async summarize(userId: string, records: Transaction[]): Promise<PeriodTotals> {
    return summarizePeriod(records, { usdRateMinor: await this.usdRateFor(userId, records) });
  }
}
