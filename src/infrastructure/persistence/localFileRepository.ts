// src/infrastructure/localFileRepository.ts
import { TransactionRepository } from '../../domain/repositories/transactionRepository';
import { Transaction } from '../../domain/entity/transaction';
import { LocalFileService } from '../services/localFileService';

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
