// src/domain/transactionRepository.ts
import { Transaction } from "./transactionEntity";

export interface TransactionRepository {
    save(transaction: Transaction): Promise<string>;
    getAll(): Promise<Transaction[]>;
    delete(id: string): Promise<void>;
}
