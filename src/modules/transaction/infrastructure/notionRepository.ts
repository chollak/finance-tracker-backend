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

    async findById(id: string): Promise<Transaction | null> {
        const transactions = await this.notionService.getTransactions();
        return transactions.find(t => t.id === id) || null;
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

    async getByUserIdAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]> {
        // For the Notion implementation, we'll filter all transactions by date range
        // In a production system, you'd use Notion's database query filters
        const allTransactions = await this.getAll();
        
        return allTransactions.filter(transaction => {
            const transactionDate = new Date(transaction.date);
            return transaction.userId === userId && 
                   transactionDate >= startDate && 
                   transactionDate <= endDate;
        });
    }
}
