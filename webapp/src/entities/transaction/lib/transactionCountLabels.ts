import { pluralRu, pluralTransactions } from '@/shared/lib/plural';

/**
 * Label for the "show the whole list" link on Home.
 * A single transaction reads better without the numeral («Все 1 транзакция» is wrong).
 */
export function formatAllTransactionsLabel(count: number): string {
  if (count === 1) return 'Все транзакции';
  return `Все ${count} ${pluralTransactions(count)}`;
}

/**
 * Subtitle for the transactions page: how many of the tab's total are currently shown.
 * The adjective agrees with the total, not with the shown count.
 */
export function formatTransactionsScopeLabel(
  shown: number,
  total: number,
  tab: 'active' | 'archived'
): string {
  const scope =
    tab === 'active'
      ? pluralRu(total, 'текущей', 'текущих', 'текущих')
      : pluralRu(total, 'скрытой', 'скрытых', 'скрытых');

  return `${shown} из ${total} ${scope}`;
}
