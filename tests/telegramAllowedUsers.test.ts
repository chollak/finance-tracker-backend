import 'reflect-metadata';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { winstonLogger } from '../src/shared/infrastructure/logging';
import { allowedUsersOnly } from '../src/delivery/messaging/telegram/middleware/allowedUsersOnly';
import { AuthModule } from '../src/modules/auth/authModule';
import { SqliteLoginTokenRepository } from '../src/modules/auth/infrastructure/SqliteLoginTokenRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { TelegramStand } from './helpers/telegramStand';

/**
 * FT-153 in the bot: the bot is public in Telegram, so anyone who finds it can write. A message, a voice or a button
 * press from someone not in ALLOWED_TELEGRAM_IDS creates no user, reaches no OpenAI and writes nothing; the bot stays
 * silent and the log names who was turned away. The bot is the one `startTelegramBot` assembles, on the stand
 * (`tests/helpers/telegramStand.ts`, #294): only polling and Telegram's API are fakes. Each stranger writes from a
 * private chat of their own.
 */

const ALLOWED = 111;
const STRANGER = 222;
const OTHER_STRANGER = 333;

describe('the bot answers only the allowed (FT-153)', () => {
  let db: TestDatabase;
  let userModule: UserModule;
  let authModule: AuthModule;
  let stand: TelegramStand;
  /** Every use of the modules that would reach OpenAI or write records. */
  let touched: string[];
  let warn: jest.SpyInstance;

  const watched = (name: string) => new Proxy({}, {
    get: (_target, property) => {
      touched.push(`${name}.${String(property)}`);
      return () => ({});
    },
  }) as any;

  /** The bot as the app starts it, with ALLOWED_TELEGRAM_IDS as AppConfig has it then. */
  function startBot(): void {
    stand.start({
      voiceModule: watched('voiceModule'), transactionModule: watched('transactionModule'), userModule,
      quickCaptureModule: watched('quickCaptureModule'), authModule,
    });
  }

  function message(sender: number, content: Record<string, unknown>) {
    return stand.deliver(stand.messageUpdate(content, { from: { id: sender, first_name: 'Test' } }));
  }

  const command = (sender: number, text: string) => stand.deliver(stand.textUpdate(text, { from: { id: sender, first_name: 'Test' } }));

  /** A press under a message no longer in the presser's chat. */
  const press = (sender: number, data: string) => stand.pressData(5, data, { from: sender });

  async function startLogin(): Promise<{ payload: string; browserSecret: string }> {
    const started = await authModule.getStartWebLoginUseCase().execute({ userAgent: 'test' });
    if (!started.success) throw started.error;
    return { payload: new URL(started.data.link).searchParams.get('start')!, browserSecret: started.data.browserSecret };
  }

  const usersInDb = async () => (await db.dataSource.query('SELECT telegram_id FROM users')).map((row: { telegram_id: string }) => row.telegram_id);
  /** What the bot sent after it started (the command menu goes out at start). */
  const sent = () => stand.calls.filter(call => call.method !== 'setMyCommands');

  beforeEach(async () => {
    touched = [];
    warn = jest.spyOn(winstonLogger, 'warn').mockImplementation(() => winstonLogger);

    db = await openMigratedDatabase();
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    authModule = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), { botUsername: { username: async () => 'KapelkaBot' } });

    stand = new TelegramStand({ id: ALLOWED, first_name: 'Test' });
    stand.install({ allowed: [ALLOWED] });
    startBot();
    touched = [];
  });

  afterEach(async () => {
    await db.close();
    jest.restoreAllMocks();
  });

  it('a message, a voice and a button press from someone not on the list create nothing and get no answer', async () => {
    await command(STRANGER, '/start');
    await message(STRANGER, { text: 'кофе 25000' });
    await message(STRANGER, { voice: { file_id: 'v1', file_unique_id: 'u1', duration: 2 } });
    await press(STRANGER, 'login:ok:00000000-0000-4000-8000-000000000000');

    expect(sent()).toEqual([]);
    expect(touched).toEqual([]);
    expect(await usersInDb()).toEqual([]);
  });

  it('logs who was turned away', async () => {
    await message(STRANGER, { text: 'кофе 25000' });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not allowed'),
      expect.objectContaining({ category: 'TELEGRAM', telegramId: STRANGER })
    );
  });

  it('a stranger who keeps writing is logged once, not on every message; a new stranger at once (FT-166)', async () => {
    for (let i = 0; i < 50; i++) await message(STRANGER, { text: `кофе ${i}` });
    await press(OTHER_STRANGER, 'login:ok:00000000-0000-4000-8000-000000000000');

    const refusals = warn.mock.calls.filter(([text]) => String(text).includes('not allowed'));
    expect(refusals).toEqual([
      [expect.any(String), expect.objectContaining({ category: 'TELEGRAM', telegramId: STRANGER, updateType: 'message' })],
      [expect.any(String), expect.objectContaining({ category: 'TELEGRAM', telegramId: OTHER_STRANGER, updateType: 'callback_query' })],
    ]);
    expect(sent()).toEqual([]);
  });

  it('the web login link opened by someone not on the list gives them no login', async () => {
    const { payload, browserSecret } = await startLogin();

    await command(STRANGER, `/start ${payload}`);

    expect(sent()).toEqual([]);
    const status = await authModule.getWebLoginStatusUseCase().execute({ browserSecret });
    expect(status.success && status.data.status).toBe('pending');
    const session = await authModule.getOpenWebSessionUseCase().execute({ browserSecret });
    expect(session.success).toBe(false);
    expect(await usersInDb()).toEqual([]);
  });

  it('the allowed get through: the same link asks them «Подтвердить»', async () => {
    const { payload } = await startLogin();

    await command(ALLOWED, `/start ${payload}`);

    const question = sent().find(call => call.method === 'sendMessage');
    expect(question?.payload.chat_id).toBe(ALLOWED);
    expect(JSON.stringify(question?.payload.reply_markup)).toContain('Подтвердить');
    expect(await usersInDb()).toEqual([String(ALLOWED)]);
  });

  it('with an empty list everyone gets through, as before', async () => {
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([]));
    startBot();
    const { payload } = await startLogin();

    await command(STRANGER, `/start ${payload}`);

    expect(sent().some(call => call.method === 'sendMessage' && call.payload.chat_id === STRANGER)).toBe(true);
    expect(await usersInDb()).toEqual([String(STRANGER)]);
  });
});

