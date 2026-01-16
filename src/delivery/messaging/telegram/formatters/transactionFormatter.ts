import { ProcessedTransaction } from '../types';
import { RU, formatAmount } from '../i18n/ru';

/**
 * Format a transaction message for display in Telegram
 * @param tx - Transaction data
 * @param originalText - Original user input text
 * @param needsConfirmation - Whether the transaction needs user confirmation
 * @param isVoice - Whether the input was voice message
 * @param todayTotal - Optional today's total expenses
 * @param monthTotal - Optional month's total expenses
 */
export function formatTransactionMessage(
  tx: ProcessedTransaction,
  originalText: string,
  needsConfirmation: boolean,
  isVoice = false,
  todayTotal?: number,
  monthTotal?: number
): string {
  const voicePrefix = isVoice ? '🎤' : '';

  const status = needsConfirmation
    ? `${voicePrefix}🤔 <b>${RU.transaction.confirmRequired}</b>`
    : `${voicePrefix}✅ <b>${RU.transaction.autoSaved}</b>`;

  const typeLabel = tx.type === 'income' ? RU.transaction.income : RU.transaction.expense;
  const typeEmoji = tx.type === 'income' ? '💚' : '💸';

  const lines = [
    status,
    `📝 ${originalText}`,
    '',
    `${typeEmoji} ${RU.transaction.amount}: <b>${formatAmount(tx.amount)}</b>`,
    `📂 ${RU.transaction.category}: ${tx.category}`,
    `📊 ${RU.transaction.type}: ${typeLabel}`,
  ];

  if (tx.merchant) {
    lines.push(`🏪 ${RU.transaction.merchant}: ${tx.merchant}`);
  }

  // Add confidence warning for low confidence transactions
  if (needsConfirmation && tx.confidence !== undefined) {
    lines.push('');
    lines.push(`⚠️ ${RU.transaction.confidence(Math.round(tx.confidence * 100))}`);
  }

  // Add summary if available
  if (todayTotal !== undefined || monthTotal !== undefined) {
    lines.push('');
    const summaryParts: string[] = [];
    if (todayTotal !== undefined) {
      summaryParts.push(RU.transaction.todaySummary(formatAmount(todayTotal)));
    }
    if (monthTotal !== undefined) {
      summaryParts.push(RU.transaction.monthSummary(formatAmount(monthTotal)));
    }
    lines.push(summaryParts.join(' | '));
  }

  return lines.join('\n');
}

/**
 * Format a confirmed transaction message
 */
export function formatConfirmedMessage(originalMessage: string): string {
  return originalMessage
    .replace('🤔', '✅')
    .replace(`<b>${RU.transaction.confirmRequired}</b>`, `<b>${RU.transaction.confirmed}</b>`);
}
