// src/infrastructure/notionRepository.ts
import { TransactionRepository } from '../../domain/repositories/transactionRepository';
import { Transaction } from '../../domain/entity/transaction';
import { NotionService } from '../services/notionService';

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
