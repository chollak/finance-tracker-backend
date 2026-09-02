import { Router, Request, Response } from 'express';
import { QuickCaptureService } from '../../application/quickCaptureService';
import { CAPTURE_SOURCES, isCaptureSource } from '../../domain/quickCaptureTypes';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { UserModule } from '../../../user/userModule';
import { resolveUserIdToUUID } from '../../../../shared/application/helpers/userIdResolver';
import { allowGuestMode } from '../../../../delivery/web/express/middleware/authMiddleware';
import { aiRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';

const MAX_TEXT_LENGTH = 2000;

/**
 * Mounted at `/quick-capture` inside buildServer, so the public route is POST /api/quick-capture.
 */
export function createQuickCaptureRouter(
  quickCaptureService: QuickCaptureService,
  userModule?: UserModule
): Router {
  const router = Router();

  // Capture can reach OpenAI, so it shares the AI rate limit with /voice.
  router.use(aiRateLimiter);

  router.post('/', allowGuestMode, async (req: Request, res: Response) => {
    try {
      const { text, source, userId, userName } = req.body ?? {};

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        const error = ErrorFactory.validation('Text is required and cannot be empty', 'text');
        return handleControllerError(error, res);
      }

      if (text.length > MAX_TEXT_LENGTH) {
        const error = ErrorFactory.validation(`Text is too long (maximum ${MAX_TEXT_LENGTH} characters)`, 'text');
        return handleControllerError(error, res);
      }

      if (source !== undefined && !isCaptureSource(source)) {
        const error = ErrorFactory.validation(`Source must be one of: ${CAPTURE_SOURCES.join(', ')}`, 'source');
        return handleControllerError(error, res);
      }

      // Capture writes transactions, so the owner must be explicit — no default userId here,
      // unlike the older /voice/text-input route that falls back to '1'.
      if (!userId || typeof userId !== 'string') {
        const error = ErrorFactory.validation('User ID is required', 'userId');
        return handleControllerError(error, res);
      }

      const resolvedUserId = userModule ? await resolveUserIdToUUID(userId, userModule) : userId;

      const result = await quickCaptureService.capture({
        text,
        userId: resolvedUserId,
        userName: typeof userName === 'string' ? userName : undefined,
        source,
      });

      handleControllerSuccess(result, res, 200, 'Quick capture processed');
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  return router;
}
