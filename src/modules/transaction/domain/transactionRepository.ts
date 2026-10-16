// src/domain/transactionRepository.ts
import { Transaction } from "./transactionEntity";

export interface TransactionRepository {
    create(transaction: Transaction): Promise<Transaction>;
    getAll(): Promise<Transaction[]>;
    /** Reads leave deleted records out (FT-105); only the *IncludingDeleted lookup sees them. */
    findById(id: string): Promise<Transaction | null>;
    findByUserId(userId: string, limit?: number): Promise<Transaction[]>;
    /** Deletes softly (FT-105). */
    delete(id: string): Promise<void>;
    /** Brings a softly deleted record back. */
    restore(id: string): Promise<Transaction>;
    findByIdIncludingDeleted(id: string): Promise<Transaction | null>;
    /**
     * The records the client sent under this id (FT-106), deleted ones too: the record with exactly
     * this client id and the further records of the same quick capture («<id>:1», …), in order.
     */
    findByClientId(userId: string, clientId: string): Promise<Transaction[]>;
    update(id: string, updates: Partial<Transaction>): Promise<Transaction>;
    getByUserIdAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]>;

    // Archive methods
    archive(id: string): Promise<void>;
    unarchive(id: string): Promise<void>;
    archiveMultiple(ids: string[]): Promise<void>;
    archiveAllByUserId(userId: string): Promise<number>;
    findArchivedByUserId(userId: string, limit?: number): Promise<Transaction[]>;
    findByIdIncludingArchived(id: string): Promise<Transaction | null>;
}
