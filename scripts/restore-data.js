#!/usr/bin/env node

const { AppDataSource } = require('../dist/shared/infrastructure/database/database.config');
const fs = require('fs');
const path = require('path');

async function restoreData(filePath, dataType = 'auto') {
  try {
    console.log('🔄 Starting data restoration...');
    
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database connected');
    }

    // Read dump file
    console.log(`📥 Reading dump file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    let data;
    const fileExt = path.extname(filePath).toLowerCase();
    
    // Parse based on file type
    if (fileExt === '.json' || dataType === 'json') {
      data = JSON.parse(fileContent);
    } else if (fileExt === '.sql' || dataType === 'sql') {
      console.log('📋 For SQL files, use restore-from-dump.sh script instead');
      process.exit(1);
    } else {
      console.log('❌ Unsupported file format. Use .json or .sql files');
      process.exit(1);
    }

    // Get repository
    const transactionRepo = AppDataSource.getRepository('Transaction');
    const budgetRepo = AppDataSource.getRepository('Budget');

    let restoredCount = 0;

    // Restore transactions
    if (data.transactions && Array.isArray(data.transactions)) {
      console.log(`📊 Restoring ${data.transactions.length} transactions...`);
      
      for (const transaction of data.transactions) {
        try {
          // Check if transaction already exists
          const existing = await transactionRepo.findOne({ 
            where: { id: transaction.id } 
          });
          
          if (!existing) {
            await transactionRepo.save(transaction);
            restoredCount++;
          } else {
            console.log(`⚠️  Transaction ${transaction.id} already exists, skipping`);
          }
        } catch (error) {
          console.error(`❌ Failed to restore transaction ${transaction.id}:`, error.message);
        }
      }
    }

    // Restore budgets
    if (data.budgets && Array.isArray(data.budgets)) {
      console.log(`💰 Restoring ${data.budgets.length} budgets...`);
      
      for (const budget of data.budgets) {
        try {
          const existing = await budgetRepo.findOne({ 
            where: { id: budget.id } 
          });
          
          if (!existing) {
            await budgetRepo.save(budget);
            restoredCount++;
          } else {
            console.log(`⚠️  Budget ${budget.id} already exists, skipping`);
          }
        } catch (error) {
          console.error(`❌ Failed to restore budget ${budget.id}:`, error.message);
        }
      }
    }

    await AppDataSource.destroy();
    
    console.log(`✅ Data restoration completed!`);
    console.log(`📈 Restored ${restoredCount} records`);
    
  } catch (error) {
    console.error('❌ Restoration failed:', error);
    process.exit(1);
  }
}

// Command line usage
const filePath = process.argv[2];
const dataType = process.argv[3];

if (!filePath) {
  console.log('Usage: node restore-data.js <dump_file_path> [data_type]');
  console.log('Example: node restore-data.js backup.json');
  console.log('Example: node restore-data.js backup.json json');
  process.exit(1);
}

restoreData(filePath, dataType);