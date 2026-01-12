// scripts/migrate-to-supabase.ts
// Миграция данных из SQLite в Supabase PostgreSQL

import { AppDataSource } from '../src/shared/infrastructure/database/database.config';
import { getSupabaseClient } from '../src/shared/infrastructure/database/supabase.config';
import { Transaction } from '../src/shared/infrastructure/database/entities/Transaction';
import { Budget } from '../src/shared/infrastructure/database/entities/Budget';

async function migrateData() {
  console.log('🚀 Starting migration from SQLite to Supabase...\n');

  try {
    // 1. Initialize SQLite connection
    console.log('📂 Connecting to SQLite database...');
    await AppDataSource.initialize();
    console.log('✅ SQLite connected\n');

    // 2. Initialize Supabase connection
    console.log('☁️  Connecting to Supabase...');
    const supabase = getSupabaseClient();
    console.log('✅ Supabase connected\n');

    // ===== MIGRATE TRANSACTIONS =====
    console.log('📊 Migrating transactions...');
    const transactionRepo = AppDataSource.getRepository(Transaction);
    const transactions = await transactionRepo.find();

    console.log(`Found ${transactions.length} transactions to migrate`);

    if (transactions.length > 0) {
      // Batch insert (100 at a time for performance)
      const batchSize = 100;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);

        // Map SQLite fields to Supabase fields (camelCase → snake_case)
        const mapped = batch.map(t => ({
          amount: t.amount,
          type: t.type,
          description: t.description,
          date: t.date,
          merchant: t.merchant || null,
          confidence: t.confidence || null,
          original_text: t.originalText || null,
          original_parsing: t.originalParsing || null,
          tags: t.tags || null,
          user_id: t.userId,
          category: t.category || 'Другое',
          created_at: t.createdAt,
          updated_at: t.updatedAt
        }));

        const { data, error } = await supabase
          .from('transactions')
          .insert(mapped);

        if (error) {
          console.error(`❌ Error inserting transactions batch ${i}-${i + batchSize}:`, error.message);
          errorCount += batch.length;
        } else {
          const endIndex = Math.min(i + batchSize, transactions.length);
          console.log(`✅ Migrated transactions ${i + 1}-${endIndex}`);
          successCount += batch.length;
        }
      }

      console.log(`\n📈 Transaction Migration Summary:`);
      console.log(`   ✅ Success: ${successCount}`);
      console.log(`   ❌ Errors: ${errorCount}`);
      console.log(`   📊 Total: ${transactions.length}\n`);
    }

    // ===== MIGRATE BUDGETS =====
    console.log('💰 Migrating budgets...');
    const budgetRepo = AppDataSource.getRepository(Budget);
    const budgets = await budgetRepo.find();

    console.log(`Found ${budgets.length} budgets to migrate`);

    if (budgets.length > 0) {
      const batchSize = 100;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < budgets.length; i += batchSize) {
        const batch = budgets.slice(i, i + batchSize);

        // Map SQLite fields to Supabase fields (camelCase → snake_case)
        const mapped = batch.map(b => ({
          name: b.name,
          amount: b.amount,
          period: b.period,
          start_date: b.startDate,
          end_date: b.endDate,
          category_ids: b.categoryIds || null,
          is_active: b.isActive,
          spent: b.spent || 0,
          description: b.description || null,
          user_id: b.userId,
          created_at: b.createdAt,
          updated_at: b.updatedAt
        }));

        const { data, error } = await supabase
          .from('budgets')
          .insert(mapped);

        if (error) {
          console.error(`❌ Error inserting budgets batch ${i}-${i + batchSize}:`, error.message);
          errorCount += batch.length;
        } else {
          const endIndex = Math.min(i + batchSize, budgets.length);
          console.log(`✅ Migrated budgets ${i + 1}-${endIndex}`);
          successCount += batch.length;
        }
      }

      console.log(`\n📈 Budget Migration Summary:`);
      console.log(`   ✅ Success: ${successCount}`);
      console.log(`   ❌ Errors: ${errorCount}`);
      console.log(`   📊 Total: ${budgets.length}\n`);
    }

    // 4. Close SQLite connection
    console.log('🔌 Closing SQLite connection...');
    await AppDataSource.destroy();
    console.log('✅ SQLite connection closed\n');

    console.log('✨ Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Verify data in Supabase Dashboard');
    console.log('   2. Test application with: npm run dev');
    console.log('   3. Check API endpoints work correctly\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);

    // Try to close SQLite connection even if migration failed
    try {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
    } catch (closeError) {
      console.error('❌ Error closing SQLite connection:', closeError);
    }

    process.exit(1);
  }
}

// Run migration
migrateData().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
