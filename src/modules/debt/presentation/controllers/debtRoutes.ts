import { Router } from 'express';
import { DebtController } from './debtController';
import { DebtModule } from '../../debtModule';

export function createDebtRouter(debtModule: DebtModule): Router {
  const router = Router();
  const controller = new DebtController(debtModule);

  // ==================== USER-SCOPED ROUTES ====================
  // Debts for a specific user (consistent with /transactions/user/:userId pattern)
  router.post('/user/:userId', controller.createDebt);
  router.get('/user/:userId', controller.getDebts);
  router.get('/user/:userId/summary', controller.getSummary);

  // ==================== DEBT-SCOPED ROUTES ====================
  // Single debt operations
  router.get('/:debtId', controller.getDebt);
  router.put('/:debtId', controller.updateDebt);
  router.delete('/:debtId', controller.deleteDebt);
  router.post('/:debtId/cancel', controller.cancelDebt);

  // ==================== PAYMENT ROUTES ====================
  // Payment operations on a debt
  router.post('/:debtId/pay', controller.payDebt);
  router.post('/:debtId/pay-full', controller.payDebtFull);

  // Delete a specific payment
  router.delete('/payments/:paymentId', controller.deletePayment);

  return router;
}
