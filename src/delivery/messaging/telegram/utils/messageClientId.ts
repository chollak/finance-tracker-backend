import { BotContext } from '../types';

/**
 * The client id of the records a Telegram message writes (FT-167): `tg-<chat id>-<message id>`, one per message.
 *
 * Telegram sends a message again when the bot stopped before confirming it — a restart while it was being handled. Its
 * records are then found by this id instead of being written twice: the same unique (user, client id) the Mini App's
 * offline queue relies on (FT-106). A group's chat id is negative, which «-» allows. No id without a message: a button
 * press writes no record of its own.
 */
export function messageClientId(ctx: BotContext): string | undefined {
  const messageId = ctx.message?.message_id;
  const chatId = ctx.chat?.id;
  if (typeof messageId !== 'number' || typeof chatId !== 'number') return undefined;
  return `tg-${chatId}-${messageId}`;
}

/** `{ clientId }` of the message, or nothing — for the requests that take an optional client id. */
export function withMessageClientId(ctx: BotContext): { clientId?: string } {
  const clientId = messageClientId(ctx);
  return clientId ? { clientId } : {};
}
