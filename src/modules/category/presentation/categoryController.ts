import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { CategoryModule } from '../categoryModule';
import { CreateCategoryUseCase, ListCategoriesUseCase, UpdateCategoryUseCase } from '../application/categoryUseCases';

/** GET/POST /api/categories, PATCH /api/categories/:id (FT-099). */
export class CategoryController {
  constructor(
    private list: ListCategoriesUseCase,
    private create: CreateCategoryUseCase,
    private update: UpdateCategoryUseCase
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
}

export function createCategoryRoutes(categoryModule: CategoryModule, userModule: UserModule): Router {
  const controller = new CategoryController(
    categoryModule.getListCategoriesUseCase(),
    categoryModule.getCreateCategoryUseCase(),
    categoryModule.getUpdateCategoryUseCase()
  );
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/', controller.getAll);
  router.post('/', controller.post);
  router.patch('/:id', controller.patch);
  return router;
}
