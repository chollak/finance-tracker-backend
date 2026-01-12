import { DataSource } from 'typeorm';
import path from 'path';
import { AppConfig } from '../config/appConfig';
import { Transaction, Budget } from './entities';
import { initializeSupabase } from './supabase.config';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(process.cwd(), 'data', 'database.sqlite'),
  entities: [Transaction, Budget],
  synchronize: process.env.DB_SYNCHRONIZE === 'true' || AppConfig.NODE_ENV === 'development',
  logging: AppConfig.NODE_ENV === 'development',
});

export async function initializeDatabase(): Promise<DataSource | null> {
  try {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      console.log('🔗 Initializing Supabase database...');
      initializeSupabase();
      console.log('✅ Supabase database connected successfully');
      return null; // Supabase doesn't use TypeORM DataSource
    } else {
      console.log('🔗 Initializing SQLite database...');
      
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        console.log('✅ SQLite database connected successfully');
      }
      
      return AppDataSource;
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppConfig.DATABASE_TYPE === 'sqlite' && AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('🔌 SQLite database connection closed');
  } else if (AppConfig.DATABASE_TYPE === 'supabase') {
    console.log('🔌 Supabase connection closed (handled by client)');
  }
}