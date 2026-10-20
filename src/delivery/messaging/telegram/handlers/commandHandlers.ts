import { Telegraf, Telegram } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { BotContext } from '../types';
import { RU } from '../i18n/ru';
import { appLinkRows, formatDaySummary, formatMonthSummary } from '../formatters/summaryMessage';
import { appLinks } from '../utils/webAppUrl';
import { localClock } from '../../../../modules/notification/domain/dailySummary';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * The command menu — «/» in the input field (board «Бот · меню команд»). Budgets left the bot with Д2; the
 * weekly review, /stats and /transactions with the design; /premium and /cancel_subscription keep working
 * outside the menu while monetisation waits (Д3).
 */
export const BOT_COMMANDS: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'today', description: 'Итоги дня' },
  { command: 'month', description: 'Траты за месяц' },
  { command: 'undo', description: 'Отменить последнюю запись' },
  { command: 'help', description: 'Как записывать' },
  { command: 'start', description: 'Что умеет бот' },
];

/** Sets the menu with setMyCommands; a refusal is logged — the bot works without its menu. */
export async function setCommandMenu(telegram: Pick<Telegram, 'setMyCommands'>): Promise<void> {
  try {
    await telegram.setMyCommands([...BOT_COMMANDS]);
  } catch (error) {
    logger.warn('Could not set the bot command menu', { error: (error as Error).message });
  }
}

/** /start, /help, /today and /month (FT-124); /undo is the record handlers'. */
export function registerCommandHandlers(bot: Telegraf<BotContext>) {
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('today', handleToday);
  bot.command('month', handleMonth);
  // The month in numbers before FT-124: it answers as /month, outside the menu
  bot.command('stats', handleMonth);
}

function keyboard(rows: InlineKeyboardButton[][]) {
  return { reply_markup: { inline_keyboard: rows } };
}

/** The user behind the update with the day it is on their clock. */
async function botUser(ctx: BotContext): Promise<{ id: string; telegramId: string; today: string }> {
  const telegramId = String(ctx.from?.id);
  const user = await ctx.modules.userModule.getGetOrCreateUserUseCase().execute({ telegramId });
  return { id: user.id, telegramId, today: localClock(new Date(), user.timezone).date };
}

/** The first message: what Daftar is and how to write, «Открыть Daftar ↗» (board «Бот · первое сообщение»). */
async function handleStart(ctx: BotContext) {
  try {
    await ctx.reply(RU.commands.start, { parse_mode: 'HTML', ...keyboard(appLinkRows('Открыть Daftar', appLinks.home(String(ctx.from?.id)))) });
  } catch (error) {
    logger.error('/start command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/** How to write and the commands. */
async function handleHelp(ctx: BotContext) {
  try {
    await ctx.reply(RU.commands.help, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('/help command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/** Итоги дня on request: the evening summary of today so far (board «Бот · запись текстом и голосом», /today). */
async function handleToday(ctx: BotContext) {
  try {
    const summaries = ctx.modules.notificationModule?.getSummaries();
    if (!summaries) throw new Error('The notification module is not wired');
    const user = await botUser(ctx);
    const summary = await summaries.day(user.id, user.today);
    const notice = formatDaySummary(summary, { today: user.today, appUrl: appLinks.home(user.telegramId) });
    await ctx.reply(notice.text, { parse_mode: 'HTML', ...keyboard(notice.keyboard) });
  } catch (error) {
    logger.error('/today command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}

/** Траты за месяц: what Home's month tile shows, against the same days of the month before. */
async function handleMonth(ctx: BotContext) {
  try {
    const summaries = ctx.modules.notificationModule?.getSummaries();
    if (!summaries) throw new Error('The notification module is not wired');
    const user = await botUser(ctx);
    const summary = await summaries.month(user.id, user.today);
    const notice = formatMonthSummary(summary, { analyticsUrl: appLinks.analytics(user.telegramId) });
    await ctx.reply(notice.text, { parse_mode: 'HTML', ...keyboard(notice.keyboard) });
  } catch (error) {
    logger.error('/month command error', error as Error);
    await ctx.reply(RU.errors.generic);
  }
}
