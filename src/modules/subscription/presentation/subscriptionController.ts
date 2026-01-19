/**
 * SubscriptionController
 * HTTP API endpoints for subscription management
 */

import { Request, Response } from 'express';
import { SubscriptionModule } from '../subscriptionModule';

export class SubscriptionController {
  constructor(private subscriptionModule: SubscriptionModule) {}

  /**
   * GET /api/subscription/:userId
   * Get subscription status for a user
   */
  async getSubscriptionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const status = await this.subscriptionModule
        .getGetSubscriptionUseCase()
        .execute(userId);

      res.json(status);
    } catch (error) {
      console.error('Error getting subscription status:', error);
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  }

  /**
   * POST /api/subscription/check-limit
   * Check if user can perform an action
   */
  async checkLimit(req: Request, res: Response): Promise<void> {
    try {
      const { userId, limitType } = req.body;

      if (!userId || !limitType) {
        res.status(400).json({ error: 'userId and limitType are required' });
        return;
      }

      if (!['transactions', 'voice_inputs', 'debts'].includes(limitType)) {
        res.status(400).json({ error: 'Invalid limitType' });
        return;
      }

      const result = await this.subscriptionModule
        .getCheckLimitUseCase()
        .execute({ userId, limitType });

      res.json(result);
    } catch (error) {
      console.error('Error checking limit:', error);
      res.status(500).json({ error: 'Failed to check limit' });
    }
  }

  /**
   * POST /api/subscription/grant
   * Grant premium to a user (admin only)
   */
  async grantPremium(req: Request, res: Response): Promise<void> {
    try {
      const { userId, grantedBy, grantNote, isLifetime, durationDays } = req.body;

      if (!userId || !grantedBy) {
        res.status(400).json({ error: 'userId and grantedBy are required' });
        return;
      }

      const subscription = await this.subscriptionModule
        .getGrantPremiumUseCase()
        .execute({
          userId,
          grantedBy,
          grantNote,
          isLifetime: isLifetime || false,
          durationDays,
        });

      res.json({ success: true, subscription });
    } catch (error) {
      console.error('Error granting premium:', error);
      res.status(500).json({ error: 'Failed to grant premium' });
    }
  }

  /**
   * POST /api/subscription/cancel
   * Cancel subscription
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { userId, reason } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const result = await this.subscriptionModule
        .getCancelSubscriptionUseCase()
        .execute({ userId, reason });

      res.json(result);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  }

  /**
   * POST /api/subscription/start-trial
   * Start trial for a new user
   */
  async startTrial(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const subscription = await this.subscriptionModule
        .getStartTrialUseCase()
        .execute({ userId });

      if (!subscription) {
        res.json({
          success: false,
          message: 'User already has subscription history, trial not available',
        });
        return;
      }

      res.json({ success: true, subscription });
    } catch (error) {
      console.error('Error starting trial:', error);
      res.status(500).json({ error: 'Failed to start trial' });
    }
  }
}
