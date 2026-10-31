import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import express, { Router } from 'express';
import { randomUUID } from 'crypto';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { winstonLogger } from '../src/shared/infrastructure/logging';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { resetSharedRateLimiters } from '../src/delivery/web/express/middleware/rateLimitMiddleware';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { TransactionLearningService } from '../src/shared/application/learning/transactionLearning';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';
import { signedInitData } from './helpers/telegramInitData';

/**
 * FT-218 (decision 2026-10-31): the iOS app shows the owner's records from the server, deletes them and changes their
 * category with the same token it captures with, `SHORTCUT_CAPTURE_TOKEN` for `SHORTCUT_CAPTURE_OWNER`. The token is one
 * more way to sign in, next to initData and the session cookie — on exactly six routes, listed here, and nowhere else.
 * The answers are the Mini App's: the iOS client (`ios/Kapelka/Records/RecordsClient.swift`) reads the same contract.
 */

const OWNER = 900000218;
const OTHER = 111;
/** Made up for the tests, in mixed case so no piece of it turns up in a log by chance. */
const TOKEN = 'ft218Xq7Lm2Vz9Rk4Tw8Jp3Nc6Hy5Gb1Df0SuEa';
const BOT_TOKEN = 'test-bot-token-ft218';

/** The routes the token opens, as the routers declare them: capture since FT-075 and the six records routes. */
const CAPTURE_ROUTES = ['POST /quick-capture/', 'POST /quick-capture/payment'];
const RECORDS_ROUTES = [
  'GET /transactions/',
  'GET /categories/',
  'GET /accounts/',
  'DELETE /transactions/:id',
  'POST /transactions/:id/restore',
  'PUT /transactions/:id',
];

/** Any module method buildServer calls gives an empty object: the routes of these modules are only refused here. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

type Headers = Record<string, string>;
interface Answer {
  status: number;
  body: any;
}

const byToken: Headers = { 'X-Shortcut-Capture-Token': TOKEN };
const asOwner = (): Headers => ({ Authorization: `tma ${signedInitData(OWNER, BOT_TOKEN)}` });

/** What changes between two answers to the same question: the moment, and the uptime of `/api/health`. */
const MOMENT_KEYS = new Set(['timestamp', 'uptime']);

function withoutTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimestamps);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !MOMENT_KEYS.has(key)).map(([key, inner]) => [key, withoutTimestamps(inner)])
    );
  }
  return value;
}

