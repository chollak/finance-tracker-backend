import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * After this long an update still being handled is logged, not cut: the chat's next updates wait for it. Telegraf's
 * own limit before #317, which answered «Произошла ошибка» while the handler went on.
 */
export const SLOW_UPDATE_MS = 90_000;

/**
 * The longest an update holds anything (#317): after it the queue lets its chat go and Telegraf (its `handlerTimeout`)
 * lets polling go. The update itself runs on; only a hung one gets here — the slow parts have limits of their own.
 */
export const UPDATE_LIMIT_MS = 10 * 60_000;

/**
 * The updates of one chat one at a time, in the order Telegram sent them (#317). Telegraf's polling hands a whole batch
 * of getUpdates to the handlers side by side, and a batch is everything that came while the bot did not poll: the PC
 * asleep, a restart, a slow voice message. Chains in a chat need the order — /undo after a phrase cancels that phrase,
 * «18к» after «такси» answers «Сколько?» — so an update waits here until the chat's previous one is done, failed or
 * not; its own failure still reaches its own `bot.catch`. Chats do not wait for each other. Polling still waits for the
 * whole batch before it confirms it (FT-167). An update not done after UPDATE_LIMIT_MS no longer holds its chat.
 *
 * It goes right after the closed access, before any middleware that awaits: Telegraf enters the middleware of a batch's
 * updates in their order, and only up to the first await. An update without a chat (a payment's pre_checkout_query) is
 * not held: nothing in a chat waits for it, and Telegram wants its answer within seconds.
 */
export function chatQueue(): MiddlewareFn<BotContext> {
  // When the last update of each chat in line lets the chat go: the next one of the chat starts then
  const lastInLine = new Map<number, Promise<void>>();

  return (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return next();

    let letChatGo: () => void = () => undefined;
    const chatFree = new Promise<void>(resolve => { letChatGo = resolve; });
    const turn = (lastInLine.get(chatId) ?? Promise.resolve()).then(() => handleWatched(ctx, next, letChatGo));
    turn.then(letChatGo, letChatGo);
    lastInLine.set(chatId, chatFree);
    void chatFree.then(() => {
      if (lastInLine.get(chatId) === chatFree) lastInLine.delete(chatId);
    });
    return turn;
  };
}

/**
 * Runs the update: after SLOW_UPDATE_MS it is logged, after UPDATE_LIMIT_MS its chat goes on without it. The log names
 * the update, never what the person wrote.
 */
async function handleWatched(ctx: BotContext, next: () => Promise<void>, letChatGo: () => void): Promise<void> {
  const update = { updateId: ctx.update.update_id, updateType: ctx.updateType };
  const slow = setTimeout(() => {
    logger.warn('A Telegram update is still being handled; the next updates of its chat wait for it', {
      ...update,
      afterSeconds: SLOW_UPDATE_MS / 1000,
    });
  }, SLOW_UPDATE_MS);
  const hung = setTimeout(() => {
    logger.error('A Telegram update is not done after the limit; the next updates of its chat no longer wait for it', null, {
      ...update,
      afterMinutes: UPDATE_LIMIT_MS / 60_000,
    });
    letChatGo();
  }, UPDATE_LIMIT_MS);
  // Neither keeps anything running: the shutdown waits only for the updates themselves (FT-167)
  slow.unref?.();
  hung.unref?.();
  try {
    await next();
  } finally {
    clearTimeout(slow);
    clearTimeout(hung);
  }
}
