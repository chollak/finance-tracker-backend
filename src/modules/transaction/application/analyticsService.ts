import { TransactionRepository } from "../domain/transactionRepository";
import { Transaction } from "../domain/transactionEntity";
import { countsAsBudgetSpending, countsAsIncome, countsAsRealExpense, normalizeSemanticType } from "../domain/transactionSemanticType";
import { fromMinor, minorOf, percentOf } from "../../../shared/domain/money/money";

// Sums are integer minor units (FT-097); responses keep сум for the screens that read them.

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
        
        const { incomeMinor, expenseMinor } = this.sumIncomeAndExpense(transactions);
        const transactionCount = transactions.length;
        const averageMinor = transactionCount > 0
            ? Math.round((incomeMinor + expenseMinor) / transactionCount)
            : 0;

        return {
            totalIncome: fromMinor(incomeMinor),
            totalExpense: fromMinor(expenseMinor),
            netIncome: fromMinor(incomeMinor - expenseMinor),
            transactionCount,
            averageTransactionAmount: fromMinor(averageMinor),
            period: this.formatPeriod(timeRange)
        };
    }

    async getDetailedCategoryBreakdown(userId: string, timeRange?: TimeRange): Promise<CategoryBreakdown> {
        // This breakdown backs the "Расходы по категориям" chart, so it must hold the
        // same real-spending set as the home screen and budgets: no income, no own
        // transfers/savings/withdrawals/debt, nothing still awaiting review.
        const expenseTransactions = (await this.getTransactionsInRange(userId, timeRange))
            .filter(t =>
                !t.needsReview
                && t.type === 'expense'
                && countsAsBudgetSpending(normalizeSemanticType(t.semanticType, t.type))
            );
        // Percentages are shares of real spending, not of total turnover.
        const totalMinor = expenseTransactions.reduce((sum, t) => sum + minorOf(t), 0);

        const breakdown: { [key: string]: { minor: number; count: number } } = {};

        for (const transaction of expenseTransactions) {
            if (!breakdown[transaction.category]) {
                breakdown[transaction.category] = { minor: 0, count: 0 };
            }
            breakdown[transaction.category].minor += minorOf(transaction);
            breakdown[transaction.category].count++;
        }

        const result: CategoryBreakdown = {};
        for (const [category, data] of Object.entries(breakdown)) {
            result[category] = {
                amount: fromMinor(data.minor),
                count: data.count,
                percentage: percentOf(data.minor, totalMinor)
            };
        }

        return result;
    }

    async getMonthlyTrends(userId: string, months: number = 12): Promise<MonthlyTrend[]> {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - months);

        const transactions = await this.getTransactionsInRange(userId, { startDate, endDate });
        
        const monthlyData: { [key: string]: MonthlyTrend & { incomeMinor: number; expensesMinor: number } } = {};

        for (const transaction of transactions) {
            if (transaction.needsReview) {
                continue;
            }

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
                    transactionCount: 0,
                    incomeMinor: 0,
                    expensesMinor: 0
                };
            }

            const data = monthlyData[monthKey];
            data.transactionCount++;

            const semanticType = normalizeSemanticType(transaction.semanticType, transaction.type);
            if (countsAsIncome(semanticType)) {
                data.incomeMinor += minorOf(transaction);
            } else if (countsAsRealExpense(semanticType)) {
                data.expensesMinor += minorOf(transaction);
            }
        }

        return Object.values(monthlyData)
            .map(({ incomeMinor, expensesMinor, ...trend }) => ({
                ...trend,
                income: fromMinor(incomeMinor),
                expenses: fromMinor(expensesMinor),
                net: fromMinor(incomeMinor - expensesMinor)
            }))
            .sort((a, b) => (a.year === b.year ? 
                new Date(`${a.month} 1, ${a.year}`).getMonth() - new Date(`${b.month} 1, ${b.year}`).getMonth() :
                a.year - b.year));
    }

    async getSpendingPatterns(userId: string, timeRange?: TimeRange): Promise<SpendingPattern[]> {
        const transactions = await this.getTransactionsInRange(userId, timeRange);
        const expenseTransactions = transactions.filter(t =>
            !t.needsReview && countsAsRealExpense(normalizeSemanticType(t.semanticType, t.type))
        );

        const dayData: { [key: string]: { total: number; count: number } } = {};
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (const transaction of expenseTransactions) {
            const date = new Date(transaction.date);
            const dayName = dayNames[date.getDay()];

            if (!dayData[dayName]) {
                dayData[dayName] = { total: 0, count: 0 };
            }

            dayData[dayName].total += minorOf(transaction);
            dayData[dayName].count++;
        }

        return dayNames.map(dayName => ({
            dayOfWeek: dayName,
            averageAmount: dayData[dayName]
                ? fromMinor(Math.round(dayData[dayName].total / dayData[dayName].count))
                : 0,
            transactionCount: dayData[dayName]?.count || 0
        }));
    }

    async getTopCategories(userId: string, timeRange?: TimeRange, limit: number = 5): Promise<Array<{ category: string; amount: number; percentage: number }>> {
        const transactions = await this.getTransactionsInRange(userId, timeRange);
        const expenseTransactions = transactions.filter(t =>
            !t.needsReview && countsAsRealExpense(normalizeSemanticType(t.semanticType, t.type)) && !t.isDebtRelated
        );
        const totalExpenseMinor = expenseTransactions.reduce((sum, t) => sum + minorOf(t), 0);
        const categoryTotals: Record<string, number> = {};

        for (const transaction of expenseTransactions) {
            categoryTotals[transaction.category] = (categoryTotals[transaction.category] || 0) + minorOf(transaction);
        }

        return Object.entries(categoryTotals)
            .map(([category, minor]) => ({
                category,
                amount: fromMinor(minor),
                percentage: percentOf(minor, totalExpenseMinor)
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, limit);
    }

    /**
     * Get transactions for a user within a time range.
     * Use this method when you need to process transactions in bulk (e.g., weekly insights)
     * to avoid N+1 query problems.
     */
    async getTransactionsForUser(userId: string, timeRange?: TimeRange): Promise<Transaction[]> {
        return this.getTransactionsInRange(userId, timeRange);
    }

    // Helper methods
    private async getTransactionsInRange(userId: string, timeRange?: TimeRange): Promise<Transaction[]> {
        if (!timeRange) {
            // Use findByUserId instead of getAll() + filter to avoid N+1 query problem
            return await this.repository.findByUserId(userId);
        }

        return await this.repository.getByUserIdAndDateRange(userId, timeRange.startDate, timeRange.endDate);
    }

    private calculateBasicSummary(transactions: Transaction[]): { totalIncome: number; totalExpense: number } {
        const { incomeMinor, expenseMinor } = this.sumIncomeAndExpense(transactions);
        return { totalIncome: fromMinor(incomeMinor), totalExpense: fromMinor(expenseMinor) };
    }

    private sumIncomeAndExpense(transactions: Transaction[]): { incomeMinor: number; expenseMinor: number } {
        let incomeMinor = 0;
        let expenseMinor = 0;

        for (const transaction of transactions) {
            // Skip debt-related transactions from balance calculation
            if (transaction.isDebtRelated) {
                continue;
            }

            // Skip transactions flagged for review from finalized totals
            if (transaction.needsReview) {
                continue;
            }

            const semanticType = normalizeSemanticType(transaction.semanticType, transaction.type);
            if (countsAsIncome(semanticType)) {
                incomeMinor += minorOf(transaction);
            } else if (countsAsRealExpense(semanticType)) {
                expenseMinor += minorOf(transaction);
            }
        }

        return { incomeMinor, expenseMinor };
    }

    private calculateSimpleCategoryBreakdown(transactions: Transaction[]): { [category: string]: number } {
        const minorByCategory = transactions.reduce((acc, transaction) => {
            acc[transaction.category] = (acc[transaction.category] || 0) + minorOf(transaction);
            return acc;
        }, {} as { [category: string]: number });
        const result: { [category: string]: number } = {};
        for (const [category, minor] of Object.entries(minorByCategory)) {
            result[category] = fromMinor(minor);
        }
        return result;
    }

    private formatPeriod(timeRange?: TimeRange): string {
        if (!timeRange) return 'All time';
        
        const start = timeRange.startDate.toLocaleDateString();
        const end = timeRange.endDate.toLocaleDateString();
        return `${start} - ${end}`;
    }
}
