import { HttpCbuClient, parseCbuResponse, CBU_URL } from '../src/modules/fx/infrastructure/HttpCbuClient';
import { SqliteFxRateRepository } from '../src/modules/fx/infrastructure/SqliteFxRateRepository';
import { FxRateService, OwnRateStore } from '../src/modules/fx/application/fxRateService';
import { createFxRoutes } from '../src/modules/fx/presentation/fxController';
import { CbuClient } from '../src/modules/fx/domain/cbuClient';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { createAccountRoutes } from '../src/modules/account/presentation/accountController';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer } from './helpers/testServer';

describe('USD rate (FT-102)', () => {
  describe('the CBU answer', () => {
    const answer = (fields: Record<string, unknown>) => [{ id: 69, Code: '840', Ccy: 'USD', Nominal: '1', ...fields }];

    it('reads the rate in minor units and the date the rate states', () => {
      expect(parseCbuResponse(answer({ Rate: '12850.37', Date: '16.10.2026' }), '2026-10-16'))
        .toEqual({ date: '2026-10-16', rateMinor: 1285037 });
      // On a holiday the answer carries the last working day's date
      expect(parseCbuResponse(answer({ Rate: '12849', Date: '15.10.2026' }), '2026-10-18'))
        .toEqual({ date: '2026-10-15', rateMinor: 1284900 });
      expect(parseCbuResponse(answer({ Rate: '128503.70', Nominal: '10', Date: '16.10.2026' }), '2026-10-16'))
        .toEqual({ date: '2026-10-16', rateMinor: 1285037 });
    });

    it('treats anything else as no answer', () => {
      expect(parseCbuResponse([], '2026-10-16')).toBeNull();
      expect(parseCbuResponse('<html>error</html>', '2026-10-16')).toBeNull();
      expect(parseCbuResponse([{ Ccy: 'EUR', Rate: '14000' }], '2026-10-16')).toBeNull();
      expect(parseCbuResponse(answer({ Rate: 'n/a' }), '2026-10-16')).toBeNull();
      expect(parseCbuResponse(answer({ Rate: '0' }), '2026-10-16')).toBeNull();
    });

    it('asks the archive URL for the date and gives null on errors and timeouts', async () => {
      const ok = jest.fn().mockResolvedValue({ ok: true, json: async () => answer({ Rate: '12850.37', Date: '16.10.2026' }) });
      expect(await new HttpCbuClient(ok as unknown as typeof fetch).fetchUsdRate('2026-10-16')).toEqual({ date: '2026-10-16', rateMinor: 1285037 });
      expect(ok.mock.calls[0][0]).toBe(CBU_URL('2026-10-16'));
      expect(CBU_URL('2026-10-16')).toBe('https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/2026-10-16/');

      const failing = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      expect(await new HttpCbuClient(failing as unknown as typeof fetch).fetchUsdRate('2026-10-16')).toBeNull();
      const offline = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      expect(await new HttpCbuClient(offline as unknown as typeof fetch).fetchUsdRate('2026-10-16')).toBeNull();
    });
  });

  describe('with a migrated database', () => {
    let db: TestDatabase;
    let client: jest.Mocked<CbuClient>;
    let ownRates: Map<string, { rateMinor: number; since: string }>;
    let service: FxRateService;

    beforeEach(async () => {
      db = await openMigratedDatabase();
      client = { fetchUsdRate: jest.fn() };
      ownRates = new Map();
      const store: OwnRateStore = {
        get: async userId => ownRates.get(userId) ?? null,
        set: async (userId, rate) => { if (rate) ownRates.set(userId, rate); else ownRates.delete(userId); },
      };
      service = new FxRateService(new SqliteFxRateRepository(db.dataSource), client, store);
    });

    afterEach(async () => {
      await db.close();
    });

    it('loads today\'s rate once and keeps it', async () => {
      client.fetchUsdRate.mockResolvedValue({ date: '2026-10-16', rateMinor: 1285037 });

      expect(await service.refreshUsd('2026-10-16')).toMatchObject({ date: '2026-10-16', rateMinor: 1285037 });
      await service.refreshUsd('2026-10-16');

      expect(client.fetchUsdRate).toHaveBeenCalledTimes(1);
    });

    it('keeps the last known rate, with its date, when the CBU does not answer', async () => {
      client.fetchUsdRate.mockResolvedValueOnce({ date: '2026-10-15', rateMinor: 1284900 });
      await service.refreshUsd('2026-10-15');
      client.fetchUsdRate.mockResolvedValue(null);

      expect(await service.refreshUsd('2026-10-16')).toMatchObject({ date: '2026-10-15', rateMinor: 1284900 });
      expect(await service.effectiveUsdRate('user-1')).toEqual({ rateMinor: 1284900, source: 'cbu', date: '2026-10-15' });
    });

    it('stores a holiday answer for the asked date too', async () => {
      client.fetchUsdRate.mockResolvedValue({ date: '2026-10-17', rateMinor: 1285000 });

      await service.refreshUsd('2026-10-18');
      await service.refreshUsd('2026-10-18');

      expect(client.fetchUsdRate).toHaveBeenCalledTimes(1);
      expect((await service.cbuRateOn('2026-10-17'))?.rateMinor).toBe(1285000);
    });

    it('gives the CBU rate on a date, loading it or falling back to the last earlier one', async () => {
      client.fetchUsdRate.mockResolvedValueOnce({ date: '2026-10-01', rateMinor: 1270000 });
      expect(await service.cbuRateOn('2026-10-01')).toMatchObject({ date: '2026-10-01', rateMinor: 1270000 });

      client.fetchUsdRate.mockResolvedValueOnce(null);
      expect(await service.cbuRateOn('2026-10-05')).toMatchObject({ date: '2026-10-01', rateMinor: 1270000 });

      expect(await service.cbuRateOn('2026-10-01')).toMatchObject({ rateMinor: 1270000 });
      expect(client.fetchUsdRate).toHaveBeenCalledTimes(2);
    });

    it('applies the user\'s own rate instead of the CBU one, and goes back to the CBU rate', async () => {
      client.fetchUsdRate.mockResolvedValue({ date: '2026-10-16', rateMinor: 1285037 });
      await service.refreshUsd('2026-10-16');

      const set = await service.setOwnRate('user-1', 1290000, '2026-10-16');
      expect(set.success && set.data.effective).toEqual({ rateMinor: 1290000, source: 'own', date: '2026-10-16' });
      expect(await service.effectiveUsdRate('user-2')).toMatchObject({ source: 'cbu' });

      const cleared = await service.setOwnRate('user-1', null);
      expect(cleared.success && cleared.data).toEqual({
        effective: { rateMinor: 1285037, source: 'cbu', date: '2026-10-16' },
        cbu: expect.objectContaining({ rateMinor: 1285037, date: '2026-10-16' }),
        own: null,
      });

      for (const bad of [0, 99, 12850.5, 1e9, '1290000']) {
        expect((await service.setOwnRate('user-1', bad)).success).toBe(false);
      }
    });

    it('brings an own rate back with the date it applied from — «Отменить» after a change (FT-119)', async () => {
      const back = await service.setOwnRate('user-1', 1280000, '2026-10-16', '2026-10-10');
      expect(back.success && back.data.own).toEqual({ rateMinor: 1280000, since: '2026-10-10' });
      expect(back.success && back.data.effective).toEqual({ rateMinor: 1280000, source: 'own', date: '2026-10-10' });

      // Not later than today, a real date, and only with a rate
      for (const since of ['2026-10-17', '2026-02-30', '10.10.2026', 20261010]) {
        const result = await service.setOwnRate('user-1', 1290000, '2026-10-16', since);
        expect(result.success).toBe(false);
      }
      expect(ownRates.get('user-1')).toEqual({ rateMinor: 1280000, since: '2026-10-10' });
      // Without a date it applies from today, as before
      const today = await service.setOwnRate('user-1', 1290000, '2026-10-16');
      expect(today.success && today.data.own).toEqual({ rateMinor: 1290000, since: '2026-10-16' });
    });

    it('serves /api/rates/usd and puts the own rate into the accounts total', async () => {
      const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
      const fx = new FxRateService(new SqliteFxRateRepository(db.dataSource), client, {
        get: userId => userModule.ownUsdRate(userId),
        set: (userId, rate) => userModule.setOwnUsdRate(userId, rate),
      });
      const accounts = new AccountModule(new SqliteAccountRepository(db.dataSource), undefined, new SqliteAccountMoveRepository(db.dataSource));
      accounts.getBook().setRateProvider(fx);
      const server = await startTestServer({
        '/rates': createFxRoutes(fx, userModule),
        '/accounts': createAccountRoutes(accounts, userModule),
      });
      const as = (method: string, url: string, body?: unknown) => server.request(method, url, { devUser: 31337, body });

      try {
        expect((await as('GET', '/api/rates/usd')).body.data).toEqual({ effective: null, cbu: null, own: null });
        await as('POST', '/api/accounts', { name: 'Доллары', kind: 'cash', currency: 'USD', openingBalanceMinor: 5500 });
        expect((await as('GET', '/api/accounts')).body.data).toMatchObject({ totalMinor: 0, missingRate: true });

        const own = await as('PUT', '/api/rates/usd/own', { rateMinor: 1290000 });
        expect(own.status).toBe(200);
        expect(own.body.data.effective).toEqual({ rateMinor: 1290000, source: 'own', date: todayDateOnly() });
        // 55.00 USD × 12 900.00 = 709 500 сум
        expect((await as('GET', '/api/accounts')).body.data).toMatchObject({ totalMinor: 70950000, missingRate: false });
        expect((await as('GET', '/api/rates/usd')).body.data.own).toEqual({ rateMinor: 1290000, since: todayDateOnly() });

        expect((await as('PUT', '/api/rates/usd/own', { rateMinor: 'много' })).status).toBe(400);
        // «Отменить» after a change brings the previous own rate back with its own date
        const restored = await as('PUT', '/api/rates/usd/own', { rateMinor: 1280000, since: '2020-01-01' });
        expect(restored.status).toBe(200);
        expect(restored.body.data.own).toEqual({ rateMinor: 1280000, since: '2020-01-01' });
        expect((await as('PUT', '/api/rates/usd/own', { rateMinor: 1280000, since: '2999-01-01' })).status).toBe(400);
        expect((await as('DELETE', '/api/rates/usd/own')).body.data).toEqual({ effective: null, cbu: null, own: null });
        expect((await server.request('GET', '/api/rates/usd')).status).toBe(401);
      } finally {
        await server.close();
      }
    });
  });
});
