import 'reflect-metadata';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { NotificationModule } from '../src/modules/notification/notificationModule';
import { SqliteNotificationLogRepository } from '../src/modules/notification/infrastructure/SqliteNotificationLogRepository';
import { BOT_COMMANDS, registerCommandHandlers, setCommandMenu } from '../src/delivery/messaging/telegram/handlers/commandHandlers';
import { registerMessageHandlers } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { registerRecordHandlers } from '../src/delivery/messaging/telegram/handlers/recordHandlers';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/**
 * FT-124: /start and /help say what the boards «Бот · первое сообщение» and «Бот · меню команд» say; /today and
 * /month count with the totals service of FT-103, so their numbers are Home's; the menu is set with setMyCommands;
 * commands that left the bot with Д2 and Д3 answer «Такой команды нет».
 */

const NB = ' ';
const TELEGRAM_ID = 597843119;
const BASE_URL = 'https://miniapp.test';

interface Reply { text: string; keyboard: Array<Array<{ text: string; callback_data?: string; web_app?: { url: string } }>> }
type Middleware = (ctx: any, next: () => Promise<void>) => Promise<void> | void;

/** Telegraf as the handlers see it: commands first, then the first text handler whose filter matches. */
class Bot {
  readonly commands = new Map<string, (ctx: any) => Promise<void>>();
  readonly handlers: Array<{ filter: (update: any) => boolean; chain: Middleware[] }> = [];

  command(name: string, handler: (ctx: any) => Promise<void>) {
    this.commands.set(name, handler);
  }

  on(filter: (update: any) => boolean, ...chain: Middleware[]) {
    this.handlers.push({ filter, chain });
  }

  action() {}

  use() {}

  async handle(ctx: any): Promise<void> {
    const text: string = ctx.message.text;
    const command = text.startsWith('/') ? this.commands.get(text.slice(1).split(/[\s@]/)[0]) : undefined;
    const chain: Middleware[] = command ? [async (c: any) => command(c)] : this.handlers.find(({ filter }) => filter(ctx.update))?.chain ?? [];
    const step = async (index: number): Promise<void> => {
      if (index < chain.length) await chain[index](ctx, () => step(index + 1));
    };
    await step(0);
  }
}

