import { Telegraf, Telegram } from 'telegraf';
import { BotContext } from '../types';
import { formatDaySummary, formatNoSpending, NO_SPENDING_CALLBACK_PATTERN } from '../formatters/summaryMessage';
import { appLinks } from '../utils/webAppUrl';
import { botUserId } from '../utils/userCategories';
import { sendOrNotSent } from '../utils/notSent';
import { DailySummarySender } from '../../../../modules/notification/application/dailySummaryNotifier';
import { todayDateOnly } from '../../../../shared/domain/dates/dateOnly';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * The daily summary sent by the scheduler (FT-124) into the user's private chat with the bot — its id is the
 * user's Telegram id. Telegram's refusal (the bot blocked, the chat never started) is thrown to the scheduler; a
 * request that never left the machine is thrown as NoticeNotSentError, so the scheduler tries again (FT-144). The
 * summary of a day that did not go out by its midnight comes the next morning as «Итоги за вчера» (FT-164).
 */
export function summarySender(telegram: Pick<Telegram, 'sendMessage'>): DailySummarySender {
  return {
    async send(recipient, summary, options = {}) {
      const notice = formatDaySummary(summary, {
        today: summary.day,
        appUrl: appLinks.home(recipient.telegramId),
        scheduled: true,
        late: options.late,
      });
      const message = await sendOrNotSent(() => telegram.sendMessage(recipient.telegramId, notice.text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: notice.keyboard },
      }));
      return { chatId: String(message.chat.id), messageId: message.message_id };
    },
  };
}

/** «Да, не было» under «Трат правда не было?» (board «Бот · итоги дня»). */
export function registerSummaryHandlers(bot: Telegraf<BotContext>) {
  bot.action(NO_SPENDING_CALLBACK_PATTERN, handleNoSpending);
}

/**
 * The question becomes the answer «Отметил: 19 октября трат не было.», kept with the notice. If something was
 * recorded for the day since the question («обед 45к» as the hint says), nothing is kept: the question becomes
 * the day's summary, without the button.
 */
async function handleNoSpending(ctx: BotContext) {
  const day = ((ctx as unknown as { match?: RegExpExecArray }).match ?? [])[1];
  try {
    await ctx.answerCbQuery().catch(() => undefined);
    if (!day) return;
    const notifier = ctx.modules.notificationModule?.getDailySummary();
    if (!notifier) throw new Error('The notification module is not wired');
    const answer = await notifier.answerNoSpending(await botUserId(ctx), day);
    const today = todayDateOnly();
    const notice = answer.kind === 'recorded'
      ? formatDaySummary(answer.summary, { today, appUrl: appLinks.home(String(ctx.from?.id ?? '')), scheduled: true })
      : formatNoSpending(day, today);
    await ctx.editMessageText(notice.text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: notice.keyboard } });
  } catch (error) {
    logger.error('«Да, не было» failed', error as Error, { day });
  }
}
