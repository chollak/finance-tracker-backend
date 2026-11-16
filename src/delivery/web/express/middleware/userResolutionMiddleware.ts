/**
 * User Resolution Middleware
 *
 * Централизованный middleware для резолва userId (telegramId → UUID).
 * Применяется один раз на входе в API, все контроллеры получают уже UUID.
 *
 * Поддерживаемые форматы userId:
 * - telegramId (числовой): "597843119" → резолвится в UUID; "0597843119" — тот же пользователь (`telegramIdOf`, #230)
 * - UUID: "02c5718f-b6db-4990-894e-3fc080bb2a83" → проходит в нижнем регистре (#230)
 * Гостей нет (решение Д4, #206), поэтому на маршрутах пользователя middleware стоит после verifyOwnership: telegramId
 * резолвится с созданием пользователя. Любой другой id (`abc`, `-5`, старый гостевой, число от 2^53) — 400
 * INVALID_USER_ID, пользователь не создаётся (#224, #230).
 */

import { Request, Response, NextFunction } from 'express';
import { UserModule } from '../../../../modules/user/userModule';
import { resolveUserIdToUUID, isUUID, resolvableUserIdOf } from '../../../../shared/application/helpers/userIdResolver';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.USER);

/**
 * Resolved user info attached to request
 */
export interface ResolvedUser {
  /** UUID */
  id: string;
  /** Original telegramId if resolved, null otherwise */
  telegramId: string | null;
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
 * A route's `:id` is never a user: it names a record or an account (#275).
 */
function extractUserIdFromRequest(req: Request): unknown {
  // Check params (populated when middleware is applied at route level)
  const paramUserId = req.params?.userId || req.params?.telegramId;
  if (paramUserId) return paramUserId;

  // Check query: an array for `?userId=a&userId=b`
  const queryUserId: unknown = req.query?.userId;
  if (queryUserId) return queryUserId;

  // Check body: any JSON value
  const bodyUserId: unknown = req.body?.userId;
  if (bodyUserId) return bodyUserId;

  return undefined;
}

/**
 * Create middleware that resolves userId to UUID. A request without one goes on unresolved: the route decides
 * whether it needs it (the admin grant answers 400).
 *
 * @param userModule - UserModule for telegramId → UUID resolution
 * @returns Express middleware
 *
 * @example
 * router.post('/grant', requireAuth, requireAdmin, createUserResolutionMiddleware(userModule), handler);
 *
 * // In controller, use resolved UUID:
 * const userId = req.resolvedUser?.id;
 */
export function createUserResolutionMiddleware(userModule: UserModule) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawUserId = extractUserIdFromRequest(req);

      // No userId: nothing to resolve
      if (!rawUserId) {
        next();
        return;
      }

      // A number, an array, an object or a blank string names no user: 400, not a 500 from resolving it (FT-162).
      // Nor does a string that is no UUID and no Telegram id — `abc`, `-5`, an old guest id, 30 digits: resolving it
      // would create a `users` row for it (#224, #230). On user routes verifyOwnership refuses it first; this covers the
      // admin grant, which names whom to grant
      const resolvableId = typeof rawUserId === 'string' ? resolvableUserIdOf(rawUserId) : null;
      if (resolvableId === null) {
        res.status(400).json({
          success: false,
          error: 'userId must be one Telegram id or user UUID, as a string',
          code: 'INVALID_USER_ID',
        });
        return;
      }

      // Check if already UUID (no resolution needed)
      if (isUUID(resolvableId)) {
        req.resolvedUser = {
          id: resolvableId,
          telegramId: null, // Unknown - could be either
        };
        next();
        return;
      }

      // Resolve telegramId to UUID; the id as the list writes it, without leading zeros (#230)
      const resolvedUUID = await resolveUserIdToUUID(resolvableId, userModule);

      req.resolvedUser = {
        id: resolvedUUID,
        telegramId: resolvableId,
      };
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

