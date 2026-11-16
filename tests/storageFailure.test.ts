import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { StorageError } from '../src/shared/domain/errors/AppError';
import { handleControllerError } from '../src/shared/infrastructure/utils/controllerHelpers';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { FxModule } from '../src/modules/fx/fxModule';
import { SqliteFxRateRepository } from '../src/modules/fx/infrastructure/SqliteFxRateRepository';
import { ExportModule } from '../src/modules/export/exportModule';
import { ExportSources } from '../src/modules/export/domain/exportPorts';
import { AuditModule } from '../src/modules/audit/auditModule';
import { AuditSources } from '../src/modules/audit/domain/auditSources';
import { SqliteAuditRepository } from '../src/modules/audit/infrastructure/SqliteAuditRepository';
import { SqliteGoalRepository } from '../src/modules/audit/infrastructure/SqliteGoalRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { prepareDatabaseOnce, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #270: a failing database is the server's fault, not the request's. Every Mini App route whose use case catches a
 * storage error answers `500 INTERNAL_ERROR` — the Mini App's queue (`recordOutbox.ts`) and the iOS app send the
 * request again on a 5xx, while a 4xx drops it. The answer carries the use case's message only: the database's own
 * words stay in the log.
 */

const TELEGRAM_ID = 4242;
const CLIENT_ID = '0b5e7c1a-2f4d-4e6a-9b8c-7d6e5f4a3b2c';
/** What SQLite says when another process holds the file: it must never reach the answer. */
const CAUSE = 'SQLITE_BUSY: database is locked';
const SOME_ID = '00000000-0000-4000-8000-000000000000';

/** Any module method buildServer calls gives an empty object: the debt, subscription and capture routes are not under test. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

/** Every method of `target` — or only `names` — rejects as a locked database does. */
function breakStorage(target: object, names?: string[]): void {
  for (const name of names ?? methodsOf(target)) {
    jest.spyOn(target as Record<string, () => Promise<unknown>>, name).mockRejectedValue(new Error(CAUSE));
  }
}

function methodsOf(target: object): string[] {
  const names = new Set<string>();
  // A plain object's own functions (the export's sources), then a class's methods up its prototypes
  for (let proto = target; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name !== 'constructor' && typeof (target as Record<string, unknown>)[name] === 'function') names.add(name);
    }
  }
  return [...names];
}

