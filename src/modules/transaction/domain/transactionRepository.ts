// src/domain/transactionRepository.ts
import { Transaction } from "./transactionEntity";
import { HistoryAmount, HistoryCursor, HistoryFilters, HistoryPage } from "./transactionHistory";

export interface TransactionRepository {
    create(transaction: Transaction): Promise<Transaction>;
    /**
     * Reads leave deleted records out (FT-105); only the *IncludingDeleted lookup sees them. Records archived before
     * #273 are left out the same way (decision Д7) — only that lookup and findByClientId see them; nothing archives a
     * record or brings one back any more.
     */
    findById(id: string): Promise<Transaction | null>;
    findByUserId(userId: string, limit?: number): Promise<Transaction[]>;
    /**
     * Deletes softly (FT-105) in one write that changes only a record not deleted yet (#383): true when this call
     * deleted it, false when it was deleted already — by another delete at the same moment too — or is unknown.
     */
    delete(id: string): Promise<boolean>;
    /**
     * Brings a softly deleted record back in one write that changes only a deleted record (#383): true when this call
     * restored it, false when it is not deleted — restored by another call at the same moment too — or is unknown.
     */
    restore(id: string): Promise<boolean>;
    findByIdIncludingDeleted(id: string): Promise<Transaction | null>;
    /**
     * The records the client sent under this id (FT-106), deleted ones too: the record with exactly
     * this client id and the further records of the same quick capture («<id>:1», …), in order.
     */
    findByClientId(userId: string, clientId: string): Promise<Transaction[]>;
    /** One page of the user's history (FT-107), newest first; not archived, not deleted. */
    findHistory(userId: string, filters: HistoryFilters, cursor: HistoryCursor | null, limit: number): Promise<HistoryPage>;
    /** Type, currency and amount of every record the same filters find, all pages: the summary of a search (FT-116). */
    findHistoryAmounts(userId: string, filters: HistoryFilters): Promise<HistoryAmount[]>;
    update(id: string, updates: Partial<Transaction>): Promise<Transaction>;
    /**
     * Not archived, not deleted records of the user dated from `from` to `to`, both days included. Days are YYYY-MM-DD
     * on the user's calendar, as records keep them: no `Date` whose local day could differ (#275).
     */
    getByUserIdAndDateRange(userId: string, from: string, to: string): Promise<Transaction[]>;
    /** The day of the user's earliest record (not archived, not deleted) — when recording began (FT-120); null without records. */
    findFirstRecordDate(userId: string): Promise<string | null>;
}
