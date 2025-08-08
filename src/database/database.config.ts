import { DataSource } from 'typeorm';
import path from 'path';
import { AppConfig } from '../config/appConfig';
import { User, Category, Account, Transaction, Budget } from './entities';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(process.cwd(), 'data', 'database.sqlite'),
  entities: [User, Category, Account, Transaction, Budget],
  synchronize: AppConfig.NODE_ENV === 'development', // Only in development
  logging: AppConfig.NODE_ENV === 'development',
});

export async function initializeDatabase(): Promise<DataSource> {
  try {
    console.log('🔗 Initializing SQLite database...');
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database connected successfully');
    }
    
    return AppDataSource;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('🔌 Database connection closed');
  }
}