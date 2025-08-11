import { Router } from 'express';
import { BudgetController } from './budgetController';
import { BudgetModule } from '../budgetModule';

export function createBudgetRouter(budgetModule: BudgetModule): Router {
  const router = Router();
  const controller = new BudgetController(budgetModule);

  // Budget CRUD operations
  router.post('/users/:userId/budgets', controller.createBudget);
  router.get('/users/:userId/budgets', controller.getBudgets);
  router.get('/budgets/:budgetId', controller.getBudget);
  router.put('/budgets/:budgetId', controller.updateBudget);
  router.delete('/budgets/:budgetId', controller.deleteBudget);

  // Budget analytics and summaries
  router.get('/users/:userId/budgets/summaries', controller.getBudgetSummaries);
  router.get('/users/:userId/budgets/alerts', controller.getBudgetAlerts);

  // Budget utilities
  router.post('/budgets/:budgetId/recalculate', controller.recalculateBudgetSpending);

  return router;
}