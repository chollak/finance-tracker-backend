import { BotContext } from '../types';
import { captureDayOf, capturedAtProblem } from '../../../../modules/quickCapture/domain/capturedAt';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM_MSG);

/**
 * When the message was sent, by Telegram's clock (FT-182): the time of input of what it writes. While the PC is off
 * Telegram keeps a message up to 24 hours and the bot reads it once the PC is on; dated by the time it was read, a
 * phrase sent in the evening would land on the next day. The limits are those of `capturedAt` (FT-175), but a time
 * older than 30 days is dropped, not refused: Telegram keeps nothing that long, so the server's clock is off, and a
 * refusal would answer every message with an error. None without a message: a button press is not a time of input.
 */
export function messageSentAt(ctx: BotContext, now: Date = new Date()): Date | undefined {
  const date = ctx.message?.date;
  if (typeof date !== 'number') return undefined;
  const sentAt = new Date(date * 1000);
  if (capturedAtProblem(sentAt, now) !== 'too_old') return sentAt;
  logger.warn('A message is older than a time of input may be; it is dated by the server clock', {
    daysAgo: Math.round((now.getTime() - sentAt.getTime()) / 86_400_000),
  });
  return undefined;
}

/** `{ capturedAt }` of the message, or nothing — for the capture of a phrase, which checks the limits itself. */
export function withMessageSentAt(ctx: BotContext): { capturedAt?: Date } {
  const capturedAt = messageSentAt(ctx);
  return capturedAt ? { capturedAt } : {};
}

/** The day the message's records are dated by, on the user's calendar; none without a time of input. */
export function messageDay(ctx: BotContext, now: Date = new Date()): string | undefined {
  const sentAt = messageSentAt(ctx, now);
  return sentAt ? captureDayOf(sentAt, now) : undefined;
}
