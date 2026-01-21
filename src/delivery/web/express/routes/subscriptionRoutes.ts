/**
 * Subscription Routes
 * REST API routes for subscription management
 */

import { Router } from 'express';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { SubscriptionController } from '../../../../modules/subscription/presentation/subscriptionController';
import { createUserResolutionMiddleware } from '../middleware/userResolutionMiddleware';

export function createSubscriptionRoutes(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule
): Router {
  const router = Router();
  const controller = new SubscriptionController(subscriptionModule);
  const resolveUser = createUserResolutionMiddleware(userModule);

  // GET /api/subscription/:userId - Get subscription status
  router.get('/:userId', resolveUser, (req, res) => controller.getSubscriptionStatus(req, res));

  // POST /api/subscription/check-limit - Check if user can perform action
  router.post('/check-limit', resolveUser, (req, res) => controller.checkLimit(req, res));

  // POST /api/subscription/grant - Grant premium to user (admin only)
  router.post('/grant', resolveUser, (req, res) => controller.grantPremium(req, res));

  // POST /api/subscription/cancel - Cancel subscription
  router.post('/cancel', resolveUser, (req, res) => controller.cancelSubscription(req, res));

  // POST /api/subscription/start-trial - Start trial for new user
  router.post('/start-trial', resolveUser, (req, res) => controller.startTrial(req, res));

  return router;
}
