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
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { NotificationModule } from '../src/modules/notification/notificationModule';
import { SqliteNotificationLogRepository } from '../src/modules/notification/infrastructure/SqliteNotificationLogRepository';
import { DailySummarySender } from '../src/modules/notification/application/dailySummaryNotifier';
import { AUDIT_TIMES, DAILY_SUMMARY_TIMES } from '../src/modules/user/domain/userSettings';
// The webapp's copy: the time chips of «Сводка дня» and «Звать на ревизию»
import { AUDIT_TIMES as WEBAPP_AUDIT_TIMES, DAILY_SUMMARY_TIMES as WEBAPP_DAILY_SUMMARY_TIMES } from '../webapp/src/entities/settings/model/options';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';

/**
 * FT-125: «Ещё» → «Сводка дня» saves through PATCH /api/settings, and the scheduler of FT-124 reads the saved
 * settings on every look at the clock — no restart, no cache. Switched off: nothing that evening; a new time: the
 * summary waits for it; a time changed after the day's summary went out: no second one. The bot process and the
 * API share one SQLite file, as they do in the app.
 */
describe('notification settings from «Ещё» drive the scheduler (FT-125)', () => {
  const TELEGRAM_ID = 597843119;
  let db: TestDatabase;
  let server: TestServer;
  let userModule: UserModule;
  let transactionModule: TransactionModule;
  let notifications: NotificationModule;
  let clock: Date;
  let sent: string[];

  const sender: DailySummarySender = {
    send: async recipient => {
      sent.push(recipient.telegramId);
      return { chatId: recipient.telegramId, messageId: sent.length };
    },
  };

  beforeEach(async () => {
    db = await openMigratedDatabase();
    const ds = db.dataSource;
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    notifications = new NotificationModule(new SqliteNotificationLogRepository(ds), { transactionModule, userModule }, () => clock);
    server = await startTestServer({ '/settings': createSettingsRoutes(userModule) });
    sent = [];
  });

  afterEach(async () => {
    await server.close();
    await db.close();
  });

  /** The clock reads this time in Tashkent (UTC+5). */
  const at = (date: string, time: string) => {
    clock = new Date(`${date}T${time}:00+05:00`);
  };
  const tick = () => notifications.getDailySummary().tick(sender);
  const save = async (body: Record<string, unknown>) => {
    const res = await server.request('PATCH', '/api/settings', { devUser: TELEGRAM_ID, body });
    expect(res.status).toBe(200);
    return res.body.data;
  };

  /** The user opened the Mini App in September and has a record on 14 October. */
  async function userWithRecord(): Promise<string> {
    const read = await server.request('GET', '/api/settings', { devUser: TELEGRAM_ID });
    const owner: string = read.body.data.userId;
    await db.dataSource.query('UPDATE users SET created_at = ? WHERE id = ?', ['2026-09-01 04:00:00', owner]);
    const created = await transactionModule.getCreateTransactionUseCase().execute({
      userId: owner, amountMinor: 4_500_000, category: 'Кафе', type: 'expense', description: 'Обед', date: '2026-10-14', source: 'telegram',
    } as any);
    if (!created.success) throw created.error;
    return owner;
  }

  it('switched off in «Ещё»: no summary that evening; switched on again: the next one comes', async () => {
    const owner = await userWithRecord();
    expect(await save({ dailySummaryEnabled: false })).toMatchObject({ dailySummaryEnabled: false });

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([]);
    at('2026-10-14', '23:59');
    expect(await tick()).toEqual([]);

    await save({ dailySummaryEnabled: true });
    at('2026-10-15', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-15', outcome: 'asked' }]);
    expect(sent).toEqual([String(TELEGRAM_ID)]);
  });

  it('a new time from «Ещё» is the time the summary waits for, from that same evening', async () => {
    const owner = await userWithRecord();
    at('2026-10-14', '20:30');
    await save({ dailySummaryTime: '23:00' });

    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([]);
    at('2026-10-14', '23:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);
  });

  it('a time changed after the day\'s summary went out does not bring a second one', async () => {
    const owner = await userWithRecord();
    at('2026-10-14', '21:00');
    expect(await tick()).toEqual([{ userId: owner, day: '2026-10-14', outcome: 'sent' }]);

    at('2026-10-14', '21:10');
    await save({ dailySummaryTime: '22:00' });
    at('2026-10-14', '22:00');
    expect(await tick()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it('keeps the audit and the goal reminders the screen saves, for the reminders of FT-133', async () => {
    await userWithRecord();

    await save({ auditEnabled: false });
    await save({ auditTime: '19:00' });
    await save({ goalAlertsEnabled: false });

    const read = await server.request('GET', '/api/settings', { devUser: TELEGRAM_ID });
    expect(read.body.data).toMatchObject({ auditEnabled: false, auditTime: '19:00', goalAlertsEnabled: false, dailySummaryEnabled: true, dailySummaryTime: '21:00' });
  });
});

describe('the time chips of «Ещё» (FT-125)', () => {
  // A chip the server does not accept would be turned down, and the switch would flip back with «Не получилось»
  it('are the times PATCH /api/settings accepts, in the same order', () => {
    expect([...WEBAPP_DAILY_SUMMARY_TIMES]).toEqual([...DAILY_SUMMARY_TIMES]);
    expect([...WEBAPP_AUDIT_TIMES]).toEqual([...AUDIT_TIMES]);
  });
});
