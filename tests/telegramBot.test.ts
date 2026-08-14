describe('startTelegramBot', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, TG_BOT_API_KEY: 'test-token' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  async function loadBotWithMocks() {
    // A launch that fails the way a 409 conflict does: a rejected promise
    // rather than a synchronous throw.
    const launchRejection = new Error('409: Conflict: terminated by other getUpdates request');
    const launch = jest.fn(() => Promise.reject(launchRejection));
    const use = jest.fn();
    const catchHandler = jest.fn();
    const stop = jest.fn();
    const Telegraf = jest.fn().mockImplementation(() => ({
      use,
      catch: catchHandler,
      launch,
      stop,
      telegram: {},
    }));

    jest.doMock('telegraf', () => ({
      Telegraf,
      session: jest.fn(() => jest.fn()),
    }));

    jest.doMock('../src/delivery/messaging/telegram/handlers/commandHandlers', () => ({
      registerCommandHandlers: jest.fn(),
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/messageHandlers', () => ({
      registerMessageHandlers: jest.fn(),
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/callbackHandlers', () => ({
      registerCallbackHandlers: jest.fn(),
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/paymentHandlers', () => ({
      registerPaymentHandlers: jest.fn(),
    }));
    jest.doMock('../src/modules/subscription/infrastructure/TelegramPaymentService', () => ({
      TelegramPaymentService: jest.fn(),
    }));

    const processOnce = jest.spyOn(process, 'once').mockImplementation(() => process as any);
    const { startTelegramBot } = await import('../src/delivery/messaging/telegram/telegramBot');

    const userModule = {
      getGetOrCreateUserUseCase: () => ({ execute: jest.fn() }),
    } as any;

    const start = () => startTelegramBot({} as any, {} as any, {} as any, userModule);

    return {
      start,
      Telegraf,
      launch,
      launchRejection,
      processOnce,
    };
  }

  it('survives a failing launch without an unhandled rejection or a thrown error', async () => {
    const { start, launch } = await loadBotWithMocks();

    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    // Startup must not throw even though polling cannot begin: the API is
    // expected to keep serving without the bot (QA-BUG-1).
    expect(() => start()).not.toThrow();
    expect(launch).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
  });

  it('does not create or launch a Telegram bot when polling is explicitly disabled', async () => {
    process.env.ENABLE_TELEGRAM_POLLING = 'false';
    const { start, Telegraf, launch } = await loadBotWithMocks();

    start();

    expect(Telegraf).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  it('does not launch polling when webhook mode is enabled', async () => {
    process.env.WEBHOOK_MODE = 'true';
    const { start, Telegraf, launch } = await loadBotWithMocks();

    start();

    expect(Telegraf).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
});
