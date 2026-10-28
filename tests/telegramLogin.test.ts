import 'reflect-metadata';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { AuthModule } from '../src/modules/auth/authModule';
import { SqliteLoginTokenRepository } from '../src/modules/auth/infrastructure/SqliteLoginTokenRepository';
import { LOGIN_START_PREFIX } from '../src/modules/auth/domain/webLogin';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { registerCommandHandlers } from '../src/delivery/messaging/telegram/handlers/commandHandlers';
import { registerLoginHandlers } from '../src/delivery/messaging/telegram/handlers/loginHandlers';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/**
 * FT-128: the bot's side of the web login (boards «Бот · подтверждение входа», «Бот, вход из браузера, тёмная»). The
 * link from the browser opens the chat on «Запустить», which sends `/start login_<token>`; the bot names the browser,
 * the system and the time, and asks «Подтвердить» or «Это не я». The answer replaces the question.
 */

const TELEGRAM_ID = 597843119;
const MINUTE = 60 * 1000;
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

interface Button { text: string; callback_data?: string; url?: string; web_app?: { url: string } }
interface ChatMessage { text: string; keyboard: Button[][] }

class Bot {
  readonly commands = new Map<string, (ctx: any) => Promise<void>>();
  readonly actions: Array<{ trigger: RegExp | string; handler: (ctx: any) => Promise<void> }> = [];

  command(name: string, handler: (ctx: any) => Promise<void>) {
    this.commands.set(name, handler);
  }

  action(trigger: RegExp | string, handler: (ctx: any) => Promise<void>) {
    this.actions.push({ trigger, handler });
  }

  on() {}

  use() {}
}

