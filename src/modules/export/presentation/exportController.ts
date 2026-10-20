import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import {
  createCurrentUserMiddleware,
  currentTelegramId,
  currentUserId,
} from '../../../delivery/web/express/middleware/currentUserMiddleware';
import { standardRateLimiter } from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { ExportModule } from '../exportModule';
import { BuildRecordsFileUseCase, SendRecordsToChatUseCase } from '../application/exportRecords';

/**
 * «Скачать все записи» (FT-126): GET /api/export — the CSV as a download (a browser); POST /api/export/chat — the
 * same file sent to the private chat with the bot (Telegram). The user comes from authentication only.
 */
export class ExportController {
  constructor(private buildFile: BuildRecordsFileUseCase, private sendToChat: SendRecordsToChatUseCase) {}

  /** A file, not JSON: the one route that answers outside handleControllerSuccess. Errors are JSON as everywhere. */
  download = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.buildFile.execute({ userId: currentUserId(req) });
      if (!result.success) return handleControllerError(result.error, res);
      const { fileName, text, count } = result.data;
      res
        .status(200)
        .set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'X-Export-Count': String(count),
          'Access-Control-Expose-Headers': 'Content-Disposition, X-Export-Count',
          'Cache-Control': 'no-store',
        })
        .send(Buffer.from(text, 'utf8'));
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  chat = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.sendToChat.execute({ userId: currentUserId(req), chatId: currentTelegramId(req) });
      if (!result.success) return handleControllerError(result.error, res);
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };
}

/** Mounted at /api/export. */
export function createExportRoutes(exportModule: ExportModule, userModule: UserModule): Router {
  const controller = new ExportController(exportModule.getBuildRecordsFileUseCase(), exportModule.getSendRecordsToChatUseCase());
  const router = Router();
  router.use(standardRateLimiter);
  router.use(...createCurrentUserMiddleware(userModule));
  router.get('/', controller.download);
  router.post('/chat', controller.chat);
  return router;
}
