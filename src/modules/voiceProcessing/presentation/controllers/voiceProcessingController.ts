import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { ProcessVoiceInputUseCase, removeVoiceFile } from '../../application/processVoiceInput';
import { ProcessTextInputUseCase } from '../../application/processTextInput';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { SUCCESS_MESSAGES } from '../../../../shared/domain/constants/messages';
import { UserModule } from '../../../user/userModule';
import { resolveUserIdToUUID } from '../../../../shared/application/helpers/userIdResolver';
import { requireAuth, writeAsSignedInUser } from '../../../../delivery/web/express/middleware/authMiddleware';
import { aiRateLimiter } from '../../../../delivery/web/express/middleware/rateLimitMiddleware';

// Allowed audio MIME types
const ALLOWED_AUDIO_TYPES = [
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
];

// File filter for audio uploads
const audioFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // A validation error, so the client gets 400 with the reason instead of a generic 500.
    cb(ErrorFactory.validation(`Invalid file type: ${file.mimetype}. Allowed types: ${ALLOWED_AUDIO_TYPES.join(', ')}`, 'audio'));
  }
};

export interface VoiceRouterOptions {
  /** Where multer keeps an upload while it is read; `uploads/` of the working folder, ignored by git (FT-216). */
  uploadDir?: string;
}

export function createVoiceProcessingRouter(
  voiceUseCase: ProcessVoiceInputUseCase,
  textUseCase: ProcessTextInputUseCase,
  userModule?: UserModule,
  options: VoiceRouterOptions = {}
): Router {
  const router = Router();

  // Multer configuration with file type and size validation
  const upload = multer({
    dest: options.uploadDir ?? 'uploads/',
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB max (Telegram voice limit)
    },
    fileFilter: audioFileFilter,
  });

  // Apply AI rate limiting to all voice/text processing routes
  router.use(aiRateLimiter);

  // The signed-in user, never a userId of the form (2026-10-21); the form is read by multer, so the check comes after it
  router.post('/voice-input', requireAuth, upload.single('audio'), writeAsSignedInUser, async (req: Request, res: Response) => {
    try {
      // Input validation
      if (!req.file) {
        const error = ErrorFactory.validation('Audio file is required');
        return handleControllerError(error, res);
      }

      if (!req.body.userId) {
        const error = ErrorFactory.validation('User ID is required');
        return handleControllerError(error, res);
      }

      // Validate file type and size
      if (req.file.size === 0) {
        const error = ErrorFactory.validation('Audio file cannot be empty');
        return handleControllerError(error, res);
      }

      // Resolve telegramId to UUID if userModule is available
      let userId = req.body.userId;
      if (userModule) {
        userId = await resolveUserIdToUUID(userId, userModule);
      }

      // Process voice input
      const result = await voiceUseCase.execute({
        filePath: req.file.path,
        userId,
        userName: req.body.userName || 'Unknown User',
      });

      handleControllerSuccess(
        result,
        res,
        200,
        SUCCESS_MESSAGES.FILE_PROCESSED
      );
    } catch (error) {
      handleControllerError(error, res);
    } finally {
      // The use case removes the voice it read; an upload refused before it is not left in uploads/ either (FT-216)
      if (req.file) await removeVoiceFile(req.file.path);
    }
  });

  router.post('/text-input', requireAuth, writeAsSignedInUser, async (req: Request, res: Response) => {
    try {
      // Input validation
      if (!req.body.text || typeof req.body.text !== 'string' || req.body.text.trim().length === 0) {
        const error = ErrorFactory.validation('Text is required and cannot be empty');
        return handleControllerError(error, res);
      }

      // Validate text length
      if (req.body.text.length > 2000) {
        const error = ErrorFactory.validation('Text is too long (maximum 2000 characters)');
        return handleControllerError(error, res);
      }

      // The signed-in user (writeAsSignedInUser); there is no default user any more
      let userId = req.body.userId;
      const userName = req.body.userName || 'Unknown User';

      // Resolve telegramId to UUID if userModule is available
      if (userModule) {
        userId = await resolveUserIdToUUID(userId, userModule);
      }

      // Process text input
      const result = await textUseCase.execute(req.body.text.trim(), userId, userName);

      handleControllerSuccess(
        result,
        res,
        200,
        'Text processed successfully'
      );
    } catch (error) {
      handleControllerError(error, res);
    }
  });

  return router;
}
