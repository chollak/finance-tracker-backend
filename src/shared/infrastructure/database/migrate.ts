import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { AppDataSource, DATABASE_BACKUP_DIR, DATABASE_FILE } from './database.config';
import { backupDatabaseFile, findSchemaDrift, runMigrationsWithBackup } from './migrationRunner';
import { MIGRATIONS } from './migrations';

/**
 * Command line for schema migrations (run through the compiled build):
 *   npm run migration:show    — which migrations are applied and which are pending
 *   npm run migration:run     — copy the database to data/backups/, then apply pending migrations
 *   npm run migration:revert  — copy the database, then undo the last applied migration
 * The application also applies pending migrations on start (with the same backup).
 */
async function show(): Promise<void> {
  const tableExists = (await AppDataSource.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'"
  )).length > 0;
  const applied: Array<{ name: string }> = tableExists
    ? await AppDataSource.query('SELECT name FROM migrations ORDER BY id')
    : [];
  const appliedNames = new Set(applied.map(row => row.name));

  for (const migration of MIGRATIONS) {
    const name = new migration().name ?? migration.name;
    console.log(`${appliedNames.has(name) ? '[x]' : '[ ]'} ${name}`);
  }

  const drift = await findSchemaDrift(AppDataSource);
  console.log(drift.length === 0
    ? 'Schema matches the entities.'
    : `Schema differs from the entities (${drift.length} statements would be needed):\n${drift.join(';\n')}`);
}

async function run(): Promise<void> {
  const { applied, backupPath } = await runMigrationsWithBackup(AppDataSource, DATABASE_FILE, DATABASE_BACKUP_DIR);
  if (applied.length === 0) {
    console.log('No pending migrations.');
    return;
  }
  if (backupPath) console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`);
  console.log(`Applied: ${applied.join(', ')}`);
}

async function revert(): Promise<void> {
  if (fs.existsSync(DATABASE_FILE)) {
    const backupPath = backupDatabaseFile(DATABASE_FILE, DATABASE_BACKUP_DIR);
    console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`);
  }
  await AppDataSource.undoLastMigration({ transaction: 'each' });
  console.log('Reverted the last applied migration.');
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const commands: Record<string, () => Promise<void>> = { show, run, revert };
  const handler = commands[command];
  if (!handler) {
    console.error('Usage: migrate <show|run|revert>');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });
  await AppDataSource.initialize();
  try {
    await handler();
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
