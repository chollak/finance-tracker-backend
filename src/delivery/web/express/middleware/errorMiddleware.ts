import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, ExternalServiceError, ConfigurationError } from '../../../../shared/domain/errors/AppError';
import { ERROR_MESSAGES } from '../../../../shared/domain/constants/messages';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.HTTP);

const UNREADABLE_BODY = { code: 'INVALID_BODY', error: 'Request body could not be read' };

/**
 * How a body the JSON parser (`express.json`, body-parser) refused is answered (#272), by the parser's `type`. Only its
 * client errors are here: its 500s (a stream set up wrong) stay a server error. Named one by one, so another library's
 * error with a `type` and a 4xx `status` (OpenAI's `invalid_request_error`) is not taken for one.
 */
const BODY_REFUSALS: ReadonlyMap<string, { code: string; error: string }> = new Map([
  ['entity.too.large', { code: 'PAYLOAD_TOO_LARGE', error: 'Request body is too large' }],
  ['entity.parse.failed', { code: 'INVALID_JSON', error: 'Invalid JSON in request body' }],
  ['encoding.unsupported', UNREADABLE_BODY],
  ['charset.unsupported', UNREADABLE_BODY],
  ['request.aborted', UNREADABLE_BODY],
  ['request.size.invalid', UNREADABLE_BODY],
]);

interface BodyRefusal {
  status: number;
  code: string;
  error: string;
}

/** The parser's refusal of a body: the client sent it wrong, so it is answered with the parser's 4xx, not 500. */
function bodyRefusalOf(error: Error): BodyRefusal | null {
  const { type, status } = error as { type?: unknown; status?: unknown };
  const refusal = typeof type === 'string' ? BODY_REFUSALS.get(type) : undefined;
  if (!refusal || typeof status !== 'number' || status < 400 || status > 499) return null;
  return { status, ...refusal };
}

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
  // A body the parser refused: the path and the code only — the parser's message quotes the start of the body (#272)
  const bodyRefusal = bodyRefusalOf(error);
  if (bodyRefusal) {
    logger.warn('Request body refused', { path: req.path, method: req.method, status: bodyRefusal.status, code: bodyRefusal.code });
    res.status(bodyRefusal.status).json({ success: false, error: bodyRefusal.error, code: bodyRefusal.code });
    return;
  }

  // Log error for debugging: the path, not the query — the history search sends what the user looks for there (#269)
  logger.error('Express error handler', error, {
    path: req.path,
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
  const path = req.originalUrl || req.url || req.path;
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${path} not found`,
    code: 'NOT_FOUND'
  });
}

/**
 * Request logging middleware. It writes the path, not the query (#269): the history search sends what the user looks
 * for there (`?q=…`).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log incoming request
  logger.debug(`${req.method} ${req.path}`, {
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);

    // Log slow requests
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration,
        statusCode: res.statusCode,
      });
    }
  });

  next();
}

/** The origin of a URL — `https://host` without the path; null for an empty or malformed one. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The pages that may call the API from another origin (#272). The Mini App and the site are served by this server, so
 * their calls are same-origin and need none of this; Telegram's sites never call it — a Mini App inside
 * web.telegram.org is a frame of its own origin; in development the webapp goes through Vite's proxy, same-origin too.
 * Left: the web app's address WEB_APP_URL as an origin (an address with a path or a trailing slash never matched before).
 */
function allowedOrigins(): string[] {
  const webApp = originOf(process.env.WEB_APP_URL);
  return webApp ? [webApp] : [];
}

/**
 * CORS headers middleware (#272): only an allowed origin gets them — that origin itself with credentials, never `*`.
 * A request without Origin (the same origin's GET, the iPhone, curl) gets none: it needs none.
 */
export function corsHeaders(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  // The answer depends on Origin: a cache must not give one origin's answer to another
  res.vary('Origin');

  if (origin && allowedOrigins().includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  }

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
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
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

  // No answer of the API is kept by a browser or a proxy: they carry records, sums and sessions. Mounted on the /api
  // router only, so every answer here is the API's. It checked `req.path` for «/api/», which inside the router has no
  // prefix, so it was never set (#272)
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');

  next();
}