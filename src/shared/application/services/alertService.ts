import { BudgetService } from '../../../modules/budget/application/budgetService';
import { AnalyticsService } from '../../../modules/transaction/application/analyticsService';

export enum AlertType {
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  BUDGET_NEAR_LIMIT = 'BUDGET_NEAR_LIMIT',
  UNUSUAL_SPENDING = 'UNUSUAL_SPENDING',
  HIGH_CATEGORY_SPENDING = 'HIGH_CATEGORY_SPENDING',
  LOW_SAVINGS_RATE = 'LOW_SAVINGS_RATE',
  SPENDING_TREND_UP = 'SPENDING_TREND_UP',
  RECURRING_PAYMENT_DUE = 'RECURRING_PAYMENT_DUE'
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  userId: string;
  actionable: boolean;
  suggestions?: string[];
}

export interface AlertConfig {
  budgetWarningThreshold: number; // 0.8 = 80%
  budgetCriticalThreshold: number; // 1.0 = 100%
  unusualSpendingThreshold: number; // 2.0 = 200% of average
  lowSavingsRateThreshold: number; // 0.1 = 10%
  spendingTrendThreshold: number; // 0.2 = 20% increase
}

export class AlertService {
  private defaultConfig: AlertConfig = {
    budgetWarningThreshold: 0.8,
    budgetCriticalThreshold: 1.0,
    unusualSpendingThreshold: 2.0,
    lowSavingsRateThreshold: 0.1,
    spendingTrendThreshold: 0.2
  };

  constructor(
    private budgetService: BudgetService,
    private analyticsService: AnalyticsService
  ) {}

  async generateAlertsForUser(userId: string, config?: Partial<AlertConfig>): Promise<Alert[]> {
    const alertConfig = { ...this.defaultConfig, ...config };
    const alerts: Alert[] = [];

    // Get budget alerts
    const budgetAlerts = await this.generateBudgetAlerts(userId, alertConfig);
    alerts.push(...budgetAlerts);

    // Get spending alerts
    const spendingAlerts = await this.generateSpendingAlerts(userId, alertConfig);
    alerts.push(...spendingAlerts);

    // Get financial health alerts
    const healthAlerts = await this.generateFinancialHealthAlerts(userId, alertConfig);
    alerts.push(...healthAlerts);

    // Sort by severity and timestamp
    return alerts.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }

  private async generateBudgetAlerts(userId: string, config: AlertConfig): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const budgetSummaries = await this.budgetService.getBudgetSummaries(userId);

    for (const budget of budgetSummaries) {
      const utilizationRate = budget.amount > 0 ? budget.spent / budget.amount : 0;

      // Budget exceeded alert
      if (utilizationRate >= config.budgetCriticalThreshold) {
        alerts.push({
          id: `budget-exceeded-${budget.id}`,
          type: AlertType.BUDGET_EXCEEDED,
          severity: AlertSeverity.CRITICAL,
          title: 'Budget Exceeded',
          message: `You've exceeded your "${budget.name}" budget by ${Math.round((utilizationRate - 1) * 100)}%`,
          data: { budget },
          timestamp: new Date(),
          userId,
          actionable: true,
          suggestions: [
            'Review recent transactions in this category',
            'Consider adjusting your budget amount',
            'Reduce spending in this category for the remainder of the period'
          ]
        });
      }
      // Budget near limit alert
      else if (utilizationRate >= config.budgetWarningThreshold) {
        const remainingDays = budget.daysRemaining;
        const remainingAmount = budget.remaining;

        alerts.push({
          id: `budget-warning-${budget.id}`,
          type: AlertType.BUDGET_NEAR_LIMIT,
          severity: AlertSeverity.HIGH,
          title: 'Budget Near Limit',
          message: `You've used ${Math.round(utilizationRate * 100)}% of your "${budget.name}" budget with ${remainingDays} days left`,
          data: { budget },
          timestamp: new Date(),
          userId,
          actionable: true,
          suggestions: [
            `You have $${remainingAmount.toFixed(2)} remaining for ${remainingDays} days`,
            'Monitor your spending closely in this category',
            remainingDays > 0 ? `Daily budget remaining: $${(remainingAmount / remainingDays).toFixed(2)}` : 'Budget period ending soon'
          ]
        });
      }
    }

