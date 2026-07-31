import { AnalyticsService, TimeRange } from '../src/modules/transaction/application/analyticsService';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

describe('Enhanced Analytics Service', () => {
  let analyticsService: AnalyticsService;
  let mockRepository: jest.Mocked<TransactionRepository>;

  const mockTransactions: Transaction[] = [
    {
      id: '1',
      amount: 50,
      type: 'expense',
      description: 'Groceries',
      date: '2024-01-15',
      category: 'Food',
      userId: 'user-123',
      merchant: 'Supermarket',
      confidence: 0.9,
      originalText: 'groceries 50',
      userName: 'John'
    },
    {
      id: '2',
      amount: 100,
      type: 'expense',
      description: 'Restaurant',
      date: '2024-01-16',
      category: 'Food',
      userId: 'user-123',
      merchant: 'Restaurant ABC',
      confidence: 0.8,
      originalText: 'dinner 100',
      userName: 'John'
    },
    {
      id: '3',
      amount: 200,
      type: 'income',
      description: 'Salary',
      date: '2024-01-20',
      category: 'Income',
      userId: 'user-123',
      merchant: 'Company XYZ',
      confidence: 1.0,
      originalText: 'salary 200',
      userName: 'John'
    },
    {
      id: '4',
      amount: 75,
      type: 'expense',
      description: 'Gas',
      date: '2024-02-15',
      category: 'Transportation',
      userId: 'user-123',
      merchant: 'Gas Station',
      confidence: 0.9,
      originalText: 'gas 75',
      userName: 'John'
    }
  ];

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      getAll: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      getByUserIdAndDateRange: jest.fn(),
      // Archive methods
      archive: jest.fn(),
      unarchive: jest.fn(),
      archiveMultiple: jest.fn(),
      archiveAllByUserId: jest.fn(),
      findArchivedByUserId: jest.fn(),
      findByIdIncludingArchived: jest.fn(),
    };

    analyticsService = new AnalyticsService(mockRepository);
  });

  describe('getAnalyticsSummary', () => {
    it('should calculate analytics summary with all transactions', async () => {
      mockRepository.findByUserId.mockResolvedValue(mockTransactions);

      const summary = await analyticsService.getAnalyticsSummary('user-123');

      expect(summary.totalIncome).toBe(200);
      expect(summary.totalExpense).toBe(225); // 50 + 100 + 75
      expect(summary.netIncome).toBe(-25); // 200 - 225
      expect(summary.transactionCount).toBe(4);
      expect(summary.averageTransactionAmount).toBe(106.25); // (200 + 225) / 4
      expect(summary.period).toBe('All time');
    });

    it('should filter transactions by date range', async () => {
      const januaryTransactions = mockTransactions.filter(t => t.date.startsWith('2024-01'));
      mockRepository.getByUserIdAndDateRange.mockResolvedValue(januaryTransactions);

      const timeRange: TimeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      const summary = await analyticsService.getAnalyticsSummary('user-123', timeRange);

      expect(summary.totalIncome).toBe(200);
      expect(summary.totalExpense).toBe(150); // 50 + 100
      expect(summary.netIncome).toBe(50);
      expect(summary.transactionCount).toBe(3);
      expect(summary.period).toContain('2024');
    });
  });

  describe('getDetailedCategoryBreakdown', () => {
    it('should calculate detailed category breakdown with percentages', async () => {
      mockRepository.findByUserId.mockResolvedValue(mockTransactions);

      const breakdown = await analyticsService.getDetailedCategoryBreakdown('user-123');

      expect(breakdown.Food.amount).toBe(150); // 50 + 100
      expect(breakdown.Food.count).toBe(2);
      expect(breakdown.Food.percentage).toBeCloseTo(35.29, 1); // 150 / (150 + 200 + 75) * 100

      expect(breakdown.Transportation.amount).toBe(75);
      expect(breakdown.Transportation.count).toBe(1);
      expect(breakdown.Transportation.percentage).toBeCloseTo(17.65, 1);

      expect(breakdown.Income.amount).toBe(200);
      expect(breakdown.Income.count).toBe(1);
      expect(breakdown.Income.percentage).toBeCloseTo(47.06, 1);
    });
  });

  describe('getMonthlyTrends', () => {
    it('should calculate monthly trends', async () => {
      mockRepository.getByUserIdAndDateRange.mockResolvedValue(mockTransactions);

      const trends = await analyticsService.getMonthlyTrends('user-123', 3);

      expect(trends).toHaveLength(2); // January and February
      
      const januaryTrend = trends.find(t => t.month === 'Jan' && t.year === 2024);
      expect(januaryTrend?.income).toBe(200);
      expect(januaryTrend?.expenses).toBe(150);
      expect(januaryTrend?.net).toBe(50);
      expect(januaryTrend?.transactionCount).toBe(3);

      const februaryTrend = trends.find(t => t.month === 'Feb' && t.year === 2024);
      expect(februaryTrend?.income).toBe(0);
      expect(februaryTrend?.expenses).toBe(75);
      expect(februaryTrend?.net).toBe(-75);
      expect(februaryTrend?.transactionCount).toBe(1);
    });
  });

  describe('getSpendingPatterns', () => {
    it('should calculate spending patterns by day of week', async () => {
      // Mock dates: 2024-01-15 is Monday, 2024-01-16 is Tuesday, 2024-02-15 is Thursday
      mockRepository.findByUserId.mockResolvedValue(mockTransactions);

      const patterns = await analyticsService.getSpendingPatterns('user-123');

      expect(patterns).toHaveLength(7); // All days of the week
      
      const mondayPattern = patterns.find(p => p.dayOfWeek === 'Monday');
      expect(mondayPattern?.averageAmount).toBe(50);
      expect(mondayPattern?.transactionCount).toBe(1);

      const tuesdayPattern = patterns.find(p => p.dayOfWeek === 'Tuesday');
      expect(tuesdayPattern?.averageAmount).toBe(100);
      expect(tuesdayPattern?.transactionCount).toBe(1);

      const thursdayPattern = patterns.find(p => p.dayOfWeek === 'Thursday');
      expect(thursdayPattern?.averageAmount).toBe(75);
      expect(thursdayPattern?.transactionCount).toBe(1);

      // Days with no transactions should have zero values
      const sundayPattern = patterns.find(p => p.dayOfWeek === 'Sunday');
      expect(sundayPattern?.averageAmount).toBe(0);
      expect(sundayPattern?.transactionCount).toBe(0);
    });
  });

  describe('getTopCategories', () => {
    it('should return top categories sorted by amount', async () => {
      mockRepository.findByUserId.mockResolvedValue(mockTransactions);

      const topCategories = await analyticsService.getTopCategories('user-123', undefined, 3);

      expect(topCategories).toHaveLength(2);
      expect(topCategories[0].category).toBe('Food');
      expect(topCategories[0].amount).toBe(150);
      expect(topCategories[0].percentage).toBe(66.67);
      
      expect(topCategories[1].category).toBe('Transportation');
      expect(topCategories[1].amount).toBe(75);
      expect(topCategories[1].percentage).toBe(33.33);
    });

    it('should limit results to specified number', async () => {
      mockRepository.findByUserId.mockResolvedValue(mockTransactions);

      const topCategories = await analyticsService.getTopCategories('user-123', undefined, 2);

      expect(topCategories).toHaveLength(2);
      expect(topCategories[0].category).toBe('Food');
      expect(topCategories[1].category).toBe('Transportation');
    });
  });

  describe('semanticType-aware spending calculations', () => {
    // A normal expense plus one transaction of every non-expense semantic type,
    // each tagged with a legacy `type` that would previously have inflated totals.
    const semanticTransactions: Transaction[] = [
      { id: 'sem-1', amount: 50, type: 'expense', semanticType: 'expense', description: 'Groceries', date: '2024-03-04', category: 'Food', userId: 'user-123' }, // Monday
      { id: 'sem-2', amount: 500, type: 'expense', semanticType: 'own_transfer', description: 'Move to savings account', date: '2024-03-05', category: 'Transfer', userId: 'user-123' },
      { id: 'sem-3', amount: 300, type: 'expense', semanticType: 'saving_deposit', description: 'Deposit', date: '2024-03-06', category: 'Savings', userId: 'user-123' },
      { id: 'sem-4', amount: 200, type: 'expense', semanticType: 'debt', description: 'Lent money to a friend', date: '2024-03-07', category: 'Debt', userId: 'user-123' },
      { id: 'sem-5', amount: 80, type: 'income', semanticType: 'reimbursement', description: 'Refund from friend', date: '2024-03-08', category: 'Refund', userId: 'user-123' },
      { id: 'sem-6', amount: 100, type: 'expense', semanticType: 'cash_withdrawal', description: 'ATM withdrawal', date: '2024-03-09', category: 'Cash', userId: 'user-123' },
      { id: 'sem-7', amount: 150, type: 'expense', semanticType: 'group_payment', description: 'Split restaurant bill', date: '2024-03-10', category: 'Group', userId: 'user-123' },
    ];

    it('getAnalyticsSummary counts only real expense/income semanticTypes, not transfers/savings/debt/reimbursement/withdrawals/group payments', async () => {
      mockRepository.findByUserId.mockResolvedValue(semanticTransactions);

      const summary = await analyticsService.getAnalyticsSummary('user-123');

      expect(summary.totalExpense).toBe(50); // only sem-1
      expect(summary.totalIncome).toBe(0); // reimbursement does not count as income
      expect(summary.transactionCount).toBe(7); // all transactions still counted
    });

    it('getSpendingPatterns excludes non-expense semanticTypes from day-of-week totals', async () => {
      mockRepository.findByUserId.mockResolvedValue(semanticTransactions);

      const patterns = await analyticsService.getSpendingPatterns('user-123');

      const mondayPattern = patterns.find(p => p.dayOfWeek === 'Monday');
      expect(mondayPattern?.averageAmount).toBe(50);
      expect(mondayPattern?.transactionCount).toBe(1);

      const otherDaysTotal = patterns
        .filter(p => p.dayOfWeek !== 'Monday')
        .reduce((sum, p) => sum + p.transactionCount, 0);
      expect(otherDaysTotal).toBe(0);
    });

    it('getTopCategories excludes non-expense semanticTypes', async () => {
      mockRepository.findByUserId.mockResolvedValue(semanticTransactions);

      const topCategories = await analyticsService.getTopCategories('user-123');

      expect(topCategories).toHaveLength(1);
      expect(topCategories[0].category).toBe('Food');
      expect(topCategories[0].amount).toBe(50);
    });

    it('getMonthlyTrends counts only real expense/income semanticTypes', async () => {
      mockRepository.getByUserIdAndDateRange.mockResolvedValue(semanticTransactions);

      const trends = await analyticsService.getMonthlyTrends('user-123', 3);

      const marchTrend = trends.find(t => t.month === 'Mar' && t.year === 2024);
      expect(marchTrend?.expenses).toBe(50);
      expect(marchTrend?.income).toBe(0);
      expect(marchTrend?.transactionCount).toBe(7);
    });

    it('preserves legacy fallback: transactions without semanticType still count by their raw type', async () => {
      // mockTransactions (defined above) has no semanticType field on any entry
      mockRepository.findByUserId.mockResolvedValue(mockTransactions);

      const summary = await analyticsService.getAnalyticsSummary('user-123');

      expect(summary.totalExpense).toBe(225); // 50 + 100 + 75, same as legacy behavior
      expect(summary.totalIncome).toBe(200);
    });
  });

  describe('needsReview exclusion from finalized totals', () => {
    const needsReviewTransactions: Transaction[] = [
      { id: 'nr-1', amount: 50, type: 'expense', semanticType: 'expense', description: 'Groceries', date: '2024-04-01', category: 'Food', userId: 'user-123' }, // Monday
      { id: 'nr-2', amount: 300, type: 'expense', semanticType: 'expense', description: 'Uncertain purchase', date: '2024-04-02', category: 'Food', userId: 'user-123', needsReview: true },
      { id: 'nr-3', amount: 200, type: 'income', semanticType: 'income', description: 'Uncertain income', date: '2024-04-03', category: 'Income', userId: 'user-123', needsReview: true },
      { id: 'nr-4', amount: 100, type: 'income', semanticType: 'income', description: 'Salary', date: '2024-04-04', category: 'Income', userId: 'user-123' },
    ];

    it('getAnalyticsSummary excludes needsReview transactions from totalExpense/totalIncome', async () => {
      mockRepository.findByUserId.mockResolvedValue(needsReviewTransactions);

      const summary = await analyticsService.getAnalyticsSummary('user-123');

      expect(summary.totalExpense).toBe(50); // nr-1 only, nr-2 excluded
      expect(summary.totalIncome).toBe(100); // nr-4 only, nr-3 excluded
    });

    it('getDetailedCategoryBreakdown excludes needsReview transactions', async () => {
      mockRepository.findByUserId.mockResolvedValue(needsReviewTransactions);

      const breakdown = await analyticsService.getDetailedCategoryBreakdown('user-123');

      expect(breakdown.Food.amount).toBe(50);
      expect(breakdown.Food.count).toBe(1);
      expect(breakdown.Income.amount).toBe(100);
      expect(breakdown.Income.count).toBe(1);
    });

    it('getTopCategories excludes needsReview transactions', async () => {
      mockRepository.findByUserId.mockResolvedValue(needsReviewTransactions);

      const topCategories = await analyticsService.getTopCategories('user-123');

      expect(topCategories).toHaveLength(1);
      expect(topCategories[0].category).toBe('Food');
      expect(topCategories[0].amount).toBe(50);
    });

    it('getMonthlyTrends excludes needsReview transactions from income/expenses', async () => {
      mockRepository.getByUserIdAndDateRange.mockResolvedValue(needsReviewTransactions);

      const trends = await analyticsService.getMonthlyTrends('user-123', 3);

      const aprilTrend = trends.find(t => t.month === 'Apr' && t.year === 2024);
      expect(aprilTrend?.expenses).toBe(50);
      expect(aprilTrend?.income).toBe(100);
    });

    it('getSpendingPatterns excludes needsReview transactions', async () => {
      mockRepository.findByUserId.mockResolvedValue(needsReviewTransactions);

      const patterns = await analyticsService.getSpendingPatterns('user-123');

      const mondayPattern = patterns.find(p => p.dayOfWeek === 'Monday');
      expect(mondayPattern?.averageAmount).toBe(50);
      expect(mondayPattern?.transactionCount).toBe(1);

      const tuesdayPattern = patterns.find(p => p.dayOfWeek === 'Tuesday'); // nr-2's date
      expect(tuesdayPattern?.transactionCount).toBe(0);
    });
  });

  describe('backward compatibility', () => {
    it('should maintain getSummary method for existing code', async () => {
      mockRepository.getAll.mockResolvedValue(mockTransactions);

      const summary = await analyticsService.getSummary();

      expect(summary.totalIncome).toBe(200);
      expect(summary.totalExpense).toBe(225);
    });

    it('should maintain getCategoryBreakdown method for existing code', async () => {
      mockRepository.getAll.mockResolvedValue(mockTransactions);

      const breakdown = await analyticsService.getCategoryBreakdown();

      expect(breakdown.Food).toBe(150);
      expect(breakdown.Transportation).toBe(75);
      expect(breakdown.Income).toBe(200);
    });
  });
});