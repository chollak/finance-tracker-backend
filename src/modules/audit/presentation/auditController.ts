import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import { createCurrentUserMiddleware, currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { Result } from '../../../shared/domain/types/Result';
import { UserModule } from '../../user/userModule';
import { AuditModule } from '../auditModule';

async function answer<T>(res: Response, run: () => Promise<Result<T>>): Promise<void> {
  try {
    const result = await run();
    if (!result.success) return handleControllerError(result.error, res);
    handleControllerSuccess(result.data, res);
  } catch (error) {
    handleControllerError(error, res);
  }
}

/**
 * The spending audit (FT-131): GET /api/audits/current, PATCH /api/audits/:id/candidates/:candidateId,
 * POST /api/audits/:id/finish; the goals: GET /api/goals, PATCH /api/goals/:id. The user comes from authentication only.
 */
export class AuditController {
  constructor(private audit: AuditModule) {}

  current = (req: Request, res: Response) =>
    answer(res, () => this.audit.getCurrentAuditUseCase().execute({ userId: currentUserId(req) }));

  decide = (req: Request, res: Response) =>
    answer(res, () => this.audit.getDecideAuditCandidateUseCase().execute({
      userId: currentUserId(req),
      auditId: String(req.params.id),
      candidateId: String(req.params.candidateId),
      body: req.body ?? {},
    }));

  finish = (req: Request, res: Response) =>
    answer(res, () => this.audit.getFinishAuditUseCase().execute({ userId: currentUserId(req), auditId: String(req.params.id) }));

  goals = (req: Request, res: Response) =>
    answer(res, () => this.audit.getListGoalsUseCase().execute({ userId: currentUserId(req) }));

  updateGoal = (req: Request, res: Response) =>
    answer(res, () => this.audit.getUpdateGoalUseCase().execute({ userId: currentUserId(req), goalId: String(req.params.id), body: req.body ?? {} }));
}

/** Mounted at /api/audits. */
export function createAuditRoutes(auditModule: AuditModule, userModule: UserModule): Router {
  const controller = new AuditController(auditModule);
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/current', controller.current);
  router.patch('/:id/candidates/:candidateId', controller.decide);
  router.post('/:id/finish', controller.finish);
  return router;
}

/** Mounted at /api/goals. */
export function createGoalRoutes(auditModule: AuditModule, userModule: UserModule): Router {
  const controller = new AuditController(auditModule);
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/', controller.goals);
  router.patch('/:id', controller.updateGoal);
  return router;
}
