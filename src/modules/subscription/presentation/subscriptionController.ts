/**
 * SubscriptionController
 * HTTP API endpoints for subscription management
 */

import { Request, Response } from 'express';
import { SubscriptionModule } from '../subscriptionModule';
import { handleControllerSuccess, handleControllerError } from '../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';

/**
 * The user's own subscription routes act for the signed-in user (`currentUserId`, FT-162); a userId in the body is
 * never read. Only the admin grant names whom it is for.
 */
export class SubscriptionController {
  constructor(private subscriptionModule: SubscriptionModule) {}

  /**
   * GET /api/subscription/:userId
   * Get subscription status of the signed-in user (the path id is checked to be theirs before this, FT-162)
   */
  async getSubscriptionStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = currentUserId(req);
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
   * Check if the signed-in user can perform an action
   */
  async checkLimit(req: Request, res: Response): Promise<void> {
    try {
      const { limitType } = req.body;
      const userId = currentUserId(req);

      if (!limitType) {
        return handleControllerError(ErrorFactory.validation('limitType is required'), res);
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
      // The user the admin names in the body, resolved to UUID by middleware
      const userId = req.resolvedUser?.id;

      if (!userId || !grantedBy) {
        return handleControllerError(
          ErrorFactory.validation('userId and grantedBy are required'),
          res
        );
      }

      // A UUID no user has is 404 NOT_FOUND (#230)
      const result = await this.subscriptionModule
        .getGrantPremiumUseCase()
        .execute({
          userId,
          grantedBy,
          grantNote,
          isLifetime: isLifetime || false,
          durationDays,
        });
      if (!result.success) return handleControllerError(result.error, res);

      handleControllerSuccess({ subscription: result.data }, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  }

  /**
   * POST /api/subscription/cancel
   * Cancel the signed-in user's subscription
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body;
      const userId = currentUserId(req);

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
   * Start trial for the signed-in user
   */
  async startTrial(req: Request, res: Response): Promise<void> {
    try {
      const userId = currentUserId(req);

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
