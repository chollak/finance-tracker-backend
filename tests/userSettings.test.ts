import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { validateSettingsPatch } from '../src/modules/user/application/userSettingsUseCases';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';

describe('user settings (FT-098)', () => {
  describe('validation', () => {
    const ok = (patch: unknown) => validateSettingsPatch(patch).success;

    it('accepts the three themes and nothing else', () => {
      expect(ok({ theme: 'telegram' })).toBe(true);
      expect(ok({ theme: 'light' })).toBe(true);
      expect(ok({ theme: 'dark' })).toBe(true);
      expect(ok({ theme: 'sepia' })).toBe(false);
    });

    it('accepts summary times 20:00–23:00 only, on the hour', () => {
      for (const time of ['20:00', '21:00', '22:00', '23:00']) expect(ok({ dailySummaryTime: time })).toBe(true);
      expect(ok({ dailySummaryTime: '19:00' })).toBe(false);
      expect(ok({ dailySummaryTime: '21:30' })).toBe(false);
      expect(ok({ dailySummaryTime: 21 })).toBe(false);
    });

    it('accepts audit times 09, 10, 12 and 19 only', () => {
      for (const time of ['09:00', '10:00', '12:00', '19:00']) expect(ok({ auditTime: time })).toBe(true);
      expect(ok({ auditTime: '11:00' })).toBe(false);
    });

    it('checks flags, dates and counters', () => {
      expect(ok({ dailySummaryEnabled: false, auditEnabled: true, goalAlertsEnabled: false })).toBe(true);
      expect(ok({ dailySummaryEnabled: 'no' })).toBe(false);
      expect(ok({ auditInviteSnoozedUntil: '2026-11-01' })).toBe(true);
      expect(ok({ auditInviteSnoozedUntil: '2026-02-30' })).toBe(false);
      expect(ok({ auditInviteSnoozedUntil: null })).toBe(true);
      expect(ok({ onboardedAt: '2026-10-16T09:00:00.000Z' })).toBe(true);
      expect(ok({ onboardedAt: 'вчера' })).toBe(false);
      expect(ok({ receiptTipsSeen: 3 })).toBe(true);
      expect(ok({ receiptTipsSeen: 4 })).toBe(false);
    });

    it('accepts the display currency of Home: сум or USD (FT-137)', () => {
      expect(ok({ displayCurrency: 'UZS' })).toBe(true);
      expect(ok({ displayCurrency: 'USD' })).toBe(true);
      expect(ok({ displayCurrency: 'EUR' })).toBe(false);
      expect(ok({ displayCurrency: null })).toBe(false);
    });

    it('refuses unknown fields, empty bodies and non-objects, naming every problem', () => {
      const result = validateSettingsPatch({ theme: 'sepia', userId: 'someone-else' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('theme must be one of');
        expect(result.error.message).toContain('userId is not a setting');
      }
      expect(ok({})).toBe(false);
      expect(ok([])).toBe(false);
      expect(ok('theme=dark')).toBe(false);
    });
  });

  describe('GET and PATCH /api/settings', () => {
    let db: TestDatabase;
    let server: TestServer;

    beforeEach(async () => {
      db = await openMigratedDatabase();
      const userModule = new UserModule(
        new SqliteUserRepository(db.dataSource),
        new SqliteUserSettingsRepository(db.dataSource)
      );
      server = await startTestServer({ '/settings': createSettingsRoutes(userModule) });
    });

    afterEach(async () => {
      await server.close();
      await db.close();
    });

    it('requires authentication', async () => {
      const res = await server.request('GET', '/api/settings');
      expect(res.status).toBe(401);
    });

    it('returns defaults for a user who never changed anything, without writing a row', async () => {
      const res = await server.request('GET', '/api/settings', { devUser: 111 });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        theme: 'telegram',
        dailySummaryEnabled: true,
        dailySummaryTime: '21:00',
        auditEnabled: true,
        auditTime: '10:00',
        goalAlertsEnabled: true,
        fxOwnRateMinor: null,
        defaultAccountId: null,
        onboardedAt: null,
        receiptTipsSeen: 0,
        auditInviteSnoozedUntil: null,
        displayCurrency: 'UZS',
      });
      expect(await db.dataSource.query('SELECT * FROM user_settings')).toEqual([]);
    });

    it('remembers the display currency of Home between launches (FT-137)', async () => {
      const patch = await server.request('PATCH', '/api/settings', { devUser: 111, body: { displayCurrency: 'USD' } });
      expect(patch.status).toBe(200);
      expect(patch.body.data.displayCurrency).toBe('USD');

      // Another change keeps it; a later read finds it
      await server.request('PATCH', '/api/settings', { devUser: 111, body: { theme: 'dark' } });
      expect((await server.request('GET', '/api/settings', { devUser: 111 })).body.data.displayCurrency).toBe('USD');

      const back = await server.request('PATCH', '/api/settings', { devUser: 111, body: { displayCurrency: 'UZS' } });
      expect(back.body.data.displayCurrency).toBe('UZS');
    });

    it('saves a change and keeps the other settings', async () => {
      const patch = await server.request('PATCH', '/api/settings', {
        devUser: 111,
        body: { theme: 'dark', dailySummaryTime: '22:00', onboardedAt: '2026-10-16T09:00:00.000Z' },
      });
      expect(patch.status).toBe(200);

      const second = await server.request('PATCH', '/api/settings', { devUser: 111, body: { auditEnabled: false } });
      expect(second.body.data).toMatchObject({
        theme: 'dark',
        dailySummaryTime: '22:00',
        auditEnabled: false,
        onboardedAt: '2026-10-16T09:00:00.000Z',
      });

      const read = await server.request('GET', '/api/settings', { devUser: 111 });
      expect(read.body.data).toEqual(second.body.data);
    });

    it('keeps users apart: the user comes from authentication only', async () => {
      await server.request('PATCH', '/api/settings', { devUser: 111, body: { theme: 'dark' } });

      const other = await server.request('GET', '/api/settings', { devUser: 222 });
      expect(other.body.data.theme).toBe('telegram');
      expect(other.body.data.userId).not.toBe((await server.request('GET', '/api/settings', { devUser: 111 })).body.data.userId);
    });

    it('reads settings saved before FT-137 as сум', async () => {
      // Back to the schema before the display currency, with a row saved then
      const applied = async () => (await db.dataSource.query(`SELECT name FROM migrations`)).map((row: { name: string }) => row.name);
      while ((await applied()).includes('DisplayCurrency1761700000000')) {
        await db.dataSource.undoLastMigration({ transaction: 'each' });
      }
      await db.dataSource.query(`INSERT INTO user_settings (user_id, theme) VALUES ('before-ft137', 'dark')`);

      await db.dataSource.runMigrations({ transaction: 'each' });

      const settings = await new SqliteUserSettingsRepository(db.dataSource).findByUserId('before-ft137');
      expect(settings).toMatchObject({ theme: 'dark', displayCurrency: 'UZS' });
    });

    it('answers 400 with the reason and changes nothing on an invalid patch', async () => {
      const res = await server.request('PATCH', '/api/settings', { devUser: 111, body: { dailySummaryTime: '18:00' } });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('dailySummaryTime must be one of: 20:00, 21:00, 22:00, 23:00');
      expect(await db.dataSource.query('SELECT * FROM user_settings')).toEqual([]);
    });
  });
});
