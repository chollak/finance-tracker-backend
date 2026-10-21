import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { AccountModule } from '../accountModule';
import { CreateMoveUseCase, SetMoveDeletedUseCase } from '../application/accountMoveUseCases';

/** POST /api/moves, DELETE /api/moves/:id, POST /api/moves/:id/restore (FT-104). */
export class MoveController {
  constructor(private create: CreateMoveUseCase, private setDeleted: SetMoveDeletedUseCase) {}

  post = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.create.execute({ userId: currentUserId(req), body: req.body ?? {} });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res, 201);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  delete = (deleted: boolean) => async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.setDeleted.execute({ userId: currentUserId(req), moveId: String(req.params.id), deleted });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };
}

/** Mounted at /api/moves. */
export function createMoveRoutes(accountModule: AccountModule, userModule: UserModule): Router {
  const controller = new MoveController(accountModule.getCreateMoveUseCase(), accountModule.getSetMoveDeletedUseCase());
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.post('/', controller.post);
  router.delete('/:id', controller.delete(true));
  router.post('/:id/restore', controller.delete(false));
  return router;
}
