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

/**
 * A SQLite file a test opens as often as the bot restarts (#294): each `open()` is a new connection made the way the app
 * starts, and a restart is closing the old one and opening again. What was in memory is gone, what is in the file stays.
 */
export interface DatabaseFile {
  /** The directory the file is in; the app's copy before a migration goes to its `backups/`. */
  readonly dir: string;
  readonly file: string;
  /** A new connection to the file, as the app opens one: every pending migration applied, after a backup. */
  open(): Promise<DataSource>;
  /** Closes every connection `open()` gave that is still open; the file stays. */
  closeAll(): Promise<void>;
  /** Closes them and removes the directory. */
  remove(): Promise<void>;
}

/** The database file `file`; `remove()` deletes the directory it is in. */
export function databaseFileAt(file: string): DatabaseFile {
  const dir = path.dirname(file);
  const connections: DataSource[] = [];
  const closeAll = async () => {
    for (const dataSource of connections.splice(0)) if (dataSource.isInitialized) await dataSource.destroy();
  };
  return {
    dir,
    file,
    async open() {
      const dataSource = createAppDataSource(file);
      connections.push(dataSource);
      await dataSource.initialize();
      await runMigrationsWithBackup(dataSource, file, path.join(dir, 'backups'));
      return dataSource;
    },
    closeAll,
    async remove() {
      await closeAll();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The path of `name` in a new temp directory. */
function newDatabasePath(prefix: string, name = 'db.sqlite'): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), prefix)), name);
}

/** A new, empty SQLite file `name` in a temp directory of its own: the first `open()` migrates it. */
export function newDatabaseFile(name = 'db.sqlite'): DatabaseFile {
  return databaseFileAt(newDatabasePath('ft-db-', name));
}

/** One connection to the file; closing it removes the file. */
async function openOnce(database: DatabaseFile): Promise<TestDatabase> {
  return { dataSource: await database.open(), close: () => database.remove() };
}

/** A fresh SQLite file in a temp directory with every migration applied. */
export async function openMigratedDatabase(): Promise<TestDatabase> {
  return openOnce(newDatabaseFile());
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
  /** A copy of the prepared file in a fresh temp directory, to open as often as the bot restarts (#294). */
  newFile(): DatabaseFile;
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
    const migrated = databaseFileAt(newDatabasePath('ft-prepared-'));
    Object.assign(prepared, { dir: migrated.dir, file: migrated.file });
    await migrated.open();
    await migrated.closeAll();
    await prepare(prepared.file);
  }, PREPARE_TIMEOUT_MS);

  afterAll(() => {
    if (prepared.dir) fs.rmSync(prepared.dir, { recursive: true, force: true });
  });

  const newFile = (): DatabaseFile => {
    const file = newDatabasePath('ft-db-');
    fs.copyFileSync(prepared.file, file);
    return databaseFileAt(file);
  };

  return {
    open: () => openOnce(newFile()),
    newFile,
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
