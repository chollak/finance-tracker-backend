/**
 * Seed script for creating test data in local SQLite database
 *
 * Creates:
 * - 1 test user (telegramId: test_user_dev)
 * - ~50 transactions (various categories, income/expense)
 * - 3 budgets (Food, Transport, Entertainment)
 *
 * Usage: npm run seed:test
 */

import path from 'path';
import { randomUUID } from 'crypto';
import sqlite3 from 'sqlite3';

const DB_PATH = path.join(process.cwd(), 'data', 'database.sqlite');

// Test user configuration
const TEST_USER = {
  telegramId: 'test_user_dev',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'Developer',
  language: 'ru',
  currency: 'UZS',
};

// Categories for transactions
const EXPENSE_CATEGORIES = [
  'Еда', 'Продукты', 'Рестораны', 'Кофе',
  'Транспорт', 'Такси', 'Бензин',
  'Покупки', 'Одежда', 'Электроника',
  'Развлечения', 'Кино', 'Подписки',
  'Счета', 'Интернет', 'Коммунальные',
  'Здоровье', 'Аптека',
];

const INCOME_CATEGORIES = ['Зарплата', 'Фриланс', 'Перевод', 'Подарок'];

// Merchants for realistic data
const MERCHANTS: Record<string, string[]> = {
  'Еда': ['Evos', 'Oqtepa Lavash', 'KFC', 'Burger King'],
  'Продукты': ['Makro', 'Korzinka', 'Havas'],
  'Рестораны': ['Caravan', 'Milliy Taomlar', 'The Ramen'],
  'Кофе': ['Brew Spot', 'Coffee Boom', 'Starbucks'],
  'Транспорт': ['Yandex Go', 'MyTaxi', 'Uzum Taxi'],
  'Такси': ['Yandex Go', 'MyTaxi'],
  'Бензин': ['АЗС Лукойл', 'АЗС UNG', 'Qozoq АЗС'],
  'Покупки': ['Uzum Market', 'Wildberries'],
  'Одежда': ['LC Waikiki', 'Zara', 'H&M'],
  'Электроника': ['Texnomart', 'MediaPark', 'Olcha'],
  'Развлечения': ['Netflix', 'Spotify', 'YouTube Premium'],
  'Кино': ['Magic Cinema', 'Chaplin Cinemas'],
  'Подписки': ['Netflix', 'Spotify', 'ChatGPT Plus'],
  'Счета': ['Uzmobile', 'Ucell'],
  'Интернет': ['Uztelecom', 'TuronTelecom'],
  'Коммунальные': ['Тошкент шахар газ', 'Электр энергия'],
  'Здоровье': ['Dori-Darmon', 'Akfa Medline'],
  'Аптека': ['Dori-Darmon', 'Фармация'],
};

// Generate random date within last N days
function randomDate(daysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date.toISOString().split('T')[0];
}

// Generate random amount based on category
function randomAmount(category: string, type: 'income' | 'expense'): number {
  if (type === 'income') {
    const ranges: Record<string, [number, number]> = {
      'Зарплата': [5000000, 15000000],
      'Фриланс': [500000, 3000000],
      'Перевод': [100000, 1000000],
      'Подарок': [50000, 500000],
    };
    const [min, max] = ranges[category] || [100000, 1000000];
    return Math.floor(Math.random() * (max - min) + min);
  }

  const ranges: Record<string, [number, number]> = {
    'Еда': [20000, 80000],
    'Продукты': [50000, 300000],
    'Рестораны': [80000, 250000],
    'Кофе': [15000, 40000],
    'Транспорт': [10000, 50000],
    'Такси': [15000, 80000],
    'Бензин': [100000, 300000],
    'Покупки': [50000, 500000],
    'Одежда': [100000, 800000],
    'Электроника': [200000, 2000000],
    'Развлечения': [30000, 150000],
    'Кино': [50000, 150000],
    'Подписки': [50000, 200000],
    'Счета': [50000, 200000],
    'Интернет': [80000, 150000],
    'Коммунальные': [100000, 500000],
    'Здоровье': [50000, 500000],
    'Аптека': [20000, 200000],
  };
  const [min, max] = ranges[category] || [20000, 100000];
  return Math.floor(Math.random() * (max - min) + min);
}

