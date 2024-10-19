// src/domain/transactionRepository.ts
import { Transaction } from "../entity/transaction";

export interface TransactionRepository {
    save(transaction: Transaction): Promise<void>;
    getAll(): Promise<Transaction[]>;
}
