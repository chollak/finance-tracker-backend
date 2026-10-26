import { Telegram } from 'telegraf';
import { BotUsernameSource } from '../domain/authPorts';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.AUTH);

/**
 * The bot's @username for the login link: `TG_BOT_USERNAME` when set, otherwise asked from Telegram (getMe) once and
 * remembered. A failed ask is tried again on the next login.
 */
export class ConfiguredBotUsername implements BotUsernameSource {
  private known: string | null;

  constructor(configured: string, private botToken: string, private getMe: (token: string) => Promise<{ username?: string }> = defaultGetMe) {
    this.known = configured.trim().replace(/^@/, '') || null;
  }

  async username(): Promise<string | null> {
    if (this.known) return this.known;
    if (!this.botToken) return null;
    try {
      const me = await this.getMe(this.botToken);
      this.known = me.username ?? null;
    } catch (error) {
      logger.warn('Could not learn the bot username for the web login', { error: (error as Error).message });
    }
    return this.known;
  }
}

function defaultGetMe(token: string): Promise<{ username?: string }> {
  return new Telegram(token).getMe();
}
