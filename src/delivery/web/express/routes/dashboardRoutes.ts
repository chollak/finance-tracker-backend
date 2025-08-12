import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { DashboardService } from '../services/dashboardService';
import { AlertService } from '../services/alertService';
import { AnalyticsService } from '../../modules/transaction/application/analyticsService';
import { BudgetService } from '../../modules/budget/application/budgetService';

export function createDashboardRouter(
  analyticsService: AnalyticsService,
  budgetService: BudgetService
): Router {
  const router = Router();
  
  // Initialize services
  const dashboardService = new DashboardService(analyticsService, budgetService);
  const alertService = new AlertService(budgetService, analyticsService);
  const controller = new DashboardController(dashboardService, alertService);

  // Dashboard insights endpoints
  router.get('/insights/:userId', controller.getDashboardInsights);
  router.get('/insights/:userId/weekly', controller.getWeeklyInsights);
  router.get('/insights/:userId/health-score', controller.getFinancialHealthScore);

  // Alert endpoints
  router.get('/alerts/:userId', controller.getAlerts);
  router.get('/alerts/:userId/summary', controller.getAlertSummary);

  // Combined dashboard endpoint - the main one most clients would use
  router.get('/:userId', controller.getCompleteDashboard);

  // Quick stats for widgets or mobile apps
  router.get('/:userId/quick-stats', controller.getQuickStats);

  return router;
}