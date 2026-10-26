/**
 * The browser's session (FT-128): outside Telegram the web app signs in through the bot and gets an httpOnly cookie.
 * This middleware runs before every /api route: it looks the cookie up and puts its user in `req.webSession`, where
 * `requireAuth`, `optionalAuth` and the general rate limit find it next to Telegram's initData.
 */

import { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';
import { Result } from '../../../../shared/domain/types/Result';

const logger = createLogger(LogCategory.AUTH);

/** The session: 30 days, for every /api route. */
export const SESSION_COOKIE = 'daftar_session';
/** The browser's waiting login: only the login routes read it. */
export const LOGIN_COOKIE = 'daftar_login';

declare global {
  namespace Express {
    interface Request {
      /** The user of a valid session cookie; set by createWebSessionMiddleware. */
      webSession?: { telegramId: number };
    }
  }
}

/** One cookie's value from the Cookie header, or '' when it is not there. */
export function readCookie(req: Request, name: string): string {
  const header = req.headers.cookie;
  if (!header) return '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

/**
 * httpOnly — page scripts never see it; SameSite=Lax — other sites cannot send it with their requests; Secure when the
 * request came over HTTPS (the tunnel, production), so local http keeps working.
 */
export function cookieOptions(req: Request, path: string, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || process.env.NODE_ENV === 'production',
    path,
    maxAge: maxAgeMs,
  };
}

export function clearCookieOptions(req: Request, path: string): CookieOptions {
  const { maxAge: _maxAge, ...options } = cookieOptions(req, path, 0);
  return options;
}

export type WebSessionResolver = (sessionSecret: string) => Promise<Result<{ telegramId: string } | null>>;

export function createWebSessionMiddleware(resolve: WebSessionResolver): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const secret = readCookie(req, SESSION_COOKIE);
    if (!secret) return next();
    try {
      const result = await resolve(secret);
      if (result.success && result.data) {
        const telegramId = Number(result.data.telegramId);
        if (Number.isSafeInteger(telegramId)) req.webSession = { telegramId };
      }
    } catch (error) {
      // No session rather than no answer: the route answers 401 if it needs one
      logger.error('Could not read the web session', error as Error);
    }
    next();
  };
}