describe('a failing database answers 500, not 422 (#270)', () => {
  const migrated = prepareDatabaseOnce();
  let db: TestDatabase;
  let api: LoopbackServer;
  let records: ReturnType<typeof recordsOn>;
  let transactionModule: TransactionModule;
  let categoryRepository: SqliteCategoryRepository;
  let settingsRepository: SqliteUserSettingsRepository;
  let userModule: UserModule;
  let auditRepository: SqliteAuditRepository;
  let goalRepository: SqliteGoalRepository;
  let exportSources: ExportSources;

  beforeEach(async () => {
    db = await migrated.open();
    // Wired the way createModules() wires them, on the test database
    records = recordsOn(db.dataSource);
    transactionModule = new TransactionModule(records.repository);
    categoryRepository = new SqliteCategoryRepository(db.dataSource);
    const categoryModule = new CategoryModule(categoryRepository);
    const accountModule = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    settingsRepository = new SqliteUserSettingsRepository(db.dataSource);
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), settingsRepository);
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));
    accountModule.setRecordSource({ recordsOf: (userId, accountId) => transactionModule.recordsOfAccount(userId, accountId) });
    const fxModule = new FxModule(new SqliteFxRateRepository(db.dataSource), { fetchUsdRate: async () => null }, {
      get: userId => userModule.ownUsdRate(userId),
      set: (userId, rate) => userModule.setOwnUsdRate(userId, rate),
    });
    exportSources = {
      records: userId => records.repository.findByUserId(userId),
      moves: userId => records.moveRepository.findByUserId(userId),
      accounts: userId => records.accountRepository.findByUserId(userId),
    };
    const exportModule = new ExportModule(exportSources, { sendFile: jest.fn() });
    const auditSources: AuditSources = {
      recordsBetween: (userId, from, to) => records.repository.getByUserIdAndDateRange(userId, new Date(from), new Date(to)),
      firstRecordDate: userId => records.repository.findFirstRecordDate(userId),
      categories: userId => categoryModule.getCatalog().listForUser(userId),
      usdRateMinor: async () => null,
    };
    auditRepository = new SqliteAuditRepository(db.dataSource);
    goalRepository = new SqliteGoalRepository(db.dataSource);
    const auditModule = new AuditModule({ audits: auditRepository, goals: goalRepository, sources: auditSources });

    const app = express();
    app.use('/api', buildServer(
      transactionModule, userModule, unusedModule, unusedModule,
      { categoryModule, accountModule, fxModule, exportModule, auditModule }
    ));
    api = await listenOnLoopback(app);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await api.close();
    await db.close();
  });

  /** Signed in as TELEGRAM_ID through the local dev header, as the Mini App is in development. */
  async function call(method: string, url: string, body?: unknown): Promise<{ status: number; body: any; text: string }> {
    const res = await fetch(`${api.baseUrl}/api${url}`, {
      method,
      headers: { 'X-Dev-User-Id': String(TELEGRAM_ID), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  }

  const ownerId = async () => (await userModule.getGetOrCreateUserUseCase().execute({ telegramId: String(TELEGRAM_ID) })).id;

  async function recordOf(userId: string): Promise<string> {
    const created = await transactionModule.getCreateTransactionUseCase().execute({
      userId, amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-30',
    } as never);
    if (!created.success) throw created.error;
    return created.data;
  }

  function expectServerFault(answer: { status: number; body: any; text: string }): void {
    expect(answer.status).toBe(500);
    expect(answer.body).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR', message: expect.any(String) } });
    expect(answer.body.error.context).toBeUndefined();
    expect(answer.text).not.toMatch(/SQLITE/);
  }

  it('StorageError is 500 INTERNAL_ERROR with its message only', () => {
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) } as never;

    handleControllerError(new StorageError('Failed to read history'), res);

    expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to read history', timestamp: expect.any(String) },
    });
  });

  describe('POST /api/transactions', () => {
    const body = { amountMinor: 2_500_000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-30', clientId: CLIENT_ID };

    it('a failed write answers 500; the same clientId sent again writes one record', async () => {
      breakStorage(records.repository, ['create']);
      expectServerFault(await call('POST', '/transactions', body));

      jest.restoreAllMocks();
      const retried = await call('POST', '/transactions', body);
      const repeated = await call('POST', '/transactions', body);

      expect(retried.status).toBe(201);
      expect(repeated.status).toBe(200);
      expect(repeated.body.data).toMatchObject({ id: retried.body.data.id, repeated: true });
      expect(await records.repository.findByClientId(await ownerId(), CLIENT_ID)).toHaveLength(1);
    });

    it('a record the server finds invalid stays 400', async () => {
      breakStorage(records.repository, ['create']);
      expect((await call('POST', '/transactions', { ...body, amountMinor: -1 })).status).toBe(400);
    });
  });

  describe('records: every read and write of the records table', () => {
    it.each([
      ['GET', '/transactions'],
      ['GET', '/transactions/totals?from=2026-10-01&to=2026-10-31'],
      ['GET', '/transactions/frequent'],
      ['GET', `/transactions/${SOME_ID}`],
      ['GET', '/analytics?type=expense'],
    ])('%s %s', async (method, url) => {
      breakStorage(records.repository);
      expectServerFault(await call(method, url));
    });

    it('GET /api/analytics/categories/:id', async () => {
      const userId = await ownerId();
      const [category] = await records.catalog.listForUser(userId);
      breakStorage(records.repository);
      expectServerFault(await call('GET', `/analytics/categories/${category.id}?month=2026-10`));
    });

    it('DELETE /api/transactions/:id: the record is found, its delete fails', async () => {
      const id = await recordOf(await ownerId());
      breakStorage(records.repository, ['delete']);
      expectServerFault(await call('DELETE', `/transactions/${id}`));
    });

    it('POST /api/transactions/:id/restore: the deleted record is found, its restore fails', async () => {
      const id = await recordOf(await ownerId());
      await records.repository.delete(id);
      breakStorage(records.repository, ['restore']);
      expectServerFault(await call('POST', `/transactions/${id}/restore`));
    });

    it('PUT /api/transactions/:id, with and without the learning context: the write fails', async () => {
      const userId = await ownerId();
      const id = await recordOf(userId);
      breakStorage(records.repository, ['update']);

      expectServerFault(await call('PUT', `/transactions/${id}`, { description: 'капучино' }));
      expectServerFault(await call('PUT', `/transactions/${id}`, {
        description: 'капучино', userId: String(TELEGRAM_ID), originalText: 'кофе 25000',
        originalParsing: { amount: 25000, category: 'Кафе', type: 'expense' },
      }));
    });
  });

  describe('categories', () => {
    it.each([
      ['GET', '/categories', undefined],
      ['POST', '/categories', { type: 'expense', name: 'Хобби', color: 'mint' }],
      ['PATCH', `/categories/${SOME_ID}`, { name: 'Хобби' }],
      ['DELETE', `/categories/${SOME_ID}`, undefined],
    ])('%s %s', async (method, url, body) => {
      breakStorage(categoryRepository);
      expectServerFault(await call(method, url, body));
    });
  });

  describe('accounts, moves and the first launch', () => {
    it.each([
      ['GET', '/accounts', undefined],
      ['POST', '/accounts', { name: 'Вклад', kind: 'card', currency: 'UZS' }],
      ['POST', '/accounts/opening-balances', { cashMinor: 0, cardMinor: 100, usdMinor: 0 }],
      ['PATCH', `/accounts/${SOME_ID}`, { name: 'Вклад' }],
      ['DELETE', `/accounts/${SOME_ID}`, undefined],
      ['GET', `/accounts/${SOME_ID}/operations`, undefined],
      ['POST', '/moves', { kind: 'transfer', fromAccountId: SOME_ID, toAccountId: SOME_ID, amountMinor: 100 }],
    ])('%s %s', async (method, url, body) => {
      breakStorage(records.accountRepository);
      expectServerFault(await call(method, url, body));
    });

    it.each([
      ['DELETE', `/moves/${SOME_ID}`],
      ['POST', `/moves/${SOME_ID}/restore`],
    ])('%s %s', async (method, url) => {
      breakStorage(records.moveRepository);
      expectServerFault(await call(method, url));
    });
  });

  describe('settings and the own USD rate', () => {
    it.each([
      ['GET', '/settings', undefined],
      ['PATCH', '/settings', { auditEnabled: true }],
      ['PUT', '/rates/usd/own', { rateMinor: 1_265_000 }],
      ['DELETE', '/rates/usd/own', undefined],
    ])('%s %s', async (method, url, body) => {
      breakStorage(settingsRepository);
      expectServerFault(await call(method, url, body));
    });
  });

  describe('export', () => {
    it.each([
      ['GET', '/export'],
      ['POST', '/export/chat'],
    ])('%s %s', async (method, url) => {
      breakStorage(exportSources);
      expectServerFault(await call(method, url));
    });
  });

  describe('the audit and its goals', () => {
    it.each([
      ['GET', '/audits/current', undefined],
      ['PATCH', `/audits/${SOME_ID}/candidates/${SOME_ID}`, { decision: 'need' }],
      ['POST', `/audits/${SOME_ID}/finish`, undefined],
    ])('%s %s', async (method, url, body) => {
      breakStorage(auditRepository);
      expectServerFault(await call(method, url, body));
    });

    it.each([
      ['GET', '/goals', undefined],
      ['PATCH', `/goals/${SOME_ID}`, { subscription: 'remind' }],
    ])('%s %s', async (method, url, body) => {
      breakStorage(goalRepository);
      expectServerFault(await call(method, url, body));
    });
  });
});
