/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse by limiting request rates.
 * Uses express-rate-limit with different limits for different endpoint types.
 */

import rateLimit, { ipKeyGenerator, MemoryStore, RateLimitRequestHandler, Store } from 'express-rate-limit';
import { Request, Response } from 'express';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';
import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';
import { signedInTelegramId } from './authMiddleware';

const logger = createLogger(LogCategory.RATE_LIMIT);

/** The counters of the shared limiters below, one store each (express-rate-limit refuses a store used twice). */
const sharedStores: MemoryStore[] = [];

function sharedStore(): MemoryStore {
  const store = new MemoryStore();
  sharedStores.push(store);
  return store;
}

/**
 * Forgets every request the shared limiters counted. For tests (FT-151): a test server starts with empty counters, as
 * the app does on start, so one test's requests never count against the next. The limits themselves do not change.
 */
export async function resetSharedRateLimiters(): Promise<void> {
  await Promise.all(sharedStores.map(store => store.resetAll()));
}

/** Requests per 15 minutes for one signed-in Telegram user (decision of 2026-10-20, FT-139). */
const SIGNED_IN_REQUEST_LIMIT = 600;
/** Requests per 15 minutes for one address without sign-in. */
const ANONYMOUS_REQUEST_LIMIT = 100;

/** Who a request counts against: its Telegram user when signed in, otherwise its address. */
interface Requester {
  key: string;
  telegramId: number | null;
}

/**
 * Standard (general) API rate limiter
 *
 * Applies to most API endpoints. Counts per Telegram user (initData, or `X-Dev-User-Id` outside
 * production), so people behind one address — the Mini App tunnel, a family's Wi-Fi — do not share a
 * counter: 600 requests per 15 minutes each. Requests without sign-in count per address: 100.
 *
 * It runs before the route's authentication, so it checks the sign-in itself; initData that does not
 * verify counts as no sign-in. The options exist for tests: each call has its own counters, unless it is given a store.
 */
export function createStandardRateLimiter(
  options: { botToken?: string; store?: Store } = {}
): RateLimitRequestHandler {
  const botToken = options.botToken ?? AppConfig.TG_BOT_API_KEY;
  // The key and the limit both need the requester: verify initData once per request.
  const requesters = new WeakMap<Request, Requester>();
  const requesterOf = (req: Request): Requester => {
    let requester = requesters.get(req);
    if (!requester) {
      const telegramId = signedInTelegramId(req, botToken);
      requester = telegramId === null
        ? { key: `ip:${ipKeyGenerator(req.ip ?? '')}`, telegramId }
        : { key: `user:${telegramId}`, telegramId };
      requesters.set(req, requester);
    }
    return requester;
  };

  return rateLimit({
    store: options.store,
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: (req: Request): number =>
      requesterOf(req).telegramId === null ? ANONYMOUS_REQUEST_LIMIT : SIGNED_IN_REQUEST_LIMIT,
    keyGenerator: (req: Request): string => requesterOf(req).key,
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req: Request): boolean => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
    handler: (req: Request, res: Response): void => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        telegramId: requesterOf(req).telegramId ?? 'anonymous',
      });
      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    },
  });
}

/** The general limiter the API routers share (one counter set for the whole API). */
export const standardRateLimiter: RateLimitRequestHandler = createStandardRateLimiter({ store: sharedStore() });

/**
 * Strict rate limiter for sensitive operations
 *
 * Applies to authentication, subscription changes, etc.
 * Limits: 10 requests per 15 minutes per IP
 */
export const strictRateLimiter: RateLimitRequestHandler = rateLimit({
  store: sharedStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: {
    success: false,
    error: 'Too many attempts, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use default keyGenerator (IP-based, IPv6 safe)
  handler: (req: Request, res: Response): void => {
    logger.warn('Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: 'Too many attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * Generous rate limiter for read operations
 *
 * Applies to GET endpoints that don't modify data.
 * Limits: 300 requests per 15 minutes per IP
 */
export const readOnlyRateLimiter: RateLimitRequestHandler = rateLimit({
  store: sharedStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use default keyGenerator (IP-based, IPv6 safe)
});

/**
 * AI/Voice processing rate limiter
 *
 * Applies to OpenAI-powered endpoints (expensive operations).
 * Limits: 20 requests per 15 minutes per IP
 */
export const aiRateLimiter: RateLimitRequestHandler = rateLimit({
  store: sharedStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: {
    success: false,
    error: 'Too many AI requests, please try again later',
    code: 'AI_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use default keyGenerator (IP-based, IPv6 safe)
  handler: (req: Request, res: Response): void => {
    logger.warn('AI rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: req.resolvedUser?.id || 'anonymous',
    });
    res.status(429).json({
      success: false,
      error: 'Too many AI processing requests. Please wait before trying again.',
      code: 'AI_RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * Admin endpoint rate limiter
 *
 * Very strict limits for admin operations.
 * Limits: 5 requests per 15 minutes per IP
 */
export const adminRateLimiter: RateLimitRequestHandler = rateLimit({
  store: sharedStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    error: 'Too many admin requests',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use default keyGenerator (IP-based, IPv6 safe)
});
