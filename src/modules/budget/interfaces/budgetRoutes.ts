import { Router } from 'express';
import { BudgetController } from './budgetController';
import { BudgetModule } from '../budgetModule';
import { UserModule } from '../../user/userModule';
import { createUserResolutionMiddleware } from '../../../delivery/web/express/middleware/userResolutionMiddleware';
import { allowGuestMode, optionalAuth, verifyOwnership } from '../../../delivery/web/express/middleware/authMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';

export function createBudgetRouter(
  budgetModule: BudgetModule,
  userModule?: UserModule
): Router {
  const router = Router();
  const controller = new BudgetController(budgetModule, userModule);

  // Apply rate limiting to all budget routes
  router.use(standardRateLimiter);

  // User resolution middleware (resolves telegramId to UUID)
  const resolveUser = userModule
    ? createUserResolutionMiddleware(userModule)
    : (_req: any, _res: any, next: any) => next();

  // Budget CRUD operations (user-scoped)
  // Protected with auth + ownership verification (guests allowed)
  router.post('/users/:userId/budgets', allowGuestMode, resolveUser, verifyOwnership, controller.createBudget);
  router.get('/users/:userId/budgets', allowGuestMode, resolveUser, verifyOwnership, controller.getBudgets);

  // Budget analytics and summaries
  router.get('/users/:userId/budgets/summaries', allowGuestMode, resolveUser, verifyOwnership, controller.getBudgetSummaries);
  router.get('/users/:userId/budgets/alerts', allowGuestMode, resolveUser, verifyOwnership, controller.getBudgetAlerts);

  // Budget CRUD operations (budget-scoped)
  // Ownership verification is done in controller by fetching budget and checking userId
  // optionalAuth: validates auth if present, allows unauthenticated for guest resources
  router.get('/:budgetId', optionalAuth, controller.getBudget);
  router.put('/:budgetId', optionalAuth, controller.updateBudget);
  router.delete('/:budgetId', optionalAuth, controller.deleteBudget);

  // Budget utilities
  router.post('/:budgetId/recalculate', optionalAuth, controller.recalculateBudgetSpending);

  return router;
}