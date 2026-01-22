/**
 * SubscriptionController
 * HTTP API endpoints for subscription management
 */

import { Request, Response } from 'express';
import { SubscriptionModule } from '../subscriptionModule';
import { FREE_TIER_LIMITS, getCurrentMonthPeriod } from '../domain/usageLimit';
import { SubscriptionStatus } from '../application/getSubscription';
import { handleControllerSuccess, handleControllerError } from '../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';

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
        return handleControllerError(ErrorFactory.validation('userId is required'), res);
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
        return handleControllerError(
          ErrorFactory.validation('userId and limitType are required'),
          res
        );
      }

      const validLimitTypes = ['transactions', 'voice_inputs', 'debts'];
      if (!validLimitTypes.includes(limitType)) {
        return handleControllerError(
          ErrorFactory.validation(
            `Invalid limitType: "${limitType}". Valid values are: ${validLimitTypes.join(', ')}`
          ),
          res
        );
      }

      const result = await this.subscriptionModule
        .getCheckLimitUseCase()
        .execute({ userId, limitType });

      handleControllerSuccess(result, res);
    } catch (error) {
      handleControllerError(error, res);
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
        return handleControllerError(
          ErrorFactory.validation('userId and grantedBy are required'),
          res
        );
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

      handleControllerSuccess({ subscription }, res);
    } catch (error) {
      handleControllerError(error, res);
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
        return handleControllerError(ErrorFactory.validation('userId is required'), res);
      }

      const result = await this.subscriptionModule
        .getCancelSubscriptionUseCase()
        .execute({ userId, reason });

      handleControllerSuccess(result, res);
    } catch (error) {
      handleControllerError(error, res);
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
        return handleControllerError(ErrorFactory.validation('userId is required'), res);
      }

      const subscription = await this.subscriptionModule
        .getStartTrialUseCase()
        .execute({ userId });

      if (!subscription) {
        handleControllerSuccess(
          { available: false, message: 'User already has subscription history, trial not available' },
          res
        );
        return;
      }

      handleControllerSuccess({ available: true, subscription }, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  }
}
