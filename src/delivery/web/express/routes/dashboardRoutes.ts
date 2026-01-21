import { Router } from 'express';
import { DashboardController } from '../../../../modules/dashboard/presentation/controllers/dashboardController';
import { DashboardService } from '../../../../modules/dashboard/application/services/dashboardService';
import { AlertService } from '../../../../shared/application/services/alertService';
import { AnalyticsService } from '../../../../modules/transaction/application/analyticsService';
import { BudgetService } from '../../../../modules/budget/application/budgetService';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { createRequirePremiumMiddleware } from '../middleware/subscriptionMiddleware';
import { createUserResolutionMiddleware } from '../middleware/userResolutionMiddleware';

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

  // User resolution middleware (resolves telegramId to UUID)
  const resolveUser = userModule
    ? createUserResolutionMiddleware(userModule)
    : (_req: any, _res: any, next: any) => next();

  // Premium middleware (only if subscription module is available)
  const requirePremium = subscriptionModule && userModule
    ? createRequirePremiumMiddleware(subscriptionModule, userModule)
    : (_req: any, _res: any, next: any) => next();

  // Dashboard insights endpoints - PREMIUM ONLY
  router.get('/insights/:userId', resolveUser, requirePremium, controller.getDashboardInsights);
  router.get('/insights/:userId/weekly', resolveUser, requirePremium, controller.getWeeklyInsights);
  router.get('/insights/:userId/health-score', resolveUser, requirePremium, controller.getFinancialHealthScore);

  // Alert endpoints - FREE (alerts help users)
  router.get('/alerts/:userId', resolveUser, controller.getAlerts);
  router.get('/alerts/:userId/summary', resolveUser, controller.getAlertSummary);

  // Combined dashboard endpoint - FREE (basic overview)
  router.get('/:userId', resolveUser, controller.getCompleteDashboard);

  // Quick stats for widgets - FREE
  router.get('/:userId/quick-stats', resolveUser, controller.getQuickStats);

  return router;
}