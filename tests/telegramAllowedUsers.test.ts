import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { winstonLogger } from '../src/shared/infrastructure/logging';
import { startTelegramBot } from '../src/delivery/messaging/telegram/telegramBot';
import { allowedUsersOnly } from '../src/delivery/messaging/telegram/middleware/allowedUsersOnly';
import { AuthModule } from '../src/modules/auth/authModule';
import { SqliteLoginTokenRepository } from '../src/modules/auth/infrastructure/SqliteLoginTokenRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/**
 * FT-153 in the bot: the bot is public in Telegram, so anyone who finds it can write. A message, a voice or a button
 * press from someone not in ALLOWED_TELEGRAM_IDS creates no user, reaches no OpenAI and writes nothing; the bot stays
 * silent and the log names who was turned away. The bot here is the real one `startTelegramBot` assembles, on a real
 * Telegraf: only polling and Telegram's API are fakes.
 */

interface ApiCall { method: string; payload: any }

// The real Telegraf without the network: launch() does not poll; every Bot API call — from the bot's client and from
// the client Telegraf makes for each update — is kept and answered
jest.mock('telegraf', () => {
  const actual = jest.requireActual('telegraf');
  class TestTelegraf extends actual.Telegraf {
    static last: TestTelegraf;
    readonly calls: ApiCall[] = [];

    constructor(token: string, options?: unknown) {
      super(token, options);
      this.botInfo = { id: 1, is_bot: true, first_name: 'Daftar', username: 'DaftarBot' };
      TestTelegraf.last = this;
    }

    launch() {
      return new Promise(() => undefined);
    }
  }
  let nextMessageId = 100;
  actual.Telegram.prototype.callApi = async function (method: string, payload: any) {
    TestTelegraf.last.calls.push({ method, payload });
    return method === 'sendMessage'
      ? { message_id: nextMessageId++, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text }
      : true;
  };
  return { ...actual, Telegraf: TestTelegraf };
});

const ALLOWED = 111;
const STRANGER = 222;

describe('the bot answers only the allowed (FT-153)', () => {
  let db: TestDatabase;
  let downloads: string;
  let userModule: UserModule;
  let authModule: AuthModule;
  let bot: { calls: ApiCall[]; handleUpdate(update: unknown): Promise<void> };
  /** Every use of the modules that would reach OpenAI or write records. */
  let touched: string[];
  let warn: jest.SpyInstance;
  let updateId = 1;

  const watched = (name: string) => new Proxy({}, {
    get: (_target, property) => {
      touched.push(`${name}.${String(property)}`);
      return () => ({});
    },
  }) as any;

  function from(id: number) {
    return { id, is_bot: false, first_name: 'Test', username: `user${id}` };
  }

  function message(sender: number, content: Record<string, unknown>) {
    return bot.handleUpdate({
      update_id: updateId++,
      message: { message_id: updateId, date: Math.floor(Date.now() / 1000), chat: { id: sender, type: 'private' }, from: from(sender), ...content },
    });
  }

  const command = (sender: number, text: string) =>
    message(sender, { text, entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] });

  const press = (sender: number, data: string) => bot.handleUpdate({
    update_id: updateId++,
    callback_query: { id: `q${updateId}`, from: from(sender), chat_instance: 'c', data, message: { message_id: 5, date: 0, chat: { id: sender, type: 'private' } } },
  });

  async function startLogin(): Promise<{ payload: string; browserSecret: string }> {
    const started = await authModule.getStartWebLoginUseCase().execute({ userAgent: 'test' });
    if (!started.success) throw started.error;
    return { payload: new URL(started.data.link).searchParams.get('start')!, browserSecret: started.data.browserSecret };
  }

  const usersInDb = async () => (await db.dataSource.query('SELECT telegram_id FROM users')).map((row: { telegram_id: string }) => row.telegram_id);
  /** What the bot sent after it started (the command menu goes out at start). */
  const sent = () => bot.calls.filter(call => call.method !== 'setMyCommands');

  beforeEach(async () => {
    touched = [];
    downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'ft153-downloads-'));
    jest.replaceProperty(AppConfig, 'TG_BOT_API_KEY', '123:test');
    jest.replaceProperty(AppConfig, 'ENABLE_TELEGRAM_POLLING', true);
    jest.replaceProperty(AppConfig, 'WEBHOOK_MODE', false);
    jest.replaceProperty(AppConfig, 'DOWNLOADS_PATH', downloads);
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([String(ALLOWED)]));
    jest.spyOn(process, 'once').mockImplementation(() => process);
    warn = jest.spyOn(winstonLogger, 'warn').mockImplementation(() => winstonLogger);

    db = await openMigratedDatabase();
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    authModule = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), { botUsername: { username: async () => 'DaftarBot' } });

    startTelegramBot(
      watched('voiceModule'), watched('transactionModule'), userModule, watched('quickCaptureModule'),
      undefined, undefined, undefined, undefined, undefined, authModule
    );
    bot = (jest.requireMock('telegraf') as any).Telegraf.last;
    touched = [];
  });

  afterEach(async () => {
    await db.close();
    fs.rmSync(downloads, { recursive: true, force: true });
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
    startTelegramBot(
      watched('voiceModule'), watched('transactionModule'), userModule, watched('quickCaptureModule'),
      undefined, undefined, undefined, undefined, undefined, authModule
    );
    bot = (jest.requireMock('telegraf') as any).Telegraf.last;
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
