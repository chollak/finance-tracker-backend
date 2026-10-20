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
    const launchCatch = jest.fn();
    const launchResult = { catch: launchCatch };
    const launch = jest.fn(() => launchResult);
    const use = jest.fn();
    const catchHandler = jest.fn();
    const stop = jest.fn();
    const telegram = { setMyCommands: jest.fn().mockResolvedValue(true), sendMessage: jest.fn() };
    const action = jest.fn();
    const Telegraf = jest.fn().mockImplementation(() => ({
      use,
      catch: catchHandler,
      launch,
      stop,
      action,
      telegram,
    }));

    jest.doMock('telegraf', () => ({
      Telegraf,
      session: jest.fn(() => jest.fn()),
    }));

    const registerCommandHandlers = jest.fn();
    const setCommandMenu = jest.fn().mockResolvedValue(undefined);
    const closeAmountQuestionOnCommand = jest.fn();
    jest.doMock('../src/delivery/messaging/telegram/handlers/commandHandlers', () => ({
      registerCommandHandlers,
      setCommandMenu,
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/messageHandlers', () => ({
      registerMessageHandlers: jest.fn(),
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/callbackHandlers', () => ({
      registerCallbackHandlers: jest.fn(),
    }));
    jest.doMock('../src/delivery/messaging/telegram/handlers/recordHandlers', () => ({
      registerRecordHandlers: jest.fn(),
      closeAmountQuestionOnCommand,
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

    const dailySummary = { start: jest.fn(), stop: jest.fn() };
    const notificationModule = { getDailySummary: () => dailySummary } as any;
    const start = () => startTelegramBot({} as any, {} as any, userModule, {} as any, undefined, undefined, undefined, undefined, notificationModule);

    return {
      start,
      telegram,
      setCommandMenu,
      dailySummary,
      Telegraf,
      launch,
      launchCatch,
      processOnce,
      use,
      registerCommandHandlers,
      closeAmountQuestionOnCommand,
    };
  }

  it('closes an open «Сумму» question before any command runs (FT-122)', async () => {
    const { start, use, registerCommandHandlers, closeAmountQuestionOnCommand } = await loadBotWithMocks();

    start();

    const call = use.mock.calls.findIndex(([middleware]) => middleware === closeAmountQuestionOnCommand);
    expect(call).not.toBe(-1);
    expect(use.mock.invocationCallOrder[call]).toBeLessThan(registerCommandHandlers.mock.invocationCallOrder[0]);
  });

  it('sets the command menu and starts the daily summary in the bot\'s process (FT-124)', async () => {
    const { start, telegram, setCommandMenu, dailySummary, launch } = await loadBotWithMocks();

    start();

    expect(setCommandMenu).toHaveBeenCalledWith(telegram);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(dailySummary.start).toHaveBeenCalledTimes(1);
    // The scheduler sends with the bot's own Telegram client
    const [sender] = dailySummary.start.mock.calls[0];
    expect(sender.send).toEqual(expect.any(Function));
  });

  it('attaches a rejection handler to bot.launch so launch failures do not become unhandled rejections', async () => {
    const { start, launch, launchCatch } = await loadBotWithMocks();

    start();

    expect(launch).toHaveBeenCalledTimes(1);
    expect(launchCatch).toHaveBeenCalledTimes(1);
    expect(launchCatch.mock.calls[0][0]).toEqual(expect.any(Function));
  });

  it('marks the bot as running immediately after requesting long polling launch', async () => {
    const { start } = await loadBotWithMocks();
    const { getTelegramBotStatus } = await import('../src/delivery/messaging/telegram/telegramBot');

    start();

    expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'running', attempts: 1 }));
  });

  it('retries polling conflicts instead of staying disabled until process restart', async () => {
    jest.useFakeTimers();
    const { start, launch, launchCatch } = await loadBotWithMocks();
    const { getTelegramBotStatus } = await import('../src/delivery/messaging/telegram/telegramBot');

    start();
    launchCatch.mock.calls[0][0](new Error('409: Conflict: terminated by other getUpdates request'));

    expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'retrying', attempts: 1 }));

    jest.advanceTimersByTime(5000);

    expect(launch).toHaveBeenCalledTimes(2);
    expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'running', attempts: 2 }));
    jest.useRealTimers();
  });

  it('does not create or launch a Telegram bot when polling is explicitly disabled', async () => {
    process.env.ENABLE_TELEGRAM_POLLING = 'false';
    const { start, Telegraf, launch, dailySummary } = await loadBotWithMocks();

    start();

    expect(Telegraf).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    // No bot, no scheduler: the daily summary runs only in the bot's process
    expect(dailySummary.start).not.toHaveBeenCalled();
  });

  it('does not launch polling when webhook mode is enabled', async () => {
    process.env.WEBHOOK_MODE = 'true';
    const { start, Telegraf, launch } = await loadBotWithMocks();

    start();

    expect(Telegraf).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
});