describe('bot commands (FT-124)', () => {
  let db: TestDatabase;
  let transactionModule: TransactionModule;
  let userModule: UserModule;
  let notificationModule: NotificationModule;
  let bot: Bot;
  let replies: Reply[];
  let owner: string;

  async function send(text: string): Promise<Reply[]> {
    replies = [];
    const message = { text, chat: { id: TELEGRAM_ID } };
    await bot.handle({
      from: { id: TELEGRAM_ID, first_name: 'Shukur' },
      chat: { id: TELEGRAM_ID },
      message,
      update: { message },
      session: {},
      modules: { transactionModule, userModule, notificationModule },
      reply: jest.fn(async (body: string, extra?: any) => {
        replies.push({ text: body, keyboard: extra?.reply_markup?.inline_keyboard ?? [] });
        return { message_id: 900 + replies.length, chat: { id: TELEGRAM_ID } };
      }),
      deleteMessage: jest.fn().mockResolvedValue(true),
      sendChatAction: jest.fn().mockResolvedValue(true),
    });
    return replies;
  }

  async function record(date: string, category: string, sum: number, type: 'expense' | 'income' = 'expense') {
    const created = await transactionModule.getCreateTransactionUseCase().execute({
      userId: owner, amountMinor: sum * 100, category, type, description: category, date, source: 'telegram',
    } as any);
    if (!created.success) throw created.error;
  }

  /** Home's month tile and a day's total: GET /api/transactions/totals. */
  async function homeExpenses(from: string, to: string): Promise<number> {
    const totals = await transactionModule.getPeriodTotalsUseCase().execute({ userId: owner, query: { from, to } });
    if (!totals.success) throw totals.error;
    return totals.data.expenseMinor;
  }

  beforeEach(async () => {
    // 19:20 in Tashkent on 14 October; only the clock is fake
    jest.useFakeTimers({
      now: new Date('2026-10-14T14:20:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
    });
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue(BASE_URL);
    db = await openMigratedDatabase();
    const ds = db.dataSource;
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    notificationModule = new NotificationModule(new SqliteNotificationLogRepository(ds), { transactionModule, userModule });
    owner = (await userModule.getGetOrCreateUserUseCase().execute({ telegramId: String(TELEGRAM_ID) })).id;

    // In the order telegramBot.ts registers them
    bot = new Bot();
    registerCommandHandlers(bot as any);
    registerRecordHandlers(bot as any);
    registerMessageHandlers(bot as any, undefined, userModule);
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await db.close();
  });

  it('/start: what Daftar is and how to write, with «Открыть Daftar ↗» to Home', async () => {
    const [greeting, ...rest] = await send('/start');

    expect(rest).toEqual([]);
    expect(greeting.text).toBe([
      '<b>Это Daftar — учёт расходов и доходов.</b>',
      'Пишите траты прямо сюда, как в заметках:',
      '<blockquote><i>кофе 25к, такси 18к нал</i></blockquote>',
      '',
      'Можно голосом. Всё сразу попадёт в приложение.',
      '',
      '<i>Команды — «/» в поле ввода.</i>',
    ].join('\n'));
    expect(greeting.keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Daftar ↗', web_app: { url: `${BASE_URL}/?userId=${TELEGRAM_ID}` } })]]);
  });

  it('/help: how to write and the commands, no buttons', async () => {
    const [help, ...rest] = await send('/help');

    expect(rest).toEqual([]);
    expect(help).toEqual({
      text: [
        '<b>Как записывать</b>',
        'Трата и сумма: «такси 18к», «обед 45 000 картой».'.replace('45 000', `45${NB}000`),
        'Несколько сразу — через запятую.',
        'Доход: «зарплата 12,5 млн». Доллары: «наушники 55$».',
        'Не сегодня — добавьте «вчера» или дату.',
        'Поменять сумму — напишите «не 25, а 28».',
        '',
        '/today — итоги дня',
        '/month — траты за месяц',
        '/undo — отменить последнюю запись',
      ].join('\n'),
      keyboard: [],
    });
  });

  it('/today: the day as Home counts it, the 3 largest categories and the month', async () => {
    await record('2026-09-05', 'Продукты', 200_000);
    await record('2026-10-13', 'Кафе', 145_000);
    await record('2026-10-14', 'Продукты', 186_400);
    await record('2026-10-14', 'Транспорт', 24_000);
    await record('2026-10-14', 'Зарплата', 12_500_000, 'income');

    const [today] = await send('/today');

    expect(await homeExpenses('2026-10-14', '2026-10-14')).toBe(21_040_000);
    expect(await homeExpenses('2026-10-01', '2026-10-31')).toBe(35_540_000);
    expect(today.text).toBe([
      `<b>Итоги дня · 14${NB}октября</b>`,
      `Потрачено 210${NB}400${NB}сум · 2 записи`,
      '',
      `Продукты · 186${NB}400`,
      `Транспорт · 24${NB}000`,
      '',
      `С начала октября — 355${NB}400${NB}сум, на 155${NB}400${NB}сум больше, чем за 1–14 сентября.`,
    ].join('\n'));
    expect(today.keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Daftar ↗' })]]);
  });

  it('/today without records today: «Записей пока нет.», no question and no buttons', async () => {
    const [today] = await send('/today');

    expect(today).toEqual({ text: `<b>Итоги дня · 14${NB}октября</b>\nЗаписей пока нет.`, keyboard: [] });
  });

  it('/month: Home\'s month tile against the same days of September, the 3 largest, «Открыть аналитику ↗»', async () => {
    await record('2026-09-03', 'Продукты', 900_000);
    await record('2026-09-20', 'Дом', 1_000_000);
    await record('2026-10-02', 'Продукты', 600_000);
    await record('2026-10-05', 'Дом', 450_000);
    await record('2026-10-09', 'Кафе', 92_000);
    await record('2026-10-14', 'Транспорт', 24_000);
    // A rent planned for later this month counts, as on Home's tile
    await record('2026-10-30', 'Дом', 1_000_000);

    const [month] = await send('/month');

    expect(await homeExpenses('2026-10-01', '2026-10-31')).toBe(216_600_000);
    expect(month.text).toBe([
      '<b>Октябрь · 1–14</b>',
      `Потрачено 2${NB}166${NB}000${NB}сум — на 1${NB}266${NB}000${NB}сум больше, чем за 1–14 сентября.`,
      '',
      `Дом · 1${NB}450${NB}000`,
      `Продукты · 600${NB}000`,
      `Кафе · 92${NB}000`,
    ].join('\n'));
    expect(month.keyboard).toEqual([[expect.objectContaining({ text: 'Открыть аналитику ↗', web_app: { url: `${BASE_URL}/analytics?userId=${TELEGRAM_ID}` } })]]);
  });

  it('/month in a month without spending says so', async () => {
    const [month] = await send('/month');

    expect(month.text).toBe('<b>Октябрь · 1–14</b>\nТрат в октябре пока нет.');
  });

  it('/stats, the month before FT-124, answers as /month', async () => {
    await record('2026-10-02', 'Продукты', 600_000);

    expect(await send('/stats')).toEqual(await send('/month'));
  });

  it('the menu: /today, /month, /undo, /help, /start with the board\'s words, set with setMyCommands', async () => {
    expect(BOT_COMMANDS).toEqual([
      { command: 'today', description: 'Итоги дня' },
      { command: 'month', description: 'Траты за месяц' },
      { command: 'undo', description: 'Отменить последнюю запись' },
      { command: 'help', description: 'Как записывать' },
      { command: 'start', description: 'Что умеет бот' },
    ]);
    // Every command of the menu answers
    for (const { command } of BOT_COMMANDS) expect(bot.commands.has(command)).toBe(true);

    const telegram = { setMyCommands: jest.fn().mockResolvedValue(true) };
    await setCommandMenu(telegram as any);
    expect(telegram.setMyCommands).toHaveBeenCalledWith(BOT_COMMANDS);
  });

  it('a menu Telegram refuses does not stop the bot', async () => {
    await expect(setCommandMenu({ setMyCommands: jest.fn().mockRejectedValue(new Error('network')) } as any)).resolves.toBeUndefined();
    await expect(setCommandMenu({} as any)).resolves.toBeUndefined();
  });

  it.each(['/budget', '/week', '/weekly', '/transactions', '/whatever'])(
    '%s: «Такой команды нет. Список — /help» (budgets left the bot with Д2, the weekly review and the list with the design)',
    async (text) => {
      expect(await send(text)).toEqual([{ text: 'Такой команды нет. Список — /help', keyboard: [] }]);
    }
  );

  it('a text that only starts with «/» is not a command: it goes on to the capture', async () => {
    const capture = jest.fn().mockResolvedValue({ transactions: [], debts: [] });
    const message = { text: '/ 25к кофе', chat: { id: TELEGRAM_ID } };
    replies = [];
    await bot.handle({
      from: { id: TELEGRAM_ID }, chat: { id: TELEGRAM_ID }, message, update: { message }, session: {},
      modules: { transactionModule, userModule, notificationModule, quickCaptureModule: { getQuickCaptureService: () => ({ capture }) } },
      reply: jest.fn(async (body: string) => { replies.push({ text: body, keyboard: [] }); return { message_id: 1 }; }),
      sendChatAction: jest.fn().mockResolvedValue(true),
    });

    expect(replies.map(reply => reply.text)).not.toContain('Такой команды нет. Список — /help');
  });

  it('a command named with the bot answers as the command itself', async () => {
    const [today] = await send('/today@DaftarBot');

    expect(today.text).toContain('Итоги дня');
  });
});
