import { CbuRate } from './fxRate';

export interface FxRateRepository {
  /** Insert or replace the rate of a date. */
  upsert(rate: CbuRate): Promise<void>;
  findByDate(date: string): Promise<CbuRate | null>;
  /** The latest known rate on or before `date` (any date when omitted). */
  latest(onOrBefore?: string): Promise<CbuRate | null>;
}
