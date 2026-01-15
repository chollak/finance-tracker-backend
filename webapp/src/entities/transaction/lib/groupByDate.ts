import { parseISO, isToday, isYesterday, format, isSameYear } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { TransactionViewModel } from '../model/types';

export interface DateGroup {
  label: string;
  date: Date;
  transactions: TransactionViewModel[];
}

/**
 * Groups transactions by date
 * Returns groups sorted by date descending (newest first)
 */
export function groupTransactionsByDate(
  transactions: TransactionViewModel[]
): DateGroup[] {
  const groupsMap = new Map<string, DateGroup>();
  const now = new Date();

  for (const transaction of transactions) {
    const date = parseISO(transaction.date);
    const dateKey = format(date, 'yyyy-MM-dd');

    if (!groupsMap.has(dateKey)) {
      groupsMap.set(dateKey, {
        label: getDateLabel(date, now),
        date,
        transactions: [],
      });
    }

    groupsMap.get(dateKey)!.transactions.push(transaction);
  }

  // Sort groups by date descending
  return Array.from(groupsMap.values()).sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
}

/**
 * Returns a human-readable label for a date
 */
function getDateLabel(date: Date, now: Date): string {
  if (isToday(date)) {
    return 'Сегодня';
  }

  if (isYesterday(date)) {
    return 'Вчера';
  }

  // Same year - show day and month
  if (isSameYear(date, now)) {
    return format(date, 'd MMMM', { locale: ru });
  }

  // Different year - show full date
  return format(date, 'd MMMM yyyy', { locale: ru });
}
