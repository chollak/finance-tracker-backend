/**
 * Subscription Routes
 * REST API routes for subscription management
 */

import { Router } from 'express';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { SubscriptionController } from '../../../../modules/subscription/presentation/subscriptionController';

export function createSubscriptionRoutes(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule
): Router {
  const router = Router();
  const controller = new SubscriptionController(subscriptionModule, userModule);

  // GET /api/subscription/:userId - Get subscription status
  router.get('/:userId', (req, res) => controller.getSubscriptionStatus(req, res));

  // POST /api/subscription/check-limit - Check if user can perform action
  router.post('/check-limit', (req, res) => controller.checkLimit(req, res));

  // POST /api/subscription/grant - Grant premium to user (admin only)
  router.post('/grant', (req, res) => controller.grantPremium(req, res));

  // POST /api/subscription/cancel - Cancel subscription
  router.post('/cancel', (req, res) => controller.cancelSubscription(req, res));

  // POST /api/subscription/start-trial - Start trial for new user
  router.post('/start-trial', (req, res) => controller.startTrial(req, res));

  return router;
}
