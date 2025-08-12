import { DashboardService } from '../src/modules/dashboard/application/services/dashboardService';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { BudgetService } from '../src/modules/budget/application/budgetService';
import { BudgetSummary, BudgetPeriod } from '../src/modules/budget/domain/budgetEntity';

describe('Dashboard Service', () => {
  let dashboardService: DashboardService;
  let mockAnalyticsService: jest.Mocked<AnalyticsService>;
  let mockBudgetService: jest.Mocked<BudgetService>;

  const mockAnalyticsSummary = {
    totalIncome: 1000,
    totalExpense: 750,
    netIncome: 250,
    transactionCount: 15,
    averageTransactionAmount: 116.67,
    period: 'All time'
  };

  const mockBudgetSummaries: BudgetSummary[] = [
    {
      id: 'budget-1',
      name: 'Food Budget',
      amount: 500,
      spent: 300,
      remaining: 200,
      percentageUsed: 60,
      isOverBudget: false,
      period: BudgetPeriod.MONTHLY,
      daysRemaining: 10
    },
    {
      id: 'budget-2',
      name: 'Transport Budget',
      amount: 200,
      spent: 220,
      remaining: -20,
      percentageUsed: 110,
      isOverBudget: true,
      period: BudgetPeriod.MONTHLY,
      daysRemaining: 10
    }
  ];

  const mockTopCategories = [
    { category: 'Food', amount: 400, percentage: 53.33 },
    { category: 'Transportation', amount: 250, percentage: 33.33 },
    { category: 'Entertainment', amount: 100, percentage: 13.33 }
  ];

  const mockMonthlyTrends = [
    { month: 'Nov', year: 2023, income: 800, expenses: 600, net: 200, transactionCount: 12 },
    { month: 'Dec', year: 2023, income: 900, expenses: 700, net: 200, transactionCount: 14 },
    { month: 'Jan', year: 2024, income: 1000, expenses: 750, net: 250, transactionCount: 15 }
  ];

  const mockSpendingPatterns = [
    { dayOfWeek: 'Monday', averageAmount: 45, transactionCount: 3 },
    { dayOfWeek: 'Tuesday', averageAmount: 32, transactionCount: 2 },
    { dayOfWeek: 'Wednesday', averageAmount: 78, transactionCount: 4 },
    { dayOfWeek: 'Thursday', averageAmount: 25, transactionCount: 2 },
    { dayOfWeek: 'Friday', averageAmount: 95, transactionCount: 3 },
    { dayOfWeek: 'Saturday', averageAmount: 120, transactionCount: 1 },
    { dayOfWeek: 'Sunday', averageAmount: 0, transactionCount: 0 }
  ];

  beforeEach(() => {
    mockAnalyticsService = {
      getAnalyticsSummary: jest.fn(),
      getTopCategories: jest.fn(),
      getMonthlyTrends: jest.fn(),
      getSpendingPatterns: jest.fn(),
      getDetailedCategoryBreakdown: jest.fn(),
    } as any;

    mockBudgetService = {
      getBudgetSummaries: jest.fn(),
      getBudgetsNearLimit: jest.fn(),
      getOverBudgets: jest.fn(),
    } as any;

    dashboardService = new DashboardService(mockAnalyticsService, mockBudgetService);
  });

  describe('getDashboardInsights', () => {
    it('should return comprehensive dashboard insights', async () => {
      // Setup mocks
      mockAnalyticsService.getAnalyticsSummary.mockResolvedValue(mockAnalyticsSummary);
      mockAnalyticsService.getTopCategories.mockResolvedValue(mockTopCategories);
      mockAnalyticsService.getMonthlyTrends.mockResolvedValue(mockMonthlyTrends);
      mockAnalyticsService.getSpendingPatterns.mockResolvedValue(mockSpendingPatterns);
      
      mockBudgetService.getBudgetSummaries.mockResolvedValue(mockBudgetSummaries);
      mockBudgetService.getBudgetsNearLimit.mockResolvedValue([]);
      mockBudgetService.getOverBudgets.mockResolvedValue([mockBudgetSummaries[1]]);

      const insights = await dashboardService.getDashboardInsights('user-123');

      // Verify financial summary
      expect(insights.financialSummary).toEqual(mockAnalyticsSummary);

      // Verify budget overview
      expect(insights.budgetOverview.totalBudgets).toBe(2);
      expect(insights.budgetOverview.activeBudgets).toBe(2);
      expect(insights.budgetOverview.totalBudgetAmount).toBe(700); // 500 + 200
      expect(insights.budgetOverview.totalSpent).toBe(520); // 300 + 220
      expect(insights.budgetOverview.overBudgetCount).toBe(1);

      // Verify other components
      expect(insights.topCategories).toEqual(mockTopCategories);
      expect(insights.monthlyTrends).toEqual(mockMonthlyTrends);
      expect(insights.spendingPatterns).toEqual(mockSpendingPatterns);

      // Verify insights calculations
      expect(insights.insights.topSpendingDay).toBe('Saturday'); // Highest average amount
      expect(insights.insights.averageMonthlySpending).toBe(683.33); // (600 + 700 + 750) / 3
      expect(insights.insights.spendingTrend).toBe('stable'); // Based on algorithm logic
      expect(insights.insights.budgetUtilization).toBe(74.29); // 520 / 700 * 100
      expect(insights.insights.savingsRate).toBe(25); // (1000 - 750) / 1000 * 100
    });

    it('should handle empty data gracefully', async () => {
      mockAnalyticsService.getAnalyticsSummary.mockResolvedValue({
        totalIncome: 0,
        totalExpense: 0,
        netIncome: 0,
        transactionCount: 0,
        averageTransactionAmount: 0,
        period: 'All time'
      });
      mockAnalyticsService.getTopCategories.mockResolvedValue([]);
      mockAnalyticsService.getMonthlyTrends.mockResolvedValue([]);
      mockAnalyticsService.getSpendingPatterns.mockResolvedValue(mockSpendingPatterns);
      
      mockBudgetService.getBudgetSummaries.mockResolvedValue([]);
      mockBudgetService.getBudgetsNearLimit.mockResolvedValue([]);
      mockBudgetService.getOverBudgets.mockResolvedValue([]);

      const insights = await dashboardService.getDashboardInsights('user-123');

      expect(insights.budgetOverview.totalBudgets).toBe(0);
      expect(insights.insights.savingsRate).toBe(0);
      expect(insights.insights.budgetUtilization).toBe(0);
      expect(insights.budgetAlerts.recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateFinancialHealthScore', () => {
    it('should calculate financial health score', async () => {
      mockAnalyticsService.getAnalyticsSummary.mockResolvedValue(mockAnalyticsSummary);
      mockAnalyticsService.getMonthlyTrends.mockResolvedValue(mockMonthlyTrends);
      mockAnalyticsService.getDetailedCategoryBreakdown.mockResolvedValue({
        'Food': { amount: 400, count: 8, percentage: 53.33 },
        'Transportation': { amount: 250, count: 4, percentage: 33.33 },
        'Entertainment': { amount: 100, count: 3, percentage: 13.33 }
      });
      
      mockBudgetService.getBudgetSummaries.mockResolvedValue(mockBudgetSummaries);

      const healthScore = await dashboardService.calculateFinancialHealthScore('user-123');

      expect(healthScore.score).toBeGreaterThan(0);
      expect(healthScore.score).toBeLessThanOrEqual(100);
      
      expect(healthScore.factors.budgetCompliance).toBeGreaterThan(0);
      expect(healthScore.factors.savingsRate).toBeGreaterThan(0);
      expect(healthScore.factors.expenseVariability).toBeGreaterThan(0);
      expect(healthScore.factors.categoryDiversification).toBeGreaterThan(0);
      
      expect(Array.isArray(healthScore.recommendations)).toBe(true);
    });

    it('should provide appropriate recommendations based on score factors', async () => {
      // Setup for low health score scenario
      mockAnalyticsService.getAnalyticsSummary.mockResolvedValue({
        totalIncome: 1000,
        totalExpense: 950, // Low savings rate
        netIncome: 50,
        transactionCount: 20,
        averageTransactionAmount: 50,
        period: 'All time'
      });
      
      mockAnalyticsService.getMonthlyTrends.mockResolvedValue([
        { month: 'Jan', year: 2024, income: 1000, expenses: 500, net: 500, transactionCount: 10 },
        { month: 'Feb', year: 2024, income: 1000, expenses: 800, net: 200, transactionCount: 15 },
        { month: 'Mar', year: 2024, income: 1000, expenses: 950, net: 50, transactionCount: 20 }
      ]);
      
      mockAnalyticsService.getDetailedCategoryBreakdown.mockResolvedValue({
        'Food': { amount: 900, count: 18, percentage: 94.74 }, // Very concentrated spending
        'Other': { amount: 50, count: 2, percentage: 5.26 }
      });
      
      mockBudgetService.getBudgetSummaries.mockResolvedValue([
        { ...mockBudgetSummaries[0], isOverBudget: true }, // Poor budget compliance
        { ...mockBudgetSummaries[1], isOverBudget: true }
      ]);

      const healthScore = await dashboardService.calculateFinancialHealthScore('user-123');

      expect(healthScore.score).toBeLessThan(50); // Should be low
      expect(healthScore.recommendations.length).toBeGreaterThan(2);
      expect(healthScore.recommendations.some(r => r.includes('budget adherence'))).toBe(true);
      expect(healthScore.recommendations.some(r => r.includes('savings rate'))).toBe(true);
    });
  });

  describe('getWeeklyInsights', () => {
    it('should return weekly insights', async () => {
      mockAnalyticsService.getAnalyticsSummary.mockImplementation((userId, timeRange) => {
        // Mock different data based on date range
        if (timeRange) {
          return Promise.resolve({
            totalIncome: 250,
            totalExpense: 180,
            netIncome: 70,
            transactionCount: 5,
            averageTransactionAmount: 36,
            period: 'Week'
          });
        }
        return Promise.resolve(mockAnalyticsSummary);
      });

      mockAnalyticsService.getTopCategories.mockResolvedValue([
        { category: 'Food', amount: 120, percentage: 66.67 }
      ]);

      const weeklyInsights = await dashboardService.getWeeklyInsights('user-123', 2);

      expect(weeklyInsights).toHaveLength(2);
      expect(weeklyInsights[0].income).toBe(250);
      expect(weeklyInsights[0].expenses).toBe(180);
      expect(weeklyInsights[0].net).toBe(70);
      expect(weeklyInsights[0].topCategory).toBe('Food');
      expect(weeklyInsights[0].week).toContain('-'); // Should contain date range
    });
  });
});