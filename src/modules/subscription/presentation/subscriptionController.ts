/**
 * SubscriptionController
 * HTTP API endpoints for subscription management
 */

import { NextFunction, Request, Response } from 'express';
import { SubscriptionModule } from '../subscriptionModule';
import { GRANT_DURATION_DAYS, isGrantDuration } from '../domain/subscription';
import { handleControllerSuccess, handleControllerError } from '../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';
import { currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';

/**
 * The status is read for the signed-in user (`currentUserId`, FT-162). Only the admin grant names whom it is for, and
 * the one who granted is the admin who signed in (#320).
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
   * POST /api/subscription/grant, after requireAdmin and before the target is resolved — resolving creates the user on
   * first contact, so a refused grant adds nothing, no subscription and no user (#256): `durationDays`, when given, is
   * a whole number of days within GRANT_DURATION_DAYS, for a lifetime grant too. Otherwise 400 VALIDATION_ERROR.
   * Without `durationDays` the gift lasts 30 days, as before. `grantedBy` of the body is not looked at (#320).
   */
  checkGrantBody(req: Request, res: Response, next: NextFunction): void {
    const { durationDays } = req.body ?? {};
    if (durationDays !== undefined && durationDays !== null && !isGrantDuration(durationDays)) {
      return handleControllerError(
        ErrorFactory.validation(
          `durationDays must be a whole number from ${GRANT_DURATION_DAYS.min} to ${GRANT_DURATION_DAYS.max}`,
          'durationDays'
        ),
        res
      );
    }
    next();
  }

  /**
   * POST /api/subscription/grant
   * Grant premium to a user (admin only). `grantedBy` is the Telegram id of the admin who signed in — the one
   * `requireAdmin` let through; a `grantedBy` in the body is not read, so the record cannot name someone else (#320)
   */
  async grantPremium(req: Request, res: Response): Promise<void> {
    try {
      // durationDays is checked by checkGrantBody before this (#256)
      const { grantNote, isLifetime, durationDays } = req.body;
      const admin = req.telegramUser;
      if (!admin) {
        return handleControllerError(ErrorFactory.authorization('Admin access required'), res);
      }
      // The user the admin names in the body, resolved to UUID by middleware
      const userId = req.resolvedUser?.id;

      if (!userId) {
        return handleControllerError(ErrorFactory.validation('userId is required', 'userId'), res);
      }

      // A UUID no user has is 404 NOT_FOUND (#230)
      const result = await this.subscriptionModule
        .getGrantPremiumUseCase()
        .execute({
          userId,
          grantedBy: String(admin.id),
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
}
