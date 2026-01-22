/**
 * Subscription Middleware for Express
 * Checks limits and premium access before actions
 */

import { Request, Response, NextFunction } from 'express';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { LimitType } from '../../../../modules/subscription/domain/usageLimit';
import { resolveUserIdToUUID, isGuestUser } from '../../../../shared/application/helpers/userIdResolver';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.SUBSCRIPTION);

// Extend Express Request to include user and subscription info
declare global {
  namespace Express {
    interface Request {
      userUUID?: string; // Resolved UUID from telegram_id
      subscriptionInfo?: {
        isPremium: boolean;
        allowed: boolean;
        currentUsage: number;
        limit: number | null;
        remaining: number | null;
      };
    }
  }
}

/**
 * Helper to get userId from request (params, query, or body)
 */
function getUserIdFromRequest(req: Request): string | undefined {
  return (
    (req.params?.userId as string) ||
    (req.query?.userId as string) ||
    req.body?.userId
  );
}

/**
 * Helper to resolve telegram_id to UUID
 * Uses shared resolveUserIdToUUID which properly handles UUIDs
 */
async function resolveUserUUID(
  userId: string,
  userModule: UserModule
): Promise<string | null> {
  try {
    // Skip guest users
    if (isGuestUser(userId)) {
      return null;
    }
    // Use shared resolver which checks isUUID first
    return await resolveUserIdToUUID(userId, userModule);
  } catch (error) {
    logger.error('Failed to resolve user UUID', error as Error);
    return null;
  }
}

/**
 * Factory function to create limit-checking middleware
 */
export function createCheckLimitMiddleware(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule,
  limitType: LimitType
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const telegramId = getUserIdFromRequest(req);

      if (!telegramId) {
        res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
        return;
      }

      // Resolve telegram_id to UUID
      const userId = await resolveUserUUID(telegramId, userModule);
      if (!userId) {
        // If user doesn't exist, allow action (fail open)
        next();
        return;
      }

      // Store resolved UUID for downstream handlers
      req.userUUID = userId;

      const result = await subscriptionModule
        .getCheckLimitUseCase()
        .execute({ userId, limitType });

      // Attach info to request for downstream handlers
      req.subscriptionInfo = {
        isPremium: result.isPremium,
        allowed: result.allowed,
        currentUsage: result.currentUsage,
        limit: result.limit,
        remaining: result.remaining,
      };

      if (!result.allowed) {
        res.status(403).json({
          error: result.message || 'Limit exceeded',
          code: 'LIMIT_EXCEEDED',
          limitType,
          currentUsage: result.currentUsage,
          limit: result.limit,
          isPremium: result.isPremium,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in subscription middleware', error as Error);
      res.status(500).json({
        error: 'Failed to check subscription limit',
        code: 'SUBSCRIPTION_CHECK_ERROR',
      });
    }
  };
}

/**
 * Factory function to create usage increment middleware (runs after action)
 */
export function createIncrementUsageMiddleware(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule,
  limitType: LimitType
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
      // Only increment on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Use already resolved UUID if available, otherwise resolve
        const resolveAndIncrement = async () => {
          let userId = req.userUUID;
          if (!userId) {
            const telegramId = getUserIdFromRequest(req);
            if (telegramId) {
              userId = await resolveUserUUID(telegramId, userModule) ?? undefined;
            }
          }

          if (userId) {
            await subscriptionModule
              .getIncrementUsageUseCase()
              .execute({ userId, limitType });
          }
        };

        // Fire and forget - don't block response
        resolveAndIncrement().catch(error =>
          logger.error('Failed to increment usage', error as Error)
        );
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware to require premium access
 */
export function createRequirePremiumMiddleware(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const telegramId = getUserIdFromRequest(req);

      if (!telegramId) {
        res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
        return;
      }

      // Resolve telegram_id to UUID
      const userId = await resolveUserUUID(telegramId, userModule);
      if (!userId) {
        // User doesn't exist - not premium
        res.status(403).json({
          error: 'Premium subscription required',
          code: 'PREMIUM_REQUIRED',
        });
        return;
      }

      // Store resolved UUID for downstream handlers
      req.userUUID = userId;

      const isPremium = await subscriptionModule
        .getSubscriptionService()
        .isPremium(userId);

      if (!isPremium) {
        res.status(403).json({
          error: 'Premium subscription required',
          code: 'PREMIUM_REQUIRED',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error in require premium middleware', error as Error);
      res.status(500).json({
        error: 'Failed to check premium status',
        code: 'PREMIUM_CHECK_ERROR',
      });
    }
  };
}
