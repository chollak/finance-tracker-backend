import 'reflect-metadata';
import { DataSource } from 'typeorm';
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
import { summarySender } from '../src/delivery/messaging/telegram/handlers/summaryHandlers';
import { TelegramAccess, telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { DatabaseFile, prepareDatabaseOnce } from './helpers/testDatabase';
import { SentMessage, TelegramStand } from './helpers/telegramStand';

/**
 * FT-124 end to end on a real SQLite file: the daily summary goes out at the user's chosen time on the user's
 * clock, once — a second tick or a restart does not repeat it; a day without records asks «Трат правда не
 * было?» at most 2 evenings in a row and again after a record, never before the first record and not on the
 * evening the user came after the chosen time; «Да, не было» answers it, unless the day has records by then.
 * The text is drawn by the bot's own sender into the stand's chats (`tests/helpers/telegramStand.ts`), and «Да, не
 * было» is pressed through the bot `startTelegramBot` assembles (#294).
 */

const NB = '\u00a0';
const TELEGRAM_ID = '597843119';
const BASE_URL = 'https://miniapp.test';

describe('daily summary (FT-124)', () => {
  let db: DatabaseFile;
  let clock: Date;
  /** Telegram: the chats of the users, kept across restarts of the bot. */
  let stand: TelegramStand;

  /** How many of the messages sent so far a test has put aside: `sent()` starts after them. */
  let forgotten = 0;
  /** What the bot sent, in every chat, oldest first, as it sent it. */
  const sent = (): SentMessage[] => stand.sent().slice(forgotten);

  /** Only the messages from now on count in `sent()`. */
  function forgetSent(): void {
    forgotten = stand.sent().length;
  }

  /** Telegram refuses every message with `error` — the request never got through, say — until `null`. */
  function refuse(error: Error | null): void {
    stand.stopRefusing('sendMessage');
    if (error) stand.refuse('sendMessage', error, { times: Infinity });
  }

  interface Running {
    ds: DataSource;
    transactionModule: TransactionModule;
    userModule: UserModule;
    notificationModule: NotificationModule;
  }
  let running: Running;
  /** Migrated once for the file; each test's bot starts over its own copy (#250). */
  const migrated = prepareDatabaseOnce();

  /** The bot's process: its modules over the file and the bot over them; the summary's ticks are the test's. */
  async function start(access?: TelegramAccess): Promise<Running> {
    const ds = await db.open();
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const notificationModule = new NotificationModule(new SqliteNotificationLogRepository(ds), { transactionModule, userModule, access }, () => clock);
    stand.start({ transactionModule, userModule, notificationModule, categoryModule, accountModule });
    return { ds, transactionModule, userModule, notificationModule };
  }

  /** What `notifications_log` keeps about the user's day. */
  function logEntry(owner: string, kind: 'daily_summary' | 'daily_summary_late', day: string) {
    return new SqliteNotificationLogRepository(running.ds).find(owner, kind, day);
  }

  /** The bot process stops and starts again over the same file, with ALLOWED_TELEGRAM_IDS when given (FT-153). */
  async function restart(access?: TelegramAccess): Promise<void> {
    await running.ds.destroy();
    running = await start(access);
  }

  /** A user with the bot since September, before any of the days below — whatever the real date is. */
  async function user(telegramId: string = TELEGRAM_ID): Promise<string> {
    stand.chatWith(Number(telegramId));
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

  /**
   * «Да, не было» pressed under the message the bot sent, by the person: every answer the bot gave the press, and the
   * edits it made of the message — the text and what came with it.
   */
  async function pressNoSpending(message: SentMessage) {
    const editsBefore = stand.calls.length;
    const answers = await stand.press(message.messageId, 'Да, не было');
    const edits: Array<[string, any]> = stand.calls.slice(editsBefore)
      .filter(call => call.method === 'editMessageText' && call.payload.message_id === message.messageId)
      .map(({ payload: { chat_id: _chat, message_id: _message, inline_message_id: _inline, text, ...extra } }) => [text, extra]);
    return { answers, edits };
  }

  async function tick() {
    return running.notificationModule.getDailySummary().tick(summarySender(stand.telegram));
  }

  beforeEach(async () => {
    db = migrated.newFile();
    forgotten = 0;
    stand = new TelegramStand({ id: Number(TELEGRAM_ID), first_name: 'Shukur' });
    stand.install();
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue(BASE_URL);
    running = await start();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.remove();
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
    expect(sent()).toEqual([]);

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].chatId).toBe(TELEGRAM_ID);
    expect(sent()[0].text).toBe([
      `<b>Итоги дня · 14${NB}октября</b>`,
      `Потрачено 210${NB}400${NB}сум · 2 записи`,
      '',
      `Продукты · 186${NB}400`,
      `Транспорт · 24${NB}000`,
      '',
      `С начала октября — 387${NB}400${NB}сум, на 187${NB}400${NB}сум больше, чем за 1–14 сентября.`,
    ].join('\n'));
    expect(sent()[0].keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Kapelka ↗', web_app: { url: `${BASE_URL}/` } })]]);

    // Every minute until midnight: nothing more; after a restart neither
    at('2026-10-14', '21:01');
    await tick();
    await restart();
    at('2026-10-14', '22:30');
    expect(await tick()).toEqual([]);
    expect(sent()).toHaveLength(1);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
      status: 'sent', variant: 'summary', chatId: TELEGRAM_ID, messageId: sent()[0].messageId,
    });
  });

  it('without HTTPS — WEB_APP_URL=http://localhost:3000 — goes out without «Открыть Kapelka ↗» (#278)', async () => {
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('http://localhost:3000');
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    at('2026-10-14', '21:00');

    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].text).toContain(`Потрачено 45${NB}000${NB}сум · 1 запись`);
    expect(sent()[0].keyboard).toEqual([]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({ status: 'sent', messageId: sent()[0].messageId });
  });

  it('goes only to the users on ALLOWED_TELEGRAM_IDS from the config; the rest of the base is left as it is (FT-153)', async () => {
    const owner = await user();
    const tester = await user('111');
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    await record(tester, '2026-10-14', 'Кафе', 30_000);
    // Built without a list of its own, as the app builds it: the list comes from AppConfig
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([TELEGRAM_ID]));
    await restart();
    at('2026-10-14', '21:00');

    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent().map(message => message.chatId)).toEqual([TELEGRAM_ID]);
    expect(await logEntry(tester, 'daily_summary', '2026-10-14')).toBeNull();
  });

  it('two bot processes over the same file at the same minute: one message', async () => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    const second = await start();
    at('2026-10-14', '21:00');

    await Promise.all([tick(), second.notificationModule.getDailySummary().tick(summarySender(stand.telegram))]);

    expect(sent()).toHaveLength(1);
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
    expect(sent().map(message => message.chatId)).toEqual(['597843120']);
  });

  // No route writes users.timezone since #274, and nothing reads it since #275: every user is on Tashkent's clock
  // (DEFAULT_TIME_ZONE). A zone left in the column moves nothing
  it('on Tashkent\'s clock, whatever users.timezone holds', async () => {
    const owner = await user();
    await running.ds.query('UPDATE users SET timezone = ? WHERE id = ?', ['Europe/Moscow', owner]);
    await record(owner, '2026-10-14', 'Кафе', 45_000);

    at('2026-10-14', '20:59');
    expect(await tick()).toEqual([]);
    at('2026-10-14', '21:00'); // 19:00 in Moscow
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent()[0].text).toContain(`Потрачено 45${NB}000${NB}сум · 1 запись`);
  });

  it('a day without records: «Трат правда не было?» two evenings in a row, then silence until the next record', async () => {
    const owner = await user();
    await record(owner, '2026-10-10', 'Кафе', 25_000);

    const evening = async (date: string) => {
      at(date, '21:00');
      return (await tick()).map(result => result.outcome);
    };

    expect(await evening('2026-10-11')).toEqual(['asked']);
    expect(sent()[0].text).toBe([
      `<b>Итоги дня · 11${NB}октября</b>`,
      'Записей нет. Трат правда не было?',
      '',
      '<i>Если что-то было — просто напишите, например «обед 45к».</i>',
    ].join('\n'));
    expect(sent()[0].keyboard).toEqual([[{ text: 'Да, не было', callback_data: 'n:none:2026-10-11', hide: false }]]);

    expect(await evening('2026-10-12')).toEqual(['asked']);
    expect(await evening('2026-10-13')).toEqual(['skipped']);
    expect(await evening('2026-10-14')).toEqual(['skipped']);
    expect(sent()).toHaveLength(2);

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
    expect(sent()).toEqual([]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-12')).toMatchObject({ status: 'skipped', variant: 'empty' });

    // The first record: from now on the empty evenings are asked about, two in a row
    await record(owner, '2026-10-13', 'Кафе', 25_000);
    expect(await evening('2026-10-13')).toEqual(['sent']);
    expect(await evening('2026-10-14')).toEqual(['asked']);
    expect(await evening('2026-10-15')).toEqual(['asked']);
    expect(await evening('2026-10-16')).toEqual(['skipped']);
    expect(sent()).toHaveLength(3);
  });

  it('a new user who came at 22:15, after the chosen time: nothing that evening, even after a first record', async () => {
    const owner = await user();
    await joined(owner, '2026-10-20', '22:15');

    // The minute after /start: no question under the greeting, nothing claimed for the day
    at('2026-10-20', '22:16');
    expect(await tick()).toEqual([]);
    expect(sent()).toEqual([]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-20')).toBeNull();

    // The first record a few minutes later is not followed by a summary of it
    await record(owner, '2026-10-20', 'Кафе', 45_000);
    at('2026-10-20', '22:21');
    expect(await tick()).toEqual([]);
    at('2026-10-20', '23:59');
    expect(await tick()).toEqual([]);
    expect(sent()).toEqual([]);

    // Nothing to catch up the next morning: that evening was not theirs (FT-164)
    at('2026-10-21', '08:00');
    expect(await tick()).toEqual([]);

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

    const press = await pressNoSpending(sent()[0]);

    expect(press.edits).toEqual([[
      `<b>Итоги дня · 19${NB}октября</b>\nОтметил: 19${NB}октября трат не было.`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } },
    ]]);
    expect(press.answers).toHaveLength(1);
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

    const press = await pressNoSpending(sent()[0]);

    expect(press.edits).toHaveLength(1);
    const [[text, extra]] = press.edits;
    expect(text).toBe([
      `<b>Итоги дня · 19${NB}октября</b>`,
      `Потрачено 45${NB}000${NB}сум · 1 запись`,
      '',
      `Кафе · 45${NB}000`,
      '',
      `С начала октября — 70${NB}000${NB}сум.`,
    ].join('\n'));
    // No «Да, не было» any more: the link to the app instead
    expect(extra.reply_markup.inline_keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Kapelka ↗' })]]);
    expect(press.answers).toHaveLength(1);
    expect(await logEntry(owner, 'daily_summary', '2026-10-19')).toMatchObject({ variant: 'empty', answer: null });
  });

  it('Telegram refuses (the bot is blocked): kept as failed, not tried again that day', async () => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    // The notices name the chat by a string: blocked is blocked all the same
    stand.block(TELEGRAM_ID);

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'failed' }]);
    stand.unblock(TELEGRAM_ID);
    await restart();
    at('2026-10-14', '21:05');
    expect(await tick()).toEqual([]);
    expect(sent()).toEqual([]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
      status: 'failed', error: '403: Forbidden: bot was blocked by the user',
    });
    // A refusal is not caught up the next morning either (FT-164)
    at('2026-10-15', '08:00');
    expect(await tick()).toEqual([]);
    expect(sent()).toEqual([]);
  });

  /** What Telegraf's fetch throws when the request did not get through: no DNS after sleep, no route, a reset. */
  function networkError(code: string): Error {
    return Object.assign(
      new Error(`request to https://api.telegram.org/bot123:[REDACTED]/sendMessage failed, reason: getaddrinfo ${code} api.telegram.org`),
      { name: 'FetchError', type: 'system', code, errno: code },
    );
  }

  it('no network (the Mac woke without it): tried again the next minute; the attempts survive a restart (FT-144, FT-164)', async () => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    refuse(networkError('ENOTFOUND'));

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
      status: 'not_sent', attempts: 1, error: expect.stringContaining('getaddrinfo ENOTFOUND api.telegram.org'),
    });

    refuse(networkError('EAI_AGAIN'));
    await restart();
    at('2026-10-14', '21:01');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
      status: 'not_sent', attempts: 2, error: expect.stringContaining('EAI_AGAIN'),
    });

    refuse(null);
    at('2026-10-14', '21:02');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    at('2026-10-14', '21:03');
    expect(await tick()).toEqual([]);
    expect(sent()).toHaveLength(1);
    // The attempt that went out is the third one
    expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({ status: 'sent', attempts: 3 });
  });

  it.each(['ETIMEDOUT', 'ECONNRESET'])('%s may have reached Telegram: kept as failed, never sent twice (FT-144)', async (code) => {
    const owner = await user();
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    refuse(networkError(code));

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'failed' }]);
    refuse(null);
    at('2026-10-14', '21:01');
    expect(await tick()).toEqual([]);
    // It may have reached the chat: not caught up the next morning (FT-164)
    at('2026-10-15', '08:00');
    expect(await tick()).toEqual([]);
    expect(sent()).toEqual([]);
  });

  describe('a summary that did not go out by midnight (FT-164)', () => {
    /** The summary of the 13th went out: the bot has been sending this user's summaries. */
    async function summaryOfThe13thSent(owner: string): Promise<void> {
      await record(owner, '2026-10-13', 'Такси', 18_000);
      at('2026-10-13', '21:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-13', outcome: 'sent' }]);
      forgetSent();
    }

    const LATE_14 = [
      `<b>Итоги за вчера · 14${NB}октября</b>`,
      `Потрачено 45${NB}000${NB}сум · 1 запись`,
      '',
      `Кафе · 45${NB}000`,
      '',
      `С начала октября — 63${NB}000${NB}сум.`,
    ].join('\n');

    it('no network until midnight: the day is kept failed with the reason; «Итоги за вчера» come from 08:00, today\'s as usual', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      await record(owner, '2026-10-14', 'Кафе', 45_000);
      refuse(networkError('ENOTFOUND'));

      at('2026-10-14', '21:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);
      at('2026-10-14', '23:59');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry' }]);

      // After midnight: the trace, and nothing at night
      refuse(null);
      at('2026-10-15', '00:00');
      expect(await tick()).toEqual([]);
      expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
        status: 'failed',
        attempts: 2,
        error: 'не ушло: нет сети, 2 попытки, последняя ошибка request to https://api.telegram.org/bot123:[REDACTED]/sendMessage failed, reason: getaddrinfo ENOTFOUND api.telegram.org',
      });
      at('2026-10-15', '07:59');
      expect(await tick()).toEqual([]);
      expect(sent()).toEqual([]);

      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent', late: true }]);
      expect(sent()).toHaveLength(1);
      expect(sent()[0].text).toBe(LATE_14);
      expect(sent()[0].keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Kapelka ↗' })]]);
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toMatchObject({ status: 'sent', attempts: 1, messageId: sent()[0].messageId });

      // Once: not on the next tick, not after a restart
      at('2026-10-15', '08:01');
      expect(await tick()).toEqual([]);
      await restart();
      at('2026-10-15', '12:00');
      expect(await tick()).toEqual([]);

      // The 15th's own summary at its time
      await record(owner, '2026-10-15', 'Продукты', 100_000);
      at('2026-10-15', '21:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-15', outcome: 'sent' }]);
      expect(sent()).toHaveLength(2);
      expect(sent()[1].text).toContain(`<b>Итоги дня · 15${NB}октября</b>`);
    });

    it('the bot was off all evening (the PC slept): the day is kept failed with no attempts, «Итоги за вчера» at 08:00', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      await record(owner, '2026-10-14', 'Кафе', 45_000);

      // No tick from 20:00 on the 14th until the morning
      at('2026-10-14', '20:00');
      expect(await tick()).toEqual([]);
      at('2026-10-15', '06:30');
      expect(await tick()).toEqual([]);
      expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({
        status: 'failed', attempts: 0, error: 'не ушло: ни одной попытки',
      });

      // What is decided at night survives a restart
      await restart();
      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent', late: true }]);
      expect(sent().map(message => message.text)).toEqual([LATE_14]);
    });

    it('the bot comes back after 08:00: «Итоги за вчера» at once; the month is told up to that day, without today\'s records', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      await record(owner, '2026-10-14', 'Кафе', 45_000);
      // Written in the morning, before the bot is back: not in yesterday's month line
      await record(owner, '2026-10-15', 'Продукты', 100_000);

      at('2026-10-15', '10:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent', late: true }]);
      expect(sent().map(message => message.text)).toEqual([LATE_14]);
    });

    it('«Итоги за вчера» are tried until the next day ends, across a restart; then kept failed and the next day is the one caught up', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      await record(owner, '2026-10-14', 'Кафе', 45_000);
      await record(owner, '2026-10-15', 'Такси', 18_000);
      refuse(networkError('ENOTFOUND'));
      at('2026-10-14', '21:00');
      await tick();

      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'retry', late: true }]);
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toMatchObject({ status: 'not_sent', attempts: 1 });
      await restart();
      at('2026-10-15', '23:59');
      // The day before first, then the day's own
      expect(await tick()).toEqual([
        { userId: owner, day: '2026-10-14', outcome: 'retry', late: true },
        { userId: owner, day: '2026-10-15', outcome: 'retry' },
      ]);
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toMatchObject({ status: 'not_sent', attempts: 2 });

      // Two evenings missed in a row: only the last one is caught up
      refuse(null);
      at('2026-10-16', '00:00');
      expect(await tick()).toEqual([]);
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toMatchObject({
        status: 'failed', attempts: 2, error: expect.stringMatching(/^не ушло: нет сети, 2 попытки, последняя ошибка .*ENOTFOUND/),
      });
      expect(await logEntry(owner, 'daily_summary', '2026-10-15')).toMatchObject({ status: 'failed', attempts: 1 });
      at('2026-10-16', '08:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-15', outcome: 'sent', late: true }]);
      expect(sent()).toHaveLength(1);
      expect(sent()[0].text).toContain(`<b>Итоги за вчера · 15${NB}октября</b>`);
      expect(sent()[0].text).toContain(`Потрачено 18${NB}000${NB}сум · 1 запись`);
    });

    it('the bot off for two evenings: only the last day is caught up, the one before leaves no row', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      await record(owner, '2026-10-14', 'Кафе', 45_000);
      await record(owner, '2026-10-15', 'Такси', 18_000);

      at('2026-10-16', '09:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-15', outcome: 'sent', late: true }]);
      expect(sent()).toHaveLength(1);
      expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toBeNull();
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toBeNull();
      expect(await logEntry(owner, 'daily_summary', '2026-10-15')).toMatchObject({ status: 'failed', attempts: 0 });
    });

    it('a day without records caught up asks «Трат правда не было?» and counts as one of the two evenings in a row', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);

      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'asked', late: true }]);
      expect(sent()[0].text).toBe([
        `<b>Итоги за вчера · 14${NB}октября</b>`,
        'Записей нет. Трат правда не было?',
        '',
        // Plain «обед 45к» would be written for today
        '<i>Если что-то было — просто напишите, например «вчера обед 45к».</i>',
      ].join('\n'));
      expect(sent()[0].keyboard).toEqual([[{ text: 'Да, не было', callback_data: 'n:none:2026-10-14', hide: false }]]);

      const press = await pressNoSpending(sent()[0]);
      expect(press.edits).toEqual([[
        `<b>Итоги за вчера · 14${NB}октября</b>\nОтметил: 14${NB}октября трат не было.`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } },
      ]]);
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toMatchObject({ variant: 'empty', answer: 'no_spending' });

      at('2026-10-15', '21:00');
      expect((await tick()).map(result => result.outcome)).toEqual(['asked']);
      at('2026-10-16', '21:00');
      expect((await tick()).map(result => result.outcome)).toEqual(['skipped']);
    });

    it('«Да, не было» under «Итоги за вчера» after «вчера обед 45к»: the question becomes yesterday\'s summary, still «за вчера»', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'asked', late: true }]);
      await record(owner, '2026-10-14', 'Кафе', 45_000);

      const press = await pressNoSpending(sent()[0]);

      const [text, extra] = press.edits[0];
      expect(text).toBe(LATE_14);
      expect(extra.reply_markup.inline_keyboard).toEqual([[expect.objectContaining({ text: 'Открыть Kapelka ↗' })]]);
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toMatchObject({ variant: 'empty', answer: null });
    });

    it('a summary claimed but never finished (the process stopped mid-send) is not tried again, nor caught up', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      await record(owner, '2026-10-14', 'Кафе', 45_000);
      await new SqliteNotificationLogRepository(running.ds).claim({ id: 'crashed', userId: owner, kind: 'daily_summary', period: '2026-10-14', sendUntil: '2026-10-14' });
      await restart();

      at('2026-10-14', '21:30');
      expect(await tick()).toEqual([]);
      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([]);
      expect(sent()).toEqual([]);
      expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({ status: 'sending' });
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toBeNull();
    });

    it('nothing to catch up for a user the bot has sent no summary yet: no row for a day it knows nothing about', async () => {
      const fresh = await user();
      await record(fresh, '2026-10-14', 'Кафе', 45_000);

      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([]);
      expect(sent()).toEqual([]);
      expect(await logEntry(fresh, 'daily_summary', '2026-10-14')).toBeNull();
      expect(await logEntry(fresh, 'daily_summary_late', '2026-10-14')).toBeNull();
    });

    it('summaries switched off: no «Итоги за вчера»; a summary that did not leave is still kept failed', async () => {
      const owner = await user();
      await summaryOfThe13thSent(owner);
      await record(owner, '2026-10-14', 'Кафе', 45_000);
      refuse(networkError('ENOTFOUND'));
      at('2026-10-14', '21:00');
      await tick();
      refuse(null);
      await running.userModule.getUpdateUserSettingsUseCase().execute({ userId: owner, patch: { dailySummaryEnabled: false } });

      at('2026-10-15', '08:00');
      expect(await tick()).toEqual([]);
      expect(sent()).toEqual([]);
      expect(await logEntry(owner, 'daily_summary', '2026-10-14')).toMatchObject({ status: 'failed', attempts: 1 });
      expect(await logEntry(owner, 'daily_summary_late', '2026-10-14')).toBeNull();
    });
  });

  it('only Telegram chats, by the rule of ALLOWED_TELEGRAM_IDS: a dev id, `0` or a number from 2^53 on gets nothing (#255)', async () => {
    // The regex before let `0` and any length through, so the bot wrote to chats no Telegram user has
    for (const telegramId of ['dev-user', '0', '9007199254740993']) {
      await record(await user(telegramId), '2026-10-14', 'Кафе', 45_000);
    }
    at('2026-10-14', '21:00');

    expect(await tick()).toEqual([]);
    expect(stand.calls.filter(call => call.method === 'sendMessage')).toEqual([]);
  });

  it('a Telegram id with leading zeros is its chat without them, as the list reads it (#255)', async () => {
    const owner = await user(`0${TELEGRAM_ID}`);
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    at('2026-10-14', '21:00');

    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent().map(message => message.chatId)).toEqual([TELEGRAM_ID]);
    expect(sent()[0].keyboard).toEqual([[expect.objectContaining({ web_app: { url: `${BASE_URL}/` } })]]);
  });

  it('with ALLOWED_TELEGRAM_IDS set, a row with leading zeros is the listed id, as the list reads it (#255)', async () => {
    const owner = await user(`0${TELEGRAM_ID}`);
    const stranger = await user('0111');
    await record(owner, '2026-10-14', 'Кафе', 45_000);
    await record(stranger, '2026-10-14', 'Кафе', 30_000);
    await restart(telegramAccess([TELEGRAM_ID]));
    at('2026-10-14', '21:00');

    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
    expect(sent().map(message => message.chatId)).toEqual([TELEGRAM_ID]);
  });
});
