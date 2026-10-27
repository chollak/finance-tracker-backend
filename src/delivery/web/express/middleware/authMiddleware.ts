/**
 * Authentication Middleware
 *
 * Validates Telegram Web App initData using HMAC-SHA256.
 * This ensures requests come from legitimate Telegram Web App users.
 *
 * Security: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import { Request, RequestHandler, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';
import { telegramIdOf } from '../../../../shared/domain/access/telegramAccess';
import { ShortcutCaptureAccess, shortcutCaptureAccess } from '../../../../shared/domain/access/shortcutCaptureAccess';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.AUTH);

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
 * @param quiet - Do not log why the data was refused (the caller is not the one answering the request)
 * @returns Parsed data if valid, null if invalid
 */
function validateTelegramWebAppData(initData: string, botToken: string, quiet = false): TelegramInitData | null {
  try {
    // Parse the initData string
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      if (!quiet) logger.warn('No hash in initData');
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
      if (!quiet) logger.warn('Hash mismatch - invalid initData');
      return null;
    }

    // Parse user data
    const userJson = params.get('user');
    const authDate = parseInt(params.get('auth_date') || '0', 10);

    // Check auth_date is not too old (max 1 hour)
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 3600; // 1 hour

    if (now - authDate > maxAge) {
      if (!quiet) logger.warn('initData expired', { authDate, now, age: now - authDate });
      return null;
    }

    return {
      query_id: params.get('query_id') || undefined,
      user: userJson ? JSON.parse(userJson) : undefined,
      auth_date: authDate,
      hash,
    };
  } catch (error) {
    if (!quiet) logger.error('Error validating initData', error as Error);
    return null;
  }
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The name in a Host header, without the port: `localhost:3000` → `localhost`, `[::1]:3000` → `[::1]`. */
function hostnameOf(host: string | undefined): string {
  const match = (host ?? '').trim().toLowerCase().match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/);
  return match ? match[1] : '';
}

/**
 * Whoever forwarded the request says it came from this machine. Cloudflare always sets `cf-connecting-ip`, so a
 * tunnelled request never qualifies; the Vite dev proxy (`xfwd`) names the browser it forwards for, which is loopback
 * only when the browser runs here — not with `vite --host` and a phone on the Wi-Fi.
 */
function forwardedForLoopback(req: Request): boolean {
  if (req.headers['cf-connecting-ip'] !== undefined || req.headers.forwarded !== undefined) return false;
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor === undefined) return true;
  const chain = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor).split(',').map(entry => entry.trim());
  return chain.every(address => LOOPBACK_ADDRESSES.has(address));
}

/**
 * A request from this machine: over loopback, addressed to this machine by name (a page of another site rebound to
 * 127.0.0.1 — DNS rebinding — carries its own Host) and, if a proxy forwarded it, for a client on loopback too.
 * cloudflared connects to the server over loopback, so its requests are told apart by the headers Cloudflare adds.
 */
export function isLocalRequest(req: Request): boolean {
  return LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress ?? '')
    && LOCAL_HOSTNAMES.has(hostnameOf(req.headers.host))
    && forwardedForLoopback(req);
}

/**
 * Whether the dev headers, which sign in without proof, may count: outside production and only from this machine.
 * `npm run dev:miniapp` puts the dev server on the internet through a quick tunnel, and it listens on every interface.
 */
function devHeadersAllowed(req: Request): boolean {
  return process.env.NODE_ENV !== 'production' && isLocalRequest(req);
}

/**
 * The Telegram user id a request is signed in as, by the same rules as `requireAuth`, without answering the
 * request: `X-Dev-User-Id` outside production from this machine, otherwise valid, unexpired initData in
 * `Authorization: tma <initData>`, otherwise the browser's session cookie (FT-128, `req.webSession`). Null when the
 * request proves no user.
 *
 * The general rate limit counts by it (FT-139); it runs before the route's own authentication.
 */
export function signedInTelegramId(req: Request, botToken: string = AppConfig.TG_BOT_API_KEY): number | null {
  if (devHeadersAllowed(req)) {
    const devUserId = req.headers['x-dev-user-id'];
    if (devUserId && typeof devUserId === 'string') {
      const id = parseInt(devUserId, 10);
      return Number.isSafeInteger(id) ? id : null;
    }
  }

  if (!req.headers.authorization) {
    return req.webSession?.telegramId ?? null;
  }

  const [scheme, initData] = req.headers.authorization.split(' ');
  if (scheme?.toLowerCase() !== 'tma' || !initData || !botToken) {
    return null;
  }

  const id = validateTelegramWebAppData(initData, botToken, true)?.user?.id;
  return typeof id === 'number' && Number.isSafeInteger(id) ? id : null;
}

