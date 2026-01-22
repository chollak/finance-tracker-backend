/**
 * Authentication Middleware
 *
 * Validates Telegram Web App initData using HMAC-SHA256.
 * This ensures requests come from legitimate Telegram Web App users.
 *
 * Security: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';

/**
 * Parsed Telegram Web App init data
 */
export interface TelegramInitData {
  query_id?: string;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
  };
  auth_date: number;
  hash: string;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      /** Authenticated Telegram user from initData */
      telegramUser?: TelegramInitData['user'];
      /** Whether request is authenticated */
      isAuthenticated?: boolean;
    }
  }
}

/**
 * Validate Telegram Web App initData hash
 *
 * @param initData - Raw initData string from Telegram
 * @param botToken - Telegram bot token
 * @returns Parsed data if valid, null if invalid
 */
function validateTelegramWebAppData(initData: string, botToken: string): TelegramInitData | null {
  try {
    // Parse the initData string
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      console.warn('[Auth] No hash in initData');
      return null;
    }

    // Remove hash from params for validation
    params.delete('hash');

    // Sort params alphabetically and create data-check-string
    const dataCheckArr: string[] = [];
    const sortedParams = Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [key, value] of sortedParams) {
      dataCheckArr.push(`${key}=${value}`);
    }

    const dataCheckString = dataCheckArr.join('\n');

    // Create secret key: HMAC_SHA256(bot_token, "WebAppData")
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculate hash: HMAC_SHA256(data_check_string, secret_key)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Compare hashes (timing-safe comparison)
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculatedHash))) {
      console.warn('[Auth] Hash mismatch - invalid initData');
      return null;
    }

    // Parse user data
    const userJson = params.get('user');
    const authDate = parseInt(params.get('auth_date') || '0', 10);

    // Check auth_date is not too old (max 1 hour)
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 3600; // 1 hour

    if (now - authDate > maxAge) {
      console.warn('[Auth] initData expired:', { authDate, now, age: now - authDate });
      return null;
    }

    return {
      query_id: params.get('query_id') || undefined,
      user: userJson ? JSON.parse(userJson) : undefined,
      auth_date: authDate,
      hash,
    };
  } catch (error) {
    console.error('[Auth] Error validating initData:', error);
    return null;
  }
}

/**
 * Authentication middleware
 *
 * Validates Telegram Web App initData from Authorization header.
 * Format: Authorization: tma <initData>
 *
 * @example
 * // Apply to protected routes
 * router.use('/api/transactions', requireAuth, transactionRoutes);
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for health check
  if (req.path === '/health') {
    next();
    return;
  }

  // Get Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Authorization header required',
      code: 'MISSING_AUTH_HEADER',
    });
    return;
  }

  // Check for Telegram Mini App format: "tma <initData>"
  const [scheme, initData] = authHeader.split(' ');

  if (scheme?.toLowerCase() !== 'tma' || !initData) {
    res.status(401).json({
      success: false,
      error: 'Invalid authorization format. Expected: tma <initData>',
      code: 'INVALID_AUTH_FORMAT',
    });
    return;
  }

  // Validate initData
  const botToken = AppConfig.TG_BOT_API_KEY;

  if (!botToken) {
    console.error('[Auth] TG_BOT_API_KEY not configured');
    res.status(500).json({
      success: false,
      error: 'Server authentication not configured',
      code: 'AUTH_NOT_CONFIGURED',
    });
    return;
  }

  const validatedData = validateTelegramWebAppData(initData, botToken);

  if (!validatedData) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication',
      code: 'INVALID_AUTH',
    });
    return;
  }

  if (!validatedData.user) {
    res.status(401).json({
      success: false,
      error: 'User data missing from authentication',
      code: 'MISSING_USER_DATA',
    });
    return;
  }

  // Attach validated user to request
  req.telegramUser = validatedData.user;
  req.isAuthenticated = true;

  next();
}

/**
 * Optional authentication middleware
 *
 * Validates auth if present, but allows unauthenticated requests.
 * Useful for endpoints that work with or without auth (e.g., guest mode).
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // No auth header - continue without authentication
  if (!authHeader) {
    req.isAuthenticated = false;
    next();
    return;
  }

  const [scheme, initData] = authHeader.split(' ');

  // Invalid format - continue without authentication
  if (scheme?.toLowerCase() !== 'tma' || !initData) {
    req.isAuthenticated = false;
    next();
    return;
  }

  // Try to validate
  const botToken = AppConfig.TG_BOT_API_KEY;

  if (botToken) {
    const validatedData = validateTelegramWebAppData(initData, botToken);

    if (validatedData?.user) {
      req.telegramUser = validatedData.user;
      req.isAuthenticated = true;
    } else {
      req.isAuthenticated = false;
    }
  } else {
    req.isAuthenticated = false;
  }

  next();
}

/**
 * Verify request user matches the resource owner
 *
 * Prevents IDOR attacks by ensuring authenticated user can only access their own resources.
 * Guest users (guest_*) are allowed through since they can only access their own local data.
 *
 * @example
 * router.get('/transactions/:userId', allowGuestMode, verifyOwnership, handler);
 */
