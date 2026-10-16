import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { BASELINE_TABLES } from '../src/shared/infrastructure/database/migrations/1760600000000-Baseline';
import { findSchemaDrift, runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { createAccountRoutes } from '../src/modules/account/presentation/accountController';
import { EffectiveRateProvider } from '../src/modules/account/domain/fxRate';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { TransactionSemanticType } from '../src/modules/transaction/domain/transactionSemanticType';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';
import { recordsOn } from './helpers/records';

describe('accounts and balances (FT-101)', () => {
  describe('migration', () => {
    let dir: string;
    const open: DataSource[] = [];

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft101-'));
    });

    afterEach(async () => {
      for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('gives every user «Карта» and moves all history onto it, opening today', async () => {
      const file = path.join(dir, 'db.sqlite');
      const old = new DataSource({ type: 'sqlite', database: file });
      await old.initialize();
      for (const sql of BASELINE_TABLES) await old.query(sql);
      await old.query(`INSERT INTO users (id, telegram_id) VALUES ('user-c', '555')`);
      for (const [id, userId] of [['t1', 'user-a'], ['t2', 'user-a'], ['t3', 'user-b']]) {
        await old.query(
          `INSERT INTO transactions (id, amount, type, description, date, userId, category) VALUES (?, 1000, 'expense', 'x', '2026-10-01', ?, 'coffee')`,
          [id, userId]
        );
      }
      await old.destroy();

      const ds = createAppDataSource(file);
      open.push(ds);
      await ds.initialize();
      await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

      const accounts = await ds.query(`SELECT user_id, name, kind, currency, opening_balance_minor AS opening, opening_date FROM accounts ORDER BY user_id`);
      expect(accounts).toEqual(['user-a', 'user-b', 'user-c'].map(user => ({
        user_id: user, name: 'Карта', kind: 'card', currency: 'UZS', opening: 0, opening_date: todayDateOnly(),
      })));
      const moved = await ds.query(`SELECT t.id, a.user_id AS owner FROM transactions t JOIN accounts a ON a.id = t.account_id ORDER BY t.id`);
      expect(moved).toEqual([{ id: 't1', owner: 'user-a' }, { id: 't2', owner: 'user-a' }, { id: 't3', owner: 'user-b' }]);
      expect(await findSchemaDrift(ds)).toEqual([]);

      // Reverting FT-101 and everything after it leaves the records without accounts
      const applied = await ds.query('SELECT name FROM migrations ORDER BY id');
      for (let i = applied.length - 1; applied[i].name !== 'Accounts1761000000000'; i -= 1) {
        await ds.undoLastMigration({ transaction: 'each' });
      }
      await ds.undoLastMigration({ transaction: 'each' });
      expect(await ds.query(`SELECT COUNT(*) AS n FROM transactions`)).toEqual([{ n: 3 }]);
      expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'accounts'`)).toEqual([]);
    });
  });

  describe('with a migrated database', () => {
    let db: TestDatabase;
    let records: ReturnType<typeof recordsOn>;

    beforeEach(async () => {
      db = await openMigratedDatabase();
      records = recordsOn(db.dataSource);
    });

    afterEach(async () => {
      await db.close();
    });

    async function account(name: string, currency: 'UZS' | 'USD', openingBalanceMinor = 0, openingDate = '2026-10-01') {
      const created = await new AccountModule(records.accountRepository, undefined, records.moveRepository).getCreateAccountUseCase().execute({
        userId: 'user-1',
        body: { name, kind: name === 'Наличные' ? 'cash' : 'card', currency, openingBalanceMinor, openingDate },
      });
      if (!created.success) throw created.error;
      return created.data;
    }

    async function record(accountId: string, amount: number, extra: {
      type?: 'income' | 'expense'; date?: string; semanticType?: TransactionSemanticType; needsReview?: boolean;
    } = {}) {
      const created = await records.create.execute({
        userId: 'user-1', accountId, amount, type: extra.type ?? 'expense', category: 'Другое', description: 'x',
        date: extra.date ?? '2026-10-10', semanticType: extra.semanticType, needsReview: extra.needsReview,
      });
      if (!created.success) throw created.error;
      return created.data;
    }

    const balanceOf = async (id: string) =>
      (await records.book.summary('user-1')).accounts.find(item => item.id === id)!.balanceMinor;

    describe('balance', () => {
      it('is the opening balance plus income minus expenses from the opening date', async () => {
        const cash = await account('Наличные', 'UZS', toMinorSum(500000));
        await record(cash.id, 120000, { type: 'income' });
        await record(cash.id, 45000);

        expect(await balanceOf(cash.id)).toBe(toMinorSum(500000 + 120000 - 45000));
      });

      it('counts every record by its type, whatever the semanticType and even while it awaits review', async () => {
        const cash = await account('Наличные', 'UZS', toMinorSum(1000000));
        await record(cash.id, 100000, { semanticType: 'own_transfer' });
        await record(cash.id, 50000, { semanticType: 'cash_withdrawal' });
        await record(cash.id, 30000, { semanticType: 'debt' });
        await record(cash.id, 20000, { type: 'income', semanticType: 'reimbursement' });
        await record(cash.id, 10000, { needsReview: true });

        expect(await balanceOf(cash.id)).toBe(toMinorSum(1000000 - 100000 - 50000 - 30000 + 20000 - 10000));
      });

      it('leaves out archived records, records before the opening date and other accounts', async () => {
        const cash = await account('Наличные', 'UZS', toMinorSum(100000));
        const card = await account('Карта Humo', 'UZS');
        const archived = await record(cash.id, 40000);
        await records.repository.archive(archived);
        await record(cash.id, 70000, { date: '2026-09-30' });
        await record(card.id, 15000);

        expect(await balanceOf(cash.id)).toBe(toMinorSum(100000));
        expect(await balanceOf(card.id)).toBe(toMinorSum(-15000));
      });
    });

    describe('total', () => {
      const rate = (rateMinor: number): EffectiveRateProvider => ({
        effectiveUsdRate: async () => ({ rateMinor, source: 'cbu', date: '2026-10-16' }),
      });

      it('sums visible accounts in сум, dollars at the effective rate rounded to whole сум', async () => {
        const cash = await account('Наличные', 'UZS', toMinorSum(300000));
        await account('Доллары', 'USD', 5500); // 55.00 USD
        const hidden = await account('Старая карта', 'UZS', toMinorSum(999999));
        await new AccountModule(records.accountRepository, undefined, records.moveRepository).getUpdateAccountUseCase().execute({
          userId: 'user-1', accountId: hidden.id, body: { isHidden: true },
        });
        records.book.setRateProvider(rate(1285037)); // 12 850.37

        const summary = await records.book.summary('user-1');

        // «Карта» (0) + 300 000 + 55 × 12 850.37 = 706 770.35 → 706 770
        expect(summary.totalMinor).toBe(toMinorSum(300000 + 706770));
        expect(summary.rate).toEqual({ rateMinor: 1285037, source: 'cbu', date: '2026-10-16' });
        expect(summary.missingRate).toBe(false);
        expect(summary.accounts.map(item => item.name)).toEqual(['Карта', 'Наличные', 'Доллары', 'Старая карта']);
        expect(cash.openingDate).toBe('2026-10-01');
      });

      it('says when dollars could not be counted for lack of a rate', async () => {
        await account('Доллары', 'USD', 5500);

        const summary = await records.book.summary('user-1');
        expect(summary).toMatchObject({ totalMinor: 0, rate: null, missingRate: true });
      });
    });

    describe('the account of a new record', () => {
      it('is the first visible account, the default from settings, or the one picked; never a hidden one', async () => {
        const [card] = await records.book.listForUser('user-1');
        const cash = await account('Наличные', 'UZS');

        expect((await records.book.resolveForRecord({ userId: 'user-1' })).success && card.name).toBe('Карта');

        records.book.setDefaultAccountSource(async () => cash.id);
        const byDefault = await records.book.resolveForRecord({ userId: 'user-1' });
        expect(byDefault.success && byDefault.data.name).toBe('Наличные');

        await records.accountRepository.update(cash.id, { isHidden: true });
        const fallback = await records.book.resolveForRecord({ userId: 'user-1' });
        expect(fallback.success && fallback.data.name).toBe('Карта');

        const hidden = await records.book.resolveForRecord({ userId: 'user-1', accountId: cash.id });
        expect(!hidden.success && (hidden.error as { statusCode?: number }).statusCode).toBe(400);

        const [theirs] = await records.book.listForUser('user-2');
        const foreign = await records.book.resolveForRecord({ userId: 'user-1', accountId: theirs.id });
        expect(!foreign.success && (foreign.error as { statusCode?: number }).statusCode).toBe(404);
      });

      it('moves with an edit to another visible account', async () => {
        const [card] = await records.book.listForUser('user-1');
        const cash = await account('Наличные', 'UZS');
        const id = await record(card.id, 25000);

        const moved = await records.update.execute({ id, accountId: cash.id });

        expect(moved.success && moved.data.accountId).toBe(cash.id);
        expect(await balanceOf(card.id)).toBe(0);
        expect(await balanceOf(cash.id)).toBe(toMinorSum(-25000));
      });
    });

    describe('/api/accounts and the default account setting', () => {
      let server: TestServer;

      beforeEach(async () => {
        const accountModule = new AccountModule(new SqliteAccountRepository(db.dataSource), undefined, records.moveRepository);
        const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
        accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));
        userModule.setAccountCheck((userId, accountId) => accountModule.getBook().isVisibleAccount(userId, accountId));
        server = await startTestServer({
          '/accounts': createAccountRoutes(accountModule, userModule),
          '/settings': createSettingsRoutes(userModule),
        });
      });

      afterEach(async () => {
        await server.close();
      });

      const as = (method: string, url: string, body?: unknown) => server.request(method, url, { devUser: 4242, body });

      it('lists «Карта» for a new user with the total', async () => {
        const res = await as('GET', '/api/accounts');
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
          accounts: [{ name: 'Карта', kind: 'card', currency: 'UZS', balanceMinor: 0, isHidden: false }],
          totalMinor: 0,
          rate: null,
          missingRate: false,
        });
        expect((await server.request('GET', '/api/accounts')).status).toBe(401);
      });

      it('creates an account and checks its fields', async () => {
        const created = await as('POST', '/api/accounts', { name: 'Доллары', kind: 'cash', currency: 'USD', openingBalanceMinor: 30000 });
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({ name: 'Доллары', currency: 'USD', openingBalanceMinor: 30000, openingDate: todayDateOnly() });

        expect((await as('POST', '/api/accounts', { name: 'ДОЛЛАРЫ', kind: 'cash', currency: 'USD' })).status).toBe(409);
        expect((await as('POST', '/api/accounts', { name: '', kind: 'cash', currency: 'UZS' })).status).toBe(400);
        expect((await as('POST', '/api/accounts', { name: 'Евро', kind: 'cash', currency: 'EUR' })).status).toBe(400);
        expect((await as('POST', '/api/accounts', { name: 'Вклад', kind: 'deposit', currency: 'UZS' })).status).toBe(400);
        expect((await as('POST', '/api/accounts', { name: 'Копилка', kind: 'cash', currency: 'UZS', openingBalanceMinor: 1.5 })).status).toBe(400);
        expect((await as('POST', '/api/accounts', { name: 'Копилка', kind: 'cash', currency: 'UZS', openingDate: '2026-02-30' })).status).toBe(400);
      });

      it('renames and hides, never the last visible account, and changes currency only without operations', async () => {
        const card = (await as('GET', '/api/accounts')).body.data.accounts[0];
        expect((await as('PATCH', `/api/accounts/${card.id}`, { isHidden: true })).status).toBe(400);

        const cash = (await as('POST', '/api/accounts', { name: 'Наличные', kind: 'cash', currency: 'UZS' })).body.data;
        expect((await as('PATCH', `/api/accounts/${cash.id}`, { currency: 'USD' })).body.data.currency).toBe('USD');
        expect((await as('PATCH', `/api/accounts/${card.id}`, { name: 'Uzcard', isHidden: true })).body.data).toMatchObject({ name: 'Uzcard', isHidden: true });

        // A hidden account leaves the total
        const summary = (await as('GET', '/api/accounts')).body.data;
        expect(summary.accounts.find((a: { id: string }) => a.id === card.id).isHidden).toBe(true);

        expect((await as('PATCH', `/api/accounts/${cash.id}`, { openingBalanceMinor: 5 })).status).toBe(400);
        expect((await server.request('PATCH', `/api/accounts/${cash.id}`, { devUser: 9999, body: { name: 'Чужой' } })).status).toBe(404);
      });

      it('refuses a currency change once the account has records', async () => {
        const card = (await as('GET', '/api/accounts')).body.data.accounts[0];
        const userId = (await as('GET', '/api/settings')).body.data.userId;
        const created = await records.create.execute({
          userId, accountId: card.id, amount: 1000, type: 'expense', category: 'Кафе', description: 'x', date: '2026-10-16',
        });
        expect(created.success).toBe(true);

        const res = await as('PATCH', `/api/accounts/${card.id}`, { currency: 'USD' });
        expect(res.status).toBe(409);
        expect((await as('PATCH', `/api/accounts/${card.id}`, { currency: 'UZS' })).status).toBe(200);
      });

      it('accepts only a visible account of the user as the default', async () => {
        const card = (await as('GET', '/api/accounts')).body.data.accounts[0];
        const cash = (await as('POST', '/api/accounts', { name: 'Наличные', kind: 'cash', currency: 'UZS' })).body.data;

        expect((await as('PATCH', '/api/settings', { defaultAccountId: cash.id })).body.data.defaultAccountId).toBe(cash.id);
        await as('PATCH', `/api/accounts/${card.id}`, { isHidden: true });
        expect((await as('PATCH', '/api/settings', { defaultAccountId: card.id })).status).toBe(400);
        expect((await as('PATCH', '/api/settings', { defaultAccountId: 'nope' })).status).toBe(400);
        expect((await as('PATCH', '/api/settings', { defaultAccountId: null })).body.data.defaultAccountId).toBeNull();
      });
    });
  });
});

/** Whole сум → minor units, for readable expectations. */
function toMinorSum(sum: number): number {
  return sum * 100;
}
