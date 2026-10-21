import type { LocalDate } from '@/shared/lib/dates';
import type { Currency } from '@/shared/lib/money';

/**
 * A record written without a connection (FT-129) — by a quick chip, by hand or from a simple phrase read on the device
 * — as it waits in the outbox and goes to `POST /api/transactions` when the connection is back.
 */
export interface QueuedRecordInput {
  type: 'expense' | 'income';
  /** Integer minor units of `currency`. */
  amountMinor: number;
  currency: Currency;
  /** Absent when the accounts were never read on this device: the server picks the default one of the currency. */
  accountId?: string;
  /** Absent when the categories were never read here: the server resolves `categoryName` (a word, «Другое»). */
  categoryId?: string;
  categoryName: string;
  date: LocalDate;
  /** Trimmed; empty when there is none. */
  note: string;
  /** The device read «45» as 45 000: the waiting row and the toast ask to check the amount. */
  checkAmount?: boolean;
}

export interface QueuedRecord extends QueuedRecordInput {
  /** The id it is sent with (FT-106): a repeat returns the record the server already has. */
  clientId: string;
  userId: string;
  /** When it was written, ms: the records of one phrase a millisecond apart, in the order they were written. */
  createdAt: number;
  /** When the phrase, chip or entry that wrote it was, ms: the same for every record of one phrase. */
  writtenAt: number;
}
