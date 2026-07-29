import { ProcessedTransaction } from '../types';
import { RU, formatAmount } from '../i18n/ru';

function formatAmountWithCurrency(amount: number): string {
  return `${formatAmount(amount).replace(/\s/g, ' ')} UZS`;
}

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
    `${typeEmoji} ${RU.transaction.amount}: <b>${formatAmountWithCurrency(tx.amount)}</b>`,
    `📂 ${RU.transaction.category}: ${tx.category}`,
    `📊 ${RU.transaction.type}: ${typeLabel}`,
  ];

  if (tx.description) {
    lines.push(`🧾 Описание: ${tx.description}`);
  }

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
      summaryParts.push(RU.transaction.todaySummary(formatAmountWithCurrency(todayTotal)));
    }
    if (monthTotal !== undefined) {
      summaryParts.push(RU.transaction.monthSummary(formatAmountWithCurrency(monthTotal)));
    }
    lines.push(summaryParts.join(' | '));
  }

  if (!needsConfirmation) {
    lines.push('');
    lines.push('Дальше: можно изменить, удалить или добавить ещё одну транзакцию кнопками ниже.');
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
