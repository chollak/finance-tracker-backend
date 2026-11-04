import { minorOf } from '../../../shared/domain/money/money';
import { normalizeNeedsReview, Transaction } from './transactionEntity';

/**
 * What an edit of a record would write (FT-248): the category and the account already resolved to their ids, the
 * amount in minor units. A field left undefined is not touched.
 */
export type RecordEdit = Partial<Pick<Transaction,
  'amountMinor' | 'categoryId' | 'accountId' | 'currency' | 'description' | 'date' | 'type' | 'semanticType' |
  'needsReview' | 'merchant'
>>;

/** No note and no merchant are the same however a client says it: missing, empty or a JSON null. */
const text = (value: string | null | undefined): string => value ?? '';

/**
 * The note or the merchant an edit writes, as `POST` writes them (FT-113, #210): trimmed, and a JSON null is none —
 * `''`, like an empty or blank one (FT-249). Not sent stays undefined: the edit does not touch it.
 */
export const textEdit = (sent: string | null | undefined): string | undefined => (sent === null ? '' : sent?.trim());

/**
 * Whether the edit changes a value of the stored record (FT-248). An edit that changes nothing is not written, so the
 * record's `updatedAt` keeps saying when it was last really changed — the capture quality report (FT-217) counts a
 * record as edited by it.
 *
 * A day is compared as written: the edit's is always YYYY-MM-DD, and a record stored with a whole moment (before
 * FT-100) has no single day — it depends on the time zone — so any day sent for it is written, as before.
 */
export function changesRecord(record: Transaction, edit: RecordEdit): boolean {
  const differs = <T>(sent: T | undefined, stored: T): boolean => sent !== undefined && sent !== stored;

  return differs(edit.amountMinor, minorOf(record))
    || differs(edit.categoryId, record.categoryId)
    || differs(edit.accountId, record.accountId)
    || differs(edit.currency, record.currency ?? 'UZS')
    || (edit.description !== undefined && text(edit.description) !== text(record.description))
    || differs(edit.date, record.date)
    || differs(edit.type, record.type)
    || differs(edit.semanticType, record.semanticType)
    || differs(edit.needsReview, normalizeNeedsReview(record.needsReview))
    || (edit.merchant !== undefined && text(edit.merchant) !== text(record.merchant));
}
