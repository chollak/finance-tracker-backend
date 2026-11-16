import { Request, Response } from 'express';
import { AppError } from '../../domain/errors/AppError';
import { ERROR_MESSAGES } from '../../domain/constants/messages';
import { createLogger, LogCategory } from '../logging';

const logger = createLogger(LogCategory.HTTP);

/**
 * Standardized error response handler for controllers. A refusal (4xx: a wrong request, someone else's record, nothing
 * there) is a `warn` with its status and code; a fault of the server (5xx, an unexpected exception) is an `error` with
 * the stack (#275: every 400 and 404 used to read in the journal as an error).
 */
export function handleControllerError(error: unknown, res: Response): void {
  if (error instanceof AppError && error.statusCode < 500) {
    // The reason in the text: Winston glues a `message` field to it with no separator. The context (`field`…) under
    // `errorContext`, as the error line writes it
    logger.warn(`Request refused: ${error.message}`, {
      status: error.statusCode,
      code: error.code,
      ...(error.context && { errorContext: error.context }),
    });
  } else {
    logger.error('Controller error', error instanceof Error ? error : new Error(String(error)));
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp,
        ...(error.context && { context: error.context })
      }
    });
    return;
  }

  // Handle unknown errors
  const statusCode = 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: ERROR_MESSAGES.INTERNAL_ERROR,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Standardized success response handler
 */
export function handleControllerSuccess<T>(
  data: T,
  res: Response,
  statusCode: number = 200,
  message?: string
): void {
  res.status(statusCode).json({
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString()
  });
}

/**
 * Safe parameter extraction with type checking
 */
export function getStringParam(req: Request, paramName: string): string | null {
  const value = req.params[paramName];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
