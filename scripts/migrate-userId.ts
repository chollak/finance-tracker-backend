/**
 * Migration Script: Fix userId Inconsistency
 *
 * This script resolves the userId mismatch between modules:
 * - Transactions were created with telegramId as userId
 * - Other modules (Budgets, Debts) use UUID as userId
 *
 * The script:
 * 1. Finds all unique telegramIds in transactions
 * 2. Maps them to UUIDs via the users table
 * 3. Updates transactions to use UUIDs
 * 4. Cleans up orphan user records
 *
 * Run: npx ts-node scripts/migrate-userId.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../data/database.sqlite');

// UUID v4 regex pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUUID(str: string): boolean {
  return UUID_PATTERN.test(str);
}

function migrateUserIds() {
  console.log('🚀 Starting userId migration...\n');

  const db = new Database(DB_PATH);

  try {
    // Step 1: Get all unique userIds from transactions
    console.log('📊 Step 1: Analyzing transactions...');
    const userIds = db
      .prepare('SELECT DISTINCT userId FROM transactions')
      .all() as { userId: string }[];

    console.log(`   Found ${userIds.length} unique userIds in transactions:`);
    userIds.forEach((u) => console.log(`   - ${u.userId}`));
    console.log('');

    // Step 2: Categorize userIds
    const uuidUserIds: string[] = [];
    const telegramUserIds: string[] = [];

    for (const { userId } of userIds) {
      if (isUUID(userId)) {
        uuidUserIds.push(userId);
      } else {
        telegramUserIds.push(userId);
      }
    }

    console.log(`   UUID userIds (already correct): ${uuidUserIds.length}`);
    console.log(`   Telegram userIds (need migration): ${telegramUserIds.length}`);
    console.log('');

    // Step 3: Build mapping from telegramId to UUID
    console.log('🔄 Step 2: Building telegramId → UUID mapping...');
    const mapping: Record<string, string> = {};

    for (const telegramId of telegramUserIds) {
      const user = db
        .prepare('SELECT id FROM users WHERE telegram_id = ?')
        .get(telegramId) as { id: string } | undefined;

      if (user) {
        mapping[telegramId] = user.id;
        console.log(`   ${telegramId} → ${user.id}`);
      } else {
        console.log(`   ⚠️ ${telegramId} - No user found, will skip`);
      }
    }
    console.log('');

    // Step 4: Update transactions
    console.log('📝 Step 3: Updating transactions...');
    const updateStmt = db.prepare('UPDATE transactions SET userId = ? WHERE userId = ?');

    let updatedCount = 0;
    for (const [telegramId, uuid] of Object.entries(mapping)) {
      const result = updateStmt.run(uuid, telegramId);
      updatedCount += result.changes;
      console.log(`   Updated ${result.changes} transactions: ${telegramId} → ${uuid}`);
    }
    console.log(`   Total updated: ${updatedCount} transactions`);
    console.log('');

    // Step 5: Clean up orphan users (users with UUID as telegram_id)
    console.log('🧹 Step 4: Cleaning up orphan users...');
    const orphanUsers = db
      .prepare(
        `SELECT id, telegram_id FROM users
         WHERE telegram_id LIKE '%-%-%-%-%'
         AND length(telegram_id) = 36`
      )
      .all() as { id: string; telegram_id: string }[];

    if (orphanUsers.length > 0) {
      console.log(`   Found ${orphanUsers.length} orphan user(s):`);
      for (const orphan of orphanUsers) {
        console.log(`   - ${orphan.id} (telegram_id: ${orphan.telegram_id})`);
      }

      const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
      for (const orphan of orphanUsers) {
        deleteStmt.run(orphan.id);
        console.log(`   ✅ Deleted orphan user: ${orphan.id}`);
      }
    } else {
      console.log('   No orphan users found');
    }
    console.log('');

    // Step 6: Verify migration
    console.log('✅ Step 5: Verifying migration...');
    const remainingTelegramIds = db
      .prepare(
        `SELECT DISTINCT userId FROM transactions
         WHERE userId NOT LIKE '%-%-%-%-%'`
      )
      .all() as { userId: string }[];

    if (remainingTelegramIds.length === 0) {
      console.log('   All transactions now use UUID userIds!');
    } else {
      console.log(`   ⚠️ ${remainingTelegramIds.length} transactions still use non-UUID userIds:`);
      remainingTelegramIds.forEach((u) => console.log(`   - ${u.userId}`));
    }

    // Final stats
    console.log('\n📈 Migration Summary:');
    const finalUserIds = db
      .prepare('SELECT COUNT(DISTINCT userId) as count FROM transactions')
      .get() as { count: number };
    const finalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number;
    };
    const finalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as {
      count: number;
    };

    console.log(`   Total users: ${finalUsers.count}`);
    console.log(`   Total transactions: ${finalTransactions.count}`);
    console.log(`   Unique userIds in transactions: ${finalUserIds.count}`);
    console.log('\n✨ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration
migrateUserIds();
