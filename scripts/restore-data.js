#!/usr/bin/env node

const { AppDataSource, DATABASE_FILE, DATABASE_BACKUP_DIR } = require('../dist/shared/infrastructure/database/database.config');
const { runMigrationsWithBackup } = require('../dist/shared/infrastructure/database/migrationRunner');
const { CategoryCatalog } = require('../dist/modules/category/application/categoryCatalog');
const { SqliteCategoryRepository } = require('../dist/modules/category/infrastructure/SqliteCategoryRepository');
const { AccountBook } = require('../dist/modules/account/application/accountBook');
const { SqliteAccountRepository } = require('../dist/modules/account/infrastructure/SqliteAccountRepository');
const { toMinor } = require('../dist/shared/domain/money/money');
const { toDateOnly } = require('../dist/shared/domain/dates/dateOnly');
const { recordSearchText } = require('../dist/modules/transaction/domain/transactionHistory');
const fs = require('fs');
const path = require('path');

/**
 * A record from any dump, old or new, in today's schema: amount in minor units (FT-097, read from the
 * decimal string, no float error), the user's category (FT-099) and account (FT-101) resolved like a
 * new record, currency UZS unless the dump says otherwise (FT-103), the search text (FT-107).
 */
async function toCurrentRecord(transaction, catalog, book) {
  const record = { ...transaction };
  if (record.amountMinor === undefined && record.amount !== undefined) record.amountMinor = toMinor(String(record.amount));
  delete record.amount;
  record.currency = record.currency === 'USD' ? 'USD' : 'UZS';
  if (record.date) record.date = toDateOnly(String(record.date));
  const type = record.type === 'income' ? 'income' : 'expense';
  if (!record.categoryId) {
    const category = await catalog.resolveForRecord({ userId: record.userId, type, category: record.category });
    if (!category.success) throw category.error;
    record.categoryId = category.data.id;
    record.legacyCategory = record.category ?? null;
  }
  delete record.category;
  if (!record.accountId) {
    const account = await book.resolveForRecord({ userId: record.userId, currency: record.currency });
    if (!account.success) throw account.error;
    record.accountId = account.data.id;
  }
  record.searchText = recordSearchText(record);
  return record;
}

async function restoreData(filePath, dataType = 'auto') {
  try {
    console.log('🔄 Starting data restoration...');
    
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database connected');
    }
    // Tables come from migrations (FT-090); a fresh database has none until they run.
    await runMigrationsWithBackup(AppDataSource, DATABASE_FILE, DATABASE_BACKUP_DIR);

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
    const catalog = new CategoryCatalog(new SqliteCategoryRepository(AppDataSource));
    const book = new AccountBook(new SqliteAccountRepository(AppDataSource));

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
            await transactionRepo.save(await toCurrentRecord(transaction, catalog, book));
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