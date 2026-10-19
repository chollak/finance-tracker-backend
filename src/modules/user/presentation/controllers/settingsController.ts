import { Request, Response, Router } from 'express';
import { UserModule } from '../../userModule';
import { GetUserSettingsUseCase, UpdateUserSettingsUseCase } from '../../application/userSettingsUseCases';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';

/** GET/PATCH /api/settings — the user comes from authentication, never from the path (FT-098). */
export class SettingsController {
  constructor(
    private getSettings: GetUserSettingsUseCase,
    private updateSettings: UpdateUserSettingsUseCase
  ) {}

  get = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.getSettings.execute({ userId: currentUserId(req) });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  patch = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.updateSettings.execute({ userId: currentUserId(req), patch: req.body });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };
}

export function createSettingsRoutes(userModule: UserModule): Router {
  const controller = new SettingsController(
    userModule.getGetUserSettingsUseCase(),
    userModule.getUpdateUserSettingsUseCase()
  );
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/', controller.get);
  router.patch('/', controller.patch);
  return router;
}
