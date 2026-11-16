import { telegramIdOf } from '../../../shared/domain/access/telegramAccess';

/**
 * The recipient as a chat the bot can write to: its Telegram id read by the rule of ALLOWED_TELEGRAM_IDS
 * (`telegramIdOf`, #255), leading zeros dropped — `0597843119` is the chat `597843119`. Null for a dev id or anything
 * else that names no Telegram user (`0`, a number from 2^53 on): no notice goes to it.
 */
export function withTelegramChat<R extends { telegramId: string }>(recipient: R): R | null {
  const chat = telegramIdOf(recipient.telegramId);
  if (chat === null) return null;
  return chat === recipient.telegramId ? recipient : { ...recipient, telegramId: chat };
}
