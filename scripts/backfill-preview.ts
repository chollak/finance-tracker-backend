#!/usr/bin/env node
/*
 * Read-only preview of what a semantic backfill would propose.
 *
 * Every row created before the semantic model existed carries
 * semanticType = 'expense', so transfers, deposits and withdrawals from that
 * period still look like spending. Analytics now computes correctly over
 * incorrect data.
 *
 * This script writes nothing. The implementation plan for semantic
 * transactions forbids an automatic backfill on purpose: a wrong inference
 * damages trust in the numbers more than a missing one, so a person decides
 * after seeing the proposal.
 *
 * It reuses classifyByText — the same classifier the parser uses — so nothing
 * is proposed that the product would not itself assign to the same wording.
 *
 * Usage:
 *   npm run backfill:preview                    # against the local SQLite
 *   npm run backfill:preview -- --user=<uuid>   # limit to one user
 *   npm run backfill:preview -- --limit=50      # show more examples
 */

import 'reflect-metadata';
import { AppDataSource } from '../src/shared/infrastructure/database/database.config';
import { Transaction as TransactionEntity } from '../src/shared/infrastructure/database/entities/Transaction';
import { classifyByText } from '../src/modules/voiceProcessing/application/classifyByText';
import { TransactionSemanticType } from '../src/modules/transaction/domain/transactionSemanticType';

interface Proposal {
  id: string;
  date: string;
  amount: number;
  description: string;
  current: string;
  proposed: TransactionSemanticType;
}

function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, value] = token.slice(2).split('=');
    flags[key] = value ?? 'true';
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const limit = Number(flags.limit ?? 15);

  await AppDataSource.initialize();
  const repository = AppDataSource.getRepository(TransactionEntity);

  const where = flags.user ? { userId: flags.user } : {};
  const rows = await repository.find({ where, order: { date: 'DESC' } });

  console.log(`Просмотрено записей: ${rows.length}${flags.user ? ` (пользователь ${flags.user})` : ''}\n`);

  const proposals: Proposal[] = [];
  const inconsistent: Proposal[] = [];
  let alreadyTyped = 0;
  let unclear = 0;

  for (const row of rows) {
    const current = row.semanticType ?? 'expense';
    const text = [row.description, row.merchant].filter(Boolean).join(' ');
    const proposed = classifyByText(text);

    // A row already carrying a non-default type was set deliberately.
    if (current !== 'expense' && current !== 'income') {
      alreadyTyped += 1;
      continue;
    }

    const entry: Proposal = {
      id: row.id,
      date: String(row.date),
      amount: Number(row.amount),
      description: row.description ?? '',
      current,
      proposed: (proposed ?? current) as TransactionSemanticType,
    };

    // Income direction stored as a semantic expense is wrong regardless of
    // wording — the two fields contradict each other.
    if (row.type === 'income' && current === 'expense') {
      inconsistent.push(entry);
      continue;
    }

    if (!proposed || proposed === current) {
      unclear += 1;
      continue;
    }

    proposals.push(entry);
  }

  const byType = proposals.reduce<Record<string, { count: number; amount: number }>>((acc, p) => {
    acc[p.proposed] ??= { count: 0, amount: 0 };
    acc[p.proposed].count += 1;
    acc[p.proposed].amount += p.amount;
    return acc;
  }, {});

  console.log('Предлагается изменить:');
  if (Object.keys(byType).length === 0) {
    console.log('   ничего — формулировки не дают уверенности');
  }
  for (const [type, stats] of Object.entries(byType)) {
    console.log(`   ${type.padEnd(18)} ${String(stats.count).padStart(4)} шт   ${stats.amount.toLocaleString('ru-RU').padStart(14)}`);
  }

  console.log('\nОстаётся как есть:');
  console.log(`   тип задан осознанно   ${String(alreadyTyped).padStart(4)}`);
  console.log(`   формулировка неясна   ${String(unclear).padStart(4)}`);

  if (inconsistent.length) {
    console.log(`\nПротиворечивые записи (направление «доход», семантика «расход»): ${inconsistent.length}`);
    console.log('   Их нельзя чинить по тексту — два поля спорят между собой, нужен ручной разбор.');
    for (const entry of inconsistent.slice(0, limit)) {
      console.log(`   ${entry.date.slice(0, 10)}  ${String(entry.amount).padStart(12)}  ${entry.description.slice(0, 40)}`);
    }
  }

  if (proposals.length) {
    console.log(`\nПримеры предложений (первые ${Math.min(limit, proposals.length)}):`);
    for (const entry of proposals.slice(0, limit)) {
      console.log(
        `   ${entry.date.slice(0, 10)}  ${String(entry.amount).padStart(12)}  ` +
        `${entry.current} → ${entry.proposed.padEnd(16)} ${entry.description.slice(0, 36)}`
      );
    }
  }

  console.log('\nНичего не записано. Это предпросмотр.');
  console.log('Низкая уверенность — повод пометить запись needsReview, а не переписать её молча.');

  await AppDataSource.destroy();
}

main().catch(async (error) => {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
