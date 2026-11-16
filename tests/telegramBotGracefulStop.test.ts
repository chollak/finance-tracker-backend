/**
 * FT-167 on Telegraf's own polling loop, with the Bot API faked. `systemctl restart` used to close the database while
 * the bot was still handling a message (a voice through OpenAI, say), and the batch's offset was never confirmed, so
 * Telegram sent the message again after the restart. Now the shutdown stops the bot first: polling stops taking
 * updates, the handler of the one in flight finishes, Telegraf confirms the offset — and only then the database closes.
 */

type Update = { update_id: number; message: Record<string, unknown> };

const TELEGRAM_ID = 131184740;
const BOT_INFO = { id: 1, is_bot: true, first_name: 'Kapelka', username: 'kapelka_test_bot' };
const UPDATE: Update = {
  update_id: 100,
  message: { message_id: 10, date: 1_761_700_000, chat: { id: TELEGRAM_ID, type: 'private' }, from: { id: TELEGRAM_ID, is_bot: false, first_name: 'Shukur' }, text: 'кофе 25к' },
};

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function fakeLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('the bot stops after the updates it is handling (FT-167)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, TG_BOT_API_KEY: '123:test-token', ENABLE_TELEGRAM_POLLING: 'true', WEBHOOK_MODE: 'false' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  /**
   * The bot with one batch of messages in Telegram's queue (one message by default); each handler runs until the test
   * lets them finish.
   */
  async function startWithMessageInFlight(batch: Update[] = [UPDATE]) {
    const entered = deferred();
    const release = deferred();
    const started: number[] = [];
    const handled: number[] = [];

    jest.doMock('../src/delivery/messaging/telegram/handlers/messageHandlers', () => ({
      registerMessageHandlers: (bot: { on: (type: string, handler: (ctx: any) => Promise<void>) => void }) => {
        bot.on('message', async ctx => {
          started.push(ctx.message.message_id);
          entered.resolve();
          await release.promise;
          handled.push(ctx.message.message_id);
        });
      },
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/commandHandlers', () => ({
      registerCommandHandlers: jest.fn(),
      setCommandMenu: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/recordHandlers', () => ({
      registerRecordHandlers: jest.fn(),
      closeAmountQuestionOnCommand: (_ctx: unknown, next: () => Promise<void>) => next(),
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/callbackHandlers', () => ({ registerCallbackHandlers: jest.fn() }));

    // The Bot API: getMe, deleteWebhook, one batch with the message, then a long poll that only an abort ends
    const { Telegram } = await import('telegraf');
    const calls: Array<{ method: string; payload: any }> = [];
    let delivered = false;
    jest.spyOn(Telegram.prototype, 'callApi').mockImplementation((async (method: string, payload: any, options?: { signal?: AbortSignal }) => {
      calls.push({ method, payload });
      if (method === 'getMe') return BOT_INFO;
      if (method !== 'getUpdates') return true;
      // Telegraf confirms the offset with a short getUpdates when polling stops
      if (payload.limit === 1) return [];
      if (!delivered) {
        delivered = true;
        return batch;
      }
      return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(abortError())));
    }) as never);

    const { startTelegramBot } = await import('../src/delivery/messaging/telegram/telegramBot');
    const userModule = { getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: 'user-1' }) }) } as any;
    const bot = startTelegramBot({} as any, {} as any, userModule, {} as any);
    await entered.promise;

    const nextOffset = batch[batch.length - 1].update_id + 1;
    const offsetConfirmed = () => calls.some(({ method, payload }) => method === 'getUpdates' && payload.limit === 1 && payload.offset === nextOffset);
    return { bot, release, started, handled, offsetConfirmed };
  }

  it('closes the database only after the message in flight is handled and its offset confirmed', async () => {
    const { bot, release, handled, offsetConfirmed } = await startWithMessageInFlight();
    const { createGracefulShutdown, BOT_STOP_GRACE_MS } = await import('../src/delivery/runtime/gracefulShutdown');
    const order: string[] = [];
    const exit = jest.fn();
    const shutdown = createGracefulShutdown(
      {
        stopSchedulers: jest.fn(),
        stopBot: () => bot.stop(BOT_STOP_GRACE_MS),
        closeHttpServer: jest.fn().mockResolvedValue(undefined),
        closeDatabase: jest.fn(async () => { order.push(offsetConfirmed() ? 'database after the offset' : 'database'); }),
      },
      { exit, logger: fakeLogger() }
    );

    const done = shutdown('SIGTERM', 0);
    await flush();
    expect(order).toEqual([]);
    expect(offsetConfirmed()).toBe(false);

    release.resolve();
    await done;

    expect(handled).toEqual([10]);
    expect(order).toEqual(['database after the offset']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('two messages of one chat in a batch run one after the other, and the stop waits for both before the offset (#317)', async () => {
    const second: Update = { update_id: 101, message: { ...UPDATE.message, message_id: 11, text: 'такси 18к' } };
    const { bot, release, started, handled, offsetConfirmed } = await startWithMessageInFlight([UPDATE, second]);
    const { BOT_STOP_GRACE_MS } = await import('../src/delivery/runtime/gracefulShutdown');

    const stopped = bot.stop(BOT_STOP_GRACE_MS);
    await flush();
    expect(started).toEqual([10]);
    expect(offsetConfirmed()).toBe(false);

    release.resolve();
    await stopped;

    expect(handled).toEqual([10, 11]);
    expect(offsetConfirmed()).toBe(true);
  });

  it('a handler that outlives the grace period is left unconfirmed, so Telegram sends the message again', async () => {
    const { bot, release, handled, offsetConfirmed } = await startWithMessageInFlight();

    await bot.stop(50);

    expect(handled).toEqual([]);
    expect(offsetConfirmed()).toBe(false);

    // Let the loop end, so nothing runs past the test
    release.resolve();
    await flush();
  });
});
