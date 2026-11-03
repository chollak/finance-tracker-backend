import { Router } from 'express';
import { DebtController } from './debtController';
import { DebtModule } from '../../debtModule';
import { UserModule } from '../../../user/userModule';
import { createUserResolutionMiddleware } from '../../../../delivery/web/express/middleware/userResolutionMiddleware';
import { optionalAuth, requireAuth, verifyOwnership } from '../../../../delivery/web/express/middleware/authMiddleware';
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
  // Signed in, and the path id must be the signed-in user's own (no guests, #206)
  router.post('/user/:userId', requireAuth, verifyOwnership, resolveUser, controller.createDebt);
  router.get('/user/:userId', requireAuth, verifyOwnership, resolveUser, controller.getDebts);
  router.get('/user/:userId/summary', requireAuth, verifyOwnership, resolveUser, controller.getSummary);

  // ==================== DEBT-SCOPED ROUTES ====================
  // Single debt operations
  // optionalAuth: the controller checks the record's owner and refuses a request without a signed-in user (403)
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
