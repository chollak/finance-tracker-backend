import { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, HTTP_STATUS_MESSAGES } from '../constants/messages';

/**
 * Standardized error response handler for controllers
 */
export function handleControllerError(error: unknown, res: Response): void {
  console.error('Controller error:', error);

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
 * Validate required fields in request body
 */
export function validateRequiredFields(
  body: any, 
  requiredFields: string[]
): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missingFields.push(field);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Extract and validate pagination parameters
 */
export function getPaginationParams(req: Request): { 
  page: number; 
  limit: number; 
  offset: number; 
} {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Safe parameter extraction with type checking
 */
export function getStringParam(req: Request, paramName: string): string | null {
  const value = req.params[paramName];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getQueryParam(req: Request, paramName: string): string | null {
  const value = req.query[paramName];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}