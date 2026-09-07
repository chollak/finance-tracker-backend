import { pluralRu, pluralTransactions, pluralWithCount } from '@/shared/lib/plural';

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

export interface HistorySubtitleInput {
  scope: 'active' | 'archived';
  /** Rows currently rendered, after filtering. */
  shown: number;
  /** Rows in the scope before filtering. */
  total: number;
  /** Rows in the scope still awaiting a correction. */
  needsReviewCount: number;
  isFiltered: boolean;
}

/**
 * Subtitle of the History page (FT-081).
 *
 * History is where a capture gets checked and corrected, so the line under the title
 * answers «что мне тут делать?» before «сколько тут строк». Whatever needs a correction
 * wins the line; a filtered list reports its own scope, because then the count on
 * screen no longer matches the count in the database; otherwise the line names the
 * one interaction that is not obvious — that a row is tappable.
 */
export function formatHistorySubtitle({
  scope,
  shown,
  total,
  needsReviewCount,
  isFiltered,
}: HistorySubtitleInput): string {
  if (isFiltered) {
    return formatTransactionsScopeLabel(shown, total, scope);
  }

  if (scope === 'archived') {
    if (total === 0) return 'Скрытые записи появятся здесь';
    return `${pluralWithCount(total, 'скрытая запись', 'скрытых записи', 'скрытых записей')} — не в итогах`;
  }

  if (total === 0) return 'Здесь появится всё, что вы запишете';

  if (needsReviewCount > 0) {
    return `${pluralWithCount(needsReviewCount, 'запись', 'записи', 'записей')} нужно проверить`;
  }

  return `${pluralWithCount(total, 'запись', 'записи', 'записей')} — нажмите, чтобы поправить`;
}
