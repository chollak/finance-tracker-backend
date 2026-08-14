import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';

/**
 * Guesses the semantic type of a movement from how it is described.
 *
 * Shared by the fast text parser and by the historical backfill preview, so a
 * proposal made about old rows is exactly what the parser would produce for the
 * same wording today. Two copies of these keywords would drift apart, and the
 * preview would start suggesting types the product never assigns.
 *
 * Deliberately conservative: it returns null whenever the wording does not
 * clearly say what the movement was, leaving the decision to a model or a
 * person rather than guessing.
 */

// \b relies on \w, which only covers ASCII — it silently fails to bound Cyrillic
// words. Build boundaries from Unicode letter/number classes instead.
function conservativeKeywordPattern(alternatives: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
}

export const SAVING_DEPOSIT_KEYWORDS_PATTERN = conservativeKeywordPattern([
  'вклад\\p{L}*', 'накоплени\\p{L}*', 'сбережени\\p{L}*', "jamg'?or\\p{L}*",
]);

export const CASH_WITHDRAWAL_VERB_PATTERN = conservativeKeywordPattern([
  'снял\\p{L}*', 'yechib oldim', 'yechdim',
]);

export const CASH_WITHDRAWAL_STANDALONE_PATTERN = conservativeKeywordPattern(['обналичил\\p{L}*']);

// Naming where the cash came from is the same statement as saying "cash",
// and it is how the phrase is usually written.
export const CASH_INDICATOR_PATTERN = conservativeKeywordPattern([
  'налич\\p{L}*', 'нал', 'cash', 'nakd',
  'банкомат\\p{L}*', 'atm', 'bankomat\\p{L}*',
  'карт\\p{L}*', 'счет', 'счёт', 'karta\\p{L}*',
]);

export const TRANSFER_VERB_PATTERN = conservativeKeywordPattern([
  'перевел\\p{L}*', 'перевёл\\p{L}*', 'перекинул\\p{L}*', 'kochirdim', "o'?tkazdim", 'otkazdim', 'transferred',
]);

export const OWN_ACCOUNT_TARGET_PATTERN = conservativeKeywordPattern([
  'себе', 'карт\\p{L}*', 'счет', 'счёт', 'alif', 'payme', 'click', 'uzcard', 'humo',
]);

export const INCOME_KEYWORDS_PATTERN = conservativeKeywordPattern([
  'зарплат\\p{L}*', 'зп', 'аванс', 'оклад', 'salary', 'maosh',
]);

export const DEBT_KEYWORDS_PATTERN =
  /\b(lent|borrowed|owe|debt|loan)\b|долг|должен|одолжил|одолжила|занял|заняла|қарз|qarz/i;

/**
 * @returns the semantic type the wording clearly indicates, or null when it
 *   does not clearly indicate one.
 */
export function classifyByText(text: string): TransactionSemanticType | null {
  const normalized = text?.trim() ?? '';
  if (!normalized) return null;

  if (SAVING_DEPOSIT_KEYWORDS_PATTERN.test(normalized)) return 'saving_deposit';

  if (
    CASH_WITHDRAWAL_STANDALONE_PATTERN.test(normalized)
    || (CASH_WITHDRAWAL_VERB_PATTERN.test(normalized) && CASH_INDICATOR_PATTERN.test(normalized))
  ) {
    return 'cash_withdrawal';
  }

  if (TRANSFER_VERB_PATTERN.test(normalized) && OWN_ACCOUNT_TARGET_PATTERN.test(normalized)) {
    return 'own_transfer';
  }

  if (INCOME_KEYWORDS_PATTERN.test(normalized)) return 'income';

  return null;
}
