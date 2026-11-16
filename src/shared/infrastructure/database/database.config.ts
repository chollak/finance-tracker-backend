import fs from 'fs';
import { DataSource, type Logger as TypeOrmLogger } from 'typeorm';
import path from 'path';
import { AppConfig } from '../config/appConfig';
import { Transaction, Budget, Debt, DebtPayment, User, Subscription, UsageLimit, UserSettings, Category, Account, FxRate, AccountMove, BotMessage, HandledMessage, NotificationLog, LoginToken, Audit, Goal } from './entities';
import { MIGRATIONS } from './migrations';
import { findSchemaDrift, runMigrationsWithBackup } from './migrationRunner';
import { createLogger, LogCategory } from '../logging';

const logger = createLogger(LogCategory.DATABASE);

export const DATABASE_FILE = path.join(process.cwd(), 'data', 'database.sqlite');
export const DATABASE_BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

export const DATABASE_ENTITIES = [
  Transaction, Budget, Debt, DebtPayment, User, Subscription, UsageLimit, UserSettings, Category, Account, FxRate, AccountMove, BotMessage, HandledMessage, NotificationLog, LoginToken, Audit, Goal,
];

/** A literal of SQL: a string in single quotes ('' inside it is a quote; cut short, up to the end) or a number. */
const SQL_STRING_LITERAL = /'(?:[^']|'')*(?:'|$)/g;
const SQL_NUMBER_LITERAL = /(?<![\w.$])(?:0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\w.$])/gi;

/**
 * SQL, or SQLite's error about it, with every literal as `?`. TypeORM sends a string as a parameter but writes a number
 * — a record's amount — straight into the text of the query for SQLite (`AbstractSqliteDriver.escapeQueryWithParameters`),
 * and SQLite's error quotes a piece of the text («near "5123400"»). Names of tables and columns stay: they say what
 * failed, and in the SQL TypeORM writes they are the only words that are not keywords.
 */
function withoutSqlValues(text: string): string {
  return text.replace(SQL_STRING_LITERAL, '?').replace(SQL_NUMBER_LITERAL, '?');
}

/**
 * TypeORM's own lines go through the app's logger (#295). Its console logger wrote them with console.log: plain text
 * among the JSON lines of production, and noise in Jest, where the app's logger is silent. Written as before: a failed
 * query and a failed migration (TypeORM calls `logMigration` only then), and its warnings in development. A failed
 * query goes without any value of a record (review of PR #392): not its parameters, not the literals of its text
 * (`withoutSqlValues`), and not the error's stack — sqlite3's verbose mode, which TypeORM turns on, writes the
 * parameters into it.
 */
function appTypeOrmLogger(withWarnings: boolean): TypeOrmLogger {
  const nothing = () => undefined;
  return {
    logQuery: nothing,
    logQueryError: (error, query) =>
      logger.error('Query failed', null, {
        query: withoutSqlValues(query),
        error: withoutSqlValues(typeof error === 'string' ? error : error.message),
      }),
    logQuerySlow: (time, query) => logger.warn('Query is slow', { query: withoutSqlValues(query), timeMs: time }),
    logSchemaBuild: nothing,
    logMigration: (message) => logger.error(message),
    log: (level, message) => {
      if (level === 'warn' && withWarnings) logger.warn(String(message));
    },
  };
}

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
    logger: appTypeOrmLogger(AppConfig.NODE_ENV === 'development'),
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
