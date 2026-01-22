/**
 * Subscription Routes
 * REST API routes for subscription management
 */

import { Router } from 'express';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { SubscriptionController } from '../../../../modules/subscription/presentation/subscriptionController';
import { createUserResolutionMiddleware } from '../middleware/userResolutionMiddleware';
import { allowGuestMode, requireAuth, requireAdmin, verifyOwnership } from '../middleware/authMiddleware';
import { standardRateLimiter, adminRateLimiter, strictRateLimiter } from '../middleware/rateLimitMiddleware';

export function createSubscriptionRoutes(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule
): Router {
  const router = Router();
  const controller = new SubscriptionController(subscriptionModule);
  const resolveUser = createUserResolutionMiddleware(userModule);

  // GET /api/subscription/:userId - Get subscription status
  // Allows guest mode (guests have default free limits)
  router.get(
    '/:userId',
    standardRateLimiter,
    allowGuestMode,
    resolveUser,
    verifyOwnership,
    (req, res) => controller.getSubscriptionStatus(req, res)
  );

  // POST /api/subscription/check-limit - Check if user can perform action
  router.post(
    '/check-limit',
    standardRateLimiter,
    allowGuestMode,
    resolveUser,
    verifyOwnership,
    (req, res) => controller.checkLimit(req, res)
  );

  // POST /api/subscription/grant - Grant premium to user (ADMIN ONLY)
  // Protected: requires authentication + admin role
  router.post(
    '/grant',
    adminRateLimiter,
    requireAuth,
    requireAdmin,
    resolveUser,
    (req, res) => controller.grantPremium(req, res)
  );

  // POST /api/subscription/cancel - Cancel subscription
  router.post(
    '/cancel',
    strictRateLimiter,
    requireAuth,
    resolveUser,
    verifyOwnership,
    (req, res) => controller.cancelSubscription(req, res)
  );

  // POST /api/subscription/start-trial - Start trial for new user
  router.post(
    '/start-trial',
    strictRateLimiter,
    requireAuth,
    resolveUser,
    verifyOwnership,
    (req, res) => controller.startTrial(req, res)
  );

  return router;
}
