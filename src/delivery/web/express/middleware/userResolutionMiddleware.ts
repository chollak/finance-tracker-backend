/**
 * User Resolution Middleware
 *
 * Централизованный middleware для резолва userId (telegramId → UUID).
 * Применяется один раз на входе в API, все контроллеры получают уже UUID.
 *
 * Поддерживаемые форматы userId:
 * - telegramId (числовой): "597843119" → резолвится в UUID
 * - UUID: "02c5718f-b6db-4990-894e-3fc080bb2a83" → проходит как есть
 * - guest: "guest_abc123" → проходит как есть (без резолва)
 */

import { Request, Response, NextFunction } from 'express';
import { UserModule } from '../../../../modules/user/userModule';
import { resolveUserIdToUUID, isUUID, isGuestUser } from '../../../../shared/application/helpers/userIdResolver';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.USER);

/**
 * Resolved user info attached to request
 */
export interface ResolvedUser {
  /** UUID (or guest_* for guest users) */
  id: string;
  /** Original telegramId if resolved, null otherwise */
  telegramId: string | null;
  /** Whether this is a guest user */
  isGuest: boolean;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      /** Resolved user after middleware processing */
      resolvedUser?: ResolvedUser;
    }
  }
}

/**
 * Extract userId from request (checks params → query → body)
 * Note: This function expects req.params to be populated, so middleware
 * should be applied at the route level, not globally before route matching.
 */
function extractUserIdFromRequest(req: Request): string | undefined {
  // Check params (populated when middleware is applied at route level)
  const paramUserId = req.params?.userId || req.params?.telegramId || req.params?.id;
  if (paramUserId) return paramUserId;

  // Check query
  const queryUserId = req.query?.userId as string | undefined;
  if (queryUserId) return queryUserId;

  // Check body
  const bodyUserId = req.body?.userId;
  if (bodyUserId) return bodyUserId;

  return undefined;
}

/**
 * Create middleware that resolves userId to UUID
 *
 * @param userModule - UserModule for telegramId → UUID resolution
 * @param options - Configuration options
 * @returns Express middleware
 *
 * @example
 * // Apply to all routes
 * router.use(createUserResolutionMiddleware(userModule));
 *
 * // In controller, use resolved UUID:
 * const userId = req.resolvedUser?.id;
 */
export function createUserResolutionMiddleware(
  userModule: UserModule,
  options: {
    /** If true, returns 400 when userId is missing (default: false) */
    requireUserId?: boolean;
    /** If true, skips routes without userId (default: true) */
    skipIfNoUserId?: boolean;
  } = {}
) {
  const { requireUserId = false, skipIfNoUserId = true } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawUserId = extractUserIdFromRequest(req);

      // No userId found
      if (!rawUserId) {
        if (requireUserId) {
          res.status(400).json({
            error: 'userId is required',
            code: 'MISSING_USER_ID',
          });
          return;
        }

        if (skipIfNoUserId) {
          // No userId needed for this route, continue
          next();
          return;
        }
      }

      // userId found, resolve it
      if (rawUserId) {
        const trimmedId = rawUserId.trim();

        // Check if guest user (no resolution needed)
        if (isGuestUser(trimmedId)) {
          req.resolvedUser = {
            id: trimmedId,
            telegramId: null,
            isGuest: true,
          };
          next();
          return;
        }

        // Check if already UUID (no resolution needed)
        if (isUUID(trimmedId)) {
          req.resolvedUser = {
            id: trimmedId,
            telegramId: null, // Unknown - could be either
            isGuest: false,
          };
          next();
          return;
        }

        // Resolve telegramId to UUID
        const resolvedUUID = await resolveUserIdToUUID(trimmedId, userModule);

        req.resolvedUser = {
          id: resolvedUUID,
          telegramId: trimmedId,
          isGuest: false,
        };
      }

      next();
    } catch (error) {
      logger.error('Error in userResolutionMiddleware', error as Error);
      res.status(500).json({
        error: 'Failed to resolve user',
        code: 'USER_RESOLUTION_ERROR',
      });
    }
  };
}

/**
 * Helper to get resolved userId from request
 * Falls back to raw userId if middleware wasn't applied
 *
 * @param req - Express request
 * @returns Resolved userId (UUID) or undefined
 */
export function getResolvedUserId(req: Request): string | undefined {
  // Prefer resolved user
  if (req.resolvedUser?.id) {
    return req.resolvedUser.id;
  }

  // Fallback to raw extraction (for backwards compatibility)
  return extractUserIdFromRequest(req);
}

/**
 * Helper to check if user is a guest
 */
export function isResolvedUserGuest(req: Request): boolean {
  return req.resolvedUser?.isGuest ?? false;
}
