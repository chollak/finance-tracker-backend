import { DataSource } from 'typeorm';
import path from 'path';
import { AppConfig } from '../config/appConfig';
import { Transaction, Budget, Debt, DebtPayment, User, Subscription, UsageLimit } from './entities';
import { initializeSupabase } from './supabase.config';
import { createLogger, LogCategory } from '../logging';

const logger = createLogger(LogCategory.DATABASE);

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(process.cwd(), 'data', 'database.sqlite'),
  entities: [Transaction, Budget, Debt, DebtPayment, User, Subscription, UsageLimit],
  synchronize: process.env.DB_SYNCHRONIZE === 'true' || AppConfig.NODE_ENV === 'development',
  logging: AppConfig.NODE_ENV === 'development',
});

export async function initializeDatabase(): Promise<DataSource | null> {
  try {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      logger.info('Initializing Supabase database...');
      initializeSupabase();
      logger.info('Supabase database connected successfully');
      return null; // Supabase doesn't use TypeORM DataSource
    } else {
      logger.info('Initializing SQLite database...');

      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        logger.info('SQLite database connected successfully');
      }

      return AppDataSource;
    }
  } catch (error) {
    logger.error('Database connection failed', error as Error);
    throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppConfig.DATABASE_TYPE === 'sqlite' && AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('SQLite database connection closed');
  } else if (AppConfig.DATABASE_TYPE === 'supabase') {
    logger.info('Supabase connection closed (handled by client)');
  }
}