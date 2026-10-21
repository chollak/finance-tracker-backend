import { Request, Response, Router } from 'express';
import { handleControllerError, handleControllerSuccess } from '../../../shared/infrastructure/utils/controllerHelpers';
import {
  clearCookieOptions,
  cookieOptions,
  LOGIN_COOKIE,
  readCookie,
  SESSION_COOKIE,
} from '../../../delivery/web/express/middleware/webSessionMiddleware';
import { createCurrentUserMiddleware, currentUserId } from '../../../delivery/web/express/middleware/currentUserMiddleware';
import {
  readOnlyRateLimiter,
  standardRateLimiter,
  strictRateLimiter,
} from '../../../delivery/web/express/middleware/rateLimitMiddleware';
import { UserModule } from '../../user/userModule';
import { AuthModule } from '../authModule';
import { LOGIN_LINK_TTL_MS, SESSION_TTL_MS } from '../domain/webLogin';
import { NotSignedInError } from '../domain/authPorts';

/** The login routes read the waiting cookie; it lives the 5 minutes of the link and the 5 to take the session. */
const LOGIN_COOKIE_PATH = '/api/auth';
const LOGIN_COOKIE_MAX_AGE_MS = 2 * LOGIN_LINK_TTL_MS;
const SESSION_COOKIE_PATH = '/api';

/** Who is signed in, for «Аккаунт» in «Ещё»: «Шукур», «@shukur · вход через Telegram». */
interface SessionUser {
  telegramId: string;
  firstName: string | null;
  username: string | null;
}

/**
 * Signing in to the web app through the bot (FT-128): `/api/auth/web-login` — the login this browser waits for;
 * `/api/auth/session` — its session. The secrets travel only in httpOnly cookies, never in a body.
 */
export class AuthController {
  constructor(private authModule: AuthModule, private userModule: UserModule) {}

  /** POST /web-login: «Войти через Telegram». */
  startLogin = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.authModule.getStartWebLoginUseCase().execute({ userAgent: req.headers['user-agent'] });
      if (!result.success) return handleControllerError(result.error, res);
      const { browserSecret, ...login } = result.data;
      res.cookie(LOGIN_COOKIE, browserSecret, cookieOptions(req, LOGIN_COOKIE_PATH, LOGIN_COOKIE_MAX_AGE_MS));
      handleControllerSuccess(login, res, 201);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  /**
   * GET /web-login: how this browser's login went — the page polls it while it waits. «Это не я» is said once: that
   * answer takes the waiting cookie away, so a reload in the cookie's 10 minutes starts clean instead of repeating it.
   */
  loginStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.authModule.getWebLoginStatusUseCase().execute({ browserSecret: readCookie(req, LOGIN_COOKIE) });
      if (!result.success) return handleControllerError(result.error, res);
      if (result.data.status === 'rejected') res.clearCookie(LOGIN_COOKIE, clearCookieOptions(req, LOGIN_COOKIE_PATH));
      res.set('Cache-Control', 'no-store');
      handleControllerSuccess(result.data, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  /** DELETE /web-login: «Отменить вход». */
  cancelLogin = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.authModule.getCancelWebLoginUseCase().execute({ browserSecret: readCookie(req, LOGIN_COOKIE) });
      if (!result.success) return handleControllerError(result.error, res);
      res.clearCookie(LOGIN_COOKIE, clearCookieOptions(req, LOGIN_COOKIE_PATH));
      handleControllerSuccess({ status: 'none' }, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  /** POST /session: the confirmed login of this browser becomes its session cookie. */
  openSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.authModule.getOpenWebSessionUseCase().execute({ browserSecret: readCookie(req, LOGIN_COOKIE) });
      if (!result.success) return handleControllerError(result.error, res);
      res.cookie(SESSION_COOKIE, result.data.sessionSecret, cookieOptions(req, SESSION_COOKIE_PATH, SESSION_TTL_MS));
      res.clearCookie(LOGIN_COOKIE, clearCookieOptions(req, LOGIN_COOKIE_PATH));
      handleControllerSuccess({ user: await this.sessionUser(result.data.telegramId) }, res, 201);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  /** GET /session: who is signed in (a session, or initData in the Mini App); 401 behind the auth middleware. */
  readSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.userModule.getGetUserUseCase().execute({ id: currentUserId(req) });
      if (!user.success || !user.data) return handleControllerError(new NotSignedInError(), res);
      res.set('Cache-Control', 'no-store');
      handleControllerSuccess({ user: toSessionUser(user.data) }, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  /** DELETE /session: «Выйти» — this browser only; the cookie goes either way. */
  closeSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.authModule.getCloseWebSessionUseCase().execute({ sessionSecret: readCookie(req, SESSION_COOKIE) });
      if (!result.success) return handleControllerError(result.error, res);
      res.clearCookie(SESSION_COOKIE, clearCookieOptions(req, SESSION_COOKIE_PATH));
      handleControllerSuccess({ signedOut: true }, res);
    } catch (error) {
      handleControllerError(error, res);
    }
  };

  private async sessionUser(telegramId: string): Promise<SessionUser> {
    // The bot created the user when it saw /start
    const user = await this.userModule.getGetOrCreateUserUseCase().execute({ telegramId });
    return toSessionUser(user);
  }
}

function toSessionUser(user: { telegramId: string; firstName?: string; userName?: string }): SessionUser {
  return { telegramId: user.telegramId, firstName: user.firstName || null, username: user.userName || null };
}

/** Mounted at /api/auth. */
export function createAuthRoutes(authModule: AuthModule, userModule: UserModule): Router {
  const controller = new AuthController(authModule, userModule);
  const router = Router();
  // Starting a login is the sensitive part: 10 an address per 15 minutes
  router.post('/web-login', strictRateLimiter, controller.startLogin);
  // The page asks every few seconds while it waits: its own, generous counter
  router.get('/web-login', readOnlyRateLimiter, controller.loginStatus);
  router.delete('/web-login', standardRateLimiter, controller.cancelLogin);
  router.post('/session', standardRateLimiter, controller.openSession);
  router.get('/session', standardRateLimiter, ...createCurrentUserMiddleware(userModule), controller.readSession);
  router.delete('/session', standardRateLimiter, controller.closeSession);
  return router;
}
