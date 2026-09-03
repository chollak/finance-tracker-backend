/**
 * Deterministic guesses about what an already-stored transaction actually *meant*.
 *
 * Every row created before FT-SEM-001 carries `semanticType = 'expense'`, including transfers,
 * withdrawals and debts. This module reads such a row and proposes a better semantic type using
 * the same vocabulary the live text parser uses (`shared/domain/semantics/semanticKeywords`), so
 * the preview can never disagree with what a re-entered phrase would produce today.
 *
 * Nothing here touches storage: it maps a plain row to a suggestion, and the caller decides what
 * to do with it. A rule either fires on wording that leaves little room for a second reading, or
 * it marks the row `needsReview` — an inherited semantic type that is wrong is worse than one
 * that is missing, so an uncertain guess is a question, not an answer.
 */

import {
  DEBT_KEYWORDS_PATTERN,
  GROUP_PAYMENT_KEYWORDS_PATTERN,
  INCOME_KEYWORDS_PATTERN,
  REPAYMENT_KEYWORDS_PATTERN,
  SAVING_DEPOSIT_KEYWORDS_PATTERN,
  TRANSFER_VERB_PATTERN,
  isObviousCashWithdrawal,
  isObviousOwnTransfer,
  mentionsCashWithdrawal,
} from '../../../shared/domain/semantics/semanticKeywords';
import { TransactionSemanticType } from './transactionSemanticType';

/**
 * A transaction as it sits in storage. Deliberately looser than the domain `Transaction`: the
 * preview reads historical rows whose columns may be missing or still hold raw SQLite values
 * (`0`/`1` for booleans, `null` for never-populated fields).
 */
/** SQLite reports booleans as 0/1, so every stored flag is read through {@link isTruthyFlag}. */
export type StoredFlag = boolean | number | null;

export function isTruthyFlag(value: StoredFlag | undefined): boolean {
  return value === true || value === 1;
}

export interface StoredTransactionRow {
  id: string;
  date?: string | null;
  createdAt?: string | null;
  amount?: number | null;
  /** Legacy cashflow direction; the only semantic hint older rows carry. */
  type?: string | null;
  semanticType?: string | null;
  needsReview?: StoredFlag;
  category?: string | null;
  description?: string | null;
  /** The phrase the user actually typed or said, when it was kept. */
  originalText?: string | null;
  merchant?: string | null;
  isArchived?: StoredFlag;
  isDebtRelated?: StoredFlag;
  relatedDebtId?: string | null;
}

export type BackfillRule =
  | 'debt_linked_row'
  | 'debt_keywords'
  | 'saving_deposit_keywords'
  | 'obvious_cash_withdrawal'
  | 'ambiguous_cash_withdrawal'
  | 'obvious_own_transfer'
  | 'ambiguous_transfer'
  | 'repayment_keywords'
  | 'group_payment_keywords'
  | 'legacy_income_row'
  | 'income_keywords'
  | 'no_match';

export interface BackfillSuggestion {
  rule: BackfillRule;
  /** `null` means "no rule fired" — the row stays a plain expense until a human says otherwise. */
  suggestedType: TransactionSemanticType | null;
  /** True when the wording raises a question the rule cannot answer on its own. */
  needsReview: boolean;
  /** Human-readable justification, printed next to the row in the preview report. */
  reason: string;
}

/** Rows the preview is allowed to reason about: the ones stuck on the legacy default. */
export function isBackfillCandidate(row: StoredTransactionRow): boolean {
  const stored = row.semanticType?.trim();
  return !stored || stored === 'expense';
}

/**
 * What the rules read. `originalText` is the richest signal, but it was not always stored, and the
 * description sometimes carries wording the original phrase lost — so both are searched, and the
 * merchant is not (a place name like "Click" would fake an own-transfer match).
 */
export function backfillSearchText(row: StoredTransactionRow): string {
  const original = row.originalText?.trim() ?? '';
  const description = row.description?.trim() ?? '';
  if (original && description && original !== description) return `${original} ${description}`;
  return original || description;
}

