/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse by limiting request rates.
 * Uses express-rate-limit with different limits for different endpoint types.
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Standard API rate limiter
 *
 * Applies to most API endpoints.
 * Limits: 100 requests per 15 minutes per IP
 */
export const standardRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60, // seconds
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Use default keyGenerator (IP-based, IPv6 safe)
  skip: (req: Request): boolean => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
  handler: (req: Request, res: Response): void => {
    console.warn('[RateLimit] Rate limit exceeded:', {
      ip: req.ip,
      path: req.path,
      userId: req.resolvedUser?.id || 'anonymous',
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * Strict rate limiter for sensitive operations
 *
 * Applies to authentication, subscription changes, etc.
 * Limits: 10 requests per 15 minutes per IP
 */
export const strictRateLimiter: RateLimitRequestHandler = rateLimit({
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
    console.warn('[RateLimit] Strict rate limit exceeded:', {
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
    console.warn('[RateLimit] AI rate limit exceeded:', {
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
