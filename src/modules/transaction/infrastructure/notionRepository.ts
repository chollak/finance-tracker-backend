// src/infrastructure/notionRepository.ts
import { NotionService } from '../../../infrastructure/services/notionService';
import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';

export class NotionRepository implements TransactionRepository {
    private notionService: NotionService;

    constructor(notionService: NotionService) {
        this.notionService = notionService;
    }

    async save(transaction: Transaction): Promise<void> {
        await this.notionService.saveTransaction(transaction);
    }

    async getAll(): Promise<Transaction[]> {
        return this.notionService.getTransactions();
    }
}
