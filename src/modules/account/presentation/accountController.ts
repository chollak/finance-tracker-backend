import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { AccountModule } from '../accountModule';
import { CreateAccountUseCase, ListAccountsUseCase, UpdateAccountUseCase } from '../application/accountUseCases';
import { GetAccountOperationsUseCase } from '../application/accountOperations';
import { CompleteFirstLaunchUseCase } from '../application/firstLaunchUseCase';

/** GET/POST /api/accounts, PATCH /api/accounts/:id (FT-101), POST /api/accounts/opening-balances (FT-109). */
export class AccountController {
  constructor(
    private list: ListAccountsUseCase,
    private create: CreateAccountUseCase,
    private update: UpdateAccountUseCase,
    private operations: GetAccountOperationsUseCase,
    private firstLaunch: CompleteFirstLaunchUseCase
  ) {}

  /** POST /api/accounts/opening-balances — the first launch: cash, card and dollars on hand today (FT-109). */
  postOpeningBalances = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.firstLaunch.execute({ userId: currentUserId(req), body: req.body ?? {} });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  /** GET /api/accounts/:id/operations?from&to — records and moves of the account by day (FT-104). */
  getOperations = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.operations.execute({
        userId: currentUserId(req),
        accountId: String(req.params.id),
        from: req.query.from,
        to: req.query.to,
      });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.list.execute({ userId: currentUserId(req) });
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
        accountId: String(req.params.id),
        body: req.body ?? {},
      });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };
}

/**
 * Mounted at /api/accounts; operations of one account (FT-104) and the first launch (FT-109) are added to
 * the same router. Whether the first launch is done is kept in the user's settings.
 */
export function createAccountRoutes(accountModule: AccountModule, userModule: UserModule): Router {
  const controller = new AccountController(
    accountModule.getListAccountsUseCase(),
    accountModule.getCreateAccountUseCase(),
    accountModule.getUpdateAccountUseCase(),
    accountModule.getAccountOperationsUseCase(),
    accountModule.getCompleteFirstLaunchUseCase(userModule)
  );
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/', controller.getAll);
  router.post('/', controller.post);
  router.post('/opening-balances', controller.postOpeningBalances);
  router.patch('/:id', controller.patch);
  router.get('/:id/operations', controller.getOperations);
  return router;
}
