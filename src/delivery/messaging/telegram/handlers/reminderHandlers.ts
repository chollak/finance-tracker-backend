import { Telegraf, Telegram } from 'telegraf';
import { BotContext } from '../types';
import {
  AUDIT_LATER_PATTERN,
  SUBSCRIPTION_ANSWER_PATTERN,
  formatAuditCall,
  formatReminder,
  formatSubscriptionAnswer,
  subscriptionAnswerOf,
} from '../formatters/reminderMessage';
import { BotNotice } from '../formatters/summaryMessage';
import { appLinks } from '../utils/webAppUrl';
import { botUserId } from '../utils/userCategories';
import { sendOrNotSent } from '../utils/notSent';
import { ReminderSender } from '../../../../modules/notification/application/remindersNotifier';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * The goal, subscription and audit reminders sent by the scheduler (FT-133) into the user's private chat with the
 * bot — its id is the user's Telegram id. Telegram's refusal (the bot blocked) is thrown to the scheduler; a request
 * that never left the machine is thrown as NoticeNotSentError, so the scheduler tries again (FT-144).
 */
export function reminderSender(telegram: Pick<Telegram, 'sendMessage'>): ReminderSender {
  return {
    async send(recipient, notice) {
      const drawn = formatReminder(notice, { appUrl: appLinks.audit(recipient.telegramId) });
      const message = await sendOrNotSent(() => telegram.sendMessage(recipient.telegramId, drawn.text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: drawn.keyboard },
      }));
      return { chatId: String(message.chat.id), messageId: message.message_id };
    },
  };
}

/** «Позже» under the audit call, «Отменено» and «Оставить» under a subscription reminder (board «Бот · напоминания»). */
export function registerReminderHandlers(bot: Telegraf<BotContext>) {
  bot.action(AUDIT_LATER_PATTERN, handleAuditLater);
  bot.action(SUBSCRIPTION_ANSWER_PATTERN, handleSubscriptionAnswer);
}

const match = (ctx: BotContext) => (ctx as unknown as { match?: RegExpExecArray }).match ?? [];

function reminders(ctx: BotContext) {
  const notifier = ctx.modules.notificationModule?.getReminders();
  if (!notifier) throw new Error('The reminders are not wired');
  return notifier;
}

const edit = (ctx: BotContext, notice: BotNotice) =>
  ctx.editMessageText(notice.text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: notice.keyboard } });

/**
 * «Позже»: the call says when it comes again — the next day at the chosen time, once — and loses «Позже». With «Звать
 * на ревизию» off it promises nothing. Under the call of an audit no longer held only the button goes.
 */
async function handleAuditLater(ctx: BotContext) {
  const [, month, left] = match(ctx);
  try {
    const telegramId = String(ctx.from?.id ?? '');
    const call = { month, left: Number(left) };
    const appUrl = appLinks.audit(telegramId);
    const userId = await botUserId(ctx);
    const answer = await reminders(ctx).answerAuditLater(userId, month);
    if (answer.kind === 'closed') {
      await ctx.answerCbQuery('Эта ревизия уже закрыта').catch(() => undefined);
      await ctx.editMessageReplyMarkup({ inline_keyboard: formatAuditCall(call, { appUrl, later: 'off' }).keyboard });
      return;
    }
    await ctx.answerCbQuery().catch(() => undefined);
    const settings = await ctx.modules.userModule.getGetUserSettingsUseCase().execute({ userId });
    if (!settings.success) throw settings.error;
    const later = settings.data.auditEnabled ? { on: answer.dueOn, time: settings.data.auditTime } : ('off' as const);
    await edit(ctx, formatAuditCall(call, { appUrl, later }));
  } catch (error) {
    logger.error('«Позже» under the audit call failed', error as Error, { month });
  }
}

/**
 * «Отменено» — the goal is answered «Уже отменено», as in the app; «Оставить» — the goal goes and the subscription
 * counts as needed. The reminder becomes the answer. A goal that is gone (changed in the audit, answered twice) loses
 * the buttons and says so.
 */
async function handleSubscriptionAnswer(ctx: BotContext) {
  const [, code, goalId] = match(ctx);
  try {
    const answer = subscriptionAnswerOf(code);
    const answered = await reminders(ctx).answerSubscription(await botUserId(ctx), goalId, answer);
    if (!answered) {
      await ctx.answerCbQuery('Этой цели уже нет').catch(() => undefined);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      return;
    }
    await ctx.answerCbQuery().catch(() => undefined);
    await edit(ctx, formatSubscriptionAnswer(answered, answer));
  } catch (error) {
    logger.error('The answer to a subscription reminder failed', error as Error, { goalId });
    await ctx.answerCbQuery('Не получилось — попробуйте ещё раз').catch(() => undefined);
  }
}
