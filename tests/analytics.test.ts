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
      save: jest.fn(),
      getAll: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      getByUserIdAndDateRange: jest.fn(),
    };

    analyticsService = new AnalyticsService(mockRepository);
  });

  describe('getAnalyticsSummary', () => {
    it('should calculate analytics summary with all transactions', async () => {
      mockRepository.getAll.mockResolvedValue(mockTransactions);

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
      mockRepository.getAll.mockResolvedValue(mockTransactions);

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
      mockRepository.getAll.mockResolvedValue(mockTransactions);

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
      mockRepository.getAll.mockResolvedValue(mockTransactions);

      const topCategories = await analyticsService.getTopCategories('user-123', undefined, 3);

      expect(topCategories).toHaveLength(3);
      expect(topCategories[0].category).toBe('Income');
      expect(topCategories[0].amount).toBe(200);
      
      expect(topCategories[1].category).toBe('Food');
      expect(topCategories[1].amount).toBe(150);
      
      expect(topCategories[2].category).toBe('Transportation');
      expect(topCategories[2].amount).toBe(75);
    });

    it('should limit results to specified number', async () => {
      mockRepository.getAll.mockResolvedValue(mockTransactions);

      const topCategories = await analyticsService.getTopCategories('user-123', undefined, 2);

      expect(topCategories).toHaveLength(2);
      expect(topCategories[0].category).toBe('Income');
      expect(topCategories[1].category).toBe('Food');
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