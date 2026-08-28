import type { Transaction } from '../types/transaction';

/**
 * Расход — ровно один семантический тип из восьми, и запись не должна требовать
 * проверки. Правило снято с getTodaySummary в messageHandlers.ts:
 *
 *     if (tx.needsReview || !countsAsRealExpense(semanticType)) continue;
 *
 * countsAsRealExpense в transactionSemanticType.ts:29 — это буквально
 * `semanticType === 'expense'`.
 *
 * ТРИ ЗАПРЕТА, каждый из которых в этом проекте уже разъезжался:
 *
 * 1. Не откатываться на `type`. Оба репозитория нормализуют semanticType
 *    на выходе, поле в ответе API всегда заполнено. Откат вернул бы
 *    own_transfer и cash_withdrawal в расходы — у них type 'expense',
 *    и сумма завысилась бы на порядки.
 * 2. Не фильтровать isDebtRelated. Бот его не фильтрует; клиент, который
 *    отфильтрует, разойдётся с ботом на записях, созданных до FT-073.
 * 3. Не фильтровать isArchived. Оба репозитория уже отдают только неархивные.
 */
export function isExpense(tx: Pick<Transaction, 'semanticType' | 'needsReview'>): boolean {
  return tx.semanticType === 'expense' && tx.needsReview !== true;
}

/** Движение денег, а не трата: показываем в ленте, но не считаем в сумме. */
export function isNonExpenseMovement(
  tx: Pick<Transaction, 'semanticType' | 'needsReview'>
): boolean {
  return !isExpense(tx);
}
