/**
 * Current user for the routes added in milestone 10 (docs/pastel/money-model.md, «Что меняется в API»).
 *
 * The user comes only from authentication — Telegram initData, or `X-Dev-User-Id` outside production —
 * never from the path, query or body. The Telegram id is resolved to the internal UUID, creating the
 * user on first contact, and stored in `req.currentUserId`.
 */

import { NextFunction, Request, RequestHandler, Response } from 'express';
import { UserModule } from '../../../../modules/user/userModule';
import { ErrorFactory } from '../../../../shared/domain/errors/AppError';
import { handleControllerError } from '../../../../shared/infrastructure/utils/controllerHelpers';
import { requireAuth } from './authMiddleware';

declare global {
  namespace Express {
    interface Request {
      /** Internal user id (UUID) of the authenticated user; set by createCurrentUserMiddleware. */
      currentUserId?: string;
    }
  }
}

export function createCurrentUserMiddleware(userModule: UserModule): RequestHandler[] {
  const resolve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const telegramUser = req.telegramUser;
      if (!telegramUser) {
        throw ErrorFactory.authorization('Authentication required');
      }
      const user = await userModule.getGetOrCreateUserUseCase().execute({
        telegramId: String(telegramUser.id),
        userName: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        languageCode: telegramUser.language_code,
      });
      req.currentUserId = user.id;
      next();
    } catch (error) {
      handleControllerError(error, res);
    }
  };
  return [requireAuth, resolve];
}

/** The authenticated user's id; only valid behind createCurrentUserMiddleware. */
export function currentUserId(req: Request): string {
  if (!req.currentUserId) {
    throw ErrorFactory.authorization('Authentication required');
  }
  return req.currentUserId;
}

/**
 * The Telegram id the request is signed in as — also the id of the user's private chat with the bot (FT-126: the
 * export goes there). Only valid behind createCurrentUserMiddleware.
 */
export function currentTelegramId(req: Request): string {
  if (!req.telegramUser) {
    throw ErrorFactory.authorization('Authentication required');
  }
  return String(req.telegramUser.id);
}
