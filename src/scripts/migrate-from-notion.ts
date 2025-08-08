import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from '../database/database.config';
import { NotionToSqliteMigration1723982400000 } from '../database/migrations/1723982400000-NotionToSqliteMigration';

async function runMigration() {
  console.log('🚀 Starting Notion to SQLite migration...');
  
  try {
    // Initialize database
    await initializeDatabase();
    
    // Run migration
    const migration = new NotionToSqliteMigration1723982400000();
    await migration.migrate();
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
    process.exit(0);
  }
}

runMigration();