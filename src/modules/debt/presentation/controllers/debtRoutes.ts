import { Router } from 'express';
import { DebtController } from './debtController';
import { DebtModule } from '../../debtModule';
import { UserModule } from '../../../user/userModule';
import { createUserResolutionMiddleware } from '../../../../delivery/web/express/middleware/userResolutionMiddleware';

export function createDebtRouter(
  debtModule: DebtModule,
  userModule?: UserModule
): Router {
  const router = Router();
  const controller = new DebtController(debtModule);

  // User resolution middleware (resolves telegramId to UUID)
  const resolveUser = userModule
    ? createUserResolutionMiddleware(userModule)
    : (_req: any, _res: any, next: any) => next();

  // ==================== USER-SCOPED ROUTES ====================
  // Debts for a specific user (consistent with /transactions/user/:userId pattern)
  router.post('/user/:userId', resolveUser, controller.createDebt);
  router.get('/user/:userId', resolveUser, controller.getDebts);
  router.get('/user/:userId/summary', resolveUser, controller.getSummary);

  // ==================== DEBT-SCOPED ROUTES ====================
  // Single debt operations - no user resolution needed
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
