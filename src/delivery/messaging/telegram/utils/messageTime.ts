import { BotContext } from '../types';
import { capturedAtProblem, inputDayOf } from '../../../../modules/quickCapture/domain/capturedAt';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM_MSG);

/**
 * When the message was sent, by Telegram's clock (FT-182): the time of input of what it writes. While the PC is off
 * Telegram keeps a message up to 24 hours and the bot reads it once the PC is on; dated by the time it was read, a
 * phrase sent in the evening would land on the next day. None without a message: a button press is not a time of input.
 */
export function messageSentAt(ctx: BotContext): Date | undefined {
  const date = ctx.message?.date;
  return typeof date === 'number' ? new Date(date * 1000) : undefined;
}

/**
 * The day the message's records are dated by: the day it was sent on the user's calendar, always (decision
 * 2026-10-30). The limits of a phone's `capturedAt` (FT-175) do not apply: Telegram's clock is right and it keeps a
 * message 24 hours, so a time beyond them means the server's clock is off, and the server's day would be the wrong
 * one. Such a time is logged, as a phone's is. None without a time of input.
 */
export function messageDay(ctx: BotContext, now: Date = new Date()): string | undefined {
  const sentAt = messageSentAt(ctx);
  if (!sentAt) return undefined;
  const problem = capturedAtProblem(sentAt, now);
  if (problem) {
    logger.warn('The server clock is off: a message was sent ahead of it or more than 30 days before it', {
      problem,
      aheadMinutes: Math.round((sentAt.getTime() - now.getTime()) / 60_000),
    });
  }
  return inputDayOf(sentAt);
}
