// src/domain/transactionRepository.ts
import { Transaction } from "./transactionEntity";

export interface TransactionRepository {
    save(transaction: Transaction): Promise<void>;
    getAll(): Promise<Transaction[]>;
}
