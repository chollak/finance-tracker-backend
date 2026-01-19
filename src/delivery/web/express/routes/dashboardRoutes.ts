import { Router } from 'express';
import { DashboardController } from '../../../../modules/dashboard/presentation/controllers/dashboardController';
import { DashboardService } from '../../../../modules/dashboard/application/services/dashboardService';
import { AlertService } from '../../../../shared/application/services/alertService';
import { AnalyticsService } from '../../../../modules/transaction/application/analyticsService';
import { BudgetService } from '../../../../modules/budget/application/budgetService';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { createRequirePremiumMiddleware } from '../middleware/subscriptionMiddleware';

export function createDashboardRouter(
  analyticsService: AnalyticsService,
  budgetService: BudgetService,
  subscriptionModule?: SubscriptionModule,
  userModule?: UserModule
): Router {
  const router = Router();

  // Initialize services
  const dashboardService = new DashboardService(analyticsService, budgetService);
  const alertService = new AlertService(budgetService, analyticsService);
  const controller = new DashboardController(dashboardService, alertService);

  // Premium middleware (only if subscription module is available)
  const requirePremium = subscriptionModule && userModule
    ? createRequirePremiumMiddleware(subscriptionModule, userModule)
    : (_req: any, _res: any, next: any) => next(); // No-op if no subscription module

  // Dashboard insights endpoints - PREMIUM ONLY
  router.get('/insights/:userId', requirePremium, controller.getDashboardInsights);
  router.get('/insights/:userId/weekly', requirePremium, controller.getWeeklyInsights);
  router.get('/insights/:userId/health-score', requirePremium, controller.getFinancialHealthScore);

  // Alert endpoints - FREE (alerts help users)
  router.get('/alerts/:userId', controller.getAlerts);
  router.get('/alerts/:userId/summary', controller.getAlertSummary);

  // Combined dashboard endpoint - FREE (basic overview)
  router.get('/:userId', controller.getCompleteDashboard);

  // Quick stats for widgets - FREE
  router.get('/:userId/quick-stats', controller.getQuickStats);

  return router;
}