/**
 * User Controller
 * HTTP API endpoints for user management
 */

import { Router } from 'express';
import { UserModule } from '../../userModule';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
// Import auth middleware (also extends Express.Request with telegramUser)
import { requireAuth } from '../../../../delivery/web/express/middleware/authMiddleware';
import { standardRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';

export function createUserController(userModule: UserModule): Router {
  const router = Router();

  // Apply rate limiting to all routes
  router.use(standardRateLimiter);

  /**
   * GET /api/users/:telegramId
   * Get user by Telegram ID
   * Protected: requires auth, user can only get their own info
   */
  router.get('/:telegramId', requireAuth, async (req, res) => {
    try {
      const { telegramId } = req.params;

      // Verify user can only access their own data
      const authenticatedTelegramId = req.telegramUser?.id?.toString();
      if (authenticatedTelegramId && authenticatedTelegramId !== telegramId) {
        throw ErrorFactory.authorization('You can only access your own user data');
      }

      const userResult = await userModule.getGetUserUseCase().execute({ telegramId });

      if (!userResult.success || !userResult.data) {
        throw ErrorFactory.notFound('User not found');
      }

      handleControllerSuccess(userResult.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  /**
   * POST /api/users
   * Create or get existing user
   * Protected: requires Telegram auth, user can only create/get themselves
   */
  router.post('/', requireAuth, async (req, res) => {
    try {
      const { telegramId, userName, firstName, lastName, languageCode } = req.body;

      if (!telegramId) {
        throw ErrorFactory.validation('telegramId is required');
      }

      // Verify user can only create/get their own account
      const authenticatedTelegramId = req.telegramUser?.id?.toString();
      if (authenticatedTelegramId && authenticatedTelegramId !== telegramId) {
        throw ErrorFactory.authorization('You can only create/access your own user account');
      }

      const user = await userModule.getGetOrCreateUserUseCase().execute({
        telegramId,
        userName,
        firstName,
        lastName,
        languageCode,
      });

      handleControllerSuccess(user, res, 201);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  /**
   * PUT /api/users/:id
   * Update user settings
   * Protected: requires auth + ownership
   */
  router.put('/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { userName, firstName, lastName, languageCode, defaultCurrency, timezone } = req.body;

      // Verify user can only update their own account
      // First, get the user to check their telegramId
      const existingUserResult = await userModule.getGetUserUseCase().execute({ id });
      if (!existingUserResult.success || !existingUserResult.data) {
        throw ErrorFactory.notFound('User not found');
      }

      const existingUser = existingUserResult.data;
      const authenticatedTelegramId = req.telegramUser?.id?.toString();
      if (authenticatedTelegramId && existingUser.telegramId !== authenticatedTelegramId) {
        throw ErrorFactory.authorization('You can only update your own user settings');
      }

      const user = await userModule.getUpdateUserUseCase().execute(id, {
        userName,
        firstName,
        lastName,
        languageCode,
        defaultCurrency,
        timezone,
      });

      handleControllerSuccess(user, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  return router;
}
