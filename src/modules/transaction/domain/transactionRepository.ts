// src/domain/transactionRepository.ts
import { Transaction } from "./transactionEntity";

export interface TransactionRepository {
    save(transaction: Transaction): Promise<string>;
    getAll(): Promise<Transaction[]>;
    findById(id: string): Promise<Transaction | null>;
    delete(id: string): Promise<void>;
    update(id: string, updates: Partial<Transaction>): Promise<Transaction>;
}