/**
 * Closed access (FT-153): a request signed in as someone not in ALLOWED_TELEGRAM_IDS — by Telegram initData, the
 * browser's session cookie or `X-Dev-User-Id` — gets 403 before any route, so no route resolves or creates its user.
 * A dev header that names no Telegram id is refused too: `requireAuth` would sign it in as NaN. A request that proves
 * no user goes on to its route, which answers 401 if it needs sign-in. With an empty list everyone goes on.
 */
export function createAllowedUsersMiddleware(): RequestHandler {
  const access = AppConfig.TELEGRAM_ACCESS;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (access.open) {
      next();
      return;
    }

    const telegramId = signedInTelegramId(req);
    const provesNoUser = telegramId === null && !(devHeadersAllowed(req) && req.headers['x-dev-user-id']);
    const allowed = telegramId !== null && access.allows(telegramId);
    if (provesNoUser || allowed) {
      next();
      return;
    }

    logger.warn('Request from a Telegram user who is not allowed refused', { telegramId, path: req.originalUrl });
    res.status(403).json({
      success: false,
      error: 'This Telegram account has no access',
      code: 'ACCESS_NOT_ALLOWED',
    });
  };
}

/**
 * The browser's session (FT-128) as the signed-in user, when the request has no Authorization header: Telegram's
 * initData, when sent, decides alone. The session knows only the Telegram id; names come from the users table.
 */
function signInWithWebSession(req: Request): boolean {
  if (req.headers.authorization || !req.webSession) return false;
  req.telegramUser = { id: req.webSession.telegramId, first_name: '' };
  req.isAuthenticated = true;
  return true;
}

/**
 * Authentication middleware
 *
 * Validates Telegram Web App initData from Authorization header.
 * Format: Authorization: tma <initData>
 * Without the header, a browser's session cookie (FT-128, put in `req.webSession` by webSessionMiddleware) signs in.
 *
 * @example
 * // Apply to protected routes
 * router.use('/api/transactions', requireAuth, transactionRoutes);
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Development mode bypass: X-Dev-User-Id, only from this machine (never through the tunnel)
  if (devHeadersAllowed(req)) {
    const devUserId = req.headers['x-dev-user-id'];
    if (devUserId && typeof devUserId === 'string') {
      logger.debug('Development auth bypass', { devUserId });
      req.telegramUser = {
        id: parseInt(devUserId, 10),
        first_name: 'Dev User',
      };
      req.isAuthenticated = true;
      next();
      return;
    }
  }

  // A browser signed in through the bot (FT-128)
  if (signInWithWebSession(req)) {
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
    logger.error('TG_BOT_API_KEY not configured');
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
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  // Development mode bypass: allow the same local dev header as requireAuth.
  // This keeps browser-only Mini App QA working for routes that allow guest mode
  // but still need ownership checks for real user resources.
  if (devHeadersAllowed(req)) {
    const devUserId = req.headers['x-dev-user-id'];
    if (devUserId && typeof devUserId === 'string') {
      logger.debug('Development optional auth bypass', { devUserId });
      req.telegramUser = {
        id: parseInt(devUserId, 10),
        first_name: 'Dev User',
      };
      req.isAuthenticated = true;
      next();
      return;
    }
  }

  // A browser signed in through the bot (FT-128)
  if (signInWithWebSession(req)) {
    next();
    return;
  }

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
 * Prevents IDOR attacks: the userId in the path, body or query must be the signed-in user's own Telegram id
 * (2026-10-21). A UUID or a `guest_*` id is refused — it says nothing about who sent the request, and there are
 * no guests any more (decision Д4).
 *
 * @example
 * router.get('/transactions/:userId', requireAuth, verifyOwnership, handler);
 */
