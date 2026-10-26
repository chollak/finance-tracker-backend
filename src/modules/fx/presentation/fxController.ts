import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { FxRateService } from '../application/fxRateService';

/** GET /api/rates/usd, PUT and DELETE /api/rates/usd/own (FT-102). */
export class FxController {
  constructor(private service: FxRateService) {}

  getUsd = async (req: Request, res: Response): Promise<void> => {
    try {
      handleControllerSuccess(await this.service.info(currentUserId(req)), res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  putOwn = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.setOwnRate(currentUserId(req), req.body?.rateMinor, undefined, req.body?.since);
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  deleteOwn = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.setOwnRate(currentUserId(req), null);
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };
}

export function createFxRoutes(service: FxRateService, userModule: UserModule): Router {
  const controller = new FxController(service);
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/usd', controller.getUsd);
  router.put('/usd/own', controller.putOwn);
  router.delete('/usd/own', controller.deleteOwn);
  return router;
}
