import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../../user/userModule';
import { GetMonthAnalyticsUseCase } from '../../application/getMonthAnalytics';
import { GetCategoryAnalyticsUseCase } from '../../application/getCategoryAnalytics';

/** GET /api/analytics?month&type, GET /api/analytics/categories/:id?month (FT-120). */
export class AnalyticsController {
  constructor(
    private month: GetMonthAnalyticsUseCase,
    private category: GetCategoryAnalyticsUseCase
  ) {}

  getMonth = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.month.execute({ userId: currentUserId(req), query: req.query as Record<string, unknown> });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  getCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.category.execute({
        userId: currentUserId(req),
        categoryId: String(req.params.id),
        query: req.query as Record<string, unknown>,
      });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };
}

/** The analytics routes take the user from authentication only. */
export function createAnalyticsRoutes(
  month: GetMonthAnalyticsUseCase,
  category: GetCategoryAnalyticsUseCase,
  userModule: UserModule
): Router {
  const controller = new AnalyticsController(month, category);
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/', controller.getMonth);
  router.get('/categories/:id', controller.getCategory);
  return router;
}
