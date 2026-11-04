import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../../src/shared/infrastructure/database/database.config';
import { runMigrationsWithBackup } from '../../src/shared/infrastructure/database/migrationRunner';

export interface TestDatabase {
  dataSource: DataSource;
  close(): Promise<void>;
}

/** Opens `file` of the temp directory `dir` the way the app starts: every pending migration applied. */
async function openMigrated(dir: string, file: string): Promise<DataSource> {
  const dataSource = createAppDataSource(file);
  await dataSource.initialize();
  await runMigrationsWithBackup(dataSource, file, path.join(dir, 'backups'));
  return dataSource;
}

/** openMigrated, and closing removes the directory. */
async function openInDirectory(dir: string, file: string): Promise<TestDatabase> {
  const dataSource = await openMigrated(dir, file);
  return {
    dataSource,
    async close() {
      if (dataSource.isInitialized) await dataSource.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function newDatabaseFile(prefix: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, file: path.join(dir, 'db.sqlite') };
}

/** A fresh SQLite file in a temp directory with every migration applied. */
export async function openMigratedDatabase(): Promise<TestDatabase> {
  const { dir, file } = newDatabaseFile('ft-db-');
  return openInDirectory(dir, file);
}

/**
 * The prepared file's setup may take this long: it is the work every test used to do itself — every migration from
 * scratch, the records of a board through the use case — done once. On a loaded Mac it can go over Jest's 5 s, and a
 * failed `beforeAll` fails the whole file. Each test keeps Jest's 5 s (#237, #250).
 */
const PREPARE_TIMEOUT_MS = 60_000;

/** The columns that name a record's owner: `transactions` and the tables of before FT-099 use `userId`. */
const OWNER_COLUMNS = ['user_id', 'userId'];

export interface PreparedDatabase {
  /** A copy of the prepared file in a fresh temp directory, opened the way openMigratedDatabase opens one. */
  open(): Promise<TestDatabase>;
  /** Copies the prepared file to `target`, for a suite that opens its database itself, like the bot's start. */
  copyTo(target: string): void;
  /**
   * Adds every row `owner` has in the prepared file to `dataSource`, as rows of `userId`: what the records `prepare`
   * wrote through the use case, without writing them again. Ids stay the prepared ones.
   */
  copyRowsOf(owner: string, dataSource: DataSource, userId: string): Promise<void>;
}

/**
 * A migrated SQLite file written once for the describe block it is called in (its `beforeAll`), with what `prepare`
 * writes into it; each test starts on its own copy, so no test sees another's rows. Migrating a fresh file in every
 * test, and writing the same 197 records of a board in every test, took most of the time of some suites, and on a
 * loaded Mac pushed their tests over Jest's 5 s (#237, #250).
 *
 * `prepare` gets the path of the migrated file, closed, and opens it the way its suite opens a database.
 */
export function prepareDatabaseOnce(prepare: (file: string) => Promise<void> = async () => undefined): PreparedDatabase {
  const prepared = { dir: '', file: '' };

  beforeAll(async () => {
    Object.assign(prepared, newDatabaseFile('ft-prepared-'));
    await (await openMigrated(prepared.dir, prepared.file)).destroy();
    await prepare(prepared.file);
  }, PREPARE_TIMEOUT_MS);

  afterAll(() => {
    if (prepared.dir) fs.rmSync(prepared.dir, { recursive: true, force: true });
  });

  return {
    async open() {
      const { dir, file } = newDatabaseFile('ft-db-');
      fs.copyFileSync(prepared.file, file);
      return openInDirectory(dir, file);
    },
    copyTo(target) {
      fs.copyFileSync(prepared.file, target);
    },
    async copyRowsOf(owner, dataSource, userId) {
      await dataSource.query(`ATTACH DATABASE ? AS prepared`, [prepared.file]);
      try {
        const tables: Array<{ name: string }> = await dataSource.query(
          `SELECT name FROM prepared.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'migrations'`
        );
        for (const { name } of tables) await copyTableRows(dataSource, name, owner, userId);
      } finally {
        await dataSource.query(`DETACH DATABASE prepared`);
      }
    },
  };
}

/** One table of copyRowsOf: the owner's rows with the owner column set to `userId`, every other column as it is. */
async function copyTableRows(dataSource: DataSource, table: string, owner: string, userId: string): Promise<void> {
  const columns: string[] = (await dataSource.query(`PRAGMA prepared.table_info("${table}")`)).map((column: { name: string }) => column.name);
  const ownerColumn = columns.find(column => OWNER_COLUMNS.includes(column));
  if (!ownerColumn) {
    const [{ n }] = await dataSource.query(`SELECT COUNT(*) AS n FROM prepared."${table}"`);
    if (n > 0) throw new Error(`The prepared table ${table} has rows but no owner column: teach copyRowsOf to copy it`);
    return;
  }
  const names = columns.map(column => `"${column}"`).join(', ');
  const values = columns.map(column => (column === ownerColumn ? '?' : `"${column}"`)).join(', ');
  await dataSource.query(
    `INSERT INTO main."${table}" (${names}) SELECT ${values} FROM prepared."${table}" WHERE "${ownerColumn}" = ?`,
    [userId, owner]
  );
}