    return alerts;
  }

  private async generateSpendingAlerts(userId: string, config: AlertConfig): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Get recent spending data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30); // Last 30 days

    const [_recentSummary, monthlyTrends, topCategories] = await Promise.all([
      this.analyticsService.getAnalyticsSummary(userId, { startDate, endDate }),
      this.analyticsService.getMonthlyTrends(userId, 3),
      this.analyticsService.getTopCategories(userId, { startDate, endDate }, 3)
    ]);

    // Check for unusual spending
    if (monthlyTrends.length >= 2) {
      const currentMonthSpending = monthlyTrends[monthlyTrends.length - 1].expenses;
      const previousMonthsAvg = monthlyTrends.slice(0, -1).reduce((sum, t) => sum + t.expenses, 0) / (monthlyTrends.length - 1);

      if (currentMonthSpending > previousMonthsAvg * config.unusualSpendingThreshold) {
        alerts.push({
          id: `unusual-spending-${Date.now()}`,
          type: AlertType.UNUSUAL_SPENDING,
          severity: AlertSeverity.MEDIUM,
          title: 'Unusual Spending Detected',
          message: `Your spending this month ($${currentMonthSpending.toFixed(2)}) is ${Math.round((currentMonthSpending / previousMonthsAvg - 1) * 100)}% higher than average`,
          data: { currentSpending: currentMonthSpending, averageSpending: previousMonthsAvg },
          timestamp: new Date(),
          userId,
          actionable: true,
          suggestions: [
            'Review your recent transactions for unexpected charges',
            'Check if this increase is due to planned expenses',
            'Consider adjusting your budget if this is a new normal'
          ]
        });
      }
    }

    // Check for high category spending
    const topCategory = topCategories[0];
    if (topCategory && topCategory.percentage > 50) {
      alerts.push({
        id: `high-category-spending-${Date.now()}`,
        type: AlertType.HIGH_CATEGORY_SPENDING,
        severity: AlertSeverity.MEDIUM,
        title: 'High Category Concentration',
        message: `${topCategory.percentage}% of your spending is in "${topCategory.category}" category`,
        data: { category: topCategory },
        timestamp: new Date(),
        userId,
        actionable: true,
        suggestions: [
          'Consider if this spending concentration is intentional',
          'Look for ways to diversify your spending',
          'Review transactions in this category for optimization opportunities'
        ]
      });
    }

    return alerts;
  }

  private async generateFinancialHealthAlerts(userId: string, config: AlertConfig): Promise<Alert[]> {
    const alerts: Alert[] = [];

    const summary = await this.analyticsService.getAnalyticsSummary(userId);
    const monthlyTrends = await this.analyticsService.getMonthlyTrends(userId, 6);

    // Low savings rate alert
    if (summary.totalIncome > 0) {
      const savingsRate = (summary.netIncome / summary.totalIncome);
      if (savingsRate < config.lowSavingsRateThreshold) {
        alerts.push({
          id: `low-savings-${Date.now()}`,
          type: AlertType.LOW_SAVINGS_RATE,
          severity: AlertSeverity.MEDIUM,
          title: 'Low Savings Rate',
          message: `Your savings rate is ${Math.round(savingsRate * 100)}%, below the recommended 20%`,
          data: { savingsRate },
          timestamp: new Date(),
          userId,
          actionable: true,
          suggestions: [
            'Review your expenses for potential cuts',
            'Consider automating your savings',
            'Look for opportunities to increase income',
            'Set up a separate savings budget category'
          ]
        });
      }
    }

    // Spending trend alert
    if (monthlyTrends.length >= 3) {
      const recent = monthlyTrends.slice(-2);
      const earlier = monthlyTrends.slice(-4, -2);
      
      if (recent.length === 2 && earlier.length === 2) {
        const recentAvg = recent.reduce((sum, t) => sum + t.expenses, 0) / 2;
        const earlierAvg = earlier.reduce((sum, t) => sum + t.expenses, 0) / 2;
        const trendIncrease = (recentAvg - earlierAvg) / earlierAvg;

        if (trendIncrease > config.spendingTrendThreshold) {
          alerts.push({
            id: `spending-trend-${Date.now()}`,
            type: AlertType.SPENDING_TREND_UP,
            severity: AlertSeverity.MEDIUM,
            title: 'Spending Trend Increasing',
            message: `Your spending has increased by ${Math.round(trendIncrease * 100)}% over the last few months`,
            data: { trendIncrease },
            timestamp: new Date(),
            userId,
            actionable: true,
            suggestions: [
              'Analyze what\'s driving the spending increase',
              'Review and adjust your budgets accordingly',
              'Set spending limits for high-growth categories',
              'Consider if this trend aligns with your financial goals'
            ]
          });
        }
      }
    }

    return alerts;
  }

  async getActiveAlerts(userId: string): Promise<Alert[]> {
    // In a real implementation, you'd store alerts in the database
    // For now, we'll generate them on demand
    return this.generateAlertsForUser(userId);
  }

  async getAlertsByType(userId: string, type: AlertType): Promise<Alert[]> {
    const allAlerts = await this.generateAlertsForUser(userId);
    return allAlerts.filter(alert => alert.type === type);
  }

  async getAlertsBySeverity(userId: string, severity: AlertSeverity): Promise<Alert[]> {
    const allAlerts = await this.generateAlertsForUser(userId);
    return allAlerts.filter(alert => alert.severity === severity);
  }

  // Utility method to check if user should receive notifications
  shouldTriggerNotification(alert: Alert): boolean {
    return alert.severity === AlertSeverity.CRITICAL || 
           alert.severity === AlertSeverity.HIGH ||
           alert.type === AlertType.BUDGET_EXCEEDED;
  }

  // Generate alert summary for dashboard
  async getAlertSummary(userId: string): Promise<{
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    actionable: number;
  }> {
    const alerts = await this.generateAlertsForUser(userId);
    
    return {
      total: alerts.length,
      critical: alerts.filter(a => a.severity === AlertSeverity.CRITICAL).length,
      high: alerts.filter(a => a.severity === AlertSeverity.HIGH).length,
      medium: alerts.filter(a => a.severity === AlertSeverity.MEDIUM).length,
      low: alerts.filter(a => a.severity === AlertSeverity.LOW).length,
      actionable: alerts.filter(a => a.actionable).length
    };
  }
}