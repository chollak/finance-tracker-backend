/**
 * Test data for the local SQLite database, written through the app's own use cases so it always
 * matches the current schema and rules (categories, accounts, money in minor units, moves).
 *
 * Creates, for the user with telegramId 900000001 (numeric, so `X-Dev-User-Id: 900000001` opens it):
 * - accounts «Карта», «Наличные» and «Доллары» with opening balances 30 days ago;
 * - ~50 records over the last 30 days in the starter categories, a few of them in dollars;
 * - a transfer «Карта → Наличные» and an exchange «Доллары → Карта».
 *
 * Budgets are no longer seeded: they leave the interface (decision Д2).
 *
 * Usage: npm run seed:test [-- --db=path/to/database.sqlite]
 * The database is migrated first, with a backup, as on app start.
 */

import 'reflect-metadata';
import path from 'path';
import { createAppDataSource, DATABASE_FILE } from '../src/shared/infrastructure/database/database.config';
import { runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { CategoryCatalog } from '../src/modules/category/application/categoryCatalog';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';

const TEST_TELEGRAM_ID = '900000001';

const EXPENSES: Array<{ category: string; merchants: string[]; range: [number, number] }> = [
  { category: 'Продукты', merchants: ['Makro', 'Korzinka', 'Havas'], range: [50000, 400000] },
  { category: 'Кафе', merchants: ['Evos', 'Oqtepa Lavash', 'Brew Spot', 'Caravan'], range: [25000, 250000] },
  { category: 'Транспорт', merchants: ['Yandex Go', 'MyTaxi', 'АЗС UNG'], range: [15000, 150000] },
  { category: 'Дом', merchants: ['Тошкент шахар газ', 'Электр энергия'], range: [100000, 600000] },
  { category: 'Связь', merchants: ['Uzmobile', 'Uztelecom'], range: [50000, 150000] },
  { category: 'Здоровье', merchants: ['Dori-Darmon', 'Akfa Medline'], range: [30000, 400000] },
  { category: 'Покупки', merchants: ['Uzum Market', 'Texnomart', 'Zara'], range: [100000, 1500000] },
];
const INCOMES: Array<{ category: string; description: string; range: [number, number] }> = [
  { category: 'Зарплата', description: 'Зарплата', range: [8000000, 15000000] },
  { category: 'Фриланс', description: 'Проект для клиента', range: [500000, 3000000] },
  { category: 'Кэшбэк', description: 'Кэшбэк', range: [10000, 80000] },
];

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
/** Whole thousands of сум, as people write them. */
const amountIn = ([min, max]: [number, number]) => Math.round((min + Math.random() * (max - min)) / 1000) * 1000;
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return todayDateOnly(date);
}

function databaseFile(): string {
  const arg = process.argv.find(value => value.startsWith('--db='));
  return arg ? path.resolve(arg.slice('--db='.length)) : DATABASE_FILE;
}

