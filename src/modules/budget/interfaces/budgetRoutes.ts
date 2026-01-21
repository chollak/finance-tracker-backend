import { Router } from 'express';
import { BudgetController } from './budgetController';
import { BudgetModule } from '../budgetModule';
import { UserModule } from '../../user/userModule';
import { createUserResolutionMiddleware } from '../../../delivery/web/express/middleware/userResolutionMiddleware';

export function createBudgetRouter(
  budgetModule: BudgetModule,
  userModule?: UserModule
): Router {
  const router = Router();
  const controller = new BudgetController(budgetModule);

  // User resolution middleware (resolves telegramId to UUID)
  const resolveUser = userModule
    ? createUserResolutionMiddleware(userModule)
    : (_req: any, _res: any, next: any) => next();

  // Budget CRUD operations (user-scoped)
  router.post('/users/:userId/budgets', resolveUser, controller.createBudget);
  router.get('/users/:userId/budgets', resolveUser, controller.getBudgets);

  // Budget analytics and summaries
  router.get('/users/:userId/budgets/summaries', resolveUser, controller.getBudgetSummaries);
  router.get('/users/:userId/budgets/alerts', resolveUser, controller.getBudgetAlerts);

  // Budget CRUD operations (budget-scoped) - no user resolution needed
  router.get('/:budgetId', controller.getBudget);
  router.put('/:budgetId', controller.updateBudget);
  router.delete('/:budgetId', controller.deleteBudget);

  // Budget utilities
  router.post('/:budgetId/recalculate', controller.recalculateBudgetSpending);

  return router;
}