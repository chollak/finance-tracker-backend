import 'reflect-metadata';
import { SqliteUsageLimitRepository } from '../src/modules/subscription/infrastructure/SqliteUsageLimitRepository';
import { IncrementUsageUseCase } from '../src/modules/subscription/application/incrementUsage';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';

/**
 * FT-141: rows a user's first writes create, written at once (FT-140's rule: `INSERT OR IGNORE` and read
 * back, never a failing insert), and settings writes that change only what they were given.
 */
describe('first writes of a user (FT-141)', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openMigratedDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  const count = async (sql: string, params: unknown[] = []) => Number((await db.dataSource.query(sql, params))[0].n);

  describe('usage_limits', () => {
    it('20 parallel first records create one row and count all 20, without a key error', async () => {
      const increment = new IncrementUsageUseCase(new SqliteUsageLimitRepository(db.dataSource));

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () => increment.execute({ userId: 'new-user', limitType: 'transactions' }))
      );

      expect(results.filter(result => result.status === 'rejected')).toEqual([]);
      expect(await count(`SELECT COUNT(*) AS n FROM usage_limits WHERE user_id = 'new-user'`)).toBe(1);
      const [row] = await db.dataSource.query(`SELECT transactions_count, voice_inputs_count FROM usage_limits`);
      expect(row).toEqual({ transactions_count: 20, voice_inputs_count: 0 });
    });

    it('parallel first reads of the period get the one row', async () => {
      const repository = new SqliteUsageLimitRepository(db.dataSource);

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () => repository.findOrCreateForCurrentPeriod('new-user'))
      );

      expect(results.filter(result => result.status === 'rejected')).toEqual([]);
      const ids = new Set(results.map(result => (result as PromiseFulfilledResult<{ id: string }>).value.id));
      expect(ids.size).toBe(1);
      expect(await count(`SELECT COUNT(*) AS n FROM usage_limits`)).toBe(1);
    });

    it('keeps an existing row and its counters', async () => {
      const repository = new SqliteUsageLimitRepository(db.dataSource);
      await repository.incrementCounter('user-1', 'voice_inputs');

      const again = await repository.findOrCreateForCurrentPeriod('user-1');

      expect(again.voiceInputsCount).toBe(1);
      expect(await count(`SELECT COUNT(*) AS n FROM usage_limits`)).toBe(1);
    });
  });

  describe('settings writes', () => {
    let userModule: UserModule;
    let server: TestServer;

    beforeEach(async () => {
      userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
      server = await startTestServer({ '/settings': createSettingsRoutes(userModule) });
    });

    afterEach(async () => {
      await server.close();
    });

    const settingsRow = async (devUser: number) => {
      const [user] = await db.dataSource.query(`SELECT id FROM users WHERE telegram_id = ?`, [String(devUser)]);
      const [row] = await db.dataSource.query(`SELECT * FROM user_settings WHERE user_id = ?`, [user.id]);
      return row;
    };

    it('three parallel PATCH of different fields keep all three', async () => {
      const devUser = 777100001;
      // The user exists already: only the settings row is new
      await server.request('GET', '/api/settings', { devUser });

      const responses = await Promise.all([
        server.request('PATCH', '/api/settings', { devUser, body: { theme: 'dark' } }),
        server.request('PATCH', '/api/settings', { devUser, body: { displayCurrency: 'USD' } }),
        server.request('PATCH', '/api/settings', { devUser, body: { auditTime: '19:00' } }),
      ]);

      expect(responses.map(res => res.status)).toEqual([200, 200, 200]);
      const read = await server.request('GET', '/api/settings', { devUser });
      expect(read.body.data).toMatchObject({ theme: 'dark', displayCurrency: 'USD', auditTime: '19:00' });
    });

    it('three parallel PATCH on an existing row keep all three', async () => {
      const devUser = 777100002;
      await server.request('PATCH', '/api/settings', { devUser, body: { dailySummaryTime: '22:00' } });

      await Promise.all([
        server.request('PATCH', '/api/settings', { devUser, body: { goalAlertsEnabled: false } }),
        server.request('PATCH', '/api/settings', { devUser, body: { receiptTipsSeen: 2 } }),
        server.request('PATCH', '/api/settings', { devUser, body: { auditEnabled: false } }),
      ]);

      const read = await server.request('GET', '/api/settings', { devUser });
      expect(read.body.data).toMatchObject({
        dailySummaryTime: '22:00',
        goalAlertsEnabled: false,
        receiptTipsSeen: 2,
        auditEnabled: false,
      });
    });

    it('a write changes only the given fields and updated_at', async () => {
      const devUser = 777100003;
      await server.request('PATCH', '/api/settings', { devUser, body: { theme: 'light' } });
      const { user_id: userId } = await settingsRow(devUser);
      // Another writer changes a field after this one; an old moment makes the new one visible
      await db.dataSource.query(
        `UPDATE user_settings SET audit_time = '12:00', updated_at = '2026-01-01 00:00:00' WHERE user_id = ?`,
        [userId]
      );
      const before = await settingsRow(devUser);

      const res = await server.request('PATCH', '/api/settings', { devUser, body: { theme: 'dark' } });

      expect(res.status).toBe(200);
      const after = await settingsRow(devUser);
      const changed = Object.keys(after).filter(column => after[column] !== before[column]);
      expect(changed.sort()).toEqual(['theme', 'updated_at']);
      expect(after).toMatchObject({ theme: 'dark', audit_time: '12:00', created_at: before.created_at });
      expect(res.body.data).toMatchObject({ theme: 'dark', auditTime: '12:00' });
    });

    it('the own rate and the first launch change only their own fields', async () => {
      const devUser = 777100004;
      await server.request('PATCH', '/api/settings', { devUser, body: { theme: 'dark' } });
      const { user_id: userId } = await settingsRow(devUser);

      await Promise.all([
        userModule.setOwnUsdRate(userId, { rateMinor: 1_280_000, since: '2026-10-20' }),
        userModule.markOnboarded(userId, '2026-10-20T09:00:00.000Z'),
        server.request('PATCH', '/api/settings', { devUser, body: { displayCurrency: 'USD' } }),
      ]);

      const read = await server.request('GET', '/api/settings', { devUser });
      expect(read.body.data).toMatchObject({
        theme: 'dark',
        displayCurrency: 'USD',
        fxOwnRateMinor: 1_280_000,
        fxOwnSince: '2026-10-20',
        onboardedAt: '2026-10-20T09:00:00.000Z',
      });

      await userModule.setOwnUsdRate(userId, null);
      expect((await server.request('GET', '/api/settings', { devUser })).body.data).toMatchObject({
        fxOwnRateMinor: null,
        fxOwnSince: null,
        displayCurrency: 'USD',
        onboardedAt: '2026-10-20T09:00:00.000Z',
      });
    });
  });
});
