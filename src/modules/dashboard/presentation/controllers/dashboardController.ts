import { Request, Response } from 'express';
import { DashboardService } from '../../application/services/dashboardService';
import { AlertService, AlertType, AlertSeverity } from '../../../../shared/application/services/alertService';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { UserModule } from '../../../user/userModule';
import { resolveUserIdToUUID, isGuestUser } from '../../../../shared/application/helpers/userIdResolver';

export class DashboardController {
  constructor(
    private dashboardService: DashboardService,
    private alertService: AlertService,
    private userModule?: UserModule
  ) {}

  /**
   * Resolve userId (telegramId or UUID) to UUID
   */
  private async resolveUserId(userId: string): Promise<string> {
    if (!this.userModule || isGuestUser(userId)) {
      return userId;
    }
    return resolveUserIdToUUID(userId, this.userModule);
  }

  getDashboardInsights = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Resolve telegramId to UUID
      const resolvedUserId = await this.resolveUserId(userId);

      let timeRange = undefined;
      if (startDate && endDate) {
        timeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      const insights = await this.dashboardService.getDashboardInsights(resolvedUserId, timeRange);
      return handleControllerSuccess(insights, res, 200, 'Dashboard insights retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getWeeklyInsights = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const weeks = req.query.weeks ? parseInt(req.query.weeks as string) : 4;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Resolve telegramId to UUID
      const resolvedUserId = await this.resolveUserId(userId);

      const insights = await this.dashboardService.getWeeklyInsights(resolvedUserId, weeks);
      return handleControllerSuccess(insights, res, 200, 'Weekly insights retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getFinancialHealthScore = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Resolve telegramId to UUID
      const resolvedUserId = await this.resolveUserId(userId);

      const healthScore = await this.dashboardService.calculateFinancialHealthScore(resolvedUserId);
      return handleControllerSuccess(healthScore, res, 200, 'Financial health score calculated successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  // Alert endpoints
  getAlerts = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { type, severity } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Resolve telegramId to UUID
      const resolvedUserId = await this.resolveUserId(userId);

      let alerts;
      if (type && Object.values(AlertType).includes(type as AlertType)) {
        alerts = await this.alertService.getAlertsByType(resolvedUserId, type as AlertType);
      } else if (severity && Object.values(AlertSeverity).includes(severity as AlertSeverity)) {
        alerts = await this.alertService.getAlertsBySeverity(resolvedUserId, severity as AlertSeverity);
      } else {
        alerts = await this.alertService.getActiveAlerts(resolvedUserId);
      }

      return handleControllerSuccess(alerts, res, 200, 'Alerts retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  getAlertSummary = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Resolve telegramId to UUID
      const resolvedUserId = await this.resolveUserId(userId);

      const summary = await this.alertService.getAlertSummary(resolvedUserId);
      return handleControllerSuccess(summary, res, 200, 'Alert summary retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  // Combined dashboard endpoint
  getCompleteDashboard = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Resolve telegramId to UUID
      const resolvedUserId = await this.resolveUserId(userId);

      let timeRange = undefined;
      if (startDate && endDate) {
        timeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      // Get all dashboard data in parallel
      const [
        insights,
        alerts,
        alertSummary,
        healthScore,
        weeklyInsights
      ] = await Promise.all([
        this.dashboardService.getDashboardInsights(resolvedUserId, timeRange),
        this.alertService.getActiveAlerts(resolvedUserId),
        this.alertService.getAlertSummary(resolvedUserId),
        this.dashboardService.calculateFinancialHealthScore(resolvedUserId),
        this.dashboardService.getWeeklyInsights(resolvedUserId, 4)
      ]);

      const completeDashboard = {
        insights,
        alerts: {
          active: alerts,
          summary: alertSummary
        },
        healthScore,
        weeklyInsights,
        lastUpdated: new Date()
      };

      return handleControllerSuccess(completeDashboard, res, 200, 'Complete dashboard data retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };

  // Utility endpoints
  getQuickStats = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      // Resolve telegramId to UUID
      const resolvedUserId = await this.resolveUserId(userId);

      const [insights, alertSummary] = await Promise.all([
        this.dashboardService.getDashboardInsights(resolvedUserId),
        this.alertService.getAlertSummary(resolvedUserId)
      ]);

      const quickStats = {
        netIncome: insights.financialSummary.netIncome,
        totalExpenses: insights.financialSummary.totalExpense,
        activeBudgets: insights.budgetOverview.activeBudgets,
        overBudgetCount: insights.budgetOverview.overBudgetCount,
        savingsRate: insights.insights.savingsRate,
        criticalAlerts: alertSummary.critical,
        totalAlerts: alertSummary.total,
        topSpendingCategory: insights.topCategories[0]?.category || 'N/A',
        spendingTrend: insights.insights.spendingTrend
      };

      return handleControllerSuccess(quickStats, res, 200, 'Quick stats retrieved successfully');
    } catch (error) {
      return handleControllerError(error, res);
    }
  };
}