async function seed() {
  const file = databaseFile();
  console.log(`🌱 Seeding ${file}\n`);
  const dataSource = createAppDataSource(file);
  await dataSource.initialize();

  try {
    const { applied, backupPath } = await runMigrationsWithBackup(dataSource, file, path.join(path.dirname(file), 'backups'));
    if (applied.length > 0) {
      console.log(`🗂  Migrations applied: ${applied.join(', ')}${backupPath ? ` (backup: ${backupPath})` : ''}\n`);
    }

    const users = new SqliteUserRepository(dataSource);
    const existing = await users.findByTelegramId(TEST_TELEGRAM_ID);
    if (existing) {
      const [{ count }] = await dataSource.query(
        `SELECT COUNT(*) AS count FROM transactions WHERE userId = ? AND deleted_at IS NULL`, [existing.id]
      );
      console.log(`⚠️  Test user "${TEST_TELEGRAM_ID}" already exists with ${count} records. Delete it first to seed again.`);
      return;
    }
    const user = await users.getOrCreate({ telegramId: TEST_TELEGRAM_ID, userName: 'testuser', firstName: 'Test', lastName: 'Developer', languageCode: 'ru' });

    const accounts = new AccountModule(new SqliteAccountRepository(dataSource), undefined, new SqliteAccountMoveRepository(dataSource));
    const opened = daysAgo(30);
    const account = async (name: string, kind: 'cash' | 'card', currency: 'UZS' | 'USD', openingBalanceMinor: number) => {
      const created = await accounts.getCreateAccountUseCase().execute({
        userId: user.id, body: { name, kind, currency, openingBalanceMinor, openingDate: opened },
      });
      if (!created.success) throw created.error;
      return created.data;
    };
    // «Карта» is created on first need; it opens with the others
    const [card] = await accounts.getBook().listForUser(user.id);
    await dataSource.query(`UPDATE accounts SET opening_date = ?, opening_balance_minor = ? WHERE id = ?`, [opened, 5_000_000_00, card.id]);
    const cash = await account('Наличные', 'cash', 'UZS', 1_500_000_00);
    const dollars = await account('Доллары', 'cash', 'USD', 500_00);
    console.log('👛 Accounts: Карта, Наличные, Доллары\n');

    const repository = new SqliteTransactionRepository(dataSource);
    const create = new CreateTransactionUseCase(repository, new CategoryCatalog(new SqliteCategoryRepository(dataSource)), accounts.getBook());
    let created = 0;
    const write = async (record: Parameters<CreateTransactionUseCase['execute']>[0]) => {
      const result = await create.execute(record);
      if (!result.success) throw result.error;
      created += 1;
    };

    for (let i = 0; i < 40; i += 1) {
      const expense = pick(EXPENSES);
      const merchant = pick(expense.merchants);
      await write({
        userId: user.id, type: 'expense', category: expense.category, amount: amountIn(expense.range),
        description: merchant, merchant, date: daysAgo(Math.floor(Math.random() * 30)),
        accountId: Math.random() < 0.15 ? cash.id : card.id, source: pick(['telegram', 'miniapp', 'manual'] as const), confidence: 0.9,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      const cents = Math.round(500 + Math.random() * 4500);
      await write({
        userId: user.id, type: 'expense', category: pick(['Связь', 'Покупки']), amount: cents / 100, amountMinor: cents,
        description: pick(['ChatGPT Plus', 'Spotify', 'iCloud', 'Наушники']), date: daysAgo(Math.floor(Math.random() * 30)),
        accountId: dollars.id, source: 'telegram',
      });
    }
    for (let i = 0; i < 6; i += 1) {
      const income = pick(INCOMES);
      await write({
        userId: user.id, type: 'income', category: income.category, amount: amountIn(income.range),
        description: income.description, date: daysAgo(Math.floor(Math.random() * 30)), accountId: card.id, source: 'manual',
      });
    }
    console.log(`💳 Records: ${created}\n`);

    const transfer = await accounts.getCreateMoveUseCase().execute({
      userId: user.id, body: { kind: 'transfer', fromAccountId: card.id, toAccountId: cash.id, amountMinor: 500_000_00, date: daysAgo(10) },
    });
    const exchange = await accounts.getCreateMoveUseCase().execute({
      userId: user.id, body: { kind: 'exchange', fromAccountId: dollars.id, toAccountId: card.id, fromAmountMinor: 100_00, toAmountMinor: 1_260_000_00, date: daysAgo(5) },
    });
    if (!transfer.success) throw transfer.error;
    if (!exchange.success) throw exchange.error;
    console.log('🔁 Moves: transfer Карта → Наличные, exchange Доллары → Карта\n');

    const summary = await accounts.getBook().summary(user.id);
    for (const a of summary.accounts) console.log(`   ${a.name}: ${(a.balanceMinor / 100).toLocaleString('ru-RU')} ${a.currency}`);
    console.log(`\n✅ Done. Outside production, send X-Dev-User-Id: ${TEST_TELEGRAM_ID} to act as this user.`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch(error => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
