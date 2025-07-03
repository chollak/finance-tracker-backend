// src/application/deleteTransaction.ts
import { TransactionRepository } from '../domain/transactionRepository';

export class DeleteTransactionUseCase {
    constructor(private repository: TransactionRepository) {}

    async execute(id: string): Promise<void> {
        await this.repository.delete(id);
    }
}
