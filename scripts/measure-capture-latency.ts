/**
 * Замер деградации выборки транзакций на пути ответа бота.
 *
 * Зачем: getTodaySummary в messageHandlers.ts на каждое входящее сообщение
 * вызывает findByUserId без лимита — то есть тянет всю историю пользователя,
 * чтобы посчитать две суммы за текущий месяц. Скрипт показывает, во что это
 * обходится при росте истории, и сравнивает с выборкой по диапазону дат.
 *
 * ВАЖНО: скрипт работает на отдельном временном файле базы во временной
 * директории системы и НЕ ТРОГАЕТ data/database.sqlite. Файл удаляется в конце.
 *
 * Запуск: npx ts-node scripts/measure-capture-latency.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { Transaction as TransactionEntity } from '../src/shared/infrastructure/database/entities/Transaction';

const USER_ID = 'latency-probe-user';
const SIZES = [100, 500, 1000, 3000, 6000];

/** История размазана по двум годам — иначе выборка за месяц вернула бы всё и сравнение было бы бессмысленным. */
const HISTORY_MONTHS = 24;

/** Сколько раз повторить каждый замер: первый прогон греет кэш страниц SQLite. */
const REPEATS = 5;

function buildDataSource(dbPath: string): DataSource {
  return new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: [TransactionEntity],
    synchronize: true,
    logging: false,
  });
}

function dateForIndex(index: number, total: number): string {
  const now = new Date();
  // Равномерно раскидываем по HISTORY_MONTHS месяцам назад от сегодня.
  const monthsBack = Math.floor((index / total) * HISTORY_MONTHS);
  const day = (index % 28) + 1;
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, day);
  return d.toISOString().split('T')[0];
}

async function median(fn: () => Promise<number>, repeats: number): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < repeats; i++) {
    samples.push(await fn());
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

async function main(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-latency-'));
  const dbPath = path.join(tmpDir, 'probe.sqlite');
  const dataSource = buildDataSource(dbPath);

  await dataSource.initialize();
  const repo = dataSource.getRepository(TransactionEntity);

  console.log(`База замера: ${dbPath}`);
  console.log(`История размазана по ${HISTORY_MONTHS} месяцам, медиана из ${REPEATS} прогонов\n`);
  console.log('записей | вся история (findByUserId) | текущий месяц (диапазон) | вернулось строк');
  console.log('--------|---------------------------|--------------------------|----------------');

  let created = 0;

  for (const size of SIZES) {
    const batch: Partial<TransactionEntity>[] = [];
    while (created < size) {
      batch.push({
        amount: 1000 + (created % 500),
        type: 'expense',
        semanticType: 'expense',
        needsReview: false,
        description: `нагрузочная запись ${created}`,
        date: dateForIndex(created, SIZES[SIZES.length - 1]),
        userId: USER_ID,
        category: 'other',
        isArchived: false,
        isDebtRelated: false,
      });
      created++;
    }
    // Пачками, иначе вставка 6000 строк по одной занимает минуты и мешает мерить чтение.
    for (let i = 0; i < batch.length; i += 500) {
      await repo.save(repo.create(batch.slice(i, i + 500) as TransactionEntity[]));
    }

    // Запрос дословно повторяет SqliteTransactionRepository.findByUserId:105-118
    const fullScan = () => async () => {
      const startedAt = process.hrtime.bigint();
      const rows = await repo
        .createQueryBuilder('transaction')
        .where('transaction.userId = :userId', { userId: USER_ID })
        .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
        .orderBy('transaction.date', 'DESC')
        .addOrderBy('transaction.createdAt', 'DESC')
        .getMany();
      rows.map((r) => ({ ...r, amount: Number(r.amount) }));
      return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    };

    // Запрос дословно повторяет SqliteTransactionRepository.getByUserIdAndDateRange:92-102
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthRows = 0;

    const rangeScan = () => async () => {
      const startedAt = process.hrtime.bigint();
      const rows = await repo
        .createQueryBuilder('transaction')
        .where('transaction.userId = :userId', { userId: USER_ID })
        .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
        .andWhere('transaction.date >= :startDate', { startDate: startOfMonth.toISOString().split('T')[0] })
        .andWhere('transaction.date <= :endDate', { endDate: now.toISOString().split('T')[0] })
        .orderBy('transaction.date', 'DESC')
        .getMany();
      rows.map((r) => ({ ...r, amount: Number(r.amount) }));
      monthRows = rows.length;
      return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    };

    const fullMs = await median(fullScan(), REPEATS);
    const rangeMs = await median(rangeScan(), REPEATS);

    console.log(
      `${String(size).padStart(7)} | ${(fullMs.toFixed(1) + ' мс').padStart(25)} | ${(rangeMs.toFixed(1) + ' мс').padStart(24)} | ${monthRows}`
    );
  }

  await dataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\nВременная база удалена.');
}

main().catch((error) => {
  console.error('Замер не удался:', error);
  process.exit(1);
});
