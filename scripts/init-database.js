#!/usr/bin/env node

// Creates or upgrades data/database.sqlite by applying TypeORM migrations (FT-090).
// `synchronize` is no longer used: it cannot move data and could rebuild tables on its own.
// Run after `npm run build` (docker compose run db-init does this inside the image).
const { AppDataSource, DATABASE_FILE, DATABASE_BACKUP_DIR } = require('../dist/shared/infrastructure/database/database.config');
const { runMigrationsWithBackup, findSchemaDrift } = require('../dist/shared/infrastructure/database/migrationRunner');

async function initializeDatabase() {
  try {
    console.log('Initializing SQLite database...');
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { applied, backupPath } = await runMigrationsWithBackup(AppDataSource, DATABASE_FILE, DATABASE_BACKUP_DIR);
    if (backupPath) console.log(`Backup: ${backupPath}`);
    console.log(applied.length > 0 ? `Applied migrations: ${applied.join(', ')}` : 'No pending migrations.');

    const drift = await findSchemaDrift(AppDataSource);
    if (drift.length > 0) {
      console.warn(`Schema differs from the entities — add a migration:\n${drift.join(';\n')}`);
    }

    const tables = await AppDataSource.query("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables:', tables.map(t => t.name).join(', '));
    await AppDataSource.destroy();
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();
