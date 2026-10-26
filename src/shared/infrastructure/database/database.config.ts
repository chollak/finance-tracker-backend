import fs from 'fs';
import { DataSource } from 'typeorm';
import path from 'path';
import { AppConfig } from '../config/appConfig';
import { Transaction, Budget, Debt, DebtPayment, User, Subscription, UsageLimit, UserSettings, Category, Account, FxRate, AccountMove, BotMessage, NotificationLog, LoginToken, Audit, Goal } from './entities';
import { MIGRATIONS } from './migrations';
import { findSchemaDrift, runMigrationsWithBackup } from './migrationRunner';
import { createLogger, LogCategory } from '../logging';

const logger = createLogger(LogCategory.DATABASE);

export const DATABASE_FILE = path.join(process.cwd(), 'data', 'database.sqlite');
export const DATABASE_BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

export const DATABASE_ENTITIES = [
  Transaction, Budget, Debt, DebtPayment, User, Subscription, UsageLimit, UserSettings, Category, Account, FxRate, AccountMove, BotMessage, NotificationLog, LoginToken, Audit, Goal,
];

/**
 * One database path: TypeORM over SQLite, schema changed only by migrations (decision Д6, FT-090).
 * `synchronize` is off — it cannot convert types or move data and could drop a column silently.
 */
export function createAppDataSource(databaseFile: string = DATABASE_FILE): DataSource {
  return new DataSource({
    type: 'sqlite',
    database: databaseFile,
    entities: DATABASE_ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'migrations',
    synchronize: false,
    logging: AppConfig.NODE_ENV === 'development' ? ['error', 'warn', 'migration'] : ['error', 'migration'],
  });
}

export const AppDataSource = createAppDataSource();

export async function initializeDatabase(): Promise<DataSource> {
  try {
    logger.info('Initializing SQLite database...');
    fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { applied, backupPath } = await runMigrationsWithBackup(AppDataSource, DATABASE_FILE, DATABASE_BACKUP_DIR);
    if (applied.length > 0) {
      logger.info('Database migrations applied', { applied, backupPath });
    }

    const drift = await findSchemaDrift(AppDataSource);
    if (drift.length > 0) {
      logger.warn('Database schema differs from entities — add a migration', { pendingSql: drift });
    }

    logger.info('SQLite database connected successfully');
    return AppDataSource;
  } catch (error) {
    logger.error('Database connection failed', error as Error);
    throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('SQLite database connection closed');
  }
}
