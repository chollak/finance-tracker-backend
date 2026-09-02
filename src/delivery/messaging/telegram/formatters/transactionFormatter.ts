import { ProcessedTransaction } from '../types';
import { RU, formatAmount } from '../i18n/ru';
import { normalizeSemanticType } from '../../../../modules/transaction/domain/transactionSemanticType';
import { CaptureAck, CapturedTransaction } from '../../../../modules/quickCapture/domain/quickCaptureTypes';

function formatAmountWithCurrency(amount: number): string {
  return `${formatAmount(amount).replace(/\s/g, ' ')} UZS`;
}

function getSemanticLabel(tx: ProcessedTransaction): { emoji: string; label: string; hint?: string } {
  const semanticType = normalizeSemanticType(tx.semanticType, tx.type);

  switch (semanticType) {
    case 'income':
      return { emoji: '💚', label: 'Доход' };
    case 'own_transfer':
      return { emoji: '↔️', label: 'Перевод себе', hint: 'Не входит в расходы' };
    case 'saving_deposit':
      return { emoji: '🏦', label: 'Вклад / накопление', hint: 'Не входит в расходы' };
    case 'debt':
      return { emoji: '🤝', label: 'Долг', hint: 'Не входит в обычные расходы' };
    case 'reimbursement':
      return { emoji: '↩️', label: 'Возврат', hint: 'Отдельно от расходов' };
    case 'cash_withdrawal':
      return { emoji: '💵', label: 'Наличные', hint: 'Не входит в расходы до фактической траты' };
    case 'group_payment':
      return { emoji: '👥', label: 'Групповой платёж', hint: 'Проверь свою долю' };
    case 'expense':
    default:
      return { emoji: '💸', label: 'Расход' };
  }
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

  const typeEmoji = tx.type === 'income' ? '💚' : '💸';

  const lines = [
    status,
    `📝 ${originalText}`,
    '',
    `${typeEmoji} ${RU.transaction.amount}: <b>${formatAmountWithCurrency(tx.amount)}</b>`,
    `📂 ${RU.transaction.category}: ${tx.category}`,
  ];

  const semantic = getSemanticLabel(tx);
  lines.push(`${semantic.emoji} Смысл: ${semantic.label}`);
  if (semantic.hint) {
    lines.push(`ℹ️ ${semantic.hint}`);
  }

  if (tx.needsReview) {
    lines.push('⚠️ Нужно проверить в Mini App');
  }

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

function formatTotalsLine(todayTotal?: number, monthTotal?: number): string | undefined {
  if (todayTotal === undefined && monthTotal === undefined) return undefined;

  const parts: string[] = [];
  if (todayTotal !== undefined) {
    parts.push(RU.transaction.todaySummary(formatAmountWithCurrency(todayTotal)));
  }
  if (monthTotal !== undefined) {
    parts.push(RU.transaction.monthSummary(formatAmountWithCurrency(monthTotal)));
  }

  return parts.join(' | ');
}

/**
 * Render a quick-capture result for Telegram.
 *
 * The title/summary come from the shared `CaptureAck`, so Telegram, the Mini App and a future
 * Shortcut all confirm a capture with the same words. Everything below the summary is Telegram's
 * own chrome: the semantic hint that keeps transfers/savings/withdrawals from reading as real
 * spending, and the today/month totals the bot has always shown.
 *
 * @param needsConfirmation - low parse confidence, which drives the confirm keyboard. This is a
 * separate signal from `tx.needsReview` (parse quality) and the two must not be conflated.
 */
export function formatCaptureMessage(
  tx: CapturedTransaction,
  ack: CaptureAck,
  needsConfirmation: boolean,
  isVoice = false,
  todayTotal?: number,
  monthTotal?: number
): string {
  const voicePrefix = isVoice ? '🎤' : '';

  const status = needsConfirmation
    ? `${voicePrefix}🤔 <b>${RU.transaction.confirmRequired}</b>`
    : `${voicePrefix}${tx.needsReview ? '⚠️' : '✅'} <b>${ack.title}</b>`;

  const lines = [status, ack.summary];

  // Only non-plain semantics carry a hint, so a normal expense/income stays a two-line ack.
  const semantic = getSemanticLabel(tx);
  if (semantic.hint) {
    lines.push(`${semantic.emoji} ${semantic.label} · ${semantic.hint}`);
  }

  if (tx.needsReview) {
    lines.push('⚠️ Нужно проверить в Mini App');
  }

  if (needsConfirmation && tx.confidence !== undefined) {
    lines.push('');
    lines.push(`⚠️ ${RU.transaction.confidence(Math.round(tx.confidence * 100))}`);
  }

  const totals = formatTotalsLine(todayTotal, monthTotal);
  if (totals) {
    lines.push('');
    lines.push(totals);
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
