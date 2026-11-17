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
 *
 * Every update, held or not, is also watched for a failure after UPDATE_LIMIT_MS (#386): Telegraf has let it go by
 * then, so its error reaches no `bot.catch` and would leave no trace.
 */
export function chatQueue(): MiddlewareFn<BotContext> {
  // When the last update of each chat in line lets the chat go: the next one of the chat starts then
  const lastInLine = new Map<number, Promise<void>>();

  return (ctx, next) => {
    // Now, not at the update's turn: Telegraf's limit counts the wait behind the chat's earlier updates too
    const handle = loggingLateFailure(ctx, next);
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return handle();

    let letChatGo: () => void = () => undefined;
    const chatFree = new Promise<void>(resolve => { letChatGo = resolve; });
    const turn = (lastInLine.get(chatId) ?? Promise.resolve()).then(() => handleWatched(ctx, handle, letChatGo));
    turn.then(letChatGo, letChatGo);
    lastInLine.set(chatId, chatFree);
    void chatFree.then(() => {
      if (lastInLine.get(chatId) === chatFree) lastInLine.delete(chatId);
    });
    return turn;
  };
}

/**
 * The update's handler, with a trace of a failure that comes after UPDATE_LIMIT_MS (#386). Telegraf's `handlerTimeout`
 * has answered for the update by then — its own error went to `bot.catch`, which says nothing — and p-timeout drops
 * whatever the handler throws later. The clock starts here, as the update comes in, a moment after Telegraf's: by the
 * time this one runs out, Telegraf's has. The error is logged as `bot.catch` logs one; the update is named, never what
 * the person wrote. It is thrown on as before: the queue goes on either way.
 */
function loggingLateFailure(ctx: BotContext, next: () => Promise<void>): () => Promise<void> {
  let letGoByTelegraf = false;
  const limit = setTimeout(() => { letGoByTelegraf = true; }, UPDATE_LIMIT_MS);
  // Holds nothing running, like the timers below
  limit.unref?.();

  return async () => {
    try {
      await next();
    } catch (error) {
      if (letGoByTelegraf) {
        logger.error(
          'A Telegram update failed after the limit; polling had gone on without it, so nobody was told',
          error instanceof Error ? error : new Error(String(error)),
          { updateId: ctx.update.update_id, updateType: ctx.updateType, afterMinutes: UPDATE_LIMIT_MS / 60_000 }
        );
      }
      throw error;
    } finally {
      clearTimeout(limit);
    }
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
