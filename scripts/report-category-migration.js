#!/usr/bin/env node
/**
 * FT-099 report, read-only: which old category values went into which new category, per type.
 *   npm run report:categories            — all users
 *   npm run report:categories -- --user=<userId>
 * Reads data/database.sqlite after the Categories migration; changes nothing.
 */
const { AppDataSource } = require('../dist/shared/infrastructure/database/database.config');

async function main() {
  const userArg = process.argv.find(arg => arg.startsWith('--user='));
  const userId = userArg ? userArg.slice('--user='.length) : null;

  await AppDataSource.initialize();
  try {
    const [table] = await AppDataSource.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'categories'`);
    if (!table) {
      console.log('No categories table yet: start the app or run `npm run migration:run` first.');
      process.exitCode = 1;
      return;
    }

    const rows = await AppDataSource.query(
      `SELECT c.type AS type, COALESCE(t.legacy_category, '(пусто)') AS legacy, c.name AS category, COUNT(*) AS count
       FROM transactions t JOIN categories c ON c.id = t.category_id
       ${userId ? 'WHERE t.userId = ?' : ''}
       GROUP BY 1, 2, 3 ORDER BY 1, 3, 4 DESC`,
      userId ? [userId] : []
    );
    if (rows.length === 0) {
      console.log('No records.');
      return;
    }

    for (const type of ['expense', 'income']) {
      const ofType = rows.filter(row => row.type === type);
      if (ofType.length === 0) continue;
      console.log(type === 'expense' ? '\nРасходы' : '\nДоходы');
      for (const row of ofType) {
        console.log(`  ${row.legacy.padEnd(22)} → ${row.category.padEnd(12)} ${row.count}`);
      }
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