/** `^\/transactions\/?(?=\/|$)` — how Express 4 keeps `router.use('/transactions', …)` — back to `/transactions`. */
function mountPathOf(layer: any): string {
  const source: string = layer.regexp.source;
  if (layer.regexp.fast_slash) return '';
  const match = source.match(/^\^((?:\\\/[\w-]+)+)\\\/\?\(\?=\\\/\|\$\)$/);
  if (!match) throw new Error(`Unknown mount path ${source}: teach the test to read it`);
  return match[1].replace(/\\\//g, '/');
}

/** Every route of a router, nested routers too, as `METHOD /path`. */
function routesOf(router: Router, prefix = ''): string[] {
  return (router as any).stack.flatMap((layer: any) => {
    if (layer.route) {
      if (typeof layer.route.path !== 'string') throw new Error('A route path that is not a string: teach the test to read it');
      return Object.keys(layer.route.methods).map(method => `${method.toUpperCase()} ${prefix}${layer.route.path}`);
    }
    if (layer.handle?.stack) return routesOf(layer.handle, `${prefix}${mountPathOf(layer)}`);
    return [];
  });
}

describe('the app token reads and edits its owner’s records (FT-218)', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SHORTCUT_CAPTURE_TOKEN: process.env.SHORTCUT_CAPTURE_TOKEN,
    SHORTCUT_CAPTURE_OWNER: process.env.SHORTCUT_CAPTURE_OWNER,
  };
  let db: TestDatabase;
  let dir: string;
  let learning: TransactionLearningService;
  let transactionModule: TransactionModule;
  let categoryModule: CategoryModule;
  let userModule: UserModule;
  let router: Router;
  let api: LoopbackServer;

  beforeEach(async () => {
    process.env.NODE_ENV = 'production';
    process.env.SHORTCUT_CAPTURE_TOKEN = TOKEN;
    process.env.SHORTCUT_CAPTURE_OWNER = String(OWNER);
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([String(OWNER), String(OTHER)]));
    jest.replaceProperty(AppConfig, 'TG_BOT_API_KEY', BOT_TOKEN);

    db = await openMigratedDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft218-learning-'));
    fs.mkdirSync(path.join(dir, 'data'));
    learning = new TransactionLearningService(dir);

    // Wired the way createModules() wires them, on the test database
    const records = recordsOn(db.dataSource);
    transactionModule = new TransactionModule(records.repository);
    categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
    const accountModule = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setCategoryLessons(learning);
    transactionModule.setAccountResolver(accountModule.getBook());
    accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));
    accountModule.setRecordSource({ recordsOf: (userId, accountId) => transactionModule.recordsOfAccount(userId, accountId) });

    router = buildServer(
      transactionModule, unusedModule, unusedModule, unusedModule, userModule, unusedModule, unusedModule,
      { categoryModule, accountModule, fxModule: unusedModule, exportModule: unusedModule, auditModule: unusedModule }
    );
    const app = express();
    app.use('/api', router);
    api = await listenOnLoopback(app);
  });

  afterEach(async () => {
    await api.close();
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  async function call(method: string, url: string, headers: Headers = {}, body?: unknown): Promise<Answer> {
    const res = await fetch(`${api.baseUrl}/api${url}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: withoutTimestamps(text ? JSON.parse(text) : null) };
  }

  const userIdOf = async (telegramId: number) =>
    (await userModule.getGetOrCreateUserUseCase().execute({ telegramId: String(telegramId) })).id;

  async function recordOf(telegramId: number, overrides: Record<string, unknown> = {}): Promise<string> {
    const created = await transactionModule.getCreateTransactionUseCase().execute({
      userId: await userIdOf(telegramId), amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе',
      date: '2026-10-30', ...overrides,
    } as never);
    if (!created.success) throw created.error;
    return created.data;
  }

  /** The id of the owner's expense category with this name. */
  const categoryIdOf = async (name: string) =>
    (await call('GET', '/categories', asOwner())).body.data
      .find((category: { name: string; type: string }) => category.name === name && category.type === 'expense').id as string;

  const historyIds = async () => (await call('GET', '/transactions', asOwner())).body.data.items.map((item: { id: string }) => item.id);

  describe('the six routes work for the owner as with the owner’s initData', () => {
    it('GET /api/transactions: the history page by page with the cursor, the owner’s records only', async () => {
      const mine = [
        await recordOf(OWNER, { date: '2026-10-30' }),
        await recordOf(OWNER, { date: '2026-10-29' }),
        await recordOf(OWNER, { date: '2026-10-28' }),
      ];
      await recordOf(OTHER);

      const first = await call('GET', '/transactions?limit=2', byToken);
      expect(first).toEqual(await call('GET', '/transactions?limit=2', asOwner()));
      expect(first.status).toBe(200);
      expect(first.body.data.items.map((item: { id: string }) => item.id)).toEqual(mine.slice(0, 2));
      expect(first.body.data.nextCursor).toEqual(expect.any(String));

      const cursor = encodeURIComponent(first.body.data.nextCursor);
      const second = await call('GET', `/transactions?cursor=${cursor}&limit=2`, byToken);
      expect(second).toEqual(await call('GET', `/transactions?cursor=${cursor}&limit=2`, asOwner()));
      expect(second.body.data.items.map((item: { id: string }) => item.id)).toEqual(mine.slice(2));
      expect(second.body.data.nextCursor).toBeNull();
    });

    it('GET /api/categories and GET /api/accounts: the owner’s lists, hidden ones too', async () => {
      await recordOf(OTHER);

      const categories = await call('GET', '/categories', byToken);
      expect(categories.status).toBe(200);
      expect(categories).toEqual(await call('GET', '/categories', asOwner()));
      expect(categories.body.data.length).toBeGreaterThan(0);

      // The first read creates the owner's «Карта», as it does for the Mini App
      const accounts = await call('GET', '/accounts', byToken);
      expect(accounts.status).toBe(200);
      expect(accounts).toEqual(await call('GET', '/accounts', asOwner()));
      expect(accounts.body.data.accounts.map((account: { name: string }) => account.name)).toEqual(['Карта']);
    });

    it('DELETE /api/transactions/:id and POST …/restore: deleted softly, back again — the Mini App’s answers', async () => {
      const id = await recordOf(OWNER);

      const deleted = await call('DELETE', `/transactions/${id}`, byToken);
      expect(deleted.status).toBe(200);
      expect(deleted.body.data).toEqual({ message: expect.any(String), id });
      expect(await historyIds()).toEqual([]);

      const restored = await call('POST', `/transactions/${id}/restore`, byToken);
      expect(restored.status).toBe(200);
      expect(restored.body.data).toMatchObject({ id });
      expect(restored.body.data.deletedAt ?? null).toBeNull();
      expect(await historyIds()).toEqual([id]);

      // The same two steps with the owner's initData answer the same
      expect(await call('DELETE', `/transactions/${id}`, asOwner())).toEqual(deleted);
      const restoredInMiniApp = await call('POST', `/transactions/${id}/restore`, asOwner());
      expect(Object.keys(restoredInMiniApp.body.data).sort()).toEqual(Object.keys(restored.body.data).sort());
      expect({ ...restoredInMiniApp.body.data, updatedAt: null }).toEqual({ ...restored.body.data, updatedAt: null });
    });

    it('PUT /api/transactions/:id { categoryId }: the record moves to the category, the Mini App’s answer', async () => {
      const id = await recordOf(OWNER);
      const groceries = await categoryIdOf('Продукты');

      const moved = await call('PUT', `/transactions/${id}`, byToken, { categoryId: groceries });
      expect(moved.status).toBe(200);
      expect(moved.body.data).toMatchObject({ id, categoryId: groceries, category: 'Продукты' });

      const inMiniApp = await call('PUT', `/transactions/${id}`, asOwner(), { categoryId: groceries });
      expect({ ...inMiniApp.body.data, updatedAt: null }).toEqual({ ...moved.body.data, updatedAt: null });
    });
  });

  describe('everything else is closed to the token: the answer of a request that does not sign in', () => {
    // 401 where the route signs in first; 403 where it looks the record up and then finds nobody signed in
    it.each([
      ['POST', '/transactions', { amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-30' }, 401],
      ['PATCH', '/categories/:category', { name: 'Кофейни' }, 401],
      ['POST', '/accounts', { name: 'Наличные', kind: 'cash', currency: 'UZS' }, 401],
      ['PATCH', '/accounts/:account', { name: 'Наличные' }, 401],
      ['GET', '/accounts/:account/operations', undefined, 401],
      ['GET', '/export', undefined, 401],
      ['GET', '/transactions/totals', undefined, 401],
      ['GET', '/settings', undefined, 401],
      ['GET', '/transactions/:record', undefined, 403],
      ['POST', '/transactions/:record/archive', undefined, 403],
    ])('%s %s', async (method, pattern, body, status) => {
      const record = await recordOf(OWNER);
      const category = await categoryIdOf('Кафе');
      const account = (await call('GET', '/accounts', asOwner())).body.data.accounts[0].id;
      const url = pattern.replace(':record', record).replace(':category', category).replace(':account', account);

      const withToken = await call(method, url, byToken, body);
      expect(withToken).toEqual(await call(method, url, {}, body));
      expect(withToken.status).toBe(status);
    });

    it('opens exactly the capture routes and the six records routes of all the API’s routes', async () => {
      const record = await recordOf(OWNER);
      const routes = routesOf(router);
      expect(routes).toEqual(expect.arrayContaining([...CAPTURE_ROUTES, ...RECORDS_ROUTES]));

      const opened: string[] = [];
      for (const route of routes) {
        const [method, pattern] = route.split(' ');
        const url = pattern
          .replace(/:userId\b\??/g, String(OWNER))
          .replace(/:\w+\??/g, record)
          .replace(/\/$/, '');
        // Each request counts from zero: a limit reached halfway would answer both alike
        await resetSharedRateLimiters();
        const without = await call(method, url);
        await resetSharedRateLimiters();
        const withToken = await call(method, url, byToken);
        if (JSON.stringify(withToken) !== JSON.stringify(without)) opened.push(route);
      }

      expect(opened.sort()).toEqual([...CAPTURE_ROUTES, ...RECORDS_ROUTES].sort());
    });
  });

  describe('someone else’s record', () => {
    it.each([
      ['DELETE', ''],
      ['POST', '/restore'],
      ['PUT', ''],
    ])('%s /api/transactions/:id%s by the token: the Mini App’s answer to someone else’s record, nothing changes', async (method, suffix) => {
      const theirs = await recordOf(OTHER);
      const body = method === 'PUT' ? { categoryId: await categoryIdOf('Продукты') } : undefined;

      const withToken = await call(method, `/transactions/${theirs}${suffix}`, byToken, body);
      expect(withToken).toEqual(await call(method, `/transactions/${theirs}${suffix}`, asOwner(), body));
      expect(withToken.status).toBe(403);

      // findById reads only records that are not deleted
      expect(await transactionModule.getRepository().findById(theirs)).toMatchObject({ id: theirs, category: 'Кафе' });
    });
  });

  describe('a wrong token, a path that is off, someone else named', () => {
    const everyRoute = async (): Promise<Array<[string, string, unknown]>> => {
      const id = await recordOf(OWNER);
      return [
        ['GET', '/transactions', undefined],
        ['GET', '/categories', undefined],
        ['GET', '/accounts', undefined],
        ['DELETE', `/transactions/${id}`, undefined],
        ['POST', `/transactions/${id}/restore`, undefined],
        ['PUT', `/transactions/${id}`, { description: 'чай' }],
      ];
    };

    it('a wrong, empty or cut token is 401 INVALID_SHORTCUT_TOKEN on all six — also next to the owner’s initData', async () => {
      const attempts: Headers[] = [
        { 'X-Shortcut-Capture-Token': `${TOKEN}x` },
        { 'X-Shortcut-Capture-Token': TOKEN.slice(1) },
        { 'X-Shortcut-Capture-Token': '' },
        { 'X-Shortcut-User-Id': String(OWNER) },
        { 'X-Shortcut-Capture-Token': 'wrong', ...asOwner() },
      ];
      for (const [method, url, body] of await everyRoute()) {
        for (const headers of attempts) {
          const res = await call(method, url, headers, body);
          expect([method, url, res.status, res.body.code]).toEqual([method, url, 401, 'INVALID_SHORTCUT_TOKEN']);
        }
      }
      expect(await historyIds()).toHaveLength(1);
    });

    it('a path that is not set up is 403 SHORTCUT_CAPTURE_DISABLED on all six', async () => {
      const routes = await everyRoute();
      delete process.env.SHORTCUT_CAPTURE_TOKEN;
      delete process.env.SHORTCUT_CAPTURE_OWNER;

      for (const [method, url, body] of routes) {
        const res = await call(method, url, byToken, body);
        expect([method, url, res.status, res.body.code]).toEqual([method, url, 403, 'SHORTCUT_CAPTURE_DISABLED']);
      }
    });

    it('X-Shortcut-User-Id naming anyone but the owner is 403 ACCESS_DENIED; naming the owner is fine', async () => {
      for (const [method, url, body] of await everyRoute()) {
        const someoneElse = await call(method, url, { ...byToken, 'X-Shortcut-User-Id': String(OTHER) }, body);
        expect([method, url, someoneElse.status, someoneElse.body.code]).toEqual([method, url, 403, 'ACCESS_DENIED']);
      }
      expect((await call('GET', '/transactions', { ...byToken, 'X-Shortcut-User-Id': `0${OWNER}` })).status).toBe(200);
    });

    it('X-Dev-User-Id never counts in production, also not next to the token: the reader is the owner', async () => {
      await recordOf(OTHER);
      const mine = await recordOf(OWNER);

      expect((await call('GET', '/transactions', { 'X-Dev-User-Id': String(OTHER) })).status).toBe(401);
      const res = await call('GET', '/transactions', { ...byToken, 'X-Dev-User-Id': String(OTHER) });
      expect(res.body.data.items.map((item: { id: string }) => item.id)).toEqual([mine]);
    });
  });

  describe('a category correction by the token teaches as one from the Mini App (FT-184)', () => {
    let analyzeInput: jest.Mock;
    let phrases: ProcessTextInputUseCase;

    beforeEach(() => {
      analyzeInput = jest.fn();
      const parser = { analyzeInput } as unknown as TranscriptionService;
      phrases = new ProcessTextInputUseCase(parser, transactionModule.getCreateTransactionUseCase(), undefined, categoryModule.getCatalog(), learning);
    });

    /** The words corrections taught, with their counts (`data/patterns.json`). */
    const lessons = () => {
      const file = path.join(dir, 'data', 'patterns.json');
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')).words ?? [] : [];
    };

    /** A phrase the AI files under «Покупки». */
    async function say(phrase: string, amount: number): Promise<string> {
      analyzeInput.mockResolvedValueOnce({
        transactions: [{ intent: 'transaction', type: 'expense', date: '2026-10-30', category: 'Покупки', amount, description: 'ZZQX' }],
        debts: [],
      });
      const { transactions } = await phrases.execute(phrase, await userIdOf(OWNER), undefined, { clientId: randomUUID() });
      return transactions[0].id;
    }

    it('one by the token, one from the Mini App: two lessons of the same word — the next phrase needs no AI', async () => {
      const groceries = await categoryIdOf('Продукты');
      const first = await say('zzqx 50000', 50_000);
      const second = await say('zzqx 70000', 70_000);

      expect((await call('PUT', `/transactions/${first}`, byToken, { categoryId: groceries })).status).toBe(200);
      expect(lessons()).toEqual([expect.objectContaining({ word: 'zzqx', category: 'groceries', uses: 1 })]);
      expect((await call('PUT', `/transactions/${second}`, asOwner(), { categoryId: groceries })).status).toBe(200);
      expect(lessons()).toEqual([expect.objectContaining({ word: 'zzqx', category: 'groceries', uses: 2 })]);
      expect((await learning.learnedCategoryWords()).get('groceries')).toContain('zzqx');

      analyzeInput.mockClear();
      const { transactions: [next] } = await phrases.execute('zzqx 30000', await userIdOf(OWNER), undefined, { clientId: randomUUID() });
      expect(next.category).toBe('Продукты');
      expect(next.assumptions?.find(assumption => assumption.kind === 'category')).toBeUndefined();
      expect(analyzeInput).not.toHaveBeenCalled();
    });
  });

  it('never writes the token to the log, on success or refusal', async () => {
    const lines: string[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      jest.spyOn(winstonLogger, level).mockImplementation(((...args: unknown[]) => {
        lines.push(util.inspect(args, { depth: 10 }));
        return winstonLogger;
      }) as never);
    }
    const id = await recordOf(OWNER);
    const groceries = await categoryIdOf('Продукты');

    for (const headers of [byToken, { 'X-Shortcut-Capture-Token': `${TOKEN}x` }, { ...byToken, 'X-Shortcut-User-Id': String(OTHER) }]) {
      await call('GET', `/transactions?limit=1`, headers);
      await call('GET', '/categories', headers);
      await call('GET', '/accounts', headers);
      await call('DELETE', `/transactions/${id}`, headers);
      await call('POST', `/transactions/${id}/restore`, headers);
      await call('PUT', `/transactions/${id}`, headers, { categoryId: groceries });
      await call('POST', '/transactions', headers, { amount: 1 });
    }

    expect(lines.length).toBeGreaterThan(0);
    const logged = lines.join('\n');
    // No eight characters of it in a row: neither the token nor a piece of it
    for (let start = 0; start + 8 <= TOKEN.length; start++) expect(logged).not.toContain(TOKEN.slice(start, start + 8));
  });

  it('counts a token request against the general limit as before: by address, 100 in 15 minutes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 101; i++) statuses.push((await call('GET', '/categories', byToken)).status);

    expect(statuses.slice(0, 100).every(status => status === 200)).toBe(true);
    expect(statuses[100]).toBe(429);
  });
});
