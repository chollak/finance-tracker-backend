import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { BASELINE_TABLES } from '../src/shared/infrastructure/database/migrations/1760600000000-Baseline';
import { findSchemaDrift, runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { CategoryCatalog } from '../src/modules/category/application/categoryCatalog';
import { createCategoryRoutes } from '../src/modules/category/presentation/categoryController';
import { presetForLegacyCategory } from '../src/modules/category/domain/categoryPresets';
import { categoryNameKey } from '../src/modules/category/domain/category';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { buildCategoryPrompt } from '../src/modules/voiceProcessing/domain/categoryPrompt';
import { OpenAITranscriptionService } from '../src/modules/voiceProcessing/infrastructure/openAITranscriptionService';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';

describe('categories in the database (FT-099)', () => {
  describe('old values → starter categories', () => {
    it.each([
      ['food', 'expense', 'Кафе'],
      ['coffee', 'expense', 'Кафе'],
      ['taxi', 'expense', 'Транспорт'],
      ['Такси', 'expense', 'Транспорт'],
      ['кофейня', 'expense', 'Кафе'],
      ['subscriptions', 'expense', 'Связь'],
      ['gifts-expense', 'expense', 'Покупки'],
      ['подарок', 'expense', 'Покупки'],
      ['подарок', 'income', 'Подарки'],
      ['entertainment', 'expense', 'Другое'],
      ['Другое', 'expense', 'Другое'],
      ['transfer', 'expense', 'Другое'],
      ['debt', 'income', 'Другое'],
      ['salary', 'income', 'Зарплата'],
      ['bonus', 'income', 'Зарплата'],
      ['investment', 'income', 'Проценты'],
      ['salary', 'expense', 'Другое'],
      ['taxi', 'income', 'Другое'],
      ['Кино', 'expense', 'Другое'],
      ['', 'income', 'Другое'],
    ] as const)('%s (%s) → %s', (legacy, type, name) => {
      expect(presetForLegacyCategory(legacy, type).name).toBe(name);
    });

    it('compares names regardless of case and ё', () => {
      expect(categoryNameKey('  Ещё  Кафе ')).toBe(categoryNameKey('еще кафе'));
      expect(categoryNameKey('КАФЕ')).toBe('кафе');
    });
  });

  describe('migration', () => {
    let dir: string;
    const open: DataSource[] = [];

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft099-'));
    });

    afterEach(async () => {
      for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    async function oldDatabase(file: string): Promise<void> {
      const ds = new DataSource({ type: 'sqlite', database: file });
      await ds.initialize();
      for (const sql of BASELINE_TABLES) await ds.query(sql);
      const rows: Array<[string, string, string, string | null]> = [
        ['t1', 'user-a', 'expense', 'coffee'],
        ['t2', 'user-a', 'expense', 'Такси'],
        ['t3', 'user-a', 'expense', 'Другое'],
        ['t4', 'user-a', 'expense', null],
        ['t5', 'user-a', 'income', 'salary'],
        ['t6', 'user-a', 'expense', 'salary'],
        ['t7', 'user-a', 'income', 'transfer'],
        ['t8', 'user-b', 'expense', 'Кино'],
      ];
      for (const [id, userId, type, category] of rows) {
        await ds.query(
          `INSERT INTO transactions (id, amount, type, description, date, userId, category) VALUES (?, 1000, ?, 'x', '2026-10-14', ?, ?)`,
          [id, type, userId, category]
        );
      }
      await ds.query(`INSERT INTO users (id, telegram_id) VALUES ('user-c', '555')`);
      await ds.destroy();
    }

    async function migrated(file: string): Promise<DataSource> {
      const ds = createAppDataSource(file);
      open.push(ds);
      await ds.initialize();
      await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));
      return ds;
    }

    it('gives every user 8 + 8 starter categories and moves each record by its type', async () => {
      const file = path.join(dir, 'db.sqlite');
      await oldDatabase(file);
      const ds = await migrated(file);

      const counts = await ds.query(`SELECT user_id, type, COUNT(*) AS n FROM categories GROUP BY 1, 2 ORDER BY 1, 2`);
      expect(counts).toEqual([
        { user_id: 'user-a', type: 'expense', n: 8 }, { user_id: 'user-a', type: 'income', n: 8 },
        { user_id: 'user-b', type: 'expense', n: 8 }, { user_id: 'user-b', type: 'income', n: 8 },
        { user_id: 'user-c', type: 'expense', n: 8 }, { user_id: 'user-c', type: 'income', n: 8 },
      ]);

      const moved = await ds.query(
        `SELECT t.id, c.name, c.type, c.user_id AS owner, t.legacy_category AS legacy FROM transactions t JOIN categories c ON c.id = t.category_id ORDER BY t.id`
      );
      expect(moved).toEqual([
        { id: 't1', name: 'Кафе', type: 'expense', owner: 'user-a', legacy: 'coffee' },
        { id: 't2', name: 'Транспорт', type: 'expense', owner: 'user-a', legacy: 'Такси' },
        { id: 't3', name: 'Другое', type: 'expense', owner: 'user-a', legacy: 'Другое' },
        { id: 't4', name: 'Другое', type: 'expense', owner: 'user-a', legacy: null },
        { id: 't5', name: 'Зарплата', type: 'income', owner: 'user-a', legacy: 'salary' },
        { id: 't6', name: 'Другое', type: 'expense', owner: 'user-a', legacy: 'salary' },
        { id: 't7', name: 'Другое', type: 'income', owner: 'user-a', legacy: 'transfer' },
        { id: 't8', name: 'Другое', type: 'expense', owner: 'user-b', legacy: 'Кино' },
      ]);
      expect(await findSchemaDrift(ds)).toEqual([]);
    });

    it('reverts to the old category column', async () => {
      const file = path.join(dir, 'revert.sqlite');
      await oldDatabase(file);
      const ds = await migrated(file);
      const migrations = await ds.query('SELECT name FROM migrations ORDER BY id');
      // Undo everything after FT-099 first, then FT-099 itself
      for (let i = migrations.length - 1; migrations[i].name !== 'Categories1760900000000'; i -= 1) {
        await ds.undoLastMigration({ transaction: 'each' });
      }
      await ds.undoLastMigration({ transaction: 'each' });

      expect(await ds.query(`SELECT id, category FROM transactions WHERE id IN ('t1', 't4') ORDER BY id`)).toEqual([
        { id: 't1', category: 'coffee' },
        { id: 't4', category: 'Другое' },
      ]);
      expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'categories'`)).toEqual([]);
    });
  });

  describe('with a migrated database', () => {
    let db: TestDatabase;
    let catalog: CategoryCatalog;

    beforeEach(async () => {
      db = await openMigratedDatabase();
      catalog = new CategoryCatalog(new SqliteCategoryRepository(db.dataSource));
    });

    afterEach(async () => {
      await db.close();
    });

    describe('resolving the category of a record', () => {
      const resolve = async (input: Record<string, unknown>) => {
        const result = await catalog.resolveForRecord({ userId: 'user-1', type: 'expense', ...input });
        if (!result.success) throw result.error;
        return result.data.name;
      };

      it('creates the starter set on first use, once', async () => {
        await catalog.listForUser('user-1');
        await catalog.listForUser('user-1');
        expect((await catalog.listForUser('user-1')).map(c => `${c.type}:${c.name}`)).toEqual([
          'expense:Продукты', 'expense:Кафе', 'expense:Транспорт', 'expense:Дом', 'expense:Связь', 'expense:Здоровье',
          'expense:Покупки', 'expense:Другое', 'income:Зарплата', 'income:Фриланс', 'income:Проценты', 'income:Подарки',
          'income:Возврат', 'income:Бизнес', 'income:Кэшбэк', 'income:Другое',
        ]);
      });

      it('by name regardless of case, by old id, by old alias, unknown → «Другое»', async () => {
        expect(await resolve({ category: 'КАФЕ' })).toBe('Кафе');
        expect(await resolve({ category: 'taxi' })).toBe('Транспорт');
        expect(await resolve({ category: 'кофейня' })).toBe('Кафе');
        expect(await resolve({ category: 'Корзинка' })).toBe('Другое');
        expect(await resolve({})).toBe('Другое');
      });

      it('finds renamed and added categories by their new names, and old words still lead to the renamed one', async () => {
        const categories = await catalog.listForUser('user-1');
        const repo = new SqliteCategoryRepository(db.dataSource);
        await repo.update(categories.find(c => c.name === 'Кафе')!.id, { name: 'Рестораны' });

        expect(await resolve({ category: 'рестораны' })).toBe('Рестораны');
        expect(await resolve({ category: 'coffee' })).toBe('Рестораны');
      });

      it('keeps automatic paths out of hidden categories', async () => {
        const categories = await catalog.listForUser('user-1');
        await new SqliteCategoryRepository(db.dataSource).update(categories.find(c => c.name === 'Транспорт')!.id, { isHidden: true });

        expect(await resolve({ category: 'такси', visibleOnly: true })).toBe('Другое');
        expect(await resolve({ category: 'такси' })).toBe('Транспорт');
      });

      it('refuses an id of another user or of the other type', async () => {
        const mine = await catalog.listForUser('user-1');
        const theirs = await catalog.listForUser('user-2');

        const foreign = await catalog.resolveForRecord({ userId: 'user-1', type: 'expense', categoryId: theirs[0].id });
        expect(foreign.success).toBe(false);
        if (!foreign.success) expect((foreign.error as { statusCode?: number }).statusCode).toBe(404);

        const salary = mine.find(c => c.name === 'Зарплата')!;
        const wrongType = await catalog.resolveForRecord({ userId: 'user-1', type: 'expense', categoryId: salary.id });
        expect(wrongType.success).toBe(false);
        if (!wrongType.success) expect((wrongType.error as { statusCode?: number }).statusCode).toBe(400);
      });
    });

    describe('records', () => {
      it('are created and edited with categoryId or with an old value, and a type change moves the category', async () => {
        const repository = new SqliteTransactionRepository(db.dataSource);
        const create = new CreateTransactionUseCase(repository, catalog);
        const update = new UpdateTransactionUseCase(repository, catalog);
        const categories = await catalog.listForUser('user-1');
        const health = categories.find(c => c.name === 'Здоровье')!;

        const byId = await create.execute({
          userId: 'user-1', amount: 50000, type: 'expense', category: '', categoryId: health.id, description: 'Аптека', date: '2026-10-16',
        });
        const byOldId = await create.execute({
          userId: 'user-1', amount: 18000, type: 'expense', category: 'taxi', description: 'Такси', date: '2026-10-16',
        });
        if (!byId.success || !byOldId.success) throw new Error('create failed');

        expect((await repository.findById(byId.data))?.category).toBe('Здоровье');
        expect((await repository.findById(byOldId.data))?.category).toBe('Транспорт');

        const asIncome = await update.execute({ id: byOldId.data, type: 'income' });
        expect(asIncome.success && asIncome.data.category).toBe('Другое');
        expect(asIncome.success && categories.find(c => c.id === asIncome.data.categoryId)?.type).toBe('income');

        const recategorised = await update.execute({ id: byOldId.data, category: 'Подарки' });
        expect(recategorised.success && recategorised.data.category).toBe('Подарки');
      });

      it('from text: the label is matched to the user\'s visible categories', async () => {
        const repository = new SqliteTransactionRepository(db.dataSource);
        const create = new CreateTransactionUseCase(repository, catalog);
        const openAI = { analyzeInput: jest.fn() } as unknown as TranscriptionService;
        const useCase = new ProcessTextInputUseCase(openAI, create, undefined, catalog);

        const taxi = await useCase.execute('такси 18000', 'user-1');
        const coffee = await useCase.execute('кофе 25к', 'user-1');

        expect(taxi.transactions[0]).toMatchObject({ category: 'Транспорт', amount: 18000 });
        expect(coffee.transactions[0]).toMatchObject({ category: 'Кафе', amount: 25000 });
        expect(openAI.analyzeInput).not.toHaveBeenCalled();
      });

      it('the parser is told the user\'s visible categories in their current names', async () => {
        const categories = await catalog.listForUser('user-1');
        const repo = new SqliteCategoryRepository(db.dataSource);
        await repo.update(categories.find(c => c.name === 'Кафе')!.id, { name: 'Рестораны' });
        await repo.update(categories.find(c => c.name === 'Связь')!.id, { isHidden: true });
        const openAI = {
          analyzeInput: jest.fn().mockResolvedValue({ transactions: [], debts: [] }),
        } as unknown as TranscriptionService;
        const create = new CreateTransactionUseCase(new SqliteTransactionRepository(db.dataSource), catalog);

        await new ProcessTextInputUseCase(openAI, create, undefined, catalog).execute('вчера ужин с друзьями и такси домой', 'user-1');

        const context = (openAI.analyzeInput as jest.Mock).mock.calls[0][1];
        const names = context.categories.map((c: { name: string }) => c.name);
        expect(names).toContain('Рестораны');
        expect(names).not.toContain('Кафе');
        expect(names).not.toContain('Связь');
        expect(context.presetNames.get('cafe')).toBe('Рестораны');

        const prompt = buildCategoryPrompt(context.categories);
        const restaurants = prompt.split('\n').find(line => line.startsWith('  - Рестораны'))!;
        // The old name stays a hint after the rename; the current name is not repeated as a hint
        expect(restaurants).toContain('кафе');
        expect(restaurants).toContain('кофе');
        expect(restaurants).not.toContain('рестораны');
        expect(prompt).not.toContain('Связь');
        // A hint that is another category's name would mislead
        expect(prompt.split('\n').find(line => line.startsWith('  - Покупки'))).not.toContain('подарки');
      });
    });

    describe('/api/categories', () => {
      let server: TestServer;

      beforeEach(async () => {
        const userModule = new UserModule(new SqliteUserRepository(db.dataSource));
        const categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
        server = await startTestServer({ '/categories': createCategoryRoutes(categoryModule, userModule) });
      });

      afterEach(async () => {
        await server.close();
      });

      const as = (method: string, url: string, body?: unknown) => server.request(method, url, { devUser: 777, body });

      it('lists the starter categories of a new user, filtered by type', async () => {
        const all = await as('GET', '/api/categories');
        expect(all.status).toBe(200);
        expect(all.body.data).toHaveLength(16);
        expect(all.body.data[0]).toEqual(expect.objectContaining({
          name: 'Продукты', type: 'expense', color: 'peach', isHidden: false, isOther: false, presetKey: 'groceries',
        }));

        const income = await as('GET', '/api/categories?type=income');
        expect(income.body.data.map((c: { name: string }) => c.name)).toEqual([
          'Зарплата', 'Фриланс', 'Проценты', 'Подарки', 'Возврат', 'Бизнес', 'Кэшбэк', 'Другое',
        ]);
        expect((await as('GET', '/api/categories?type=transfer')).status).toBe(400);
        expect((await server.request('GET', '/api/categories')).status).toBe(401);
      });

      it('adds a category before «Другое», with a unique name regardless of case', async () => {
        const created = await as('POST', '/api/categories', { type: 'expense', name: '  Дети ', color: 'lilac' });
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({ name: 'Дети', color: 'lilac', presetKey: null, isOther: false });

        const names = (await as('GET', '/api/categories?type=expense')).body.data.map((c: { name: string }) => c.name);
        expect(names.slice(-2)).toEqual(['Дети', 'Другое']);

        expect((await as('POST', '/api/categories', { type: 'expense', name: 'ДЕТИ', color: 'mint' })).status).toBe(409);
        expect((await as('POST', '/api/categories', { type: 'income', name: 'Дети', color: 'mint' })).status).toBe(201);
        expect((await as('POST', '/api/categories', { type: 'expense', name: 'Кино', color: 'red' })).status).toBe(400);
        expect((await as('POST', '/api/categories', { type: 'expense', name: '   ', color: 'mint' })).status).toBe(400);
      });

      it('renames, recolours and hides; «Другое» is never hidden; another user\'s category is not found', async () => {
        const list = (await as('GET', '/api/categories?type=expense')).body.data;
        const cafe = list.find((c: { name: string }) => c.name === 'Кафе');
        const other = list.find((c: { isOther: boolean }) => c.isOther);

        const renamed = await as('PATCH', `/api/categories/${cafe.id}`, { name: 'Рестораны', color: 'butter' });
        expect(renamed.body.data).toMatchObject({ name: 'Рестораны', color: 'butter' });
        expect((await as('PATCH', `/api/categories/${cafe.id}`, { isHidden: true })).body.data.isHidden).toBe(true);

        expect((await as('PATCH', `/api/categories/${cafe.id}`, { name: 'продукты' })).status).toBe(409);
        expect((await as('PATCH', `/api/categories/${other.id}`, { isHidden: true })).status).toBe(400);
        expect((await as('PATCH', `/api/categories/${other.id}`, { name: 'Прочее' })).status).toBe(200);
        expect((await as('PATCH', `/api/categories/${cafe.id}`, { type: 'income' })).status).toBe(400);

        const stranger = await server.request('PATCH', `/api/categories/${cafe.id}`, { devUser: 888, body: { name: 'Чужое' } });
        expect(stranger.status).toBe(404);
      });
    });
  });

  describe('debt parsing is off (decision Д2)', () => {
    it('turns a debt the model still reports into an expense in «Другое»', () => {
      const service = new OpenAITranscriptionService('test-key');
      const parse = (content: string) => (service as unknown as { parseAnalysisResponse(c: string): unknown }).parseAnalysisResponse(content);

      const result = parse(JSON.stringify({
        items: [
          { intent: 'debt', debtType: 'owed_to_me', personName: 'Азиз', amount: 300000, moneyTransferred: true },
          { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-10-16' },
        ],
      }));

      expect(result).toEqual({
        debts: [],
        transactions: [
          expect.objectContaining({ amount: 300000, category: 'Другое', type: 'expense', semanticType: 'expense', merchant: 'Азиз' }),
          expect.objectContaining({ amount: 25000, category: 'Кафе' }),
        ],
      });
    });
  });
});
