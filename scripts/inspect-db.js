#!/usr/bin/env node

const { AppDataSource } = require('../dist/database/database.config');
const { initializeDatabase, closeDatabase } = require('../dist/database/database.config');

async function inspectDatabase() {
  try {
    console.log('🔍 Inspecting SQLite Database...\n');
    
    await initializeDatabase();
    
    // Get all repositories
    const userRepo = AppDataSource.getRepository('User');
    const transactionRepo = AppDataSource.getRepository('Transaction');
    const categoryRepo = AppDataSource.getRepository('Category');
    const accountRepo = AppDataSource.getRepository('Account');
    
    // Show summary
    console.log('📊 DATABASE SUMMARY:');
    console.log('===================');
    console.log(`👥 Users: ${await userRepo.count()}`);
    console.log(`💰 Transactions: ${await transactionRepo.count()}`);
    console.log(`📁 Categories: ${await categoryRepo.count()}`);
    console.log(`🏦 Accounts: ${await accountRepo.count()}\n`);
    
    // Show user details
    const users = await userRepo.find();
    console.log('👤 USERS:');
    users.forEach(user => {
      console.log(`  • ${user.firstName} ${user.lastName} (${user.telegramId})`);
      console.log(`    Language: ${user.language}, Currency: ${user.currency}`);
    });
    
    // Show categories
    console.log('\n📁 CATEGORIES:');
    const categories = await categoryRepo.find({ order: { name: 'ASC' } });
    categories.forEach(cat => {
      console.log(`  ${cat.icon} ${cat.name}`);
    });
    
    // Show recent transactions
    console.log('\n💰 RECENT TRANSACTIONS:');
    const transactions = await transactionRepo.find({
      take: 10,
      order: { createdAt: 'DESC' },
      relations: ['category']
    });
    
    transactions.forEach(tx => {
      const category = tx.category ? tx.category.name : 'Другое';
      const icon = tx.category ? tx.category.icon : '❓';
      console.log(`  ${icon} ${tx.amount} UZS (${tx.type}) - ${category}`);
      console.log(`    ${tx.description}`);
      console.log(`    Date: ${tx.date}`);
      console.log('');
    });
    
    await closeDatabase();
    console.log('✅ Database inspection completed!');
    
  } catch (error) {
    console.error('❌ Error inspecting database:', error);
  }
}

inspectDatabase();