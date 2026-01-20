/**
 * SubscriptionController
 * HTTP API endpoints for subscription management
 */

import { Request, Response } from 'express';
import { SubscriptionModule } from '../subscriptionModule';
import { UserModule } from '../../user/userModule';
import { FREE_TIER_LIMITS, getCurrentMonthPeriod } from '../domain/usageLimit';
import { SubscriptionStatus } from '../application/getSubscription';
import { handleControllerSuccess, handleControllerError } from '../../../shared/infrastructure/utils/controllerHelpers';

export class SubscriptionController {
  constructor(
    private subscriptionModule: SubscriptionModule,
    private userModule: UserModule
  ) {}

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
   * Resolve telegram_id to UUID
   */
  private async resolveUserId(telegramId: string): Promise<string> {
    const user = await this.userModule.getGetOrCreateUserUseCase().execute({
      telegramId,
    });
    return user.id;
  }

  /**
   * GET /api/subscription/:userId
   * Get subscription status for a user
   * Note: userId param can be telegram_id, will be resolved to UUID
   * Guest users (starting with "guest_") get default free tier response
   */
  async getSubscriptionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      // Guest users get default free tier response
      if (this.isGuestUser(userId)) {
        handleControllerSuccess(this.createGuestUserResponse(userId), res);
        return;
      }

      // Resolve telegram_id to UUID
      const userUUID = await this.resolveUserId(userId);

      const status = await this.subscriptionModule
        .getGetSubscriptionUseCase()
        .execute(userUUID);

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
