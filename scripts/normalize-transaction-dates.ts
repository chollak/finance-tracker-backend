/**
 * Приводит уже сохранённые даты транзакций к календарному дню YYYY-MM-DD.
 *
 * Зачем: колонка date сравнивается в SQL как строка, поэтому запись в формате
 * полного ISO ('2026-01-21T04:20:47.000Z') не проходит условие date <= '2026-01-21'
 * и выпадает из любой выборки по диапазону дат. Два источника писали разные форматы;
 * на входе это починено в CreateTransactionUseCase, здесь чинятся старые строки.
 *
 * По умолчанию только показывает, что собирается изменить. Ничего не пишет.
 *
 * ОГРАНИЧЕНИЕ: repo.getAll() отдаёт только неархивные транзакции, поэтому архивные
 * скрипт не проверяет. На 2026-08-26 в локальной базе все три архивные строки хранят
 * корректный формат, так что это не мешало. Если понадобится покрыть и их —
 * добавить проход по findArchivedByUserId для каждого пользователя.
 *
 *   npx ts-node scripts/normalize-transaction-dates.ts                 предпросмотр
 *   npx ts-node scripts/normalize-transaction-dates.ts --apply         применить
 *
 * База берётся из DATABASE_TYPE. Для локальной SQLite:
 *   DATABASE_TYPE=sqlite npx ts-node scripts/normalize-transaction-dates.ts
 */

import { initializeDatabase, closeDatabase } from '../src/shared/infrastructure/database/database.config';
import { RepositoryFactory } from '../src/shared/infrastructure/database/repositoryFactory';
import { normalizeTransactionDate } from '../src/modules/transaction/domain/transactionEntity';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  console.log(`База: ${AppConfig.DATABASE_TYPE}`);
  console.log(APPLY ? 'Режим: ПРИМЕНЕНИЕ\n' : 'Режим: предпросмотр, ничего не изменится\n');

  await initializeDatabase();

  const repo = RepositoryFactory.createTransactionRepository();
  const all = await repo.getAll();

  const broken = all.filter((tx) => tx.date !== normalizeTransactionDate(tx.date));

  console.log(`Всего транзакций: ${all.length}`);
  console.log(`Требуют нормализации: ${broken.length}\n`);

  for (const tx of broken) {
    console.log(`  ${tx.id}  ${tx.date}  →  ${normalizeTransactionDate(tx.date)}`);
  }

  if (!broken.length) {
    console.log('Нечего исправлять.');
    await closeDatabase();
    return;
  }

  if (!APPLY) {
    console.log('\nЭто предпросмотр. Для применения запустить с флагом --apply');
    await closeDatabase();
    return;
  }

  let updated = 0;
  for (const tx of broken) {
    try {
      await repo.update(tx.id!, { date: normalizeTransactionDate(tx.date) });
      updated++;
    } catch (error) {
      console.error(`  не удалось обновить ${tx.id}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\nОбновлено строк: ${updated} из ${broken.length}`);
  await closeDatabase();
}

main().catch(async (error) => {
  console.error('Нормализация не удалась:', error);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
