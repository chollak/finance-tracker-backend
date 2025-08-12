import { Request, Response } from 'express';
import { DashboardService } from '../services/dashboardService';
import { AlertService, AlertType, AlertSeverity } from '../services/alertService';
import { handleControllerError, handleControllerSuccess } from '../utils/controllerHelpers';

export class DashboardController {
  constructor(
    private dashboardService: DashboardService,
    private alertService: AlertService
  ) {}

  getDashboardInsights = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!userId) {
        return handleControllerError(new Error('User ID is required'), res);
      }

      let timeRange = undefined;
      if (startDate && endDate) {
        timeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        };
      }

      const insights = await this.dashboardService.getDashboardInsights(userId, timeRange);
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

      const insights = await this.dashboardService.getWeeklyInsights(userId, weeks);
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

      const healthScore = await this.dashboardService.calculateFinancialHealthScore(userId);
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

      let alerts;
      if (type && Object.values(AlertType).includes(type as AlertType)) {
        alerts = await this.alertService.getAlertsByType(userId, type as AlertType);
      } else if (severity && Object.values(AlertSeverity).includes(severity as AlertSeverity)) {
        alerts = await this.alertService.getAlertsBySeverity(userId, severity as AlertSeverity);
      } else {
        alerts = await this.alertService.getActiveAlerts(userId);
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

      const summary = await this.alertService.getAlertSummary(userId);
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
        this.dashboardService.getDashboardInsights(userId, timeRange),
        this.alertService.getActiveAlerts(userId),
        this.alertService.getAlertSummary(userId),
        this.dashboardService.calculateFinancialHealthScore(userId),
        this.dashboardService.getWeeklyInsights(userId, 4)
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

      const [insights, alertSummary] = await Promise.all([
        this.dashboardService.getDashboardInsights(userId),
        this.alertService.getAlertSummary(userId)
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