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
import { standardRateLimiter, adminRateLimiter } from '../middleware/rateLimitMiddleware';

/**
 * Two routes (#320): the user's own status and the admin grant. `POST /check-limit`, `/cancel` and `/start-trial` had
 * no caller and are gone — the bot checks limits and cancels through the use cases, not over HTTP.
 *
 * The status takes the user from authentication (FT-162): the userId of the path must be the signed-in user's Telegram
 * id as a string, checked before anything is resolved — someone else's id is 403 and creates no user row. Only the
 * admin grant names whom it is for, in the body; who granted is the admin who signed in.
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

  // POST /api/subscription/grant - Grant premium to user (ADMIN ONLY)
  // Protected: requires authentication + admin role; a bad durationDays is refused before the target user is created;
  // `grantedBy` is the signed-in admin's Telegram id, the body's is not read (#320)
  router.post(
    '/grant',
    adminRateLimiter,
    requireAuth,
    requireAdmin,
    (req, res, next) => controller.checkGrantBody(req, res, next),
    resolveGrantTarget,
    (req, res) => controller.grantPremium(req, res)
  );

  return router;
}
