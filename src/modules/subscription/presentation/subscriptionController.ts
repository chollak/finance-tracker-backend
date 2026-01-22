/**
 * SubscriptionController
 * HTTP API endpoints for subscription management
 */

import { Request, Response } from 'express';
import { SubscriptionModule } from '../subscriptionModule';
import { FREE_TIER_LIMITS, getCurrentMonthPeriod } from '../domain/usageLimit';
import { SubscriptionStatus } from '../application/getSubscription';
import { handleControllerSuccess, handleControllerError } from '../../../shared/infrastructure/utils/controllerHelpers';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.SUBSCRIPTION);

export class SubscriptionController {
  constructor(private subscriptionModule: SubscriptionModule) {}

  /**
   * Check if userId is a guest user (webapp anonymous user)
   */
  private isGuestUser(userId: string): boolean {
    return userId.startsWith('guest_');
  }

  /**
   * Create default free tier response for guest users
   */
  private createGuestUserResponse(userId: string): SubscriptionStatus {
    const period = getCurrentMonthPeriod();
    return {
      subscription: null,
      usageLimit: {
        id: `guest-usage-${userId}`,
        userId,
        periodStart: period.start,
        periodEnd: period.end,
        transactionsCount: 0,
        voiceInputsCount: 0,
        activeDebtsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isPremium: false,
      isTrialActive: false,
      trialDaysLeft: null,
      subscriptionDaysLeft: null,
      limits: {
        transactions: {
          used: 0,
          limit: FREE_TIER_LIMITS.transactions,
          remaining: FREE_TIER_LIMITS.transactions,
        },
        voiceInputs: {
          used: 0,
          limit: FREE_TIER_LIMITS.voiceInputs,
          remaining: FREE_TIER_LIMITS.voiceInputs,
        },
        activeDebts: {
          used: 0,
          limit: FREE_TIER_LIMITS.activeDebts,
          remaining: FREE_TIER_LIMITS.activeDebts,
        },
      },
    };
  }

  /**
   * GET /api/subscription/:userId
   * Get subscription status for a user
   * Note: userId is resolved to UUID by middleware
   * Guest users (starting with "guest_") get default free tier response
   */
  async getSubscriptionStatus(req: Request, res: Response): Promise<void> {
    try {
      // Use resolved UUID from middleware, fallback to raw param
      const userId = req.resolvedUser?.id || req.params.userId;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      // Guest users get default free tier response
      if (req.resolvedUser?.isGuest || this.isGuestUser(userId)) {
        handleControllerSuccess(this.createGuestUserResponse(userId), res);
        return;
      }

      const status = await this.subscriptionModule
        .getGetSubscriptionUseCase()
        .execute(userId);

      handleControllerSuccess(status, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  }

  /**
   * POST /api/subscription/check-limit
   * Check if user can perform an action
   */
  async checkLimit(req: Request, res: Response): Promise<void> {
    try {
      const { limitType } = req.body;
      // Use resolved UUID from middleware, fallback to body.userId
      const userId = req.resolvedUser?.id || req.body.userId;

      if (!userId || !limitType) {
        res.status(400).json({ error: 'userId and limitType are required' });
        return;
      }

      const validLimitTypes = ['transactions', 'voice_inputs', 'debts'];
      if (!validLimitTypes.includes(limitType)) {
        res.status(400).json({
          error: `Invalid limitType: "${limitType}". Valid values are: ${validLimitTypes.join(', ')}`,
        });
        return;
      }

      const result = await this.subscriptionModule
        .getCheckLimitUseCase()
        .execute({ userId, limitType });

      res.json(result);
    } catch (error) {
      logger.error('Error checking limit', error as Error);
      res.status(500).json({ error: 'Failed to check limit' });
    }
  }

  /**
   * POST /api/subscription/grant
   * Grant premium to a user (admin only)
   */
  async grantPremium(req: Request, res: Response): Promise<void> {
    try {
      const { grantedBy, grantNote, isLifetime, durationDays } = req.body;
      // Use resolved UUID from middleware, fallback to body.userId
      const userId = req.resolvedUser?.id || req.body.userId;

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
      logger.error('Error granting premium', error as Error);
      res.status(500).json({ error: 'Failed to grant premium' });
    }
  }

  /**
   * POST /api/subscription/cancel
   * Cancel subscription
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body;
      // Use resolved UUID from middleware, fallback to body.userId
      const userId = req.resolvedUser?.id || req.body.userId;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const result = await this.subscriptionModule
        .getCancelSubscriptionUseCase()
        .execute({ userId, reason });

      res.json(result);
    } catch (error) {
      logger.error('Error cancelling subscription', error as Error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  }

  /**
   * POST /api/subscription/start-trial
   * Start trial for a new user
   */
  async startTrial(req: Request, res: Response): Promise<void> {
    try {
      // Use resolved UUID from middleware, fallback to body.userId
      const userId = req.resolvedUser?.id || req.body.userId;

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
      logger.error('Error starting trial', error as Error);
      res.status(500).json({ error: 'Failed to start trial' });
    }
  }
}