const NO_MATCH: BackfillSuggestion = {
  rule: 'no_match',
  suggestedType: null,
  needsReview: false,
  reason: 'Ни одно правило не сработало — строка остаётся обычным расходом',
};

/**
 * Order matters. A row linked to a debt is a debt no matter how it is worded; wording that names
 * a concrete mechanism (savings, cash, transfer) outranks the direction-only fallbacks at the end.
 */
export function suggestSemanticType(row: StoredTransactionRow): BackfillSuggestion {
  const text = backfillSearchText(row);

  if (isTruthyFlag(row.isDebtRelated) || (row.relatedDebtId ?? '') !== '') {
    return {
      rule: 'debt_linked_row',
      suggestedType: 'debt',
      needsReview: false,
      reason: 'Транзакция связана с долгом (isDebtRelated / relatedDebtId)',
    };
  }

  if (!text) return NO_MATCH;

  if (DEBT_KEYWORDS_PATTERN.test(text)) {
    return {
      rule: 'debt_keywords',
      suggestedType: 'debt',
      needsReview: false,
      reason: 'Формулировка прямо называет долг или заём',
    };
  }

  if (SAVING_DEPOSIT_KEYWORDS_PATTERN.test(text)) {
    return {
      rule: 'saving_deposit_keywords',
      suggestedType: 'saving_deposit',
      needsReview: false,
      reason: 'Формулировка называет вклад или накопления',
    };
  }

  if (isObviousCashWithdrawal(text)) {
    return {
      rule: 'obvious_cash_withdrawal',
      suggestedType: 'cash_withdrawal',
      needsReview: false,
      reason: 'Снятие денег названо вместе с источником (наличные / банкомат / карта)',
    };
  }

  // "снял 300000" may equally be rent ("снял квартиру"): the type is plausible, not established.
  if (mentionsCashWithdrawal(text)) {
    return {
      rule: 'ambiguous_cash_withdrawal',
      suggestedType: 'cash_withdrawal',
      needsReview: true,
      reason: 'Глагол снятия без указания наличных/банкомата — возможно, это обычный расход',
    };
  }

  if (isObviousOwnTransfer(text)) {
    return {
      rule: 'obvious_own_transfer',
      suggestedType: 'own_transfer',
      needsReview: false,
      reason: 'Перевод названо вместе со своим счётом или картой',
    };
  }

  // A transfer with no own-account target may just as well be money sent to another person.
  if (TRANSFER_VERB_PATTERN.test(text)) {
    return {
      rule: 'ambiguous_transfer',
      suggestedType: 'own_transfer',
      needsReview: true,
      reason: 'Перевод без указания своего счёта — мог быть переводом другому человеку',
    };
  }

  // Money coming back can be a refund, a reimbursement or a debt repayment; wording does not say.
  if (REPAYMENT_KEYWORDS_PATTERN.test(text)) {
    return {
      rule: 'repayment_keywords',
      suggestedType: 'reimbursement',
      needsReview: true,
      reason: 'Речь о возврате денег — возмещение или погашение долга, нужно уточнение',
    };
  }

  if (GROUP_PAYMENT_KEYWORDS_PATTERN.test(text)) {
    return {
      rule: 'group_payment_keywords',
      suggestedType: 'group_payment',
      needsReview: true,
      reason: 'Оплата за компанию — неизвестно, вернули ли деньги',
    };
  }

  // Stored as income but still carrying the legacy expense default: the row contradicts itself,
  // and its own direction is the safest answer. `normalizeSemanticType` already does this on read,
  // so the suggestion only makes the stored value agree with what the app already shows.
  if (row.type === 'income') {
    return {
      rule: 'legacy_income_row',
      suggestedType: 'income',
      needsReview: false,
      reason: 'Строка с type=income осталась на устаревшем semanticType=expense',
    };
  }

  // Salary wording on an expense row: could be income saved with the wrong direction, could be a
  // salary the user paid out. Only a human can tell.
  if (INCOME_KEYWORDS_PATTERN.test(text)) {
    return {
      rule: 'income_keywords',
      suggestedType: 'income',
      needsReview: true,
      reason: 'Формулировка про зарплату на расходной строке — возможно, доход записан как расход',
    };
  }

  return NO_MATCH;
}
