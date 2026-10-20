import 'reflect-metadata';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { createAccountRoutes } from '../src/modules/account/presentation/accountController';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { CATEGORY_PRESETS } from '../src/modules/category/domain/categoryPresets';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { createCategoryRoutes } from '../src/modules/category/presentation/categoryController';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';

/**
 * FT-140: the first requests of a new user come at once (Home reads several routes together). The user
 * row, and the settings, categories and accounts made for the user, must each be created once, and every
 * request must answer without an error.
 */
describe('a new user under parallel first requests (FT-140)', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openMigratedDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  const count = async (sql: string, params: unknown[] = []) => Number((await db.dataSource.query(sql, params))[0].n);

  it('20 parallel getOrCreate with one telegram id give one row and 20 successes', async () => {
    const repository = new SqliteUserRepository(db.dataSource);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => repository.getOrCreate({ telegramId: '777000001', firstName: 'Новый' }))
    );

    const failed = results.filter(result => result.status === 'rejected');
    expect(failed).toEqual([]);
    const ids = new Set(results.map(result => (result as PromiseFulfilledResult<{ id: string }>).value.id));
    expect(ids.size).toBe(1);
    expect(await count(`SELECT COUNT(*) AS n FROM users WHERE telegram_id = '777000001'`)).toBe(1);

    const [row] = await db.dataSource.query(`SELECT id, first_name, language_code FROM users WHERE telegram_id = '777000001'`);
    expect(row).toEqual({ id: [...ids][0], first_name: 'Новый', language_code: 'ru' });
    expect(await repository.findByTelegramId('777000001')).toMatchObject({ id: [...ids][0], firstName: 'Новый' });
  });

  it('keeps an existing user and only touches when they were last seen', async () => {
    const repository = new SqliteUserRepository(db.dataSource);
    const first = await repository.getOrCreate({ telegramId: '777000002', firstName: 'Был' });

    const again = await repository.getOrCreate({ telegramId: '777000002', firstName: 'Другое имя' });

    expect(again.id).toBe(first.id);
    expect(again.firstName).toBe('Был');
    expect(await count(`SELECT COUNT(*) AS n FROM users`)).toBe(1);
    const [{ last_seen_at: lastSeenAt }] = await db.dataSource.query(`SELECT last_seen_at FROM users WHERE id = ?`, [first.id]);
    expect(lastSeenAt).not.toBeNull();
  });

  describe('through the routes', () => {
    let server: TestServer;

    beforeEach(async () => {
      const userModule = new UserModule(
        new SqliteUserRepository(db.dataSource),
        new SqliteUserSettingsRepository(db.dataSource)
      );
      const accountModule = new AccountModule(
        new SqliteAccountRepository(db.dataSource),
        undefined,
        new SqliteAccountMoveRepository(db.dataSource)
      );
      accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));
      server = await startTestServer({
        '/settings': createSettingsRoutes(userModule),
        '/categories': createCategoryRoutes(new CategoryModule(new SqliteCategoryRepository(db.dataSource)), userModule),
        '/accounts': createAccountRoutes(accountModule, userModule),
      });
    });

    afterEach(async () => {
      await server.close();
    });

    it('creates the user, settings, categories and accounts once and answers every request', async () => {
      const devUser = 777000003;
      const first: Array<[string, string, unknown?]> = [
        ['GET', '/api/settings'],
        ['GET', '/api/accounts'],
        ['GET', '/api/categories'],
        ['PATCH', '/api/settings', { theme: 'dark' }],
      ];

      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, i) => {
          const [method, url, body] = first[i % first.length];
          return server.request(method, url, { devUser, body });
        })
      );

      expect(responses.map(res => res.status)).toEqual(Array(20).fill(200));
      const [user] = await db.dataSource.query(`SELECT id FROM users WHERE telegram_id = ?`, [String(devUser)]);
      expect(await count(`SELECT COUNT(*) AS n FROM users`)).toBe(1);
      expect(await count(`SELECT COUNT(*) AS n FROM user_settings WHERE user_id = ?`, [user.id])).toBe(1);
      expect(await count(`SELECT COUNT(*) AS n FROM categories WHERE user_id = ?`, [user.id])).toBe(CATEGORY_PRESETS.length);
      expect(await db.dataSource.query(`SELECT name FROM accounts WHERE user_id = ?`, [user.id])).toEqual([{ name: 'Карта' }]);

      // Every answer belongs to that one user
      const settings = responses.filter((_, i) => first[i % first.length][1] === '/api/settings');
      expect(new Set(settings.map(res => res.body.data.userId))).toEqual(new Set([user.id]));
      expect((await server.request('GET', '/api/settings', { devUser })).body.data.theme).toBe('dark');
    });
  });
});
