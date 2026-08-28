import type { Transaction } from '../types/transaction';
import { isExpense } from './semanticType';
import { lastSevenDates, monthPrefix, todayUtc } from './dates';

export interface DayBar {
  date: string;
  total: number;
}

export interface DayGroup {
  date: string;
  items: Transaction[];
}

/**
 * Сумма расходов за месяц переданного дня.
 *
 * Месяц определяется префиксом строки, а не разбором даты: '2026-08-01'
 * при разборе становится полуночью UTC, и в браузере с UTC+5 getMonth()
 * у неё съезжает на предыдущий месяц.
 */
export function monthTotal(transactions: Transaction[], today: string = todayUtc()): number {
  const month = monthPrefix(today);
  let total = 0;

  for (const tx of transactions) {
    if (!isExpense(tx)) continue;
    if (monthPrefix(tx.date) !== month) continue;
    total += tx.amount;
  }

  return total;
}

/**
 * Семь столбиков, последний — сегодня.
 *
 * Пустые дни возвращаются нулями, а не пропускаются: неделя, прожитая
 * наполовину, не должна выглядеть прожитой целиком.
 */
export function lastSevenDays(
  transactions: Transaction[],
  today: string = todayUtc()
): DayBar[] {
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    if (!isExpense(tx)) continue;
    totals.set(tx.date, (totals.get(tx.date) ?? 0) + tx.amount);
  }

  return lastSevenDates(today).map((date) => ({ date, total: totals.get(date) ?? 0 }));
}

/**
 * Лента по дням, новые сверху.
 *
 * Не-расходы здесь остаются: если спрятать перевод себе, человек не поймёт,
 * куда делась запись, и решит, что приложение её потеряло. Из суммы они
 * исключены, и в интерфейсе это подписано.
 */
export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const byDate = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const bucket = byDate.get(tx.date);
    if (bucket) bucket.push(tx);
    else byDate.set(tx.date, [tx]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({ date, items }));
}
