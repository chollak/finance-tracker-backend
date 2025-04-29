import { NotionRepository } from "../infrastructure/notionRepository";

export class AnalyticsService {
    private repository: NotionRepository;

    constructor(repository: NotionRepository) {
        this.repository = repository;
    }

    async getSummary(): Promise<{ totalIncome: number; totalExpense: number }> {
        const transactions = await this.repository.getAll();

        let totalIncome = 0;
        let totalExpense = 0;

        for (const transaction of transactions) {
            if (transaction.type === "income") {
                totalIncome += transaction.amount;
            } else if (transaction.type === "expense") {
                totalExpense += transaction.amount;
            }
        }

        return { totalIncome, totalExpense };
    }

    async getCategoryBreakdown(): Promise<{ [category: string]: number }> {
        const transactions = await this.repository.getAll();

        return transactions.reduce((acc, transaction) => {
            acc[transaction.category] = (acc[transaction.category] || 0) + transaction.amount;
            return acc;
        }, {} as { [category: string]: number });
    }
}
