// src/domain/transactionRepository.ts
import { Transaction } from "./transactionEntity";

export interface TransactionRepository {
    save(transaction: Transaction): Promise<string>;
    getAll(): Promise<Transaction[]>;
    findById(id: string): Promise<Transaction | null>;
    findByUserId(userId: string, limit?: number): Promise<Transaction[]>;
    delete(id: string): Promise<void>;
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
