import { Transaction } from '../../transaction/domain/transactionEntity';

/**
 * What the audit reads from the rest of the app (FT-131): the user's records, when recording began, their
 * categories and the dollar rate — wired from the transaction and category modules in `createModules()`.
 */
export interface AuditSources {
  /** Not deleted, not archived records of the user dated from `from` to `to` (YYYY-MM-DD), both days included. */
  recordsBetween(userId: string, from: string, to: string): Promise<Transaction[]>;
  /** The day of the user's earliest record; null without records. */
  firstRecordDate(userId: string): Promise<string | null>;
  /** All of the user's categories, hidden included. */
  categories(userId: string): Promise<ReadonlyArray<{ id: string; name: string; presetKey: string | null }>>;
  /** The rate dollars in these records convert at (сум minor units for $1), or null — as in every total (FT-103). */
  usdRateMinor(userId: string, records: Transaction[]): Promise<number | null>;
}
