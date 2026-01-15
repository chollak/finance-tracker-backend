import { Router } from 'express';
import { BudgetController } from './budgetController';
import { BudgetModule } from '../budgetModule';

export function createBudgetRouter(budgetModule: BudgetModule): Router {
  const router = Router();
  const controller = new BudgetController(budgetModule);

  // Budget CRUD operations (user-scoped)
  router.post('/users/:userId/budgets', controller.createBudget);
  router.get('/users/:userId/budgets', controller.getBudgets);

  // Budget analytics and summaries
  router.get('/users/:userId/budgets/summaries', controller.getBudgetSummaries);
  router.get('/users/:userId/budgets/alerts', controller.getBudgetAlerts);

  // Budget CRUD operations (budget-scoped)
  // Note: Router is mounted at /budgets, so paths become /budgets/:budgetId
  router.get('/:budgetId', controller.getBudget);
  router.put('/:budgetId', controller.updateBudget);
  router.delete('/:budgetId', controller.deleteBudget);

  // Budget utilities
  router.post('/:budgetId/recalculate', controller.recalculateBudgetSpending);

  return router;
}