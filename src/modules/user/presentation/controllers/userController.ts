/**
 * User Controller
 * HTTP API endpoints for user management
 */

import { Router } from 'express';
import { UserModule } from '../../userModule';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';

export function createUserController(userModule: UserModule): Router {
  const router = Router();

  /**
   * GET /api/users/:telegramId
   * Get user by Telegram ID
   */
  router.get('/:telegramId', async (req, res) => {
    try {
      const { telegramId } = req.params;
      const user = await userModule.getGetUserUseCase().executeByTelegramId(telegramId);

      if (!user) {
        throw ErrorFactory.notFound('User not found');
      }

      handleControllerSuccess(user, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  /**
   * POST /api/users
   * Create or get existing user
   */
  router.post('/', async (req, res) => {
    try {
      const { telegramId, userName, firstName, lastName, languageCode } = req.body;

      if (!telegramId) {
        throw ErrorFactory.validation('telegramId is required');
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
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { userName, firstName, lastName, languageCode, defaultCurrency, timezone } = req.body;

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
