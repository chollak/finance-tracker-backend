import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, ExternalServiceError, ConfigurationError } from '../../../../shared/domain/errors/AppError';
import { ERROR_MESSAGES } from '../../../../shared/domain/constants/messages';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.HTTP);

/**
 * Global error handling middleware
 * Must be placed after all routes and other middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  logger.error('Express error handler', error, {
    url: req.url,
    method: req.method,
    userId: req.body?.userId || req.params?.userId || 'unknown',
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
  logger.debug(`${req.method} ${req.url}`, {
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);

    // Log slow requests
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        duration,
        statusCode: res.statusCode,
      });
    }
  });

  next();
}

/**
 * Allowed CORS origins
 * In production, only allow specific domains
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Production domain
  if (process.env.WEB_APP_URL) {
    origins.push(process.env.WEB_APP_URL);
  }

  // Telegram Web App (t.me embedded webview)
  origins.push('https://web.telegram.org');
  origins.push('https://telegram.org');

  // Development origins
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:5173'); // Vite dev server
    origins.push('http://localhost:3000'); // Backend
    origins.push('http://127.0.0.1:5173');
    origins.push('http://127.0.0.1:3000');

    // Ngrok for testing
    if (process.env.NGROK_URL) {
      origins.push(process.env.NGROK_URL);
    }
  }

  return origins;
}

/**
 * CORS headers middleware
 * Only allows requests from whitelisted origins
 */
export function corsHeaders(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests without origin (same-origin, curl, Postman in dev)
    if (process.env.NODE_ENV === 'development') {
      res.header('Access-Control-Allow-Origin', '*');
    }
    // In production, no origin header = no CORS header (blocks cross-origin)
  }
  // If origin is not in whitelist, don't set Access-Control-Allow-Origin
  // Browser will block the request

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}

/**
 * Security headers middleware
 * Implements OWASP security headers recommendations
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.header('X-Frame-Options', 'DENY');

  // XSS protection (legacy, but still useful)
  res.header('X-XSS-Protection', '1; mode=block');

  // Control referrer information
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (for API responses)
  res.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // HSTS - enforce HTTPS (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Prevent browser from caching sensitive responses
  if (req.path.includes('/api/')) {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
  }

  next();
}