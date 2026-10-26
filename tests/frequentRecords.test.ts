import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { GetFrequentRecordsUseCase } from '../src/modules/transaction/application/getFrequentRecords';
import { FREQUENT_RECORDS_RULE, pickFrequentRecords } from '../src/modules/transaction/domain/frequentRecords';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

const unused = { execute: jest.fn() } as never;

/**
 * FT-114: the quick chips over the composer write a frequent expense in one tap. Which expenses are
 * frequent is one rule — a constant: up to 6 of the most frequent «category + note + amount» of the last
 * 30 days, each repeated at least 3 times.
 */
describe('frequent expenses for the quick chips (FT-114)', () => {
  it('is the rule of the task: the last 30 days, from 3 repeats, up to 6', () => {
    expect(FREQUENT_RECORDS_RULE).toEqual({ days: 30, minRepeats: 3, limit: 6 });
  });

  describe('the rule', () => {
    let seq = 0;
    const record = (overrides: Partial<Transaction>): Transaction => {
      seq += 1;
      return {
        id: `r${seq}`,
        userId: 'user-1',
        type: 'expense',
        semanticType: 'expense',
        category: 'Кафе',
        categoryId: 'cafe',
        accountId: 'card',
        currency: 'UZS',
        amount: 25000,
        amountMinor: 2_500_000,
        description: 'Кофе',
        date: '2026-10-10',
        createdAt: `2026-10-10T08:00:${String(seq).padStart(2, '0')}.000Z`,
        ...overrides,
      };
    };
    const times = (n: number, overrides: Partial<Transaction>) => Array.from({ length: n }, () => record(overrides));

    it('takes a «category + note + amount» repeated at least 3 times, and not one repeated twice', () => {
      const result = pickFrequentRecords([
        ...times(3, { description: 'Кофе' }),
        ...times(2, { description: 'Такси', categoryId: 'transport', amountMinor: 1_800_000 }),
      ]);

      expect(result).toEqual([
        { categoryId: 'cafe', note: 'Кофе', amountMinor: 2_500_000, currency: 'UZS', accountId: 'card', count: 3 },
      ]);
    });

    it('counts the same note as one regardless of case, «ё» and spaces, and shows it as last written', () => {
      const result = pickFrequentRecords([
        record({ description: 'кофе ', date: '2026-10-01' }),
        record({ description: 'КОФЕ', date: '2026-10-02' }),
        record({ description: '  Кофе', date: '2026-10-03' }),
        ...times(3, { description: 'Ёлка', categoryId: 'shopping', amountMinor: 9_000_000, date: '2026-10-04' }),
        record({ description: 'елка', categoryId: 'shopping', amountMinor: 9_000_000, date: '2026-10-05' }),
      ]);

      expect(result.map(r => [r.note, r.count])).toEqual([['елка', 4], ['Кофе', 3]]);
    });

    it('keeps another amount, category or currency apart', () => {
      const result = pickFrequentRecords([
        ...times(3, { amountMinor: 2_500_000 }),
        ...times(3, { amountMinor: 3_000_000 }),
        ...times(3, { categoryId: 'groceries' }),
        ...times(3, { currency: 'USD', amountMinor: 250, accountId: 'usd' }),
      ]);

      expect(result).toHaveLength(4);
      expect(result.map(r => [r.categoryId, r.amountMinor, r.currency])).toEqual(expect.arrayContaining([
        ['cafe', 2_500_000, 'UZS'], ['cafe', 3_000_000, 'UZS'], ['groceries', 2_500_000, 'UZS'], ['cafe', 250, 'USD'],
      ]));
    });

    it('orders by how often, the more recent first among equals, and gives at most 6', () => {
      const result = pickFrequentRecords([
        ...times(3, { description: 'a', date: '2026-10-01' }),
        ...times(5, { description: 'b' }),
        ...times(3, { description: 'c', date: '2026-10-09' }),
        ...times(4, { description: 'd' }),
        ...times(3, { description: 'e', date: '2026-10-05' }),
        ...times(3, { description: 'f', date: '2026-10-02' }),
        ...times(3, { description: 'g', date: '2026-10-08' }),
      ]);

      expect(result.map(r => r.note)).toEqual(['b', 'd', 'c', 'g', 'e', 'f']);
    });

    it('writes to the account of the latest of them', () => {
      const result = pickFrequentRecords([
        record({ accountId: 'card', date: '2026-10-01' }),
        record({ accountId: 'cash', date: '2026-10-07' }),
        record({ accountId: 'card', date: '2026-10-03' }),
      ]);

      expect(result[0].accountId).toBe('cash');
    });

    it('counts only real expenses: no income, no own money moving, nothing awaiting review', () => {
      const result = pickFrequentRecords([
        ...times(3, { type: 'income', semanticType: 'income', categoryId: 'salary' }),
        ...times(3, { semanticType: 'own_transfer' }),
        ...times(3, { needsReview: true }),
      ]);

      expect(result).toEqual([]);
    });
  });

  describe('the records it reads', () => {
    let db: TestDatabase;
    let records: ReturnType<typeof recordsOn>;
    let frequent: GetFrequentRecordsUseCase;
    const today = '2026-10-19';

    beforeEach(async () => {
      db = await openMigratedDatabase();
      records = recordsOn(db.dataSource);
      frequent = new GetFrequentRecordsUseCase(records.repository);
    });

    afterEach(async () => {
      await db.close();
    });

    async function record(overrides: Partial<Transaction>, userId = 'user-1') {
      const created = await records.create.execute({
        userId, amount: 25000, type: 'expense', category: 'Кафе', description: 'Кофе', date: today, ...overrides,
      });
      if (!created.success) throw created.error;
      return created.data;
    }

    it('reads the user\'s own records of the last 30 days, without deleted ones', async () => {
      const first = await record({ date: '2026-09-20' }); // the first of the 30 days
      await record({ date: '2026-10-01' });
      await record({ date: today });
      await record({ date: '2026-09-19' }); // 31 days ago
      const deleted = await record({ date: today });
      await records.repository.delete(deleted);
      await record({}, 'someone-else');

      const result = await frequent.execute({ userId: 'user-1', today });
      if (!result.success) throw result.error;

      expect(result.data.items).toEqual([
        expect.objectContaining({ note: 'Кофе', amountMinor: 2_500_000, currency: 'UZS', count: 3 }),
      ]);
      // The user's own «Кафе», by id: the chip writes it with `categoryId`
      expect(result.data.items[0].categoryId).toBe((await records.repository.findById(first))!.categoryId);
    });

    describe('GET /api/transactions/frequent', () => {
      let server: TestServer;

      beforeEach(async () => {
        const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
        server = await startTestServer({
          '/transactions': createTransactionRouter(
            records.create, unused, unused, unused, unused, unused, records.update, unused, unused, unused, unused, unused,
            unused, undefined, userModule, undefined, undefined, frequent
          ),
          '/settings': createSettingsRoutes(userModule),
        });
      });

      afterEach(async () => {
        await server.close();
      });

      it('answers the current user\'s frequent expenses and no one else\'s', async () => {
        const userId = (await server.request('GET', '/api/settings', { devUser: 4242 })).body.data.userId;
        const now = new Date().toISOString().slice(0, 10);
        for (let i = 0; i < 3; i += 1) await record({ userId, amount: 18000, category: 'Транспорт', description: 'Такси', date: now });
        for (let i = 0; i < 3; i += 1) await record({ amount: 99000, description: 'Чужое', date: now }, 'someone-else');

        const res = await server.request('GET', '/api/transactions/frequent', { devUser: 4242 });

        expect(res.status).toBe(200);
        expect(res.body.data.items).toEqual([
          expect.objectContaining({ note: 'Такси', amountMinor: 1_800_000, currency: 'UZS', count: 3, categoryId: expect.any(String) }),
        ]);
        expect((await server.request('GET', '/api/transactions/frequent')).status).toBe(401);
      });
    });
  });
});
