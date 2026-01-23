import { Router } from 'express';
import { DebtController } from './debtController';
import { DebtModule } from '../../debtModule';
import { UserModule } from '../../../user/userModule';
import { createUserResolutionMiddleware } from '../../../../delivery/web/express/middleware/userResolutionMiddleware';
import { allowGuestMode, optionalAuth, verifyOwnership } from '../../../../delivery/web/express/middleware/authMiddleware';
import { standardRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';

export function createDebtRouter(
  debtModule: DebtModule,
  userModule?: UserModule
): Router {
  const router = Router();
  const controller = new DebtController(debtModule, userModule);

  // Apply rate limiting to all debt routes
  router.use(standardRateLimiter);

  // User resolution middleware (resolves telegramId to UUID)
  const resolveUser = userModule
    ? createUserResolutionMiddleware(userModule)
    : (_req: any, _res: any, next: any) => next();

  // ==================== USER-SCOPED ROUTES ====================
  // Debts for a specific user (consistent with /transactions/user/:userId pattern)
  // Protected with auth + ownership verification (guests allowed)
  router.post('/user/:userId', allowGuestMode, resolveUser, verifyOwnership, controller.createDebt);
  router.get('/user/:userId', allowGuestMode, resolveUser, verifyOwnership, controller.getDebts);
  router.get('/user/:userId/summary', allowGuestMode, resolveUser, verifyOwnership, controller.getSummary);

  // ==================== DEBT-SCOPED ROUTES ====================
  // Single debt operations
  // optionalAuth: validates auth if present, allows unauthenticated for guest resources
  // Ownership verification is done in controller by fetching debt and checking userId
  router.get('/:debtId', optionalAuth, controller.getDebt);
  router.put('/:debtId', optionalAuth, controller.updateDebt);
  router.delete('/:debtId', optionalAuth, controller.deleteDebt);
  router.post('/:debtId/cancel', optionalAuth, controller.cancelDebt);

  // ==================== PAYMENT ROUTES ====================
  // Payment operations on a debt
  router.post('/:debtId/pay', optionalAuth, controller.payDebt);
  router.post('/:debtId/pay-full', optionalAuth, controller.payDebtFull);

  // Delete a specific payment
  router.delete('/payments/:paymentId', optionalAuth, controller.deletePayment);

  return router;
}
