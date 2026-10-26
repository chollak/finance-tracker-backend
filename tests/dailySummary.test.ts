import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
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
import { registerSummaryHandlers, summarySender } from '../src/delivery/messaging/telegram/handlers/summaryHandlers';

/**
 * FT-124 end to end on a real SQLite file: the daily summary goes out at the user's chosen time on the user's
 * clock, once — a second tick or a restart does not repeat it; a day without records asks «Трат правда не
 * было?» at most 2 evenings in a row and again after a record, never before the first record and not on the
 * evening the user came after the chosen time; «Да, не было» answers it, unless the day has records by then.
 * Telegram is a fake that keeps what the bot sent; the text is drawn by the bot's own sender.
 */

const NB = '\u00a0';
const TELEGRAM_ID = '597843119';
const BASE_URL = 'https://miniapp.test';

interface Sent { chatId: string; text: string; keyboard: Array<Array<{ text: string; callback_data?: string; web_app?: { url: string } }>>; messageId: number }

describe('daily summary (FT-124)', () => {
  let dir: string;
  let file: string;
  const open: DataSource[] = [];
  let clock: Date;
  let sent: Sent[];
  let refuse: Error | null;
  let nextMessageId: number;

  const telegram = {
    sendMessage: jest.fn(async (chatId: string, text: string, extra?: any) => {
      if (refuse) throw refuse;
      const message = { chatId: String(chatId), text, keyboard: extra?.reply_markup?.inline_keyboard ?? [], messageId: nextMessageId++ };
      sent.push(message);
      return { message_id: message.messageId, chat: { id: Number(chatId) } };
    }),
  };

  interface Running {
    ds: DataSource;
    transactionModule: TransactionModule;
    userModule: UserModule;
    notificationModule: NotificationModule;
  }
  let running: Running;

  async function start(): Promise<Running> {
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const notificationModule = new NotificationModule(new SqliteNotificationLogRepository(ds), { transactionModule, userModule }, () => clock);
    return { ds, transactionModule, userModule, notificationModule };
  }

  /** What `notifications_log` keeps about the user's day. */
  function logEntry(owner: string, kind: 'daily_summary', day: string) {
    return new SqliteNotificationLogRepository(running.ds).find(owner, kind, day);
  }

  /** The bot process stops and starts again over the same file. */
  async function restart(): Promise<void> {
    await running.ds.destroy();
    running = await start();
  }

  /** A user with the bot since September, before any of the days below — whatever the real date is. */
  async function user(telegramId: string = TELEGRAM_ID): Promise<string> {
    const created = await running.userModule.getGetOrCreateUserUseCase().execute({ telegramId, firstName: 'Shukur' });
    await joined(created.id, '2026-09-01', '09:00');
    return created.id;
  }

  async function record(owner: string, date: string, category: string, sum: number, type: 'expense' | 'income' = 'expense') {
    const created = await running.transactionModule.getCreateTransactionUseCase().execute({
      userId: owner, amountMinor: sum * 100, category, type, description: category, date, source: 'telegram',
    } as any);
    if (!created.success) throw created.error;
  }

  /** The clock reads this time in Tashkent (UTC+5). */
  function at(date: string, time: string): void {
    clock = new Date(`${date}T${time}:00+05:00`);
  }

  /** The user first came to the bot at this time in Tashkent (`users.created_at` is UTC). */
  async function joined(owner: string, date: string, time: string): Promise<void> {
    const utc = new Date(`${date}T${time}:00+05:00`).toISOString().replace('T', ' ').slice(0, 19);
    await running.ds.query('UPDATE users SET created_at = ? WHERE id = ?', [utc, owner]);
  }

  /** «Да, не было» pressed under the message the bot sent. */
  async function pressNoSpending(message: Sent) {
    const actions: Array<{ trigger: RegExp; handler: (ctx: any) => Promise<void> }> = [];
    registerSummaryHandlers({ action: (trigger: RegExp, handler: any) => actions.push({ trigger, handler }) } as any);
    const data = message.keyboard[0][0].callback_data!;
    const action = actions.find(({ trigger }) => trigger.test(data))!;
    const ctx: any = {
      from: { id: Number(TELEGRAM_ID) },
      match: action.trigger.exec(data),
      callbackQuery: { data, message: { message_id: message.messageId, chat: { id: Number(TELEGRAM_ID) } } },
      modules: { userModule: running.userModule, notificationModule: running.notificationModule },
      answerCbQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true),
    };
    await action.handler(ctx);
    return ctx;
  }

  async function tick() {
    return running.notificationModule.getDailySummary().tick(summarySender(telegram as any));
  }

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft124-'));
    file = path.join(dir, 'db.sqlite');
    sent = [];
    refuse = null;
    nextMessageId = 700;
    telegram.sendMessage.mockClear();
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue(BASE_URL);
    running = await start();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('at 21:00 in Tashkent: the total, the categories and the month against the same days of September — once', async () => {
    const owner = await user();
    await record(owner, '2026-09-05', 'Продукты', 200_000);
    await record(owner, '2026-09-20', 'Дом', 1_000_000);
    await record(owner, '2026-10-13', 'Кафе', 145_000);
    await record(owner, '2026-10-13', 'Транспорт', 32_000);
    await record(owner, '2026-10-14', 'Продукты', 186_400);
    await record(owner, '2026-10-14', 'Транспорт', 24_000);
    await record(owner, '2026-10-14', 'Зарплата', 12_500_000, 'income');

    at('2026-10-14', '20:59');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe(TELEGRAM_ID);
    expect(sent[0].text).toBe([
      `<b>Итоги дня · 14${NB}октября</b>`,
      `Потрачено 210${NB}400${NB}сум · 2 записи`,
      '',
      `Продукты · 186${NB}400`,
      `Транспорт · 24${NB}000`,
      '',
      `С начала октября — 387${NB}400${NB}сум, на 187${NB}400${NB}сум больше, чем за 1–14 сентября.`,
    ].join('\n'));
    expect(sent[0].keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Daftar ↗', web_app: { url: `${BASE_URL}/?userId=${TELEGRAM_ID}` } })]]);

    // Every minute until midnight: nothing more; after a restart neither
    at('2026-10-14', '21:01');
    await tick();
    await restart();
    at('2026-10-14', '22:30');
    expect(await tick()).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
      status: 'sent', variant: 'summary', chatId: TELEGRAM_ID, messageId: 700,
    });
  });

  it('two bot processes over the same file at the same minute: one message', async () => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    const second = await start();
    at('2026-10-14', '21:00');

    await Promise.all([tick(), second.notificationModule.getDailySummary().tick(summarySender(telegram as any))]);

    expect(sent).toHaveLength(1);
  });

  it('at the time the user chose, not at all when switched off', async () => {
    const late = await user('597843120');
    const off = await user('597843121');
    await record(late, '2026-10-10', 'Кафе', 25_000);
    await running.userModule.getUpdateUserSettingsUseCase().execute({ userId: late, patch: { dailySummaryTime: '22:00' } });
    await running.userModule.getUpdateUserSettingsUseCase().execute({ userId: off, patch: { dailySummaryEnabled: false } });

    at('2026-10-14', '21:30');
    expect(await tick()).toEqual([]);
    at('2026-10-14', '22:00');
    expect(await tick()).toEqual([{ userId: late, day: '2026-10-14', outcome: 'asked' }]);
    at('2026-10-14', '23:59');
    expect(await tick()).toEqual([]);
    expect(sent.map(message => message.chatId)).toEqual(['597843120']);
  });

  it('on the user\'s own clock: 21:00 in Moscow, about the Moscow day', async () => {
    const owner = await user();
    await running.userModule.getUpdateUserUseCase().execute(owner, { timezone: 'Europe/Moscow' });
    await record(owner, '2026-10-14', 'Кафе', 45_000);

    at('2026-10-14', '21:00'); // 19:00 in Moscow
    expect(await tick()).toEqual([]);
    at('2026-10-14', '23:00'); // 21:00 in Moscow
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent[0].text).toContain(`Потрачено 45${NB}000${NB}сум · 1 запись`);
  });

  it('a day without records: «Трат правда не было?» two evenings in a row, then silence until the next record', async () => {
    const owner = await user();
    await record(owner, '2026-10-10', 'Кафе', 25_000);

    const evening = async (date: string) => {
      at(date, '21:00');
      return (await tick()).map(result => result.outcome);
    };

    expect(await evening('2026-10-11')).toEqual(['asked']);
    expect(sent[0].text).toBe([
      `<b>Итоги дня · 11${NB}октября</b>`,
      'Записей нет. Трат правда не было?',
      '',
      '<i>Если что-то было — просто напишите, например «обед 45к».</i>',
    ].join('\n'));
    expect(sent[0].keyboard).toEqual([[{ text: 'Да, не было', callback_data: 'n:none:2026-10-11', hide: false }]]);

    expect(await evening('2026-10-12')).toEqual(['asked']);
    expect(await evening('2026-10-13')).toEqual(['skipped']);
    expect(await evening('2026-10-14')).toEqual(['skipped']);
    expect(sent).toHaveLength(2);

    await record(owner, '2026-10-15', 'Такси', 18_000);
    expect(await evening('2026-10-15')).toEqual(['sent']);
    expect(await evening('2026-10-16')).toEqual(['asked']);
    expect(await evening('2026-10-17')).toEqual(['asked']);
    expect(await evening('2026-10-18')).toEqual(['skipped']);

    // A record written later for an evening already asked about starts the count again too
    await record(owner, '2026-10-17', 'Кафе', 30_000);
    expect(await evening('2026-10-19')).toEqual(['asked']);
  });

  it('a user who has not recorded anything yet is not asked; the evenings before the first record do not count', async () => {
    const owner = await user();
    const evening = async (date: string) => {
      at(date, '21:00');
      return (await tick()).map(result => result.outcome);
    };

    expect(await evening('2026-10-11')).toEqual(['skipped']);
    expect(await evening('2026-10-12')).toEqual(['skipped']);
    expect(sent).toEqual([]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-12')).toMatchObject({ status: 'skipped', variant: 'empty' });

    // The first record: from now on the empty evenings are asked about, two in a row
    await record(owner, '2026-10-13', 'Кафе', 25_000);
    expect(await evening('2026-10-13')).toEqual(['sent']);
    expect(await evening('2026-10-14')).toEqual(['asked']);
    expect(await evening('2026-10-15')).toEqual(['asked']);
    expect(await evening('2026-10-16')).toEqual(['skipped']);
    expect(sent).toHaveLength(3);
  });

  it('a new user who came at 22:15, after the chosen time: nothing that evening, even after a first record', async () => {
    const owner = await user();
    await joined(owner, '2026-10-20', '22:15');

    // The minute after /start: no question under the greeting, nothing claimed for the day
    at('2026-10-20', '22:16');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-20')).toBeNull();

    // The first record a few minutes later is not followed by a summary of it
    await record(owner, '2026-10-20', 'Кафе', 45_000);
    at('2026-10-20', '22:21');
    expect(await tick()).toEqual([]);
    at('2026-10-20', '23:59');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);

    // The next evening is the first one at the chosen time
    await record(owner, '2026-10-21', 'Такси', 18_000);
    at('2026-10-21', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-21', outcome: 'sent' }]);
  });

  it('a user who came before the chosen time gets that evening\'s summary', async () => {
    const owner = await user();
    await joined(owner, '2026-10-20', '20:30');
    await record(owner, '2026-10-20', 'Кафе', 45_000);

    at('2026-10-20', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-20', outcome: 'sent' }]);
  });

  it('«Да, не было»: the question turns into the answer, kept with the notice', async () => {
    const owner = await user();
    await record(owner, '2026-10-10', 'Кафе', 25_000);
    at('2026-10-19', '21:00');
    await tick();

    const ctx = await pressNoSpending(sent[0]);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      `<b>Итоги дня · 19${NB}октября</b>\nОтметил: 19${NB}октября трат не было.`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
    );
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    expect(await logEntry(owner, 'daily_summary', '2026-10-19')).toMatchObject({ answer: 'no_spending' });
  });

  it('«Да, не было» after «обед 45к» for that day: nothing is kept, the question becomes the day\'s summary', async () => {
    const owner = await user();
    await record(owner, '2026-10-10', 'Кафе', 25_000);
    at('2026-10-19', '21:00');
    await tick();
    // The hint under the question: «просто напишите, например «обед 45к»»
    await record(owner, '2026-10-19', 'Кафе', 45_000);
    at('2026-10-19', '21:10');

    const ctx = await pressNoSpending(sent[0]);

    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    const [text, extra] = ctx.editMessageText.mock.calls[0];
    expect(text).toBe([
      `<b>Итоги дня · 19${NB}октября</b>`,
      `Потрачено 45${NB}000${NB}сум · 1 запись`,
      '',
      `Кафе · 45${NB}000`,
      '',
      `С начала октября — 70${NB}000${NB}сум.`,
    ].join('\n'));
    // No «Да, не было» any more: the link to the app instead
    expect(extra.reply_markup.inline_keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Daftar ↗' })]]);
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    expect(await logEntry(owner, 'daily_summary', '2026-10-19')).toMatchObject({ variant: 'empty', answer: null });
  });

  it('Telegram refuses (the bot is blocked): kept as failed, not tried again that day', async () => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    refuse = new Error('403: Forbidden: bot was blocked by the user');

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'failed' }]);
    refuse = null;
    await restart();
    at('2026-10-14', '21:05');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
      status: 'failed', error: '403: Forbidden: bot was blocked by the user',
    });
  });

  /** What Telegraf's fetch throws when the request did not get through: no DNS after sleep, no route, a reset. */
  function networkError(code: string): Error {
    return Object.assign(
      new Error(`request to https://api.telegram.org/bot123:[REDACTED]/sendMessage failed, reason: getaddrinfo ${code} api.telegram.org`),
      { name: 'FetchError', type: 'system', code, errno: code },
    );
  }

  it('no network (the Mac woke without it): tried again the next minute, and after a restart (FT-144)', async () => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    refuse = networkError('ENOTFOUND');

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toBeNull();

    refuse = networkError('EAI_AGAIN');
    await restart();
    at('2026-10-14', '21:01');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);

    refuse = null;
    at('2026-10-14', '21:02');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    at('2026-10-14', '21:03');
    expect(await tick()).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({ status: 'sent' });
  });

  it.each(['ETIMEDOUT', 'ECONNRESET'])('%s may have reached Telegram: kept as failed, never sent twice (FT-144)', async (code) => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    refuse = networkError(code);

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'failed' }]);
    refuse = null;
    at('2026-10-14', '21:01');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('no network until midnight: the next day does not send the day before (FT-144)', async () => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    refuse = networkError('ENOTFOUND');

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);
    at('2026-10-14', '23:59');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);

    refuse = null;
    at('2026-10-15', '09:00');
    expect(await tick()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('only Telegram chats: a dev or guest id gets nothing', async () => {
    await user('dev-user');
    at('2026-10-14', '21:00');

    expect(await tick()).toEqual([]);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });
});
