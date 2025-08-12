import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ProcessVoiceInputUseCase } from '../../application/processVoiceInput';
import { ProcessTextInputUseCase } from '../../application/processTextInput';
import { handleControllerError, handleControllerSuccess } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { ErrorFactory, AppError } from '../../../../shared/domain/errors/AppError';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '../../../../shared/domain/constants/messages';

export function createVoiceProcessingRouter(
  voiceUseCase: ProcessVoiceInputUseCase,
  textUseCase: ProcessTextInputUseCase
): Router {
  const router = Router();
  const upload = multer({ dest: 'uploads/' });

  router.post('/voice-input', upload.single('audio'), async (req: Request, res: Response) => {
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

      // Process voice input
      const result = await voiceUseCase.execute({
        filePath: req.file.path,
        userId: req.body.userId,
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
    }
  });

  router.post('/text-input', async (req: Request, res: Response) => {
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

      // Default userId if not provided (for backward compatibility)
      const userId = req.body.userId || '1';
      const userName = req.body.userName || 'Unknown User';

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
