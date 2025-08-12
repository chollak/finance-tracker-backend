import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, ExternalServiceError, ConfigurationError } from '../../../../shared/domain/errors/AppError';
import { ERROR_MESSAGES, HTTP_STATUS_MESSAGES } from '../../../../shared/domain/constants/messages';

/**
 * Global error handling middleware
 * Must be placed after all routes and other middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error for debugging
  console.error('Express error handler:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.method !== 'GET' ? req.body : undefined,
    userId: req.body?.userId || req.params?.userId || 'unknown',
    timestamp: new Date().toISOString()
  });

  // Handle our custom errors
  if (error instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: error.message,
      field: error.field,
      code: 'VALIDATION_ERROR',
      timestamp: error.timestamp
    });
    return;
  }

  if (error instanceof ConfigurationError) {
    res.status(500).json({
      success: false,
      error: 'Service configuration error',
      code: 'CONFIGURATION_ERROR',
      timestamp: error.timestamp
    });
    return;
  }

  if (error instanceof ExternalServiceError) {
    res.status(502).json({
      success: false,
      error: `External service error: ${error.message}`,
      code: 'EXTERNAL_SERVICE_ERROR',
      timestamp: error.timestamp
    });
    return;
  }

  if (error instanceof AppError) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      context: error.context,
      timestamp: error.timestamp
    });
    return;
  }

  // Handle common Node.js/Express errors
  if (error.name === 'SyntaxError' && 'body' in error) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      code: 'INVALID_JSON'
    });
    return;
  }

  if (error.name === 'MulterError') {
    res.status(400).json({
      success: false,
      error: 'File upload error: ' + error.message,
      code: 'FILE_UPLOAD_ERROR'
    });
    return;
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    error: ERROR_MESSAGES.INTERNAL_ERROR,
    code: 'INTERNAL_ERROR'
  });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND'
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  // Log incoming request
  console.log(`${req.method} ${req.url}`, {
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    
    // Log slow requests
    if (duration > 5000) {
      console.warn('Slow request detected:', {
        method: req.method,
        url: req.url,
        duration,
        statusCode: res.statusCode
      });
    }
  });

  next();
}

/**
 * CORS headers middleware
 */
export function corsHeaders(req: Request, res: Response, next: NextFunction): void {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
}

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
}