import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { AppDataSource } from '../src/shared/infrastructure/database/database.config';
import { findSchemaDrift, runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { transactionLearning } from '../src/shared/application/learning/transactionLearning';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { createModules } from '../src/appModules';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { createHttpApp } from '../src/delivery/web/express/httpApp';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';
import { TelegramStand } from './helpers/telegramStand';

/**
 * The app as `src/index.ts` assembles it (#294): `createModules()` — every module and every `set…` link between them —
 * over the app's own data source, `buildServer` and `createHttpApp` over them, the bot from the same modules. The other
 * suites build the modules they need by hand; a link `createModules()` forgets, or makes the wrong way, only shows here.
 *
 * The data source is the app's `AppDataSource`, the one every repository falls back to, pointed at a temp file before
 * it connects: the project's `data/database.sqlite` is never opened. No module reaches the network: the OpenAI key is a
 * placeholder and no request here parses a phrase, the Central Bank rate is never loaded (the user's own rate is set).
 */

const NB = '\u00a0';
const TELEGRAM_ID = 597843119;
const OTHER_ID = 111;
const today = todayDateOnly();

type Modules = ReturnType<typeof createModules>;

describe('the app as createModules() assembles it (#294)', () => {
  let dir: string;
  let file: string;
  let modules: Modules;
  let api: LoopbackServer;

  /** A request of the Mini App in development: the user named by X-Dev-User-Id. */
  async function call(method: string, url: string, body?: unknown, telegramId = TELEGRAM_ID): Promise<{ status: number; body: any }> {
    const res = await fetch(`${api.baseUrl}/api${url}`, {
      method,
      headers: { 'X-Dev-User-Id': String(telegramId), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text.startsWith('{') ? JSON.parse(text) : text };
  }

  /** The `data` of a successful answer. */
  async function ok(method: string, url: string, body?: unknown, telegramId = TELEGRAM_ID): Promise<any> {
    const answer = await call(method, url, body, telegramId);
    if (answer.status >= 300) throw new Error(`${method} ${url}: ${answer.status} ${JSON.stringify(answer.body)}`);
    return answer.body.data;
  }

  const write = (body: Record<string, unknown>) =>
    ok('POST', '/transactions', { amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: today, ...body });

  const accountNamed = async (name: string) => ((await ok('GET', '/accounts')).accounts as Array<{ id: string; name: string; balanceMinor: number }>)
    .find(account => account.name === name)!;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i294-app-'));
    file = path.join(dir, 'database.sqlite');
    // The app opens AppDataSource at data/database.sqlite of its folder; here it opens the temp file instead
    AppDataSource.setOptions({ database: file });
    await AppDataSource.initialize();
    // Before anything is migrated or cleared: should setOptions ever stop moving the file (a TypeORM update), this
    // stops here, not on the project's own database
    const [main] = await AppDataSource.query('PRAGMA database_list');
    if (main?.file !== fs.realpathSync(file)) {
      await AppDataSource.destroy();
      throw new Error(`AppDataSource opened ${main?.file}, not the temp file ${file}`);
    }
    await runMigrationsWithBackup(AppDataSource, file, path.join(dir, 'backups'));
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    jest.replaceProperty(AppConfig, 'OPENAI_API_KEY', 'sk-test-placeholder');
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('https://miniapp.test');
    // Nothing leaves the machine: a module that reached the Central Bank or OpenAI would fail its request
    const loopbackOnly = globalThis.fetch;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== '127.0.0.1') throw new Error(`A request off the machine: ${url.origin}`);
      return loopbackOnly(input, init);
    });
    for (const { name } of await AppDataSource.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'migrations'`)) {
      await AppDataSource.query(`DELETE FROM "${name}"`);
    }

    modules = createModules();
    const { categoryModule, accountModule, fxModule, transactionModule, quickCaptureModule, userModule, subscriptionModule, exportModule, authModule, auditModule } = modules;
    // As src/index.ts builds the server; the web app's folder is empty
    const router = buildServer(transactionModule, userModule, subscriptionModule, quickCaptureModule, { categoryModule, accountModule, fxModule, exportModule, authModule, auditModule });
    api = await listenOnLoopback(createHttpApp(router, dir));
  });

  afterEach(async () => {
    await api.close();
    jest.restoreAllMocks();
  });

  it('works on the temp file, migrated as the app migrates its own', async () => {
    const [main] = await AppDataSource.query('PRAGMA database_list');
    expect(main.file).toBe(fs.realpathSync(file));
    expect(await findSchemaDrift(AppDataSource)).toEqual([]);
  });

  it('gives every module index.ts and the bot take', () => {
    expect(Object.keys(modules).sort()).toEqual([
      'accountModule', 'auditModule', 'authModule', 'botMessageModule', 'categoryModule', 'exportModule', 'fxModule',
      'notificationModule', 'quickCaptureModule', 'subscriptionModule', 'transactionModule', 'userModule', 'voiceModule',
    ]);
  });

  it('a record written through the API is in the history, on the default account and in its balance', async () => {
    const { id } = await write({});

    const [record, ...others] = (await ok('GET', '/transactions')).items;
    expect(others).toEqual([]);
    const card = await accountNamed('Карта');
    const cafe = ((await ok('GET', '/categories')) as Array<{ id: string; name: string; type: string }>)
      .find(category => category.name === 'Кафе' && category.type === 'expense')!;
    // The category resolver gave the user's own category, the account resolver the default account
    expect(record).toMatchObject({ id, amountMinor: 2_500_000, category: 'Кафе', categoryId: cafe.id, accountId: card.id, date: today });
    expect(card.balanceMinor).toBe(-2_500_000);
    expect((await ok('GET', '/accounts')).totalMinor).toBe(-2_500_000);

    // The account screen lists the account's records next to its moves
    const screen = await ok('GET', `/accounts/${card.id}/operations`);
    expect(screen.days.flatMap((day: { operations: Array<{ id: string }> }) => day.operations.map(operation => operation.id))).toEqual([id]);

    // Home's month and the export read the same records
    expect((await ok('GET', `/transactions/totals?from=${today}&to=${today}`)).expenseMinor).toBe(2_500_000);
    const exported = await call('GET', '/export');
    expect(exported.status).toBe(200);
    expect(exported.body).toContain('кофе');
  });

  it('the default account from the settings takes the next record; an account of another user cannot be it', async () => {
    const cash = await ok('POST', '/accounts', { name: 'Наличные', kind: 'cash', currency: 'UZS' });
    await ok('PATCH', '/settings', { defaultAccountId: cash.id });

    const { id } = await write({});

    expect((await ok('GET', '/transactions')).items).toEqual([expect.objectContaining({ id, accountId: cash.id })]);
    expect((await accountNamed('Наличные')).balanceMinor).toBe(-2_500_000);
    expect((await accountNamed('Карта')).balanceMinor).toBe(0);
    const theirs = await ok('POST', '/accounts', { name: 'Чужой', kind: 'cash', currency: 'UZS' }, OTHER_ID);
    expect((await call('PATCH', '/settings', { defaultAccountId: theirs.id })).status).toBe(400);
  });

  it('dollars count in the total at the user\'s own rate', async () => {
    await ok('PUT', '/rates/usd/own', { rateMinor: 1_280_000 });
    await ok('POST', '/accounts', { name: 'Доллары', kind: 'card', currency: 'USD', openingBalanceMinor: 1_000 });
    await write({});

    const accounts = await ok('GET', '/accounts');

    // $10 at 12 800 сум, less the coffee
    expect(accounts.totalMinor).toBe(12_800_000 - 2_500_000);
    expect(accounts.rate).toMatchObject({ rateMinor: 1_280_000 });
  });

  it('a dollar record counts in Home\'s totals at the user\'s own rate', async () => {
    await ok('PUT', '/rates/usd/own', { rateMinor: 1_280_000 });
    const dollars = await ok('POST', '/accounts', { name: 'Доллары', kind: 'card', currency: 'USD' });
    await write({});
    await write({ amount: 5, currency: 'USD', accountId: dollars.id, description: 'наушники' });

    const totals = await ok('GET', `/transactions/totals?from=${today}&to=${today}`);

    // The coffee and $5 at 12 800 сум
    expect(totals.expenseMinor).toBe(2_500_000 + 6_400_000);
    expect(totals.usd).toMatchObject({ present: true, missingRate: false, rateMinor: 1_280_000 });
  });

  it('an exchange keeps the Central Bank rate of its day next to the deal\'s', async () => {
    // The Central Bank's rate of the day, as the daily refresh keeps it: nothing is loaded here
    await AppDataSource.query(
      `INSERT INTO fx_rates (date, currency, rate_minor, source, fetched_at) VALUES (?, 'USD', ?, 'cbu', ?)`,
      [today, 1_265_000, new Date().toISOString()]
    );
    const card = await accountNamed('Карта');
    const dollars = await ok('POST', '/accounts', { name: 'Доллары', kind: 'card', currency: 'USD' });

    const move = await ok('POST', '/moves', {
      kind: 'exchange', fromAccountId: card.id, toAccountId: dollars.id, fromAmountMinor: 126_000_000, toAmountMinor: 10_000, date: today,
    });

    expect(move).toMatchObject({ kind: 'exchange', dealRateMinor: 1_260_000, cbuRateMinor: 1_265_000 });
  });

  it('a record counts in the month\'s usage, and its deletion and restoring count too', async () => {
    const used = async () => (await ok('GET', `/subscription/${TELEGRAM_ID}`)).limits.transactions.used;

    const { id } = await write({});
    expect(await used()).toBe(1);

    await ok('DELETE', `/transactions/${id}`);
    expect(await used()).toBe(0);

    await ok('POST', `/transactions/${id}/restore`);
    expect(await used()).toBe(1);
  });

  it('a category corrected in the Mini App takes back what the record taught, through the shared learning', async () => {
    const unlearn = jest.spyOn(transactionLearning, 'unlearnRecord').mockResolvedValue(undefined);
    jest.spyOn(transactionLearning, 'learnCategory').mockResolvedValue(undefined);
    const { id } = await write({});
    const taxi = ((await ok('GET', '/categories')) as Array<{ id: string; name: string }>).find(category => category.name === 'Транспорт')!;

    await ok('PUT', `/transactions/${id}`, { categoryId: taxi.id });

    expect(unlearn).toHaveBeenCalledWith(id);
  });

  it('the bot started from the same modules counts the record in /today', async () => {
    await write({});
    const stand = new TelegramStand({ id: TELEGRAM_ID, first_name: 'Shukur' });
    stand.install();
    stand.start(modules);

    const [summary] = await stand.write('/today');

    expect(summary.text).toContain(`Потрачено 25${NB}000${NB}сум · 1 запись`);
  });
});
