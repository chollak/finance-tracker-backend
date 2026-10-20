import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { RU } from '../i18n/ru';
import {
  formatLoginAnswer,
  formatLoginQuestion,
  formatStaleLogin,
  LOGIN_CALLBACK_PATTERN,
  loginAnswerOf,
  LoginNotice,
} from '../formatters/loginMessage';
import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/** «Подтвердить» and «Это не я» under the login question (FT-128). /start login_<token> is the command handlers'. */
export function registerLoginHandlers(bot: Telegraf<BotContext>) {
  bot.action(LOGIN_CALLBACK_PATTERN, handleLoginAnswer);
}

function keyboard(notice: LoginNotice) {
  return { parse_mode: 'HTML' as const, reply_markup: { inline_keyboard: notice.keyboard } };
}

/** The web app's address for «Вернуться в браузер ↗»: its root, where the waiting page is. */
function webUrl(): string | undefined {
  try {
    const base = AppConfig.getWebAppUrl();
    return base ? new URL('/', base).toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * /start login_<token>: the login is bound to the one who opened the link, and the bot asks them, naming the browser
 * and the time on their clock. A link that is out of date says so.
 */
export async function handleLoginStart(ctx: BotContext, token: string): Promise<void> {
  try {
    const auth = ctx.modules.authModule;
    if (!auth) throw new Error('The auth module is not wired');
    const telegramId = String(ctx.from?.id);
    const opened = await auth.getOpenLoginInBotUseCase().execute({ token, telegramId });
    if (!opened.success) throw opened.error;
    if (opened.data.kind !== 'ask') {
      await ctx.reply(formatStaleLogin().text, keyboard(formatStaleLogin()));
      return;
    }
    const user = await ctx.modules.userModule.getGetOrCreateUserUseCase().execute({ telegramId });
    const notice = formatLoginQuestion(opened.data, user.timezone);
    await ctx.reply(notice.text, keyboard(notice));
  } catch (error) {
    logger.error('Web login /start failed', error as Error, { telegramId: ctx.from?.id });
    await ctx.reply(RU.errors.generic);
  }
}

/** The first answer stands; the question becomes the answer, or says the time is out or the link is old. */
async function handleLoginAnswer(ctx: BotContext): Promise<void> {
  const match = (ctx as unknown as { match?: RegExpExecArray }).match ?? [];
  const [, code, loginId] = match;
  try {
    await ctx.answerCbQuery().catch(() => undefined);
    const auth = ctx.modules.authModule;
    if (!auth) throw new Error('The auth module is not wired');
    if (!code || !loginId) return;
    const answered = await auth.getAnswerLoginUseCase().execute({ loginId, telegramId: String(ctx.from?.id), answer: loginAnswerOf(code) });
    if (!answered.success) throw answered.error;
    const notice = formatLoginAnswer(answered.data, { webUrl: webUrl() });
    await ctx.editMessageText(notice.text, keyboard(notice));
  } catch (error) {
    logger.error('Web login answer failed', error as Error, { loginId, telegramId: ctx.from?.id });
  }
}
