import { TransactionRepository } from "../domain/transactionRepository";
import { Transaction } from "../domain/transactionEntity";

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface AnalyticsSummary {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  transactionCount: number;
  averageTransactionAmount: number;
  period: string;
}

export interface CategoryBreakdown {
  [category: string]: {
    amount: number;
    count: number;
    percentage: number;
  };
}

export interface MonthlyTrend {
  month: string;
  year: number;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface SpendingPattern {
  dayOfWeek: string;
  averageAmount: number;
  transactionCount: number;
}

export class AnalyticsService {
    private repository: TransactionRepository;

    constructor(repository: TransactionRepository) {
        this.repository = repository;
    }

    // Original methods for backward compatibility
    async getSummary(): Promise<{ totalIncome: number; totalExpense: number }> {
        const transactions = await this.repository.getAll();
        return this.calculateBasicSummary(transactions);
    }

    async getCategoryBreakdown(): Promise<{ [category: string]: number }> {
        const transactions = await this.repository.getAll();
        return this.calculateSimpleCategoryBreakdown(transactions);
    }

    // Enhanced methods with time filtering
    async getAnalyticsSummary(userId: string, timeRange?: TimeRange): Promise<AnalyticsSummary> {
        const transactions = await this.getTransactionsInRange(userId, timeRange);
        
        const { totalIncome, totalExpense } = this.calculateBasicSummary(transactions);
        const netIncome = totalIncome - totalExpense;
        const transactionCount = transactions.length;
        const averageTransactionAmount = transactionCount > 0 
            ? (totalIncome + totalExpense) / transactionCount 
            : 0;

        return {
            totalIncome,
            totalExpense,
            netIncome,
            transactionCount,
            averageTransactionAmount: Math.round(averageTransactionAmount * 100) / 100,
            period: this.formatPeriod(timeRange)
        };
    }

    async getDetailedCategoryBreakdown(userId: string, timeRange?: TimeRange): Promise<CategoryBreakdown> {
        const transactions = await this.getTransactionsInRange(userId, timeRange);
        const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
        
        const breakdown: { [key: string]: { amount: number; count: number } } = {};
        
        for (const transaction of transactions) {
            if (!breakdown[transaction.category]) {
                breakdown[transaction.category] = { amount: 0, count: 0 };
            }
            breakdown[transaction.category].amount += transaction.amount;
            breakdown[transaction.category].count++;
        }

        const result: CategoryBreakdown = {};
        for (const [category, data] of Object.entries(breakdown)) {
            result[category] = {
                amount: Math.round(data.amount * 100) / 100,
                count: data.count,
                percentage: totalAmount > 0 ? Math.round((data.amount / totalAmount) * 10000) / 100 : 0
            };
        }

        return result;
    }

    async getMonthlyTrends(userId: string, months: number = 12): Promise<MonthlyTrend[]> {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - months);

        const transactions = await this.getTransactionsInRange(userId, { startDate, endDate });
        
        const monthlyData: { [key: string]: MonthlyTrend } = {};

        for (const transaction of transactions) {
            const date = new Date(transaction.date);
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            const year = date.getFullYear();

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    month: monthName,
                    year,
                    income: 0,
                    expenses: 0,
                    net: 0,
                    transactionCount: 0
                };
            }

            const data = monthlyData[monthKey];
            data.transactionCount++;

            if (transaction.type === 'income') {
                data.income += transaction.amount;
            } else {
                data.expenses += transaction.amount;
            }
            data.net = data.income - data.expenses;
        }

        return Object.values(monthlyData)
            .sort((a, b) => (a.year === b.year ? 
                new Date(`${a.month} 1, ${a.year}`).getMonth() - new Date(`${b.month} 1, ${b.year}`).getMonth() :
                a.year - b.year));
    }

    async getSpendingPatterns(userId: string, timeRange?: TimeRange): Promise<SpendingPattern[]> {
        const transactions = await this.getTransactionsInRange(userId, timeRange);
        const expenseTransactions = transactions.filter(t => t.type === 'expense');
        
        const dayData: { [key: string]: { total: number; count: number } } = {};
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (const transaction of expenseTransactions) {
            const date = new Date(transaction.date);
            const dayName = dayNames[date.getDay()];

            if (!dayData[dayName]) {
                dayData[dayName] = { total: 0, count: 0 };
            }

            dayData[dayName].total += transaction.amount;
            dayData[dayName].count++;
        }

        return dayNames.map(dayName => ({
            dayOfWeek: dayName,
            averageAmount: dayData[dayName] 
                ? Math.round((dayData[dayName].total / dayData[dayName].count) * 100) / 100 
                : 0,
            transactionCount: dayData[dayName]?.count || 0
        }));
    }

    async getTopCategories(userId: string, timeRange?: TimeRange, limit: number = 5): Promise<Array<{ category: string; amount: number; percentage: number }>> {
        const breakdown = await this.getDetailedCategoryBreakdown(userId, timeRange);
        
        return Object.entries(breakdown)
            .map(([category, data]) => ({
                category,
                amount: data.amount,
                percentage: data.percentage
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, limit);
    }

    // Helper methods
    private async getTransactionsInRange(userId: string, timeRange?: TimeRange): Promise<Transaction[]> {
        if (!timeRange) {
            // Get all transactions for the user
            const allTransactions = await this.repository.getAll();
            return allTransactions.filter(t => t.userId === userId);
        }

        return await this.repository.getByUserIdAndDateRange(userId, timeRange.startDate, timeRange.endDate);
    }

    private calculateBasicSummary(transactions: Transaction[]): { totalIncome: number; totalExpense: number } {
        let totalIncome = 0;
        let totalExpense = 0;

        for (const transaction of transactions) {
            // Skip debt-related transactions from balance calculation
            if (transaction.isDebtRelated) {
                continue;
            }

            if (transaction.type === "income") {
                totalIncome += transaction.amount;
            } else if (transaction.type === "expense") {
                totalExpense += transaction.amount;
            }
        }

        return { totalIncome, totalExpense };
    }

    private calculateSimpleCategoryBreakdown(transactions: Transaction[]): { [category: string]: number } {
        return transactions.reduce((acc, transaction) => {
            acc[transaction.category] = (acc[transaction.category] || 0) + transaction.amount;
            return acc;
        }, {} as { [category: string]: number });
    }

    private formatPeriod(timeRange?: TimeRange): string {
        if (!timeRange) return 'All time';
        
        const start = timeRange.startDate.toLocaleDateString();
        const end = timeRange.endDate.toLocaleDateString();
        return `${start} - ${end}`;
    }
}
