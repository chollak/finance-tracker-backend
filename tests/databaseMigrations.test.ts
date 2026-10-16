import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import {
  createAppDataSource,
  DATABASE_ENTITIES,
} from '../src/shared/infrastructure/database/database.config';
import { baselineColumns } from '../src/shared/infrastructure/database/migrations/1760600000000-Baseline';
import {
  backupDatabaseFile,
  findSchemaDrift,
  runMigrationsWithBackup,
} from '../src/shared/infrastructure/database/migrationRunner';

/**
 * Runs against real SQLite files in a temp directory: the point is to prove that the baseline
 * matches what `synchronize` used to create, and that existing databases keep their data.
 */
describe('database migrations (FT-090)', () => {
  let dir: string;
  const open: DataSource[] = [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft090-'));
  });

  afterEach(async () => {
    for (const ds of open.splice(0)) {
      if (ds.isInitialized) await ds.destroy();
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function appDataSource(file: string): Promise<DataSource> {
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();
    return ds;
  }

  /** A database the way the app created it before FT-090: `synchronize`, no migrations table. */
  async function legacyDatabase(file: string): Promise<void> {
    const ds = new DataSource({ type: 'sqlite', database: file, entities: DATABASE_ENTITIES, synchronize: true });
    await ds.initialize();
    await ds.query(
      `INSERT INTO transactions (id, amount, type, description, date, userId, category)
       VALUES ('tx-1', 25000, 'expense', 'Кофе', '2026-10-14', 'user-1', 'coffee')`
    );
    await ds.destroy();
  }

  const tables = async (ds: DataSource) =>
    (await ds.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((row: { name: string }) => row.name);

  it('creates the full schema on a fresh database, matching the entities exactly', async () => {
    const file = path.join(dir, 'fresh.sqlite');
    const ds = await appDataSource(file);

    const result = await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    expect(result.applied).toEqual(['Baseline1760600000000']);
    expect(await tables(ds)).toEqual(expect.arrayContaining([
      'budgets', 'debt_payments', 'debts', 'migrations', 'subscriptions', 'transactions', 'usage_limits', 'users',
    ]));
    expect(await findSchemaDrift(ds)).toEqual([]);
  });

  it('adopts a database created by synchronize without touching its data, after a backup', async () => {
    const file = path.join(dir, 'legacy.sqlite');
    await legacyDatabase(file);
    const ds = await appDataSource(file);

    const result = await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    expect(result.applied).toEqual(['Baseline1760600000000']);
    expect(result.backupPath).toBeDefined();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    expect(await ds.query('SELECT id, description FROM transactions')).toEqual([{ id: 'tx-1', description: 'Кофе' }]);
    expect(await findSchemaDrift(ds)).toEqual([]);

    const backup = new DataSource({ type: 'sqlite', database: result.backupPath! });
    open.push(backup);
    await backup.initialize();
    expect(await backup.query('SELECT id FROM transactions')).toEqual([{ id: 'tx-1' }]);
  });

  it('refuses to adopt a database whose tables miss baseline columns, and changes nothing', async () => {
    const file = path.join(dir, 'old.sqlite');
    const old = new DataSource({ type: 'sqlite', database: file });
    await old.initialize();
    await old.query(
      `CREATE TABLE "transactions" ("id" varchar PRIMARY KEY NOT NULL, "amount" decimal(10,2) NOT NULL, "type" varchar NOT NULL,
        "description" varchar NOT NULL, "date" date NOT NULL, "userId" varchar NOT NULL, "category" varchar)`
    );
    await old.query(`INSERT INTO transactions (id, amount, type, description, date, userId) VALUES ('tx-1', 1, 'expense', 'x', '2026-10-14', 'u')`);
    await old.destroy();
    const ds = await appDataSource(file);

    await expect(runMigrationsWithBackup(ds, file, path.join(dir, 'backups'))).rejects.toThrow(/semanticType, needsReview/);

    expect(await ds.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")).toEqual([]);
    expect(await ds.query('SELECT id FROM transactions')).toEqual([{ id: 'tx-1' }]);
    expect(fs.readdirSync(path.join(dir, 'backups'))).toHaveLength(1);
  });

  it('does nothing and takes no backup when no migration is pending', async () => {
    const file = path.join(dir, 'current.sqlite');
    const ds = await appDataSource(file);
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    const second = await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    expect(second).toEqual({ applied: [] });
    // A brand-new database has nothing to lose, and the second run has nothing to apply.
    const backups = path.join(dir, 'backups');
    expect(fs.existsSync(backups) ? fs.readdirSync(backups) : []).toHaveLength(0);
  });

  it('reports drift when the database no longer matches the entities', async () => {
    const file = path.join(dir, 'drift.sqlite');
    const ds = await appDataSource(file);
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    await ds.query('ALTER TABLE transactions ADD COLUMN "handMade" varchar');

    expect((await findSchemaDrift(ds)).length).toBeGreaterThan(0);
  });

  it('refuses to revert the baseline, which would drop all data', async () => {
    const file = path.join(dir, 'revert.sqlite');
    const ds = await appDataSource(file);
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    await expect(ds.undoLastMigration()).rejects.toThrow(/cannot be reverted/);
  });

  it('reads the baseline column list from its own SQL', () => {
    const columns = baselineColumns();
    expect(Object.keys(columns).sort()).toEqual(['budgets', 'debt_payments', 'debts', 'subscriptions', 'transactions', 'usage_limits', 'users']);
    expect(columns.transactions).toEqual(expect.arrayContaining(['id', 'amount', 'semanticType', 'needsReview', 'category', 'splitGroupId']));
    expect(columns.transactions).toHaveLength(20);
  });

  it('names backups by time and never overwrites an earlier one', () => {
    const file = path.join(dir, 'db.sqlite');
    fs.writeFileSync(file, 'data');
    const now = new Date(2026, 9, 16, 17, 30, 5);

    const first = backupDatabaseFile(file, path.join(dir, 'backups'), now);
    const second = backupDatabaseFile(file, path.join(dir, 'backups'), now);

    expect(path.basename(first)).toBe('database-20261016-173005.sqlite');
    expect(second).not.toBe(first);
    expect(fs.readFileSync(second, 'utf8')).toBe('data');
  });
});
