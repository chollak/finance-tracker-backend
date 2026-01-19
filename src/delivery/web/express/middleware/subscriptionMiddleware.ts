/**
 * Subscription Middleware for Express
 * Checks limits and premium access before actions
 */

import { Request, Response, NextFunction } from 'express';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { LimitType } from '../../../../modules/subscription/domain/usageLimit';

// Extend Express Request to include user and subscription info
declare global {
  namespace Express {
    interface Request {
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
 * Factory function to create limit-checking middleware
 */
export function createCheckLimitMiddleware(
  subscriptionModule: SubscriptionModule,
  limitType: LimitType
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get userId from query, body, or params
      const userId = req.query.userId as string ||
        req.body?.userId ||
        req.params?.userId;

      if (!userId) {
        res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
        return;
      }

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
      console.error('Error in subscription middleware:', error);
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
  limitType: LimitType
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
      // Only increment on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.query.userId as string ||
          req.body?.userId ||
          req.params?.userId;

        if (userId) {
          // Fire and forget - don't block response
          subscriptionModule
            .getIncrementUsageUseCase()
            .execute({ userId, limitType })
            .catch(error => console.error('Failed to increment usage:', error));
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware to require premium access
 */
export function createRequirePremiumMiddleware(subscriptionModule: SubscriptionModule) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.query.userId as string ||
        req.body?.userId ||
        req.params?.userId;

      if (!userId) {
        res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
        return;
      }

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
      console.error('Error in require premium middleware:', error);
      res.status(500).json({
        error: 'Failed to check premium status',
        code: 'PREMIUM_CHECK_ERROR',
      });
    }
  };
}
