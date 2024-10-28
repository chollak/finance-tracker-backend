// src/infrastructure/localFileRepository.ts
import { LocalFileService } from '../../../infrastructure/services/localFileService';
import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';

export class LocalFileRepository implements TransactionRepository {
    private localFileService: LocalFileService;

    constructor(localFileService: LocalFileService) {
        this.localFileService = localFileService;
    }

    async save(transaction: Transaction): Promise<void> {
        await this.localFileService.saveTransaction(transaction);
    }

    async getAll(): Promise<Transaction[]> {
        return this.localFileService.getTransactions();
    }
}
