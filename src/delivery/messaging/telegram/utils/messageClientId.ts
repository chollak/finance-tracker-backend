import { BotContext } from '../types';

/**
 * The client id of what a Telegram message does (FT-167): `tg-<bot id>-<chat id>-<message id>`, one per message.
 *
 * Telegram sends a message again when the bot stopped before confirming it — a restart while it was being handled. Its
 * records are then found by this id instead of being written twice: the same unique (user, client id) the Mini App's
 * offline queue relies on (FT-106). The bot's id is part of it: a private chat has the person's id with every bot and a
 * new bot numbers its messages from 1 again, while the records stay (the move to Kapelka, FT-159). At the largest
 * Telegram ids it is 48 characters, within the 64 of a client id; a group's chat id is negative, which «-» allows. No
 * id without a message: a button press writes no record of its own.
 */
export function messageClientId(ctx: BotContext): string | undefined {
  const botId = ctx.botInfo?.id;
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;
  if (typeof botId !== 'number' || typeof chatId !== 'number' || typeof messageId !== 'number') return undefined;
  return `tg-${botId}-${chatId}-${messageId}`;
}

/** `{ clientId }` of the message, or nothing — for the requests that take an optional client id. */
export function withMessageClientId(ctx: BotContext): { clientId?: string } {
  const clientId = messageClientId(ctx);
  return clientId ? { clientId } : {};
}
