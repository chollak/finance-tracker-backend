import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import {
  createCurrentUserMiddleware,
  createCurrentUserOrAppTokenMiddleware,
  currentUserId,
} from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { CategoryModule } from '../categoryModule';
import { CreateCategoryUseCase, DeleteCategoryUseCase, ListCategoriesUseCase, UpdateCategoryUseCase } from '../application/categoryUseCases';

/**
 * GET/POST /api/categories, PATCH /api/categories/:id (FT-099); DELETE /api/categories/:id of a category the user
 * added and nothing was recorded in (FT-127).
 */
export class CategoryController {
  constructor(
    private list: ListCategoriesUseCase,
    private create: CreateCategoryUseCase,
    private update: UpdateCategoryUseCase,
    private remove: DeleteCategoryUseCase
  ) {}

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.list.execute({ userId: currentUserId(req), type: req.query.type });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  post = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.create.execute({ userId: currentUserId(req), body: req.body ?? {} });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res, 201);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  patch = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.update.execute({
        userId: currentUserId(req),
        categoryId: String(req.params.id),
        body: req.body ?? {},
      });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.remove.execute({ userId: currentUserId(req), categoryId: String(req.params.id) });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };
}

export function createCategoryRoutes(categoryModule: CategoryModule, userModule: UserModule): Router {
  const controller = new CategoryController(
    categoryModule.getListCategoriesUseCase(),
    categoryModule.getCreateCategoryUseCase(),
    categoryModule.getUpdateCategoryUseCase(),
    categoryModule.getDeleteCategoryUseCase()
  );
  const router = Router();
  router.use(standardRateLimiter);
  // The list is also the iOS app's, by its token (FT-218). It is registered before the sign-in below, which every other
  // route goes through: changing categories stays with the Mini App, and a new route is closed to the token by default
  router.get('/', ...createCurrentUserOrAppTokenMiddleware(userModule), controller.getAll);
  router.use(...createCurrentUserMiddleware(userModule));
  router.post('/', controller.post);
  router.patch('/:id', controller.patch);
  router.delete('/:id', controller.delete);
  return router;
}