export function verifyOwnership(req: Request, res: Response, next: NextFunction): void {
  // Get target userId from request
  const targetUserId = req.params.userId || req.body?.userId || req.query?.userId;

  if (!targetUserId) {
    // No userId to check - allow (some endpoints may not need it)
    next();
    return;
  }

  // Allow guest users through - they only access their own IndexedDB data
  if (typeof targetUserId === 'string' && targetUserId.startsWith('guest_')) {
    next();
    return;
  }

  // For non-guest users, must be authenticated
  if (!req.isAuthenticated || !req.telegramUser) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  // Get authenticated user's telegramId
  const authTelegramId = req.telegramUser.id.toString();

  // Check if resolved user matches authenticated user
  // Note: resolvedUser.telegramId is set by userResolutionMiddleware
  if (req.resolvedUser) {
    // If we have resolvedUser, compare telegramIds
    if (req.resolvedUser.telegramId && req.resolvedUser.telegramId !== authTelegramId) {
      console.warn('[Auth] Ownership mismatch:', {
        authTelegramId,
        targetTelegramId: req.resolvedUser.telegramId,
        targetUserId,
      });

      res.status(403).json({
        success: false,
        error: 'You can only access your own resources',
        code: 'ACCESS_DENIED',
      });
      return;
    }
  } else {
    // Fallback: compare raw userId with telegramId
    // This handles cases where userResolutionMiddleware wasn't applied
    const targetStr = targetUserId.toString();

    // Allow if target looks like telegramId and matches
    if (/^\d+$/.test(targetStr) && targetStr !== authTelegramId) {
      console.warn('[Auth] Ownership mismatch (raw):', {
        authTelegramId,
        targetUserId: targetStr,
      });

      res.status(403).json({
        success: false,
        error: 'You can only access your own resources',
        code: 'ACCESS_DENIED',
      });
      return;
    }
  }

  next();
}

/**
 * Admin-only middleware
 *
 * Restricts access to admin users only.
 * Admin list is configured via ADMIN_TELEGRAM_IDS env variable.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // Must be authenticated
  if (!req.isAuthenticated || !req.telegramUser) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  // Get admin IDs from environment
  const adminIdsEnv = process.env.ADMIN_TELEGRAM_IDS || '';
  const adminIds = adminIdsEnv.split(',').map(id => id.trim()).filter(Boolean);

  const userTelegramId = req.telegramUser.id.toString();

  if (!adminIds.includes(userTelegramId)) {
    console.warn('[Auth] Non-admin access attempt:', {
      telegramId: userTelegramId,
      path: req.path,
    });

    res.status(403).json({
      success: false,
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED',
    });
    return;
  }

  next();
}

/**
 * Guest mode middleware
 *
 * Allows guest users (offline-first mode) without authentication.
 * Validates auth if present, but allows guest_* userIds without auth.
 */
export function allowGuestMode(req: Request, res: Response, next: NextFunction): void {
  // Check if this is a guest user request
  const targetUserId = req.params.userId || req.body?.userId || req.query?.userId;

  if (targetUserId && typeof targetUserId === 'string' && targetUserId.startsWith('guest_')) {
    // Guest user - no auth required
    req.isAuthenticated = false;
    next();
    return;
  }

  // Not a guest - require authentication
  requireAuth(req, res, next);
}
