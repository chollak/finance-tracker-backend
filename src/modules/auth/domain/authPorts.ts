import { AppError } from '../../../shared/domain/errors/AppError';

/** Random secrets for the link, the waiting browser and the session, and how they are kept: only their hashes. */
export interface SecretGenerator {
  /** URL-safe, up to 58 characters: it goes into the bot link after `login_` (Telegram allows 64). */
  newSecret(): string;
  hash(secret: string): string;
}

/** The bot's @username for the link `t.me/<bot>`; null when it cannot be known now. */
export interface BotUsernameSource {
  username(): Promise<string | null>;
}

/** The browser asked for a session, but its login is not confirmed (or the 5 minutes are over). */
export class LoginNotConfirmedError extends AppError {
  readonly code = 'LOGIN_NOT_CONFIRMED';
  readonly statusCode = 409;

  constructor() {
    super('The login is not confirmed in Telegram');
  }
}

/** No session cookie, or one that ended. */
export class NotSignedInError extends AppError {
  readonly code = 'NOT_SIGNED_IN';
  readonly statusCode = 401;

  constructor() {
    super('Not signed in');
  }
}

/** The bot's username is unknown (no TG_BOT_USERNAME and Telegram did not answer): there is no link to give. */
export class LoginUnavailableError extends AppError {
  readonly code = 'LOGIN_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Signing in through the bot is not available right now');
  }
}