describe('an update without a sender (FT-153)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('goes nowhere while the list is set, and on with an empty list', async () => {
    jest.spyOn(winstonLogger, 'warn').mockImplementation(() => winstonLogger);
    const channelPost: any = { from: undefined, updateType: 'channel_post' };
    const next = jest.fn().mockResolvedValue(undefined);

    await allowedUsersOnly(telegramAccess([String(ALLOWED)]))(channelPost, next);
    expect(next).not.toHaveBeenCalled();

    await allowedUsersOnly(telegramAccess([]))(channelPost, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('refused updates in the log (FT-166)', () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('writes how many updates of a stranger were skipped once the ten minutes are over', async () => {
    const warn = jest.spyOn(winstonLogger, 'warn').mockImplementation(() => winstonLogger);
    const gate = allowedUsersOnly(telegramAccess([String(ALLOWED)]));
    const next = jest.fn().mockResolvedValue(undefined);
    const update: any = { from: { id: STRANGER, is_bot: false, first_name: 'Test' }, updateType: 'message' };

    for (let i = 0; i < 50; i++) await gate(update, next);
    expect(warn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10 * 60 * 1000);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(
      expect.stringContaining('not allowed'),
      expect.objectContaining({ category: 'TELEGRAM', telegramId: STRANGER, skipped: 49, windowMinutes: 10 })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
