import { Router, Request, Response } from 'express';
import { QuickCaptureService } from '../../application/quickCaptureService';
import { CAPTURE_SOURCES, isCaptureSource } from '../../domain/quickCaptureTypes';
import { parseCapturedAt } from '../../domain/capturedAt';
import { readPayment } from './paymentRequest';
import { isClientId } from '../../../transaction/domain/clientId';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { UserModule } from '../../../user/userModule';
import { resolveUserIdToUUID } from '../../../../shared/application/helpers/userIdResolver';
import { allowShortcutCapture } from '../../../../delivery/web/express/middleware/authMiddleware';
import { aiRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';

const MAX_TEXT_LENGTH = 2000;

/**
 * Mounted at `/quick-capture` inside buildServer, so the public routes are POST /api/quick-capture (a phrase) and
 * POST /api/quick-capture/payment (a card payment from Apple Pay, FT-176).
 */
export function createQuickCaptureRouter(
  quickCaptureService: QuickCaptureService,
  userModule?: UserModule
): Router {
  const router = Router();

  // Capture can reach OpenAI, so it shares the AI rate limit with /voice.
  router.use(aiRateLimiter);

  // allowShortcutCapture lets the iPhone Shortcut in by its token, for its owner (FT-075, FT-155); otherwise the request
  // signs in and body.userId becomes the signed-in user (writeAsSignedInUser), so a capture is never for someone else.
  router.post('/', allowShortcutCapture, async (req: Request, res: Response) => {
    try {
      const { text, source, userId, userName, clientId, capturedAt } = req.body ?? {};

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

      if (clientId !== undefined && clientId !== null && !isClientId(clientId)) {
        const error = ErrorFactory.validation('clientId must be up to 64 letters, digits or «-»', 'clientId');
        return handleControllerError(error, res);
      }

      // The format only: its limits are checked after a repeat is answered (FT-175)
      const capturedAtMoment = capturedAt === undefined || capturedAt === null ? undefined : parseCapturedAt(capturedAt);
      if (capturedAtMoment === null) {
        const error = ErrorFactory.validation(
          'capturedAt must be an ISO 8601 time with seconds and a time zone, like 2026-10-27T09:15:00+05:00',
          'capturedAt'
        );
        return handleControllerError(error, res);
      }

      // Set by the auth middleware (signed-in user or Shortcut owner); kept as a guard against a misconfigured route
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
        ...(isClientId(clientId) ? { clientId } : {}),
        ...(capturedAtMoment ? { capturedAt: capturedAtMoment } : {}),
      });

      handleControllerSuccess(result, res, 200, 'Quick capture processed');
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  // A card payment from Apple Pay, sent ready (FT-176): the same token, owner and limit as a phrase. The body's
  // `source` is ignored — the records are `apple_pay`, set by the service
  router.post('/payment', allowShortcutCapture, async (req: Request, res: Response) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const payment = readPayment(body);
      if (!payment.success) return handleControllerError(payment.error, res);

      // Set by the auth middleware (signed-in user or Shortcut owner); kept as a guard against a misconfigured route
      const { userId, userName } = body;
      if (!userId || typeof userId !== 'string') {
        return handleControllerError(ErrorFactory.validation('User ID is required', 'userId'), res);
      }

      const result = await quickCaptureService.capturePayment({
        ...payment.data,
        userId: userModule ? await resolveUserIdToUUID(userId, userModule) : userId,
        userName: typeof userName === 'string' ? userName : undefined,
      });
      handleControllerSuccess(result, res, 200, 'Quick capture processed');
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  return router;
}
