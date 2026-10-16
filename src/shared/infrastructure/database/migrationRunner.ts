import fs from 'fs';
import path from 'path';
import { DataSource } from 'typeorm';

export interface MigrationRunResult {
  /** Names of migrations applied by this run, in order. Empty when nothing was pending. */
  applied: string[];
  /** Copy of the database file taken before the first pending migration, if it held any tables. */
  backupPath?: string;
}

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Copy the SQLite file into `backupDir` as `database-YYYYMMDD-HHmmss.sqlite`.
 * Called before migrations, when nothing else writes to the database yet.
 */
export function backupDatabaseFile(databaseFile: string, backupDir: string, now: Date = new Date()): string {
  fs.mkdirSync(backupDir, { recursive: true });
  let target = path.join(backupDir, `database-${timestamp(now)}.sqlite`);
  for (let attempt = 1; fs.existsSync(target); attempt += 1) {
    target = path.join(backupDir, `database-${timestamp(now)}-${attempt}.sqlite`);
  }
  fs.copyFileSync(databaseFile, target);
  return target;
}

/** True when the database holds any table besides TypeORM's own bookkeeping — i.e. something to lose. */
async function hasDataTables(dataSource: DataSource): Promise<boolean> {
  const rows = await dataSource.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('migrations', 'sqlite_sequence')"
  );
  return rows.length > 0;
}

/**
 * Apply pending migrations, copying the database file first so a failed or unwanted migration can be
 * undone by restoring the copy. Each migration runs in its own transaction.
 */
export async function runMigrationsWithBackup(
  dataSource: DataSource,
  databaseFile: string,
  backupDir: string = path.join(path.dirname(databaseFile), 'backups')
): Promise<MigrationRunResult> {
  const hasPending = await dataSource.showMigrations();
  if (!hasPending) {
    return { applied: [] };
  }

  let backupPath: string | undefined;
  if (fs.existsSync(databaseFile) && (await hasDataTables(dataSource))) {
    backupPath = backupDatabaseFile(databaseFile, backupDir);
  }

  const applied = await dataSource.runMigrations({ transaction: 'each' });
  return { applied: applied.map(migration => migration.name), backupPath };
}

/**
 * SQL that `synchronize` would run to make the tables match the entities. Empty means entities and
 * schema agree. A non-empty result means an entity changed without a migration (or the database was
 * changed by hand) — it is reported, never applied automatically.
 */
export async function findSchemaDrift(dataSource: DataSource): Promise<string[]> {
  const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
  return sqlInMemory.upQueries.map(query => query.query);
}