describe('the bot confirms a web login (FT-128)', () => {
  let db: TestDatabase;
  let userModule: UserModule;
  let authModule: AuthModule;
  let bot: Bot;
  let now: Date;
  let webAppUrl: string;
  const messages = new Map<number, ChatMessage>();
  let nextMessageId = 100;
  let answers: Array<string | undefined>;

  function context(from = TELEGRAM_ID) {
    return {
      from: { id: from, first_name: 'Шукур', username: 'shukur' },
      chat: { id: from },
      session: {},
      modules: { userModule, authModule },
      reply: jest.fn(async (text: string, extra?: any) => {
        const id = nextMessageId++;
        messages.set(id, { text, keyboard: extra?.reply_markup?.inline_keyboard ?? [] });
        return { message_id: id, chat: { id: from } };
      }),
      answerCbQuery: jest.fn(async (text?: string) => {
        answers.push(text);
        return true;
      }),
    };
  }

  /** «Запустить» in the chat the link opened: Telegram sends /start with the link's parameter. */
  async function start(payload: string, from = TELEGRAM_ID): Promise<number> {
    const ctx: any = { ...context(from), message: { text: `/start ${payload}` }, payload };
    await bot.commands.get('start')!(ctx);
    return nextMessageId - 1;
  }

  async function press(messageId: number, label: string, from = TELEGRAM_ID): Promise<void> {
    const button = messages.get(messageId)!.keyboard.flat().find(candidate => candidate.text === label);
    if (!button?.callback_data) throw new Error(`No button «${label}» under ${messageId}`);
    const data = button.callback_data;
    const action = bot.actions.find(({ trigger }) => (typeof trigger === 'string' ? trigger === data : trigger.test(data)));
    if (!action) throw new Error(`No handler for ${data}`);
    const ctx: any = {
      ...context(from),
      callbackQuery: { data, message: { message_id: messageId, chat: { id: from } } },
      match: typeof action.trigger === 'string' ? [data] : action.trigger.exec(data),
      editMessageText: jest.fn(async (text: string, extra?: any) => {
        messages.set(messageId, { text, keyboard: extra?.reply_markup?.inline_keyboard ?? [] });
        return true;
      }),
    };
    await action.handler(ctx);
  }

  async function login(): Promise<{ payload: string; browserSecret: string }> {
    const started = await authModule.getStartWebLoginUseCase().execute({ userAgent: CHROME_WINDOWS });
    if (!started.success) throw started.error;
    return { payload: new URL(started.data.link).searchParams.get('start')!, browserSecret: started.data.browserSecret };
  }

  async function browserSees(browserSecret: string): Promise<string> {
    const status = await authModule.getWebLoginStatusUseCase().execute({ browserSecret });
    if (!status.success) throw status.error;
    return status.data.status;
  }

  beforeEach(async () => {
    // 19:42 in Tashkent on 14 October, as on the board
    now = new Date('2026-10-14T14:42:00.000Z');
    webAppUrl = 'https://kapelka.example';
    jest.spyOn(AppConfig, 'getWebAppUrl').mockImplementation(() => webAppUrl);
    db = await openMigratedDatabase();
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    authModule = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), {
      botUsername: { username: async () => 'KapelkaBot' },
      now: () => now,
    });
    messages.clear();
    answers = [];
    bot = new Bot();
    registerCommandHandlers(bot as any);
    registerLoginHandlers(bot as any);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.close();
  });

  it('asks «Подтвердить» / «Это не я», naming the browser, the system and the time of the login', async () => {
    const { payload } = await login();
    expect(payload.startsWith(LOGIN_START_PREFIX)).toBe(true);
    now = new Date(now.getTime() + 30 * 1000);

    const question = await start(payload);
    expect(messages.get(question)!.text).toBe([
      '<b>Вход в Kapelka из браузера</b>',
      'Chrome · Windows, 14 октября в 19:42',
      '',
      '<i>Если это вы — подтвердите. Если нет — нажмите «Это не я», и вход не состоится.</i>',
    ].join('\n'));
    expect(messages.get(question)!.keyboard.map(row => row.map(button => button.text))).toEqual([['Подтвердить'], ['Это не я']]);
    // Every button fits Telegram's 64 bytes of callback data
    for (const button of messages.get(question)!.keyboard.flat()) expect(Buffer.byteLength(button.callback_data!)).toBeLessThanOrEqual(64);
  });

  it('«Подтвердить»: the browser opens, the message says so and leads back to the browser', async () => {
    const { payload, browserSecret } = await login();
    const question = await start(payload);

    await press(question, 'Подтвердить');
    expect(messages.get(question)).toEqual({
      text: '<b>Вход подтверждён</b>\nChrome · Windows. Вернитесь в браузер — Kapelka уже открыта.',
      keyboard: [[expect.objectContaining({ text: 'Вернуться в браузер ↗', url: 'https://kapelka.example/' })]],
    });
    expect(await browserSees(browserSecret)).toBe('confirmed');
  });

  it('a web app that is not on HTTPS gets no button: Telegram would refuse it', async () => {
    webAppUrl = 'http://localhost:3000';
    const { payload } = await login();
    const question = await start(payload);
    await press(question, 'Подтвердить');
    expect(messages.get(question)!.keyboard).toEqual([]);
  });

  it('«Это не я»: nobody gets in, and nothing else to do', async () => {
    const { payload, browserSecret } = await login();
    const question = await start(payload);

    await press(question, 'Это не я');
    expect(messages.get(question)).toEqual({
      text: '<b>Вход отклонён</b>\nНикто не получил доступ к вашим записям. Если входили не вы — ничего делать не нужно.',
      keyboard: [],
    });
    expect(await browserSees(browserSecret)).toBe('rejected');
  });

  it('pressed after 5 minutes: the time is out, the browser asks again', async () => {
    const { payload, browserSecret } = await login();
    const question = await start(payload);
    now = new Date(now.getTime() + 5 * MINUTE);

    await press(question, 'Подтвердить');
    expect(messages.get(question)).toEqual({
      text: '<b>Вход не подтвердили</b>\nСсылка для входа действует 5 минут, и это время вышло. Вернитесь в браузер и нажмите «Войти через Telegram» ещё раз.',
      keyboard: [],
    });
    expect(await browserSees(browserSecret)).toBe('expired');
  });

  it('a link that is out of date, used, or someone else’s does not ask', async () => {
    const stale = [
      '<b>Ссылка для входа устарела</b>',
      'Вернитесь в браузер и нажмите «Войти через Telegram» ещё раз.',
    ].join('\n');

    expect(messages.get(await start(`${LOGIN_START_PREFIX}no-such-token`))).toEqual({ text: stale, keyboard: [] });

    const { payload, browserSecret } = await login();
    const question = await start(payload);
    // Another Telegram account opened the same link
    expect(messages.get(await start(payload, 111))).toEqual({ text: stale, keyboard: [] });

    await press(question, 'Подтвердить');
    // The link again after the answer
    expect(messages.get(await start(payload))).toEqual({ text: stale, keyboard: [] });
    expect(await browserSees(browserSecret)).toBe('confirmed');
  });

  it('a question the browser cancelled turns out of date when pressed', async () => {
    const { payload, browserSecret } = await login();
    const question = await start(payload);
    await authModule.getCancelWebLoginUseCase().execute({ browserSecret });

    await press(question, 'Подтвердить');
    expect(messages.get(question)!.text).toContain('Ссылка для входа устарела');
    expect(answers).toEqual([undefined]);
  });

  it('/start without a login is the first message, as before', async () => {
    const greeting = await start('');
    expect(messages.get(greeting)!.text).toContain('Это Kapelka — учёт расходов и доходов.');
  });
});
