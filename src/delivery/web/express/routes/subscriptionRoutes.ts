/**
 * Subscription Routes
 * REST API routes for subscription management
 */

import { Router } from 'express';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { SubscriptionController } from '../../../../modules/subscription/presentation/subscriptionController';
import { createUserResolutionMiddleware } from '../middleware/userResolutionMiddleware';
import { createResolveCurrentUserMiddleware } from '../middleware/currentUserMiddleware';
import { requireAuth, requireAdmin, verifyOwnership } from '../middleware/authMiddleware';
import { standardRateLimiter, adminRateLimiter, strictRateLimiter } from '../middleware/rateLimitMiddleware';

/**
 * The user's own routes take the user from authentication (FT-162): a userId the path, query or body still carries
 * must be the signed-in user's Telegram id as a string, checked before anything is resolved — someone else's id is 403
 * and creates no user row. Only the admin grant names whom it is for, in the body.
 */
export function createSubscriptionRoutes(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule
): Router {
  const router = Router();
  const controller = new SubscriptionController(subscriptionModule);
  const resolveCurrentUser = createResolveCurrentUserMiddleware(userModule);
  // The admin grant's target: the user it names, created on first contact
  const resolveGrantTarget = createUserResolutionMiddleware(userModule);

  // GET /api/subscription/:userId - Get subscription status; the path id must be the signed-in user's
  router.get(
    '/:userId',
    standardRateLimiter,
    requireAuth,
    verifyOwnership,
    resolveCurrentUser,
    (req, res) => controller.getSubscriptionStatus(req, res)
  );

  // POST /api/subscription/check-limit - Check if user can perform action
  router.post(
    '/check-limit',
    standardRateLimiter,
    requireAuth,
    verifyOwnership,
    resolveCurrentUser,
    (req, res) => controller.checkLimit(req, res)
  );

  // POST /api/subscription/grant - Grant premium to user (ADMIN ONLY)
  // Protected: requires authentication + admin role
  router.post(
    '/grant',
    adminRateLimiter,
    requireAuth,
    requireAdmin,
    resolveGrantTarget,
    (req, res) => controller.grantPremium(req, res)
  );

  // POST /api/subscription/cancel - Cancel subscription
  router.post(
    '/cancel',
    strictRateLimiter,
    requireAuth,
    verifyOwnership,
    resolveCurrentUser,
    (req, res) => controller.cancelSubscription(req, res)
  );

  // POST /api/subscription/start-trial - Start trial for new user
  router.post(
    '/start-trial',
    strictRateLimiter,
    requireAuth,
    verifyOwnership,
    resolveCurrentUser,
    (req, res) => controller.startTrial(req, res)
  );

  return router;
}