export function verifyOwnership(req: Request, res: Response, next: NextFunction): void {
  // Get target userId from request
  const targetUserId = req.params.userId || req.body?.userId || req.query?.userId;

  if (!targetUserId) {
    // No userId to check - allow (some endpoints may not need it)
    next();
    return;
  }

  if (!req.isAuthenticated || !req.telegramUser) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const authTelegramId = req.telegramUser.id.toString();
  // userResolutionMiddleware leaves telegramId null for a UUID or a guest id: it names no one this request signed in as
  const targetTelegramId = req.resolvedUser ? req.resolvedUser.telegramId : String(targetUserId).trim();

  if (targetTelegramId !== authTelegramId) {
    logger.warn('Ownership mismatch', { authTelegramId, targetUserId });
    res.status(403).json({
      success: false,
      error: 'You can only access your own resources',
      code: 'ACCESS_DENIED',
    });
    return;
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
    logger.warn('Non-admin access attempt', {
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

/** Header with the Telegram id an iPhone Shortcut captures for: optional once SHORTCUT_CAPTURE_OWNER is set (FT-155). */
export const SHORTCUT_USER_ID_HEADER = 'x-shortcut-user-id';
/** Header with the capture token, SHORTCUT_CAPTURE_TOKEN. */
export const SHORTCUT_TOKEN_HEADER = 'x-shortcut-capture-token';

/**
 * Constant-time string comparison.
 *
 * Hashing first keeps timingSafeEqual from throwing on length mismatch (it requires equal-length
 * buffers) and avoids leaking the expected token's length through the error path.
 */
function safeTokenEquals(provided: string, expected: string): boolean {
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

/**
 * The Shortcut setting by the rules AppConfig checks at start (FT-155). Read per request, as NODE_ENV is for the dev
 * headers: in production the environment does not change, and tests switch it per case.
 */
function currentShortcutCapture(): ShortcutCaptureAccess {
  return shortcutCaptureAccess(
    { token: process.env.SHORTCUT_CAPTURE_TOKEN, owner: process.env.SHORTCUT_CAPTURE_OWNER },
    { production: process.env.NODE_ENV === 'production', access: AppConfig.TELEGRAM_ACCESS }
  );
}

function refuse(res: Response, status: number, code: string, error: string): void {
  res.status(status).json({ success: false, error, code });
}

type ShortcutOwner = { owner: string } | { refused: { code: string; error: string } };

/**
 * Who the capture is written for: the configured owner, which the header may only repeat; without one (outside
 * production) the header names the owner. Ids compare as numbers, as the list does: `0900000143` is `900000143`.
 */
function shortcutOwner(configured: string | null, claimedRaw: string): ShortcutOwner {
  const claimed = claimedRaw ? telegramIdOf(claimedRaw) : null;
  if (claimedRaw && (claimed === null || (configured !== null && claimed !== configured))) {
    return { refused: { code: 'ACCESS_DENIED', error: 'This capture token writes only for its owner' } };
  }
  const owner = configured ?? claimed;
  if (owner === null) {
    return { refused: { code: 'SHORTCUT_OWNER_REQUIRED', error: 'Set SHORTCUT_CAPTURE_OWNER or send X-Shortcut-User-Id' } };
  }
  return { owner };
}

/**
 * The iPhone Shortcut's way in (FT-075, FT-155). A Shortcut cannot produce Telegram initData, so it sends the capture
 * token, `X-Shortcut-Capture-Token`, and optionally `X-Shortcut-User-Id`. The capture is written for
 * SHORTCUT_CAPTURE_OWNER, and the source is forced to `ios_shortcut`, so the Shortcut body only has to carry `text`.
 *
 * - Production (the live instance): on only with a token of 32+ characters and an owner on ALLOWED_TELEGRAM_IDS —
 *   otherwise `403 SHORTCUT_CAPTURE_DISABLED`, loudly, so a Shortcut never falls through to another auth path. The
 *   token is always required.
 * - Outside production, as before: without an owner the header names it; without a token only a request from this
 *   machine goes through (`403 SHORTCUT_CAPTURE_TOKEN_REQUIRED` through the tunnel or the Wi-Fi).
 *
 * The token is checked first, in constant time (`401 INVALID_SHORTCUT_TOKEN`), so an answer to a wrong token says
 * nothing about the owner or the list. A header naming anyone but the owner is `403 ACCESS_DENIED`. A request with
 * neither header signs in and captures for the signed-in user (`writeAsSignedInUser`).
 *
 * `req.telegramUser` is deliberately NOT fabricated here: the token proves nothing about a Telegram session, so
 * ownership-sensitive middleware (`verifyOwnership`, `requireAdmin`) stays fail-closed for shortcut requests.
 */
export function allowShortcutCapture(req: Request, res: Response, next: NextFunction): void {
  const rawUserId = req.headers[SHORTCUT_USER_ID_HEADER];
  const claimedOwner = typeof rawUserId === 'string' ? rawUserId.trim() : '';
  const rawToken = req.headers[SHORTCUT_TOKEN_HEADER];

  // Not a Shortcut request: the signed-in user captures for themselves
  if (!claimedOwner && rawToken === undefined) {
    requireAuth(req, res, () => writeAsSignedInUser(req, res, next));
    return;
  }

  const setting = currentShortcutCapture();
  if (!setting.enabled) {
    logger.warn('Shortcut capture rejected: the path is off', { problems: setting.problems.length });
    refuse(res, 403, 'SHORTCUT_CAPTURE_DISABLED', 'Shortcut capture is not set up on this server');
    return;
  }

  // Without a token the header alone names the owner, so it counts only from this machine (never in production, where
  // the path is off without a token): through the tunnel anyone with the link could write as anyone
  if (!setting.token && !isLocalRequest(req)) {
    logger.warn('Shortcut capture without a token from outside this machine rejected');
    refuse(res, 403, 'SHORTCUT_CAPTURE_TOKEN_REQUIRED', 'Shortcut capture through a tunnel or the network needs SHORTCUT_CAPTURE_TOKEN');
    return;
  }

  if (setting.token) {
    const providedToken = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!providedToken || !safeTokenEquals(providedToken, setting.token)) {
      logger.warn('Shortcut capture token rejected');
      refuse(res, 401, 'INVALID_SHORTCUT_TOKEN', 'Invalid or missing shortcut capture token');
      return;
    }
  }

  const resolved = shortcutOwner(setting.owner, claimedOwner);
  if ('refused' in resolved) {
    logger.warn('Shortcut capture for someone other than its owner refused', { code: resolved.refused.code });
    refuse(res, 403, resolved.refused.code, resolved.refused.error);
    return;
  }

  // Closed access (FT-153): the owner is checked as initData would be. Production does not start with an owner off the
  // list, so this matters outside production, where the header may name the owner
  if (!AppConfig.TELEGRAM_ACCESS.allows(resolved.owner)) {
    logger.warn('Shortcut capture for a Telegram user who is not allowed refused', { shortcutUserId: resolved.owner });
    refuse(res, 403, 'ACCESS_NOT_ALLOWED', 'This Telegram account has no access');
    return;
  }

  logger.debug('Shortcut capture accepted', { tokenRequired: Boolean(setting.token), boundOwner: setting.owner !== null });

  req.isAuthenticated = true;

  // The owner is the authoritative id for this flow, so it overrides whatever the body said.
  if (req.body && typeof req.body === 'object') {
    req.body.userId = resolved.owner;
    req.body.source = 'ios_shortcut';
  }

  next();
}

/**
 * Formerly guest mode: a `guest_*` userId went through without signing in. There are no guests any more (decision Д4,
 * FT-128), so every request signs in (2026-10-21). Kept under its old name for the routes that use it until FT-136.
 */
export function allowGuestMode(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, next);
}

/**
 * A write for the signed-in user (2026-10-21). A `userId` the path, query or body still carries — the Mini App's
 * outbox, older clients — must be that user's Telegram id, or the write is refused: never another account. The body is then set to
 * the signed-in user, so user resolution and the handler see only them. Behind requireAuth.
 */
export function writeAsSignedInUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.telegramUser) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  const signedIn = String(req.telegramUser.id);
  // Every place a userId can come from: user resolution reads the path and the query before the body
  const claims = [req.params?.userId, req.query?.userId, req.body?.userId];
  const othersClaimed = claims.some(
    claimed => claimed !== undefined && claimed !== null && claimed !== '' && String(claimed).trim() !== signedIn
  );
  if (othersClaimed) {
    logger.warn('Write for another user refused', { signedIn });
    res.status(403).json({ success: false, error: 'You can only write your own records', code: 'ACCESS_DENIED' });
    return;
  }

  if (req.body && typeof req.body === 'object') req.body.userId = signedIn;
  next();
}
