#!/usr/bin/env node

const { AppDataSource } = require('../dist/shared/infrastructure/database/database.config');

async function initializeDatabase() {
  try {
    console.log('🔗 Initializing SQLite database...');
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database connected successfully');
    }
    
    // Force synchronization to create tables
    await AppDataSource.synchronize();
    console.log('📊 Database schema synchronized');
    
    // List all tables to verify
    const queryRunner = AppDataSource.createQueryRunner();
    const tables = await queryRunner.query(`SELECT name FROM sqlite_master WHERE type='table';`);
    console.log('📋 Available tables:', tables.map(t => t.name));
    
    await queryRunner.release();
    await AppDataSource.destroy();
    
    console.log('✅ Database initialization completed successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();