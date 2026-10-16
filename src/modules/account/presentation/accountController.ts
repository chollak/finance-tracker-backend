import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { AccountModule } from '../accountModule';
import { CreateAccountUseCase, ListAccountsUseCase, UpdateAccountUseCase } from '../application/accountUseCases';
import { GetAccountOperationsUseCase } from '../application/accountOperations';

/** GET/POST /api/accounts, PATCH /api/accounts/:id (FT-101). */
export class AccountController {
  constructor(
    private list: ListAccountsUseCase,
    private create: CreateAccountUseCase,
    private update: UpdateAccountUseCase,
    private operations: GetAccountOperationsUseCase
  ) {}

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

/** Mounted at /api/accounts; operations of one account (FT-104) are added to the same router. */
export function createAccountRoutes(accountModule: AccountModule, userModule: UserModule): Router {
  const controller = new AccountController(
    accountModule.getListAccountsUseCase(),
    accountModule.getCreateAccountUseCase(),
    accountModule.getUpdateAccountUseCase(),
    accountModule.getAccountOperationsUseCase()
  );
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/', controller.getAll);
  router.post('/', controller.post);
  router.patch('/:id', controller.patch);
  router.get('/:id/operations', controller.getOperations);
  return router;
}