// Generate description based on category
function generateDescription(category: string, merchant: string | undefined, type: 'income' | 'expense'): string {
  if (type === 'income') {
    const descriptions: Record<string, string[]> = {
      'Зарплата': ['Зарплата за месяц', 'Аванс', 'Зарплата'],
      'Фриланс': ['Проект для клиента', 'Фриланс работа', 'Консультация'],
      'Перевод': ['Перевод от друга', 'Возврат долга', 'Перевод'],
      'Подарок': ['Подарок на день рождения', 'Подарок', 'Кэшбэк'],
    };
    const options = descriptions[category] || ['Доход'];
    return options[Math.floor(Math.random() * options.length)];
  }

  if (merchant) {
    return `${category} - ${merchant}`;
  }
  return category;
}

interface TransactionData {
  id: string;
  userId: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  merchant: string | null;
  description: string;
  date: string;
  confidence: number;
}

// Generate test transactions
function generateTransactions(userId: string): TransactionData[] {
  const transactions: TransactionData[] = [];

  // Generate ~40 expenses
  for (let i = 0; i < 40; i++) {
    const category = EXPENSE_CATEGORIES[Math.floor(Math.random() * EXPENSE_CATEGORIES.length)];
    const merchantList = MERCHANTS[category] || [];
    const merchant = merchantList.length > 0
      ? merchantList[Math.floor(Math.random() * merchantList.length)]
      : null;

    transactions.push({
      id: randomUUID(),
      userId,
      amount: randomAmount(category, 'expense'),
      type: 'expense',
      category,
      merchant,
      description: generateDescription(category, merchant || undefined, 'expense'),
      date: randomDate(30),
      confidence: 0.85 + Math.random() * 0.15,
    });
  }

  // Generate ~10 incomes
  for (let i = 0; i < 10; i++) {
    const category = INCOME_CATEGORIES[Math.floor(Math.random() * INCOME_CATEGORIES.length)];

    transactions.push({
      id: randomUUID(),
      userId,
      amount: randomAmount(category, 'income'),
      type: 'income',
      category,
      merchant: null,
      description: generateDescription(category, undefined, 'income'),
      date: randomDate(30),
      confidence: 0.9 + Math.random() * 0.1,
    });
  }

  return transactions;
}

interface BudgetData {
  id: string;
  userId: string;
  name: string;
  amount: number;
  period: string;
  startDate: string;
  endDate: string;
  categoryIds: string;
  isActive: number;
  spent: number;
  description: string;
}

// Generate test budgets
function generateBudgets(userId: string): BudgetData[] {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return [
    {
      id: randomUUID(),
      userId,
      name: 'Еда на месяц',
      amount: 1500000,
      period: 'monthly',
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0],
      categoryIds: JSON.stringify(['Еда', 'Продукты', 'Рестораны', 'Кофе']),
      isActive: 1,
      spent: 0,
      description: 'Бюджет на еду и рестораны',
    },
    {
      id: randomUUID(),
      userId,
      name: 'Транспорт',
      amount: 500000,
      period: 'monthly',
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0],
      categoryIds: JSON.stringify(['Транспорт', 'Такси', 'Бензин']),
      isActive: 1,
      spent: 0,
      description: 'Бюджет на транспорт',
    },
    {
      id: randomUUID(),
      userId,
      name: 'Развлечения',
      amount: 300000,
      period: 'monthly',
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0],
      categoryIds: JSON.stringify(['Развлечения', 'Кино', 'Подписки']),
      isActive: 1,
      spent: 0,
      description: 'Бюджет на развлечения',
    },
  ];
}

