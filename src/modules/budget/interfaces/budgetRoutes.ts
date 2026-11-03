import { Router } from 'express';
import { BudgetController } from './budgetController';
import { BudgetModule } from '../budgetModule';
import { UserModule } from '../../user/userModule';
import { createUserResolutionMiddleware } from '../../../delivery/web/express/middleware/userResolutionMiddleware';
import { optionalAuth, requireAuth, verifyOwnership } from '../../../delivery/web/express/middleware/authMiddleware';
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
  // Signed in, and the path id must be the signed-in user's own (no guests, #206)
  router.post('/users/:userId/budgets', requireAuth, verifyOwnership, resolveUser, controller.createBudget);
  router.get('/users/:userId/budgets', requireAuth, verifyOwnership, resolveUser, controller.getBudgets);

  // Budget analytics and summaries
  router.get('/users/:userId/budgets/summaries', requireAuth, verifyOwnership, resolveUser, controller.getBudgetSummaries);
  router.get('/users/:userId/budgets/alerts', requireAuth, verifyOwnership, resolveUser, controller.getBudgetAlerts);

  // Budget CRUD operations (budget-scoped)
  // Ownership verification is done in controller by fetching budget and checking userId
  // optionalAuth: the controller checks the record's owner and refuses a request without a signed-in user (403)
  router.get('/:budgetId', optionalAuth, controller.getBudget);
  router.put('/:budgetId', optionalAuth, controller.updateBudget);
  router.delete('/:budgetId', optionalAuth, controller.deleteBudget);

  // Budget utilities
  router.post('/:budgetId/recalculate', optionalAuth, controller.recalculateBudgetSpending);

  return router;
}