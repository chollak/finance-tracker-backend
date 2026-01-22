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
import { allowGuestMode, verifyOwnership } from '../middleware/authMiddleware';
import { readOnlyRateLimiter } from '../middleware/rateLimitMiddleware';

export function createDashboardRouter(
  analyticsService: AnalyticsService,
  budgetService: BudgetService,
  subscriptionModule?: SubscriptionModule,
  userModule?: UserModule
): Router {
  const router = Router();

  // Apply rate limiting to all dashboard routes (read-only, more generous limits)
  router.use(readOnlyRateLimiter);

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
  // Protected with auth + ownership verification (guests allowed)
  router.get('/insights/:userId', allowGuestMode, resolveUser, verifyOwnership, requirePremium, controller.getDashboardInsights);
  router.get('/insights/:userId/weekly', allowGuestMode, resolveUser, verifyOwnership, requirePremium, controller.getWeeklyInsights);
  router.get('/insights/:userId/health-score', allowGuestMode, resolveUser, verifyOwnership, requirePremium, controller.getFinancialHealthScore);

  // Alert endpoints - FREE (alerts help users)
  router.get('/alerts/:userId', allowGuestMode, resolveUser, verifyOwnership, controller.getAlerts);
  router.get('/alerts/:userId/summary', allowGuestMode, resolveUser, verifyOwnership, controller.getAlertSummary);

  // Combined dashboard endpoint - FREE (basic overview)
  router.get('/:userId', allowGuestMode, resolveUser, verifyOwnership, controller.getCompleteDashboard);

  // Quick stats for widgets - FREE
  router.get('/:userId/quick-stats', allowGuestMode, resolveUser, verifyOwnership, controller.getQuickStats);

  return router;
}