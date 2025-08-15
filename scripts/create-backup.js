#!/usr/bin/env node

const { AppDataSource } = require('../dist/shared/infrastructure/database/database.config');
const fs = require('fs');

async function createBackup(outputPath = 'data/backup.json') {
  try {
    console.log('📦 Creating database backup...');
    
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database connected');
    }

    // Get repositories
    const transactionRepo = AppDataSource.getRepository('Transaction');
    const budgetRepo = AppDataSource.getRepository('Budget');

    // Export data
    const transactions = await transactionRepo.find();
    const budgets = await budgetRepo.find();

    const backup = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      transactions: transactions,
      budgets: budgets
    };

    // Write to file
    fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2));
    
    await AppDataSource.destroy();
    
    console.log(`✅ Backup created successfully!`);
    console.log(`📊 Exported ${transactions.length} transactions and ${budgets.length} budgets`);
    console.log(`💾 Saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  }
}

// Command line usage
const outputPath = process.argv[2] || 'data/backup.json';
createBackup(outputPath);