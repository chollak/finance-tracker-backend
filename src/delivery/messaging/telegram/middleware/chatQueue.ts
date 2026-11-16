import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * After this long an update still being handled is logged, not cut: the chat's next updates wait for it. Telegraf's
 * own limit before #317, which answered «Произошла ошибка» while the handler went on.
 */
export const SLOW_UPDATE_MS = 90_000;

const settled = (): void => undefined;

/**
 * The updates of one chat one at a time, in the order Telegram sent them (#317). Telegraf's polling hands a whole batch
 * of getUpdates to the handlers side by side, and a batch is everything that came while the bot did not poll: the PC
 * asleep, a restart, a slow voice message. Chains in a chat need the order — /undo after a phrase cancels that phrase,
 * «18к» after «такси» answers «Сколько?» — so an update waits here until the chat's previous one is done, failed or
 * not; its own failure still reaches its own `bot.catch`. Chats do not wait for each other. Polling still waits for the
 * whole batch before it confirms it (FT-167).
 *
 * It goes right after the closed access, before any middleware that awaits: Telegraf enters the middleware of a batch's
 * updates in their order, and only up to the first await. An update without a chat (a payment's pre_checkout_query) is
 * not held: nothing in a chat waits for it, and Telegram wants its answer within seconds.
 */
export function chatQueue(): MiddlewareFn<BotContext> {
  // The last update of each chat in line: the next one of the chat starts once it has settled
  const lastInLine = new Map<number, Promise<void>>();

  return (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return next();

    const turn = (lastInLine.get(chatId) ?? Promise.resolve()).then(() => handleLogged(ctx, next));
    const done = turn.then(settled, settled);
    lastInLine.set(chatId, done);
    void done.then(() => {
      if (lastInLine.get(chatId) === done) lastInLine.delete(chatId);
    });
    return turn;
  };
}

/** Runs the update; one that takes longer than SLOW_UPDATE_MS is logged once. */
async function handleLogged(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  const timer = setTimeout(() => {
    logger.warn('A Telegram update is still being handled; the next updates of its chat wait for it', {
      updateId: ctx.update.update_id,
      updateType: ctx.updateType,
      afterSeconds: SLOW_UPDATE_MS / 1000,
    });
  }, SLOW_UPDATE_MS);
  // The warning keeps nothing running: the shutdown waits only for the updates themselves (FT-167)
  timer.unref?.();
  try {
    await next();
  } finally {
    clearTimeout(timer);
  }
}
