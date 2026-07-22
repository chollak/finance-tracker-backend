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

  it('attaches a rejection handler to bot.launch so launch failures do not become unhandled rejections', async () => {
    const launchCatch = jest.fn();
    const launchThen = jest.fn(() => ({ catch: launchCatch }));
    const launchResult = { then: launchThen };
    const launch = jest.fn(() => launchResult);
    const use = jest.fn();
    const catchHandler = jest.fn();
    const stop = jest.fn();

    jest.doMock('telegraf', () => ({
      Telegraf: jest.fn().mockImplementation(() => ({
        use,
        catch: catchHandler,
        launch,
        stop,
        telegram: {},
      })),
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

    const { startTelegramBot } = await import('../src/delivery/messaging/telegram/telegramBot');

    const userModule = {
      getGetOrCreateUserUseCase: () => ({ execute: jest.fn() }),
    } as any;

    startTelegramBot({} as any, {} as any, {} as any, userModule);

    expect(launch).toHaveBeenCalledTimes(1);
    expect(launchCatch).toHaveBeenCalledTimes(1);
    expect(launchCatch.mock.calls[0][0]).toEqual(expect.any(Function));
  });
});
