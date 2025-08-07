// src/infrastructure/notionRepository.ts
import { NotionService } from '../../../infrastructure/services/notionService';
import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';

export class NotionRepository implements TransactionRepository {
    private notionService: NotionService;

    constructor(notionService: NotionService) {
        this.notionService = notionService;
    }

    async save(transaction: Transaction): Promise<string> {
        return this.notionService.saveTransaction(transaction);
    }

    async getAll(): Promise<Transaction[]> {
        return this.notionService.getTransactions();
    }

    async getRecentTransactions(limit: number): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.slice(-limit); // Берем последние N записей
    }

    async delete(id: string): Promise<void> {
        await this.notionService.deleteTransaction(id);
    }

    async update(id: string, updates: Partial<Transaction>): Promise<Transaction> {
        return this.notionService.updateTransaction(id, updates);
    }
}
