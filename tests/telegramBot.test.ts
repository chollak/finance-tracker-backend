describe('startTelegramBot', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Pinned: a value in a local .env.local must not change the backoff the tests count on
    process.env = { ...originalEnv, TG_BOT_API_KEY: 'test-token', TELEGRAM_POLLING_MAX_RETRIES: '5', TELEGRAM_POLLING_RETRY_BASE_MS: '5000' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function loadBotWithMocks() {
    // Each launch is a promise the test settles as Telegraf would: resolved when bot.stop() ended polling (after the
    // updates being handled), rejected when the launch failed. `launchCatch` keeps the rejection handler the bot set
    const launchCatch = jest.fn();
    const launches: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
    const launch = jest.fn(() => {
      const polling = new Promise<void>((resolve, reject) => { launches.push({ resolve, reject }); });
      return {
        catch: (onRejected: (error: unknown) => unknown) => {
          launchCatch(onRejected);
          return polling.catch(onRejected);
        },
      };
    });
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
    const reminders = { start: jest.fn(), stop: jest.fn() };
    const notificationModule = { getDailySummary: () => dailySummary, getReminders: () => reminders } as any;
    const start = (options?: Parameters<typeof startTelegramBot>[10]) =>
      startTelegramBot({} as any, {} as any, userModule, {} as any, undefined, undefined, undefined, undefined, notificationModule, undefined, options);

    return {
      start,
      telegram,
      setCommandMenu,
      dailySummary,
      reminders,
      Telegraf,
      launch,
      launches,
      launchCatch,
      processOnce,
      stop,
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

  it('sets the command menu and starts the daily summary once Telegram answered for the bot (FT-124)', async () => {
    const { start, telegram, setCommandMenu, dailySummary, launch } = await loadBotWithMocks();

    start();

    expect(setCommandMenu).toHaveBeenCalledWith(telegram);
    expect(launch).toHaveBeenCalledTimes(1);
    // Not before Telegraf's onLaunch (getMe answered)
    expect(dailySummary.start).not.toHaveBeenCalled();
    const [onLaunch] = launch.mock.calls[0] as unknown as [() => void];
    onLaunch();
    expect(dailySummary.start).toHaveBeenCalledTimes(1);
    // The scheduler sends with the bot's own Telegram client; its first look at the clock waits a minute, so a
    // polling conflict found in that minute stops it before anything goes out
    const [sender, options] = dailySummary.start.mock.calls[0];
    expect(sender.send).toEqual(expect.any(Function));
    expect(options).toEqual({ firstTickInMs: 60_000 });
  });

  it('starts the goal, subscription and audit reminders with the daily summary, and stops them with it (FT-133)', async () => {
    const { start, launch, launchCatch, reminders } = await loadBotWithMocks();

    start();
    expect(reminders.start).not.toHaveBeenCalled();
    (launch.mock.calls[0] as unknown as [() => void])[0]();
    expect(reminders.start).toHaveBeenCalledTimes(1);
    const [sender, options] = reminders.start.mock.calls[0];
    expect(sender.send).toEqual(expect.any(Function));
    expect(options).toEqual({ firstTickInMs: 60_000 });

    launchCatch.mock.calls[0][0](new Error('401: Unauthorized'));
    expect(reminders.stop).toHaveBeenCalledTimes(1);
  });

  it('polling that fails for good stops the daily summary (FT-124)', async () => {
    const { start, launch, launchCatch, dailySummary } = await loadBotWithMocks();
    const { getTelegramBotStatus } = await import('../src/delivery/messaging/telegram/telegramBot');

    start();
    (launch.mock.calls[0] as unknown as [() => void])[0]();
    launchCatch.mock.calls[0][0](new Error('401: Unauthorized'));

    expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'failed' }));
    expect(dailySummary.stop).toHaveBeenCalledTimes(1);
  });

  it('a polling conflict stops the daily summary until the retry is connected again (FT-124)', async () => {
    jest.useFakeTimers();
    const { start, launch, launchCatch, dailySummary } = await loadBotWithMocks();

    start();
    (launch.mock.calls[0] as unknown as [() => void])[0]();
    launchCatch.mock.calls[0][0](new Error('409: Conflict: terminated by other getUpdates request'));
    expect(dailySummary.stop).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(dailySummary.start).toHaveBeenCalledTimes(1);
    (launch.mock.calls[1] as unknown as [() => void])[0]();
    expect(dailySummary.start).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
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

  describe('polling that fails for good (FT-154)', () => {
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const fakeLogger = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

    it('tells the owner of the process, with the last error', async () => {
      const { start, launchCatch } = await loadBotWithMocks();
      const onPollingFailed = jest.fn();

      start({ onPollingFailed });
      launchCatch.mock.calls[0][0](new Error('401: Unauthorized'));

      expect(onPollingFailed).toHaveBeenCalledTimes(1);
      expect(onPollingFailed).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed', attempts: 1, lastError: '401: Unauthorized' }));
    });

    it('a 409 stays «retrying» while retries are left, and fails only when they run out', async () => {
      jest.useFakeTimers();
      process.env.TELEGRAM_POLLING_MAX_RETRIES = '2';
      const { start, launch, launchCatch } = await loadBotWithMocks();
      const { getTelegramBotStatus } = await import('../src/delivery/messaging/telegram/telegramBot');
      const onPollingFailed = jest.fn();
      const conflict = () => new Error('409: Conflict: terminated by other getUpdates request');

      start({ onPollingFailed });
      launchCatch.mock.calls[0][0](conflict());
      expect(getTelegramBotStatus().state).toBe('retrying');
      expect(onPollingFailed).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5000);
      expect(launch).toHaveBeenCalledTimes(2);
      launchCatch.mock.calls[1][0](conflict());

      expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'failed', attempts: 2 }));
      expect(onPollingFailed).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('a bot that cannot even be set up is «failed» too, not silently absent', async () => {
      const { start, use } = await loadBotWithMocks();
      const { getTelegramBotStatus } = await import('../src/delivery/messaging/telegram/telegramBot');
      use.mockImplementationOnce(() => { throw new Error('EACCES: downloads'); });
      const onPollingFailed = jest.fn();

      start({ onPollingFailed });

      expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'failed', lastError: 'EACCES: downloads' }));
      expect(onPollingFailed).toHaveBeenCalledTimes(1);
    });

    it('in production stops the schedulers, closes the database and exits with a non-zero code', async () => {
      const { start, launch, launchCatch, dailySummary, reminders } = await loadBotWithMocks();
      const { createGracefulShutdown } = await import('../src/delivery/runtime/gracefulShutdown');
      const { createBotFailureHandler } = await import('../src/delivery/runtime/botFailurePolicy');
      const steps = {
        stopSchedulers: jest.fn(),
        stopBot: jest.fn().mockResolvedValue(undefined),
        closeHttpServer: jest.fn().mockResolvedValue(undefined),
        closeDatabase: jest.fn().mockResolvedValue(undefined),
      };
      const exit = jest.fn();
      const logger = fakeLogger();
      const shutdown = createGracefulShutdown(steps, { exit, logger });

      start({ onPollingFailed: createBotFailureHandler({ nodeEnv: 'production', shutdown, logger }) });
      (launch.mock.calls[0] as unknown as [() => void])[0]();
      launchCatch.mock.calls[0][0](new Error('401: Unauthorized'));
      await flush();

      expect(dailySummary.stop).toHaveBeenCalled();
      expect(reminders.stop).toHaveBeenCalled();
      expect(steps.stopSchedulers).toHaveBeenCalledTimes(1);
      expect(steps.closeHttpServer).toHaveBeenCalledTimes(1);
      expect(steps.closeDatabase).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(1);
    });

    it('a retry setting that is not a number keeps its default instead of failing on the first 409', async () => {
      process.env.TELEGRAM_POLLING_MAX_RETRIES = 'five';
      const { start, launchCatch } = await loadBotWithMocks();
      const { getTelegramBotStatus } = await import('../src/delivery/messaging/telegram/telegramBot');

      start();
      launchCatch.mock.calls[0][0](new Error('409: Conflict: terminated by other getUpdates request'));

      expect(getTelegramBotStatus().state).toBe('retrying');
    });

    it('outside production the process keeps running without the bot', async () => {
      const { start, launchCatch } = await loadBotWithMocks();
      const { createGracefulShutdown } = await import('../src/delivery/runtime/gracefulShutdown');
      const { createBotFailureHandler } = await import('../src/delivery/runtime/botFailurePolicy');
      const closeDatabase = jest.fn().mockResolvedValue(undefined);
      const exit = jest.fn();
      const logger = fakeLogger();
      const shutdown = createGracefulShutdown(
        { stopSchedulers: jest.fn(), stopBot: jest.fn().mockResolvedValue(undefined), closeHttpServer: jest.fn().mockResolvedValue(undefined), closeDatabase },
        { exit, logger }
      );

      start({ onPollingFailed: createBotFailureHandler({ nodeEnv: 'development', shutdown, logger }) });
      launchCatch.mock.calls[0][0](new Error('401: Unauthorized'));
      await flush();

      expect(closeDatabase).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe('stopping (FT-154, FT-167)', () => {
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const conflict = () => new Error('409: Conflict: terminated by other getUpdates request');

    it('stops polling and resolves only once the updates being handled are done', async () => {
      const { start, launch, launches, stop } = await loadBotWithMocks();
      const bot = start();
      (launch.mock.calls[0] as unknown as [() => void])[0]();
      let stopped = false;

      const stopping = bot.stop(5_000).then(() => { stopped = true; });
      await flush();
      expect(stop).toHaveBeenCalledTimes(1);
      expect(stopped).toBe(false);

      // Telegraf's polling loop ends after the handlers of its batch, and confirms the batch's offset
      launches[0].resolve();
      await stopping;
      expect(stopped).toBe(true);
    });

    it('gives up after the grace period: what is still handled is Telegram’s to send again', async () => {
      jest.useFakeTimers();
      const { start, launch } = await loadBotWithMocks();
      const bot = start();
      (launch.mock.calls[0] as unknown as [() => void])[0]();
      let stopped = false;

      const stopping = bot.stop(5_000).then(() => { stopped = true; });
      await jest.advanceTimersByTimeAsync(4_999);
      expect(stopped).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await stopping;
      expect(stopped).toBe(true);
    });

    it('while getMe is still running ends the launch before polling starts and does not throw', async () => {
      const { start, launch, launches, stop, dailySummary } = await loadBotWithMocks();
      stop.mockImplementation(() => { throw new Error('Bot is not running!'); });
      const onPollingFailed = jest.fn();
      const bot = start({ onPollingFailed });

      const stopping = bot.stop(5_000);
      // getMe answers: the bot's onLaunch throws, so Telegraf's launch rejects before deleteWebhook and getUpdates
      const onLaunch = (launch.mock.calls[0] as unknown as [() => void])[0];
      let thrown: unknown;
      try { onLaunch(); } catch (error) { thrown = error; }
      expect(thrown).toEqual(expect.any(Error));
      launches[0].reject(thrown);
      await stopping;

      expect(dailySummary.start).not.toHaveBeenCalled();
      expect(onPollingFailed).not.toHaveBeenCalled();
    });

    it('while retrying a 409 cancels the next launch, so nothing restarts the notices during shutdown', async () => {
      jest.useFakeTimers();
      const { start, launch, launches, dailySummary } = await loadBotWithMocks();
      const bot = start();
      launches[0].reject(conflict());
      await jest.advanceTimersByTimeAsync(0);

      await bot.stop(5_000);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(launch).toHaveBeenCalledTimes(1);
      expect(dailySummary.start).not.toHaveBeenCalled();
    });

    it('listens to no signal itself: the process shutdown stops it, before the database closes', async () => {
      const { start, processOnce } = await loadBotWithMocks();
      const on = jest.spyOn(process, 'on');

      start();

      const signals = [...processOnce.mock.calls, ...on.mock.calls].map(([name]) => name);
      expect(signals).not.toContain('SIGTERM');
      expect(signals).not.toContain('SIGINT');
    });

    it('a bot that was never set up stops at once', async () => {
      process.env.TG_BOT_API_KEY = '';
      const { start, Telegraf } = await loadBotWithMocks();

      await start().stop(5_000);

      expect(Telegraf).not.toHaveBeenCalled();
    });
  });

  describe('the count of launches (FT-167)', () => {
    const conflict = () => new Error('409: Conflict: terminated by other getUpdates request');

    it('starts anew once a launch has polled for a while: a late 409 is retried, not «failed»', async () => {
      jest.useFakeTimers();
      process.env.TELEGRAM_POLLING_MAX_RETRIES = '2';
      const { start, launch, launches } = await loadBotWithMocks();
      const { getTelegramBotStatus, POLLING_STABLE_MS } = await import('../src/delivery/messaging/telegram/telegramBot');
      const onPollingFailed = jest.fn();

      start({ onPollingFailed });
      launches[0].reject(conflict());
      await jest.advanceTimersByTimeAsync(5_000);
      expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'running', attempts: 2 }));

      // The second launch connects and polls past the point where a conflict would have shown up
      (launch.mock.calls[1] as unknown as [() => void])[0]();
      await jest.advanceTimersByTimeAsync(POLLING_STABLE_MS);
      launches[1].reject(conflict());
      await jest.advanceTimersByTimeAsync(0);

      expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'retrying', attempts: 1 }));
      expect(onPollingFailed).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(5_000);
      expect(launch).toHaveBeenCalledTimes(3);
      expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'running', attempts: 2 }));
    });

    it('a 409 soon after connecting still counts, so two processes taking the token from each other reach «failed»', async () => {
      jest.useFakeTimers();
      process.env.TELEGRAM_POLLING_MAX_RETRIES = '2';
      const { start, launch, launches } = await loadBotWithMocks();
      const { getTelegramBotStatus, POLLING_STABLE_MS } = await import('../src/delivery/messaging/telegram/telegramBot');
      const onPollingFailed = jest.fn();

      start({ onPollingFailed });
      (launch.mock.calls[0] as unknown as [() => void])[0]();
      launches[0].reject(conflict());
      await jest.advanceTimersByTimeAsync(5_000);
      (launch.mock.calls[1] as unknown as [() => void])[0]();
      await jest.advanceTimersByTimeAsync(POLLING_STABLE_MS - 1);
      launches[1].reject(conflict());
      await jest.advanceTimersByTimeAsync(0);

      expect(getTelegramBotStatus()).toEqual(expect.objectContaining({ state: 'failed', attempts: 2 }));
      expect(onPollingFailed).toHaveBeenCalledTimes(1);
    });

    it('counts a launch as started after longer than one long poll (50 s) and twice the longest pause', async () => {
      const { POLLING_STABLE_MS } = await import('../src/delivery/messaging/telegram/telegramBot');

      // Defaults: 5 launches, pauses 5 s doubling to 40 s
      expect(POLLING_STABLE_MS).toBe(80_000);
    });
  });

  it('does not launch polling when webhook mode is enabled', async () => {
    process.env.WEBHOOK_MODE = 'true';
    const { start, Telegraf, launch } = await loadBotWithMocks();

    start();

    expect(Telegraf).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
});
