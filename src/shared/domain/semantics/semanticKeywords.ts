/**
 * Wording that carries the *meaning* of a money movement (transfer, savings, cash, debt, income).
 *
 * These patterns started out private to the text parser. The historical backfill preview needs the
 * exact same vocabulary to judge already-stored rows, and two copies of it would drift apart the
 * first time a keyword is added — so the vocabulary lives here and both callers read it.
 *
 * Deliberately conservative: every pattern is meant to fire only on wording that leaves little
 * room for a second reading. Anything short of that belongs in `needsReview`, not in a rule here.
 */

// \b relies on \w, which only covers ASCII — it silently fails to bound Cyrillic words
// (e.g. "\bперевел\b" never matches). Build boundaries from Unicode letter/number classes instead.
export function conservativeKeywordPattern(alternatives: string[], flags = 'iu'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, flags);
}

export const DEBT_KEYWORDS_PATTERN =
  /\b(lent|borrowed|owe|debt|loan)\b|долг|должен|одолжил|одолжила|занял|заняла|қарз|qarz/i;

// Money being given back — a debt repayment, a refund, a reimbursement — is never ordinary
// consumption. Exact verb forms only, so "вернулся домой" and "вернусь" stay out of it.
export const REPAYMENT_KEYWORDS_PATTERN = conservativeKeywordPattern([
  // "отдал" is deliberately absent: it reads as plain paying just as often ("отдал 50000 за ремонт").
  'вернул', 'вернула', 'вернули', 'верну', 'вернуть', 'возврат\\p{L}*', 'refund',
  'qaytardim', 'qaytardi', 'qaytarishdi',
]);

export const SAVING_DEPOSIT_KEYWORDS_PATTERN = conservativeKeywordPattern([
  'вклад\\p{L}*', 'накоплени\\p{L}*', 'сбережени\\p{L}*', "jamg'?or\\p{L}*",
]);

export const CASH_WITHDRAWAL_VERB_PATTERN = conservativeKeywordPattern([
  'снял\\p{L}*', 'yechib oldim', 'yechdim',
]);
export const CASH_WITHDRAWAL_STANDALONE_PATTERN = conservativeKeywordPattern(['обналичил\\p{L}*']);
export const CASH_INDICATOR_PATTERN = conservativeKeywordPattern([
  'налич\\p{L}*', 'нал', 'cash', 'nakd', 'naqd',
]);
// Where the cash came from. "снял в банкомате 300000" names no cash word at all, so without these
// the phrase used to fall through to the simple parser and become a real expense.
export const CASH_SOURCE_PATTERN = conservativeKeywordPattern([
  'банкомат\\p{L}*', 'bankomat\\p{L}*', 'atm', 'kart\\p{L}*',
]);

export const TRANSFER_VERB_PATTERN = conservativeKeywordPattern([
  'перевел\\p{L}*', 'перевёл\\p{L}*', 'перекинул\\p{L}*', 'kochirdim', "o'?tkazdim", 'otkazdim', 'transferred',
]);
export const OWN_ACCOUNT_TARGET_PATTERN = conservativeKeywordPattern([
  'себе', 'карт\\p{L}*', 'счет\\p{L}*', 'счёт\\p{L}*', 'alif', 'payme', 'click', 'uzcard', 'humo',
]);

export const INCOME_KEYWORDS_PATTERN = conservativeKeywordPattern([
  'зарплат\\p{L}*', 'зп', 'аванс', 'оклад', 'salary', 'maosh',
]);

// Paying for a group and splitting it afterwards. Only used to *raise a question* about a stored
// row — the wording alone never says whether the user was reimbursed, so it never decides a type.
export const GROUP_PAYMENT_KEYWORDS_PATTERN = conservativeKeywordPattern([
  'поровну', 'скинул\\p{L}*', 'скидыва\\p{L}*', 'компани\\p{L}*', 'на всех', 'split',
]);

/**
 * A withdrawal is obvious only when the phrase says both that money was taken out and where from
 * (cash, an ATM, a card or an own account). A bare "снял 300000" stays ambiguous — it may be rent
 * ("снял квартиру") — and is left to OpenAI rather than guessed.
 */
export function isObviousCashWithdrawal(text: string): boolean {
  return CASH_WITHDRAWAL_STANDALONE_PATTERN.test(text)
    || (
      CASH_WITHDRAWAL_VERB_PATTERN.test(text)
      && (
        CASH_INDICATOR_PATTERN.test(text)
        || CASH_SOURCE_PATTERN.test(text)
        || OWN_ACCOUNT_TARGET_PATTERN.test(text)
      )
    );
}

export function mentionsCashWithdrawal(text: string): boolean {
  return CASH_WITHDRAWAL_VERB_PATTERN.test(text) || CASH_WITHDRAWAL_STANDALONE_PATTERN.test(text);
}

export function isObviousOwnTransfer(text: string): boolean {
  return TRANSFER_VERB_PATTERN.test(text) && OWN_ACCOUNT_TARGET_PATTERN.test(text);
}
