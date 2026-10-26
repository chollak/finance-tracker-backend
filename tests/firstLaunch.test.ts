import 'reflect-metadata';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { createAccountRoutes } from '../src/modules/account/presentation/accountController';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';
import { recordsOn } from './helpers/records';

/**
 * FT-109: «Сколько у вас сейчас денег?» — the amounts become opening balances dated today, the first
 * launch is marked done, and the history before today stays in history and analytics but not in the
 * balance.
 */
describe('first launch with opening balances (FT-109)', () => {
  let db: TestDatabase;
  let server: TestServer;
  let records: ReturnType<typeof recordsOn>;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    const accountModule = new AccountModule(new SqliteAccountRepository(db.dataSource), undefined, records.moveRepository);
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));
    server = await startTestServer({
      '/accounts': createAccountRoutes(accountModule, userModule),
      '/settings': createSettingsRoutes(userModule),
    });
  });

  afterEach(async () => {
    await server.close();
    await db.close();
  });

  const as = (method: string, url: string, body?: unknown) => server.request(method, url, { devUser: 4242, body });
  const start = (body: unknown) => as('POST', '/api/accounts/opening-balances', body);
  const daysAgo = (days: number) => todayDateOnly(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const byName = (summary: { accounts: Array<{ name: string }> }) =>
    Object.fromEntries(summary.accounts.map(account => [account.name, account])) as Record<string, any>;

  it('turns the three amounts into opening balances dated today and marks the first launch done', async () => {
    expect((await as('GET', '/api/settings')).body.data.onboardedAt).toBeNull();

    const res = await start({ cashMinor: 1_250_000_00, cardMinor: 3_180_000_00, usdMinor: 420_00 });

    expect(res.status).toBe(200);
    const accounts = byName((await as('GET', '/api/accounts')).body.data);
    expect(Object.keys(accounts).sort()).toEqual(['Доллары', 'Карта', 'Наличные']);
    expect(accounts['Наличные']).toMatchObject({
      kind: 'cash', currency: 'UZS', openingBalanceMinor: 1_250_000_00, openingDate: todayDateOnly(), balanceMinor: 1_250_000_00, isHidden: false,
    });
    expect(accounts['Карта']).toMatchObject({
      kind: 'card', currency: 'UZS', openingBalanceMinor: 3_180_000_00, openingDate: todayDateOnly(), balanceMinor: 3_180_000_00,
    });
    expect(accounts['Доллары']).toMatchObject({
      kind: 'cash', currency: 'USD', openingBalanceMinor: 420_00, openingDate: todayDateOnly(), balanceMinor: 420_00,
    });

    const onboardedAt = (await as('GET', '/api/settings')).body.data.onboardedAt;
    expect(typeof onboardedAt).toBe('string');
    expect(Number.isNaN(Date.parse(onboardedAt))).toBe(false);
    expect(res.body.data.onboardedAt).toBe(onboardedAt);
    expect(res.body.data.accounts).toHaveLength(3);
  });

  it('leaves the history before today out of the balance, but in history and analytics', async () => {
    // A migrated user: «Карта» opened long ago carries the whole history
    const [card] = (await as('GET', '/api/accounts')).body.data.accounts;
    const userId = (await as('GET', '/api/settings')).body.data.userId;
    await db.dataSource.query(`UPDATE accounts SET opening_date = ? WHERE id = ?`, [daysAgo(60), card.id]);
    for (const [amount, date, type] of [[45000, daysAgo(3), 'expense'], [120000, daysAgo(10), 'expense'], [900000, daysAgo(20), 'income']] as const) {
      const created = await records.create.execute({
        userId, accountId: card.id, amount, type, category: 'Другое', description: 'x', date,
      });
      expect(created.success).toBe(true);
    }
    expect(byName((await as('GET', '/api/accounts')).body.data)['Карта'].balanceMinor).toBe((900000 - 45000 - 120000) * 100);

    expect((await start({ cardMinor: 2_000_000_00 })).status).toBe(200);

    const accounts = byName((await as('GET', '/api/accounts')).body.data);
    expect(accounts['Карта']).toMatchObject({ id: card.id, openingDate: todayDateOnly(), balanceMinor: 2_000_000_00 });
    // The records are untouched: still in history and in analytics
    expect(await records.repository.findByUserId(userId)).toHaveLength(3);
    const analytics = await new AnalyticsService(records.repository).getAnalyticsSummary(userId);
    expect(analytics).toMatchObject({ totalIncome: 900000, totalExpense: 165000 });

    // A record made from today on counts
    await records.create.execute({ userId, accountId: card.id, amount: 25000, type: 'expense', category: 'Другое', description: 'x', date: todayDateOnly() });
    expect(byName((await as('GET', '/api/accounts')).body.data)['Карта'].balanceMinor).toBe((2_000_000 - 25_000) * 100);
  });

  it('starts from zero: all three accounts open today at 0', async () => {
    const res = await start({});

    expect(res.status).toBe(200);
    const summary = (await as('GET', '/api/accounts')).body.data;
    expect(summary.totalMinor).toBe(0);
    for (const account of summary.accounts) {
      expect(account).toMatchObject({ openingBalanceMinor: 0, openingDate: todayDateOnly(), balanceMinor: 0 });
    }
    expect(summary.accounts).toHaveLength(3);
    expect((await as('GET', '/api/settings')).body.data.onboardedAt).not.toBeNull();
  });

  it('uses accounts the user already has instead of adding twins', async () => {
    const cash = (await as('POST', '/api/accounts', { name: 'Наличные', kind: 'cash', currency: 'UZS' })).body.data;

    expect((await start({ cashMinor: 300_000_00, usdMinor: 50_00 })).status).toBe(200);

    const accounts = (await as('GET', '/api/accounts')).body.data.accounts;
    expect(accounts.map((account: { name: string }) => account.name).sort()).toEqual(['Доллары', 'Карта', 'Наличные']);
    expect(byName({ accounts })['Наличные']).toMatchObject({ id: cash.id, openingBalanceMinor: 300_000_00 });
  });

  const names = async () =>
    (await as('GET', '/api/accounts')).body.data.accounts.map((account: { name: string }) => account.name);

  it('puts the accounts in the order of the boards: Наличные, Карта, Доллары (FT-137)', async () => {
    // A new user: «Карта» is created on the first read, before the first launch
    expect(await names()).toEqual(['Карта']);

    expect((await start({ cashMinor: 100_00 })).status).toBe(200);

    expect(await names()).toEqual(['Наличные', 'Карта', 'Доллары']);
    const res = await start({}); // the order does not depend on a repeated request either
    expect(res.status).toBe(409);
    expect(await names()).toEqual(['Наличные', 'Карта', 'Доллары']);
  });

  it('puts a migrated user\'s «Карта» with its history between Наличные and Доллары', async () => {
    const [card] = (await as('GET', '/api/accounts')).body.data.accounts;
    await db.dataSource.query(`UPDATE accounts SET opening_date = ?, sort_order = 10 WHERE id = ?`, [daysAgo(60), card.id]);

    const res = await start({ cardMinor: 2_000_000_00 });

    expect(res.body.data.accounts.map((account: { name: string }) => account.name)).toEqual(['Наличные', 'Карта', 'Доллары']);
    expect(await names()).toEqual(['Наличные', 'Карта', 'Доллары']);
    expect((await as('GET', '/api/accounts')).body.data.accounts[1].id).toBe(card.id);
  });

  it('keeps other accounts after the three, in their own order', async () => {
    // Neither is taken by a row of the screen: «Карта» is named, and neither is a cash account
    await as('POST', '/api/accounts', { name: 'Humo', kind: 'card', currency: 'UZS' });
    await as('POST', '/api/accounts', { name: 'Visa', kind: 'card', currency: 'USD' });

    expect((await start({})).status).toBe(200);

    expect(await names()).toEqual(['Наличные', 'Карта', 'Доллары', 'Humo', 'Visa']);
  });

  it('happens once: a second first launch is refused and changes nothing', async () => {
    expect((await start({ cashMinor: 100_00 })).status).toBe(200);

    const again = await start({ cashMinor: 999_00 });

    expect(again.status).toBe(409);
    expect(byName((await as('GET', '/api/accounts')).body.data)['Наличные'].openingBalanceMinor).toBe(100_00);
  });

  it('creates each account once even when the button is pressed twice at once', async () => {
    await as('GET', '/api/settings'); // the screen is open: the user exists
    const amounts = { cashMinor: 100_00, usdMinor: 5_00 };
    const results = await Promise.all([start(amounts), start(amounts)]);

    expect(results.map(res => res.status)).toContain(200);

    const accounts = (await as('GET', '/api/accounts')).body.data.accounts;
    expect(accounts.map((account: { name: string }) => account.name).sort()).toEqual(['Доллары', 'Карта', 'Наличные']);
  });

  it('checks the amounts and keeps the first launch pending when they are wrong', async () => {
    for (const body of [
      { cashMinor: -100 },
      { cardMinor: 12.5 },
      { usdMinor: '420' },
      { cashMinor: 100, euroMinor: 100 },
      [100, 200],
    ]) {
      const res = await start(body);
      expect(res.status).toBe(400);
    }
    expect((await as('GET', '/api/settings')).body.data.onboardedAt).toBeNull();
    expect((await as('GET', '/api/accounts')).body.data.accounts.map((a: { name: string }) => a.name)).toEqual(['Карта']);
  });

  it('takes the user only from authentication', async () => {
    expect((await server.request('POST', '/api/accounts/opening-balances', { body: { cashMinor: 100 } })).status).toBe(401);
  });
});
