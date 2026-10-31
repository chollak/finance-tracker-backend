import { TransactionRepository } from "../domain/transactionRepository";
import { Transaction } from "../domain/transactionEntity";
import { countsAsIncome, countsAsRealExpense, normalizeSemanticType } from "../domain/transactionSemanticType";
import { fromMinor } from "../../../shared/domain/money/money";
import { PeriodTotals, uzsMinorOf } from "../domain/periodTotals";
import { PeriodTotalsService } from "./periodTotalsService";

// Sums are integer minor units (FT-097) through the shared period totals (FT-103): dollars at the
// user's effective rate, never added to сум as is. Responses keep сум for the screens that read them.

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
    private periodTotals: PeriodTotalsService;

    constructor(repository: TransactionRepository, periodTotals: PeriodTotalsService = new PeriodTotalsService()) {
        this.repository = repository;
        this.periodTotals = periodTotals;
    }

    /** The rate dollars in these records convert at for this user, or null. */
    async usdRateFor(userId: string, transactions: Transaction[]): Promise<number | null> {
        return this.periodTotals.usdRateFor(userId, transactions);
    }

    private totals(userId: string, transactions: Transaction[]): Promise<PeriodTotals> {
        return this.periodTotals.summarize(userId, transactions);
    }

    // Enhanced methods with time filtering
    async getAnalyticsSummary(userId: string, timeRange?: TimeRange): Promise<AnalyticsSummary> {
        const transactions = await this.getTransactionsInRange(userId, timeRange);

        const { incomeMinor, expenseMinor } = await this.totals(userId, transactions);
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
        // Percentages are shares of real spending, not of total turnover.
        const transactions = (await this.getTransactionsInRange(userId, timeRange)).filter(t => t.type === 'expense');
        const { categories } = await this.totals(userId, transactions);

        const result: CategoryBreakdown = {};
        for (const category of categories) {
            result[category.category] = {
                amount: fromMinor(category.amountMinor),
                count: category.count,
                percentage: category.percentage
            };
        }

        return result;
    }

    async getMonthlyTrends(userId: string, months: number = 12): Promise<MonthlyTrend[]> {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - months);

        const transactions = await this.getTransactionsInRange(userId, { startDate, endDate });
        const rate = await this.usdRateFor(userId, transactions);

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
            const minor = uzsMinorOf(transaction, rate) ?? 0;
            if (countsAsIncome(semanticType)) {
                data.incomeMinor += minor;
            } else if (countsAsRealExpense(semanticType)) {
                data.expensesMinor += minor;
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
        const rate = await this.usdRateFor(userId, transactions);
        const expenseTransactions = transactions.filter(t =>
            !t.needsReview && countsAsRealExpense(normalizeSemanticType(t.semanticType, t.type)) && uzsMinorOf(t, rate) !== null
        );

        const dayData: { [key: string]: { total: number; count: number } } = {};
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (const transaction of expenseTransactions) {
            const date = new Date(transaction.date);
            const dayName = dayNames[date.getDay()];

            if (!dayData[dayName]) {
                dayData[dayName] = { total: 0, count: 0 };
            }

            dayData[dayName].total += uzsMinorOf(transaction, rate) ?? 0;
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
        const { categories } = await this.totals(userId, transactions);

        return categories
            .map(category => ({
                category: category.category,
                amount: fromMinor(category.amountMinor),
                percentage: category.percentage
            }))
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

    private formatPeriod(timeRange?: TimeRange): string {
        if (!timeRange) return 'All time';
        
        const start = timeRange.startDate.toLocaleDateString();
        const end = timeRange.endDate.toLocaleDateString();
        return `${start} - ${end}`;
    }
}