// Helper to run db queries as promises
function dbRun(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function dbGet<T>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

async function seed() {
  console.log('🌱 Starting seed script...\n');

  const db = new sqlite3.Database(DB_PATH);
  console.log('✅ Database connected\n');

  try {
    // Check if test user already exists
    const existingUser = await dbGet<{ telegramId: string }>(
      db,
      'SELECT * FROM users WHERE telegramId = ?',
      [TEST_USER.telegramId]
    );

    if (existingUser) {
      console.log(`⚠️  Test user "${TEST_USER.telegramId}" already exists`);
      console.log('   To recreate, delete existing data first.\n');

      // Show current stats
      const txCount = await dbGet<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM transactions WHERE userId = ?',
        [TEST_USER.telegramId]
      );

      const budgetCount = await dbGet<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM budgets WHERE userId = ?',
        [TEST_USER.telegramId]
      );

      console.log(`📊 Current data for test user:`);
      console.log(`   - Transactions: ${txCount?.count || 0}`);
      console.log(`   - Budgets: ${budgetCount?.count || 0}`);

      db.close();
      return;
    }

    // Create test user
    console.log('👤 Creating test user...');
    await dbRun(
      db,
      `INSERT INTO users (telegramId, username, firstName, lastName, language, currency)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        TEST_USER.telegramId,
        TEST_USER.username,
        TEST_USER.firstName,
        TEST_USER.lastName,
        TEST_USER.language,
        TEST_USER.currency,
      ]
    );
    console.log(`   ✅ User created: ${TEST_USER.firstName} ${TEST_USER.lastName} (${TEST_USER.telegramId})\n`);

    // Create transactions
    console.log('💳 Creating transactions...');
    const transactions = generateTransactions(TEST_USER.telegramId);

    for (const tx of transactions) {
      await dbRun(
        db,
        `INSERT INTO transactions (id, userId, amount, type, category, merchant, description, date, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tx.id, tx.userId, tx.amount, tx.type, tx.category, tx.merchant, tx.description, tx.date, tx.confidence]
      );
    }

    const incomeCount = transactions.filter((t) => t.type === 'income').length;
    const expenseCount = transactions.filter((t) => t.type === 'expense').length;
    console.log(`   ✅ Created ${transactions.length} transactions (${incomeCount} income, ${expenseCount} expense)\n`);

    // Create budgets
    console.log('📊 Creating budgets...');
    const budgets = generateBudgets(TEST_USER.telegramId);

    for (const budget of budgets) {
      await dbRun(
        db,
        `INSERT INTO budgets (id, userId, name, amount, period, startDate, endDate, categoryIds, isActive, spent, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          budget.id,
          budget.userId,
          budget.name,
          budget.amount,
          budget.period,
          budget.startDate,
          budget.endDate,
          budget.categoryIds,
          budget.isActive,
          budget.spent,
          budget.description,
        ]
      );
    }
    console.log(`   ✅ Created ${budgets.length} budgets\n`);

    // Calculate and update spent amounts for budgets
    console.log('🧮 Calculating budget spent amounts...');
    for (const budget of budgets) {
      const categoryIds = JSON.parse(budget.categoryIds);

      // Calculate spent from transactions
      const spent = transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            categoryIds.includes(t.category) &&
            t.date >= budget.startDate &&
            t.date <= budget.endDate
        )
        .reduce((sum, t) => sum + t.amount, 0);

      await dbRun(db, 'UPDATE budgets SET spent = ? WHERE id = ?', [spent, budget.id]);
      console.log(`   - ${budget.name}: ${spent.toLocaleString()} / ${budget.amount.toLocaleString()} UZS`);
    }

    console.log('\n✅ Seed completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   User ID: ${TEST_USER.telegramId}`);
    console.log(`   Transactions: ${transactions.length}`);
    console.log(`   Budgets: ${budgets.length}`);
    console.log('\n💡 Use this telegramId in the webapp to see test data.');

    db.close();
  } catch (error) {
    console.error('❌ Seed failed:', error);
    db.close();
    process.exit(1);
  }
}

seed();
