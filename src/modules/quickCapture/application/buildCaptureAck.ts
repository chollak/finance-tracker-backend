import { getCategoryById } from '../../../shared/domain/entities/Category';
import { CaptureAck, CaptureAckAction, CapturedTransaction } from '../domain/quickCaptureTypes';

export interface BuildCaptureAckOptions {
  debtsDetected?: number;
  /** ISO date (YYYY-MM-DD) used to render "Сегодня". Injectable so the formatter stays pure in tests. */
  today?: string;
}

const CURRENCY = 'сум';

/**
 * Groups thousands with a plain space and keeps kopeck-style fractions only when they exist,
 * so "18000" reads as "18 000" and "1234.5" as "1 234,50".
 */
function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  const [whole, fraction] = (Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return fraction ? `${grouped},${fraction}` : grouped;
}

function formatAmountWithCurrency(transaction: CapturedTransaction): string {
  const sign = transaction.type === 'income' ? '+' : '';
  return `${sign}${formatAmount(transaction.amount)} ${CURRENCY}`;
}

function categoryName(category: string): string {
  return getCategoryById(category)?.name ?? category;
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);
}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('ru-RU') === b.trim().toLocaleLowerCase('ru-RU');
}

/**
 * `withCategory` is dropped for multi-item acks so each line stays scannable, and it is
 * also dropped when the label we have *is* the category name (no "Транспорт · Транспорт"),
 * including when the parser echoes it in another case ("кофе" for "Кофе").
 */
function summaryLine(transaction: CapturedTransaction, withCategory: boolean): string {
  const name = categoryName(transaction.category);
  const label = transaction.description?.trim() || transaction.merchant?.trim() || '';

  const parts = [capitalize(label || name), formatAmountWithCurrency(transaction)];
  if (withCategory && label && !sameLabel(label, name)) {
    parts.push(name);
  }

  return parts.join(' · ');
}

/**
 * The parser emits both plain `YYYY-MM-DD` and full ISO timestamps, so compare and render
 * the calendar day only. Anything else (a free-form date) is passed through untouched.
 */
function calendarDay(date: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(date) ? date.slice(0, 10) : date;
}

function detailsFor(transaction: CapturedTransaction, today: string): string {
  const day = calendarDay(transaction.date);
  const dateLabel = day === calendarDay(today) ? 'Сегодня' : day;
  // Income is not a real expense either, but saying so would be noise; the hint is for
  // transfers/savings/withdrawals, where users expect the money to show up as spending.
  const hint = !transaction.countsAsRealExpense && transaction.type !== 'income'
    ? 'Не входит в расходы'
    : undefined;

  return [dateLabel, hint].filter(Boolean).join(' · ');
}

function actionsFor(reviewCount: number): CaptureAckAction[] {
  return reviewCount > 0 ? ['edit', 'delete', 'review'] : ['edit', 'delete'];
}

/**
 * Builds the compact confirmation every client shows after a capture. Pure by design:
 * Telegram, the Mini App and a future Shortcut must agree on the same wording.
 */
export function buildCaptureAck(
  transactions: CapturedTransaction[],
  options: BuildCaptureAckOptions = {}
): CaptureAck {
  const debtsDetected = options.debtsDetected ?? 0;
  const today = options.today ?? new Date().toISOString().split('T')[0];

  if (transactions.length === 0) {
    // A debt was persisted even though no transaction was: do not report "nothing found".
    if (debtsDetected > 0) {
      return {
        title: 'Записал долг',
        summary: `Долгов записано: ${debtsDetected}`,
        details: 'Проверьте в разделе долгов',
        actions: ['review'],
      };
    }

    return {
      title: 'Не нашёл операцию',
      summary: 'Не удалось распознать сумму или операцию',
      actions: [],
    };
  }

  const reviewCount = transactions.filter(transaction => transaction.needsReview).length;

  if (transactions.length === 1) {
    const [transaction] = transactions;

    return {
      title: reviewCount > 0 ? 'Нужно проверить' : 'Записал',
      summary: summaryLine(transaction, true),
      details: detailsFor(transaction, today),
      actions: actionsFor(reviewCount),
    };
  }

  return {
    title: reviewCount > 0
      ? `Записал ${transactions.length} · ${reviewCount} к проверке`
      : `Записал ${transactions.length}`,
    summary: transactions.map(transaction => summaryLine(transaction, false)).join('\n'),
    actions: actionsFor(reviewCount),
  };
}
